import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const core = new URL("../", import.meta.url);
const read = (path, base = core) => readFileSync(new URL(path, base), "utf8");
const claudeCode = new URL("../../adapters/claude-code/", import.meta.url);

describe("the harness layout", () => {
  it("keeps every agent out of the core, which lands in the project's design-system/harness", () => {
    const files = readdirSync(core, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
    for (const file of files) assert.doesNotMatch(read(file), /claude|cursor|codex|copilot|windsurf/i, file);
  });

  it("points git, CI and the Claude Code settings at design-system/harness, and the settings at the adapters in .claude/hooks/design-system", () => {
    assert.match(read("pre-commit"), /^"\$\(git rev-parse --show-toplevel\)"\/design-system\/harness\/with-node\.sh design-system\/harness\/run-gates\.mjs before-commit$/m);
    assert.match(read("design-system.yml"), /run: node design-system\/harness\/run-gates\.mjs before-commit/);
    const hooks = JSON.parse(read("settings.hooks.json", claudeCode)).hooks;
    const commands = Object.values(hooks).flat().flatMap((entry) => entry.hooks.map((hook) => hook.command));
    assert.equal(commands.length, 5);
    for (const command of commands) assert.match(command, /^"\$CLAUDE_PROJECT_DIR"\/design-system\/harness\/with-node\.sh \.claude\/hooks\/design-system\/[a-z-]+\.mjs$/);
  });

  it("has the adapters decide nothing: each imports the core's stages and answers through hook-io", () => {
    for (const file of ["protect-generated.mjs", "check-on-edit.mjs", "check-after-bash.mjs", "guard-commit.mjs"]) {
      const text = read(file, claudeCode);
      assert.match(text, /from "\.\.\/\.\.\/\.\.\/design-system\/harness\/gates\.mjs"/, file);
      assert.match(text, /STAGES\["[a-z-]+"\]/, file);
      assert.doesNotMatch(text, /matchesAny|runAll|process\.exit|spawnSync/, file);
    }
    const summary = read("summary-on-stop.mjs", claudeCode);
    assert.match(summary, /import \{ readGates, summarize \} from "\.\.\/\.\.\/\.\.\/design-system\/harness\/gates\.mjs"/);
    assert.doesNotMatch(summary, /readLog|openCatches|process\.exit|readFileSync/);
  });

  it("keeps the gate log out of git: the core names one file, and never writes it in CI", () => {
    const gates = read("gates.mjs");
    assert.match(gates, /export const LOG_FILE = "design-system\/gate-log\.jsonl";/);
    assert.match(gates, /gates\?\.log === false \|\| env\.CI/);
  });
});
