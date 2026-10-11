#!/usr/bin/env node
// A PreToolUse hook that keeps the Figma MCP server read only while the
// plugin reads Figma: use_figma runs JavaScript in a Figma file, and the same
// tool writes and deletes. figma-propose registers this hook in its
// frontmatter, so for the rest of a session that used it, use_figma runs only
// the plugin's read script (figma/read-variables.js, its PAGE line set), and
// any other code is refused. A session that writes to Figma is a new session.
//
// It matches use_figma under every name Claude Code may give it: the Figma
// plugin's (mcp__plugin_figma_figma__use_figma), a user or project server's
// (mcp__figma__use_figma), and a claude.ai connector's. Exit 2 blocks the call
// and hands the reason to the agent (https://code.claude.com/docs/en/hooks).
// No dependencies, Node 20 or later.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isReadScript } from "./figma-read.mjs";

/** figma-read.mjs by its real path: a hook's message reaches the agent as written, with no variable expanded. */
const READER = fileURLToPath(new URL("./figma-read.mjs", import.meta.url));

/** Why a tool call is refused, or undefined when it may run. */
export function refusal(input) {
  if (!/(^|__)use_figma$/.test(String(input?.tool_name ?? ""))) return undefined;
  if (isReadScript(input?.tool_input?.code)) return undefined;
  return `design-system reads Figma read only: use_figma runs only the plugin's read script, printed by \`node ${READER} script --page N\`, unchanged. This call carries other code, so it was not sent. Writing to Figma is a separate session's task.`;
}

function main() {
  const raw = readFileSync(0, "utf8");
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Input it cannot read passes only when it is no use_figma call: the guard fails closed on the tool it guards.
    if (!raw.includes("use_figma")) return 0;
    console.error("design-system could not read this use_figma call, so it was not sent.");
    return 2;
  }
  const reason = refusal(input);
  if (reason === undefined) return 0;
  console.error(reason);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
