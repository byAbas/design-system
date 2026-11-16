// The adapters, run as Claude Code runs them: in a project that holds the core in design-system/harness and the
// adapters in .claude/hooks/design-system, with the hook's JSON on stdin.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const here = new URL("../", import.meta.url);
const core = new URL("../../../core/", import.meta.url);

/** A project whose linter fails for a file that holds a hex colour, and whose commit gate runs it on src/a.tsx. */
function project() {
  // The real path: a hook's working directory is resolved, and macOS keeps its temporary folder behind a link.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "adapters-")));
  mkdirSync(join(root, "design-system/harness"), { recursive: true });
  mkdirSync(join(root, ".claude/hooks/design-system"), { recursive: true });
  mkdirSync(join(root, "src"));
  for (const file of ["gates.mjs", "run-gates.mjs"]) cpSync(new URL(file, core), join(root, "design-system/harness", file));
  for (const file of ["hook-io.mjs", "check-on-edit.mjs", "check-after-bash.mjs", "guard-commit.mjs", "protect-generated.mjs", "summary-on-stop.mjs"]) cpSync(new URL(file, here), join(root, ".claude/hooks/design-system", file));
  writeFileSync(join(root, "lint.mjs"), 'import { readFileSync } from "node:fs";\nlet bad = 0;\nfor (const file of process.argv.slice(2)) if (/#[0-9a-f]{6}/.test(readFileSync(file, "utf8"))) { bad++; console.log(`${process.cwd()}/${file}\\n  1:1  error  A raw colour in source  design-system/no-raw-color`); }\nprocess.exit(bad ? 1 : 0);\n');
  writeFileSync(join(root, "design-system/gates.json"), JSON.stringify({ lint: { files: ["src/**/*.tsx"], command: "node lint.mjs" }, beforeCommit: ["node lint.mjs src/a.tsx"], generated: ["src/*.generated.css"] }));
  const hook = (name, input) => {
    const env = { ...process.env };
    delete env.CI;
    const result = spawnSync(process.execPath, [join(root, ".claude/hooks/design-system", `${name}.mjs`)], { cwd: root, input: JSON.stringify({ session_id: "s1", ...input }), encoding: "utf8", env });
    return { status: result.status, stderr: result.stderr, stdout: result.stdout ? JSON.parse(result.stdout) : undefined };
  };
  const write = (text) => writeFileSync(join(root, "src/a.tsx"), text);
  const log = () => readFileSync(join(root, "design-system/gate-log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  return { root, hook, write, log };
}

describe("the Claude Code adapters, end to end", () => {
  const { root, hook, write, log } = project();
  after(() => rmSync(root, { recursive: true, force: true }));
  const edit = { tool_name: "Edit", tool_input: { file_path: join(root, "src/a.tsx") } };

  it("tells the agent and the person about a raw colour the moment it is written, and writes the catch", () => {
    write('const a = "bg-[#3b82f6]";');
    const caught = hook("check-on-edit", edit);
    assert.equal(caught.status, 2);
    assert.equal(caught.stderr, "Design-system gate caught src/a.tsx: design-system/no-raw-color.\nThe design lint failed for src/a.tsx:\nsrc/a.tsx\n  1:1  error  A raw colour in source  design-system/no-raw-color\n");
    assert.deepEqual(caught.stdout, { systemMessage: "Design-system gate caught src/a.tsx: design-system/no-raw-color." });
    assert.deepEqual(log().map((event) => [event.stage, event.result, event.files, event.by, event.session]), [["check-files", "caught", ["src/a.tsx"], "claude-code", "s1"]]);
  });

  it("stops the agent's commit while the file fails, and passes any other command", () => {
    const refused = hook("guard-commit", { tool_name: "Bash", tool_input: { command: "git commit -m x" } });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /^Design-system gate stopped the commit: design-system\/no-raw-color\.\n`node lint\.mjs src\/a\.tsx` failed:/);
    assert.deepEqual(refused.stdout, { systemMessage: "Design-system gate stopped the commit: design-system/no-raw-color." });
    assert.equal(hook("guard-commit", { tool_name: "Bash", tool_input: { command: "git status" } }).status, 0);
  });

  it("denies an edit to a generated file, with the reason for the agent and a line for the person", () => {
    const denied = hook("protect-generated", { tool_name: "Write", tool_input: { file_path: join(root, "src/theme.generated.css") } });
    assert.equal(denied.status, 0);
    assert.equal(denied.stdout.hookSpecificOutput.permissionDecision, "deny");
    assert.match(denied.stdout.systemMessage, /^Design-system gate denied the edit: src\/theme\.generated\.css is generated/);
  });

  it("summarizes the turn for the person when the agent stops: what was caught, fixed and is still open", () => {
    const open = hook("summary-on-stop", { hook_event_name: "Stop" });
    assert.equal(open.status, 0);
    assert.equal(open.stdout.systemMessage, "Design-system gates: caught once in 1 file, 0 fixed; an edit to a generated file was denied once; a commit was stopped once. Still open: src/a.tsx (design-system/no-raw-color). Log: design-system/gate-log.jsonl");
    assert.equal(hook("summary-on-stop", { hook_event_name: "Stop" }).stdout, undefined, "nothing new, nothing said");
  });

  it("records the fix when the file passes, through an edit or through the shell", () => {
    write('const a = "bg-action-info";');
    assert.equal(hook("check-on-edit", edit).status, 0);
    assert.deepEqual(log().at(-1).result, "fixed");
    write('const a = "#ff0000";');
    const shell = hook("check-after-bash", { tool_name: "Bash", tool_input: { command: "sed -i …" }, tool_response: { bashEditDiff: { changedFiles: [join(root, "src/a.tsx")] } } });
    assert.equal(shell.status, 2);
    write("const a = 1;");
    assert.equal(hook("summary-on-stop", {}).stdout.systemMessage, "Design-system gates: caught once in 1 file, 1 fixed. Log: design-system/gate-log.jsonl");
  });
});
