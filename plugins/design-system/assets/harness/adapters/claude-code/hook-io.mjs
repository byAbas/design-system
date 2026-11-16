// Claude Code's side of the design-system hooks: what a hook reads from the
// JSON Claude Code sends on stdin, and how it answers. The adapters in this
// folder only translate; every decision is the core's (STAGES in
// design-system/harness/gates.mjs), which the git hook and CI run too.
//
// Claude Code reads exit code 2 as "blocked" and feeds stderr back to the
// agent; a PreToolUse hook can instead deny the call with a JSON decision
// (https://code.claude.com/docs/en/hooks). A PreToolUse block stops the tool
// call; a PostToolUse one comes after the tool ran, so it reports and the
// commit gate is what enforces. No dependencies, Node 20 or later.
//
// The agent is not the only reader. Every answer that reports a catch also
// carries `systemMessage`, the field Claude Code shows to the person, with the
// catch's first line: Claude Code reads the JSON fields of a hook that exits 2
// as well ("Exit code 2 behavior", same page).

import { readFileSync } from "node:fs";

/** The hook's JSON input from stdin; `{}` when stdin is empty. */
export function hookInput() {
  const raw = readFileSync(0, "utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

/** The path an Edit or Write call names, as Claude Code sent it; undefined when it has none. */
export function editedPath(input) {
  const file = input?.tool_input?.file_path;
  return typeof file === "string" && file ? file : undefined;
}

/** The shell command a Bash call runs; undefined when it has none. */
export function shellCommand(input) {
  const command = input?.tool_input?.command;
  return typeof command === "string" ? command : undefined;
}

/**
 * The files a Bash command changed: Claude Code's `tool_response.bashEditDiff.changedFiles`
 * (https://code.claude.com/docs/en/hooks, Bash; v2.1.269 or later, public beta). Empty when the input has no
 * diff (recording is off, or the command ran in the background) or the diff was skipped (a command that moves
 * the working tree, such as `git checkout`). The core makes them relative and leaves out paths outside the project.
 */
export function changedPaths(input) {
  const diff = input?.tool_response?.bashEditDiff;
  if (!diff || diff.skipped || !Array.isArray(diff.changedFiles)) return [];
  return diff.changedFiles.filter((file) => typeof file === "string" && file);
}

/** Who is calling the core, for the gate log: this agent, and the session Claude Code names in the hook input. */
export function caller(input) {
  const session = input?.session_id;
  return { by: "claude-code", ...(typeof session === "string" && session ? { session } : {}) };
}

/** What the person is shown for a catch: its first line, which the core writes to stand on its own. */
export function personNote(message) {
  return message.trim().split("\n")[0];
}

/** Answers a PostToolUse hook, or a PreToolUse one that blocks: exit 2 with the message, else exit 0. */
export function report(message) {
  if (message) {
    process.stdout.write(JSON.stringify({ systemMessage: personNote(message) }));
    process.stderr.write(`${message.trimEnd()}\n`);
    process.exit(2);
  }
  process.exit(0);
}

/** Answers a PreToolUse hook with a denial and its reason, or lets the call through. */
export function deny(reason) {
  if (reason) {
    process.stdout.write(JSON.stringify({ systemMessage: `Design-system gate denied the edit: ${personNote(reason)}`, hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
  }
  process.exit(0);
}

/** Answers a hook that only tells the person something (Stop): the text as `systemMessage`, or nothing. */
export function note(text) {
  if (text) process.stdout.write(JSON.stringify({ systemMessage: text }));
  process.exit(0);
}
