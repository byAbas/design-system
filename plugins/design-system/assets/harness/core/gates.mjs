// The design-system gates, with every decision they make: the project's gates
// config (design-system/gates.json; design-tokens.gates.json at the root
// before 0.4.0), glob matching, which files are generated, the checks a
// changed file gets, and what a commit runs. The git hook, CI and each agent's
// adapter call the same stages (STAGES), through run-gates.mjs or by import;
// an adapter only translates its agent's input and answer. Copied into a
// project by /design-system:harness; the config, not this file, is what a
// project edits. No dependencies, Node 20 or later.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const CONFIG_FILES = ["design-system/gates.json", "design-tokens.gates.json"];
export const CONFIG_FILE = CONFIG_FILES[0];

/** The gate log: one JSON line for every catch and every fix. Local to a checkout, never committed. */
export const LOG_FILE = "design-system/gate-log.jsonl";

/** The log is cut to its newer half when it passes this size, so it never grows without bound. */
const LOG_MAX_BYTES = 1024 * 1024;

/**
 * A glob as a regular expression over a relative, forward-slash path:
 * `**` spans folders, `*` and `?` stay within one, `{a,b}` is either.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      // `**/` matches zero or more folders; a trailing `**` matches the rest.
      if (glob[i + 2] === "/") {
        pattern += "(?:.*/)?";
        i += 2;
      } else {
        pattern += ".*";
        i += 1;
      }
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else if (char === "{") {
      const close = glob.indexOf("}", i);
      if (close === -1) pattern += "\\{";
      else {
        pattern += `(?:${glob.slice(i + 1, close).split(",").map((option) => option.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`;
        i = close;
      }
    } else pattern += char.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

/** True when `file` (relative, forward slashes) matches any of the globs. */
export function matchesAny(file, globs = []) {
  return globs.some((glob) => globToRegExp(glob).test(file));
}

/** True when a shell command runs `git commit`: at the start, or after `;`, `&&`, `||` or a pipe. */
export function isGitCommit(command) {
  return typeof command === "string" && /(^|[;&|]\s*|\n\s*)git(\s+-[cC]\s+\S+)*\s+commit\b/.test(command);
}

/**
 * Where a gates config breaks its shape, as one sentence each; empty when it holds.
 * @param {unknown} config
 */
export function gatesProblems(config) {
  const problems = [];
  if (!config || typeof config !== "object") return [`${CONFIG_FILE} is not a JSON object`];
  const c = /** @type {Record<string, any>} */ (config);
  const list = (key) => {
    if (c[key] === undefined) return;
    if (!Array.isArray(c[key]) || c[key].some((item) => typeof item !== "string" || !item.trim())) problems.push(`${key} must be a list of non-empty strings`);
  };
  for (const key of ["generated", "sources", "onSourceEdit", "beforeCommit"]) list(key);
  if (c.build !== undefined && (typeof c.build !== "string" || !c.build.trim())) problems.push("build must be the command that rewrites the generated outputs");
  for (const [index, lint] of lintsOf(c).entries()) {
    const at = Array.isArray(c.lint) ? `lint[${index}]` : "lint";
    if (!Array.isArray(lint?.files) || typeof lint?.command !== "string") problems.push(`${at} needs files (globs) and command (the linter, which receives the edited files as its last arguments)`);
    if (lint?.strictEnv !== undefined && (typeof lint.strictEnv !== "object" || Object.values(lint.strictEnv).some((value) => typeof value !== "string"))) problems.push(`${at}.strictEnv must map variable names to strings`);
  }
  if ((c.sources?.length ?? 0) > 0 && (c.onSourceEdit?.length ?? 0) === 0) problems.push("sources is set but onSourceEdit runs nothing");
  if (c.log !== undefined && typeof c.log !== "boolean") problems.push(`log must be true or false: false stops the gates writing ${LOG_FILE}`);
  return problems;
}

/**
 * The linters an edited file gets: `lint` is one `{ files, command, strictEnv }`, or a list of them when a project
 * lints its scripts and its stylesheets with different tools (ESLint and Stylelint).
 * @param {Record<string, any>} gates
 */
export function lintsOf(gates) {
  return gates?.lint === undefined ? [] : Array.isArray(gates.lint) ? gates.lint : [gates.lint];
}

/** The project's gates config; throws with every problem when it is malformed. */
export function readGates(root = process.cwd()) {
  const file = CONFIG_FILES.find((candidate) => existsSync(join(root, candidate)));
  if (!file) throw new Error(`no gates config: write ${CONFIG_FILE} (references/conventions.md)`);
  const config = JSON.parse(readFileSync(join(root, file), "utf8"));
  const problems = gatesProblems(config);
  if (problems.length > 0) throw new Error(`${file}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  return config;
}

/** `file` relative to `root`, forward slashes; undefined when it is outside the root or is the root. */
export function projectPath(file, root = process.cwd()) {
  const path = relative(root, resolve(root, file)).split("\\").join("/");
  return path && path !== ".." && !path.startsWith("../") && !isAbsolute(path) ? path : undefined;
}

/** The paths a caller passed, relative to `root`, once each; paths outside the root are left out. */
export function projectPaths(files, root = process.cwd()) {
  const paths = files.filter((file) => typeof file === "string" && file).map((file) => projectPath(file, root));
  return [...new Set(paths.filter((path) => path !== undefined))];
}

/**
 * The checks a changed file gets, for one file or many, absolute or relative: for each linter in `lint`, the files in
 * its `files` that still exist are linted in one call of its `command` (the files are its last arguments), and `onSourceEdit` runs once when
 * any file is in `sources` or `generated`. A generated output passes the staleness check when the build wrote it and
 * fails it when a hand did. The first failure as a message, or undefined when every check passes.
 * @param {string[]} files
 * @param {Record<string, any>} gates
 */
export function checkFiles(files, gates, { root = process.cwd(), exists = (file) => existsSync(join(root, file)), runCommand = run, runCommands = runAll } = {}) {
  const paths = projectPaths(files, root);
  for (const lint of lintsOf(gates)) {
    const lintable = paths.filter((file) => matchesAny(file, lint.files) && exists(file));
    if (lintable.length === 0) continue;
    const result = runCommand(`${lint.command} ${lintable.map((file) => JSON.stringify(file)).join(" ")}`, lint.strictEnv ?? {}, root);
    if (result.status !== 0) return `The design lint failed for ${lintable.join(", ")}:\n${result.output}`;
  }
  const source = paths.find((file) => matchesAny(file, gates.sources) || matchesAny(file, gates.generated));
  if (source !== undefined) {
    const failure = runCommands(gates.onSourceEdit, {}, root);
    if (failure) return `After editing ${source}, \`${failure.command}\` failed:\n${failure.output}\nValues live in the token files; rebuild the outputs${gates.build ? ` with \`${gates.build}\`` : ""} instead of editing them.`;
  }
  return undefined;
}

/**
 * Why a file must not be edited by hand, for the first of `files` in `generated`; undefined when none is. It names
 * `build`, the command that rewrites the outputs, and no command when the config has none: `onSourceEdit` holds
 * checks, and a check named as the rebuild sends the agent to run something that rewrites nothing.
 * @param {string[]} files
 * @param {Record<string, any>} gates
 */
export function generatedReason(files, gates, { root = process.cwd() } = {}) {
  const file = projectPaths(files, root).find((path) => matchesAny(path, gates.generated));
  if (file === undefined) return undefined;
  const rebuild = gates.build ? `rebuild with \`${gates.build}\`` : "rebuild the outputs with the project's token build";
  return `${file} is generated from the design tokens. Change the token files (or the build's template), then ${rebuild}.`;
}

/** The environment a stage's commands run in: the design lint rules as errors. */
const STRICT_ENV = { DESIGN_LINT_STRICT: "1" };

/** The commands of one config key, in order; the first failure as a message, or undefined when all pass. */
function commandsProblem(commands, { root = process.cwd(), runCommands = runAll } = {}) {
  const failure = runCommands(commands, STRICT_ENV, root);
  return failure ? `\`${failure.command}\` failed:\n${failure.output}` : undefined;
}

const CHECKS = {
  "before-commit": (gates, _files, options) => commandsProblem(gates.beforeCommit, options),
  "on-source-edit": (gates, _files, options) => commandsProblem(gates.onSourceEdit, options),
  "check-files": (gates, files, options) => checkFiles(files, gates, options),
  "check-generated": (gates, files, options) => generatedReason(files, gates, options),
};

/**
 * The stages every caller shares: the git hook and CI through run-gates.mjs, an agent's adapter by import.
 * Each takes the gates, the paths it was given (absolute or relative) and options, and returns a message on
 * failure, or undefined. A failure's first line says what the gate caught, in one sentence a person can read
 * without the tool's output, and every catch and fix is written to the gate log (`LOG_FILE`). The options
 * `by` (who called: an agent's name, or the command line) and `session` are recorded with the event.
 */
export const STAGES = Object.fromEntries(Object.entries(CHECKS).map(([stage, check]) => [stage, (gates, files = [], options = {}) => caught(stage, check(gates, files, options), gates, files, options)]));

/** The rule ids a tool's output names (`design-system/no-raw-color`), each once, in the order they appear. */
export function rulesIn(output) {
  return [...new Set(String(output ?? "").match(/\bdesign-system\/[a-z][a-z0-9-]*/g) ?? [])];
}

/** One sentence for a catch: what the gate caught, and the rules, before any tool output. */
export function headline(stage, files, rules) {
  const named = rules.length > 0 ? `: ${rules.join(", ")}` : "";
  if (stage === "before-commit") return `Design-system gate stopped the commit${named}.`;
  if (files.length === 0) return `Design-system gate caught the token sources${named}.`;
  return `Design-system gate caught ${files.join(", ")}${named}.`;
}

/**
 * What a stage answers after its check ran: the problem under its headline, with the project's own path taken out of
 * the tool's output, or undefined. Writes the catch, or the fix of a file the log holds as caught, to the gate log.
 */
function caught(stage, problem, gates, files, options) {
  const root = options.root ?? process.cwd();
  const paths = projectPaths(files, root);
  if (!problem) {
    if (stage === "check-files") writeFixes(paths, gates, options);
    return undefined;
  }
  const rules = rulesIn(problem);
  // A shell command changes many files and the linter's output names the ones that fail; the check's own
  // first line names every file it linted, so it is left out.
  const output = problem.slice(problem.indexOf("\n") + 1);
  const named = paths.filter((path) => output.includes(path));
  const failing = stage === "check-files" && named.length > 0 ? named : paths;
  writeEvent(gates, { stage, result: "caught", files: failing, rules }, options);
  if (stage === "check-generated") return problem;
  return `${headline(stage, failing, rules)}\n${problem.split(`${resolve(root)}/`).join("")}`;
}

/**
 * Where the gate log is written, or undefined when nothing is: the project set `"log": false`, CI runs the gates
 * (its checkout is thrown away), or the project has no design-system folder.
 */
export function logPath(gates, { root = process.cwd(), env = process.env } = {}) {
  if (gates?.log === false || env.CI) return undefined;
  return existsSync(join(root, "design-system")) ? join(root, LOG_FILE) : undefined;
}

/** The log's events, oldest first; a line that is not JSON is skipped. */
export function readLog(file) {
  if (!file || !existsSync(file)) return [];
  const events = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn line (two writers, a full disk) loses one event, never the log.
    }
  }
  return events;
}

/** The files the log holds as caught and not fixed since, each with the rules of its last catch. */
export function openCatches(events) {
  const open = new Map();
  for (const event of events) {
    if (event.stage !== "check-files") continue;
    for (const file of event.files ?? []) {
      if (event.result === "caught") open.set(file, event.rules ?? []);
      else if (event.result === "fixed") open.delete(file);
    }
  }
  return open;
}

/** Appends one event to the gate log. A log that cannot be written never fails a gate. */
function writeEvent(gates, event, options = {}) {
  try {
    const file = logPath(gates, options);
    if (!file) return;
    const { now = () => new Date(), by = "command-line", session, maxBytes = LOG_MAX_BYTES } = options;
    if (existsSync(file) && statSync(file).size > maxBytes) {
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      writeFileSync(file, `${lines.slice(Math.floor(lines.length / 2)).join("\n")}\n`);
    }
    appendFileSync(file, `${JSON.stringify({ at: now().toISOString(), ...event, by, ...(session ? { session } : {}) })}\n`);
  } catch {
    // The gate's answer is what matters; the log is a record of it.
  }
}

/** Records as fixed the files that pass now and that the log holds as caught. */
function writeFixes(paths, gates, options) {
  try {
    const file = logPath(gates, options);
    if (!file || paths.length === 0) return;
    const open = openCatches(readLog(file));
    const fixed = paths.filter((path) => open.has(path));
    if (fixed.length > 0) writeEvent(gates, { stage: "check-files", result: "fixed", files: fixed }, options);
  } catch {
    // As in writeEvent.
  }
}

/**
 * What the gates caught since the last summary of this `session` (or of the command line, without one), as one
 * paragraph for a person, or undefined when they caught nothing. A file the log holds as caught is checked again
 * first, so a fix made outside the gates (a `git restore`, an editor) counts as fixed and "still open" is true now.
 * @param {Record<string, any>} gates
 */
export function summarize(gates, options = {}) {
  const file = logPath(gates, options);
  if (!file) return undefined;
  const { session } = options;
  const mine = (event) => (event.session ?? undefined) === (session ?? undefined);
  const events = readLog(file);
  const last = events.findLastIndex((event) => event.stage === "summary" && mine(event));
  const catches = events.slice(last + 1).filter((event) => event.result === "caught" && mine(event));
  if (catches.length === 0) return undefined;

  const files = [...new Set(catches.filter((event) => event.stage === "check-files").flatMap((event) => event.files ?? []))];
  const open = openCatches(events);
  for (const path of files.filter((path) => open.has(path))) {
    if (checkFiles([path], gates, options) === undefined) {
      writeEvent(gates, { stage: "check-files", result: "fixed", files: [path] }, options);
      open.delete(path);
    }
  }
  const stillOpen = files.filter((path) => open.has(path));
  const commits = catches.filter((event) => event.stage === "before-commit").length;
  const generated = catches.filter((event) => event.stage === "check-generated").length;
  const times = (count) => (count === 1 ? "once" : `${count} times`);

  const parts = [];
  if (files.length > 0) {
    const edits = catches.filter((event) => event.stage === "check-files").length;
    parts.push(`caught ${times(edits)} in ${files.length === 1 ? "1 file" : `${files.length} files`}, ${files.length - stillOpen.length} fixed`);
  }
  if (generated > 0) parts.push(`an edit to a generated file was denied ${times(generated)}`);
  if (commits > 0) parts.push(`a commit was stopped ${times(commits)}`);
  const sources = catches.filter((event) => event.stage === "on-source-edit").length;
  if (sources > 0) parts.push(`the token sources failed ${times(sources)}`);
  const openList = stillOpen.map((path) => `${path}${open.get(path).length > 0 ? ` (${open.get(path).join(", ")})` : ""}`);
  const still = openList.length > 0 ? ` Still open: ${openList.join("; ")}.` : "";
  writeEvent(gates, { stage: "summary", result: "shown" }, options);
  return `Design-system gates: ${parts.join("; ")}.${still} Log: ${LOG_FILE}`;
}

/** Runs a shell command at `root`, the project's node_modules/.bin first on PATH. */
export function run(command, env = {}, root = process.cwd()) {
  const result = spawnSync(command, {
    shell: true,
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${resolve(root, "node_modules/.bin")}:${process.env.PATH ?? ""}`, ...env },
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** Runs commands in order; the first failure, or undefined when all pass. */
export function runAll(commands = [], env = {}, root = process.cwd()) {
  for (const command of commands) {
    const result = run(command, env, root);
    if (result.status !== 0) return { command, output: result.output };
  }
  return undefined;
}
