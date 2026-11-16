import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { caller, changedPaths, editedPath, personNote, shellCommand } from "../hook-io.mjs";

describe("editedPath", () => {
  it("reads the path an Edit or Write call names", () => {
    assert.equal(editedPath({ tool_input: { file_path: "/repo/src/a.tsx" } }), "/repo/src/a.tsx");
    assert.equal(editedPath({ tool_input: {} }), undefined);
    assert.equal(editedPath({}), undefined);
  });
});

describe("shellCommand", () => {
  it("reads the command a Bash call runs", () => {
    assert.equal(shellCommand({ tool_input: { command: "git commit -m x" } }), "git commit -m x");
    assert.equal(shellCommand({ tool_input: {} }), undefined);
  });
});

describe("changedPaths", () => {
  const input = (bashEditDiff) => ({ tool_name: "Bash", tool_input: { command: "node -e '…'" }, tool_response: { stdout: "", bashEditDiff } });

  it("reads Claude Code's changed-file list in the shape a real session records", () => {
    const recorded = { files: [{}, {}], moreFiles: 0, changedFiles: ["/repo/design-system/tokens/semantic/colors.tokens.json", "/repo/lib/site.ts", "/repo/styles/theme.generated.css"] };
    assert.deepEqual(changedPaths(input(recorded)), recorded.changedFiles);
  });

  it("gives nothing without a list or for a skipped diff, and drops entries that are not paths", () => {
    assert.deepEqual(changedPaths({ tool_response: { stdout: "" } }), []);
    assert.deepEqual(changedPaths(input({ skipped: true, changedFiles: ["/repo/src/a.tsx"] })), []);
    assert.deepEqual(changedPaths(input({ changedFiles: [7, "", "/repo/src/a.tsx"] })), ["/repo/src/a.tsx"]);
    assert.deepEqual(changedPaths({}), []);
  });
});

describe("caller", () => {
  it("names this agent and the session of the hook input, for the gate log", () => {
    assert.deepEqual(caller({ session_id: "abc" }), { by: "claude-code", session: "abc" });
    assert.deepEqual(caller({}), { by: "claude-code" });
    assert.deepEqual(caller(undefined), { by: "claude-code" });
  });
});

describe("personNote", () => {
  it("is the catch's first line, which the core writes to stand on its own", () => {
    assert.equal(personNote("Design-system gate caught src/a.tsx: design-system/no-raw-color.\nThe design lint failed for src/a.tsx:\n1:1 error"), "Design-system gate caught src/a.tsx: design-system/no-raw-color.");
  });
});
