// The design-system gates, with every decision they make: the project's gates
// config (design-system/gates.json; design-tokens.gates.json at the root
// before 0.4.0), glob matching, which files are generated, the checks a
// changed file gets, and what a commit runs. The git hook, CI and each agent's
// adapter call the same stages (STAGES), through run-gates.mjs or by import;
// an adapter only translates its agent's input and answer. Copied into a
// project by /design-system:harness; the config, not this file, is what a
// project edits. No dependencies, Node 20 or later.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const CONFIG_FILES = ["design-system/gates.json", "design-tokens.gates.json"];
export const CONFIG_FILE = CONFIG_FILES[0];

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
  if (c.lint !== undefined) {
    if (!Array.isArray(c.lint?.files) || typeof c.lint?.command !== "string") problems.push("lint needs files (globs) and command (the linter, which receives the edited files as its last arguments)");
    if (c.lint?.strictEnv !== undefined && (typeof c.lint.strictEnv !== "object" || Object.values(c.lint.strictEnv).some((value) => typeof value !== "string"))) problems.push("lint.strictEnv must map variable names to strings");
  }
  if ((c.sources?.length ?? 0) > 0 && (c.onSourceEdit?.length ?? 0) === 0) problems.push("sources is set but onSourceEdit runs nothing");
  return problems;
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
 * The checks a changed file gets, for one file or many, absolute or relative: the files in `lint.files` that still
 * exist are linted in one `lint.command` call (the files are its last arguments), and `onSourceEdit` runs once when
 * any file is in `sources` or `generated`. A generated output passes the staleness check when the build wrote it and
 * fails it when a hand did. The first failure as a message, or undefined when every check passes.
 * @param {string[]} files
 * @param {Record<string, any>} gates
 */
export function checkFiles(files, gates, { root = process.cwd(), exists = (file) => existsSync(join(root, file)), runCommand = run, runCommands = runAll } = {}) {
  const paths = projectPaths(files, root);
  const lintable = gates.lint ? paths.filter((file) => matchesAny(file, gates.lint.files) && exists(file)) : [];
  if (lintable.length > 0) {
    const result = runCommand(`${gates.lint.command} ${lintable.map((file) => JSON.stringify(file)).join(" ")}`, gates.lint.strictEnv ?? {}, root);
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

/**
 * The stages every caller shares: the git hook and CI through run-gates.mjs, an agent's adapter by import.
 * Each takes the gates, the paths it was given (absolute or relative) and options, and returns a message on
 * failure, or undefined.
 */
export const STAGES = {
  "before-commit": (gates, _files, options) => commandsProblem(gates.beforeCommit, options),
  "on-source-edit": (gates, _files, options) => commandsProblem(gates.onSourceEdit, options),
  "check-files": (gates, files, options) => checkFiles(files, gates, options),
  "check-generated": (gates, files, options) => generatedReason(files, gates, options),
};

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
