import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileText, staleFiles } from "../figma-export.mjs";
import { figmaFileProblems, propose, readFolder, renderProposal, tokenId } from "../figma-propose.mjs";
import { TOKEN_DEFAULTS } from "../lib/project-modules.mjs";

describe("figma-export: staleness", () => {
  it("names a file whose content differs, a missing one, and one no longer written, in collection folders", () => {
    const dir = mkdtempSync(join(tmpdir(), "design-system-figma-"));
    try {
      for (const folder of ["Colors", "Old"]) mkdirSync(join(dir, folder));
      writeFileSync(join(dir, "Colors/light.tokens.json"), fileText({ a: 1 }));
      writeFileSync(join(dir, "Colors/dark.tokens.json"), fileText({ a: 2 }));
      writeFileSync(join(dir, "Old/default.tokens.json"), "{}\n");
      writeFileSync(join(dir, "README.md"), "kept");
      const files = { "Colors/light.tokens.json": { a: 1 }, "Colors/dark.tokens.json": { a: 3 }, "Palette/default.tokens.json": {} };
      assert.deepEqual(staleFiles(dir, files), { differing: ["Colors/dark.tokens.json", "Palette/default.tokens.json"], extra: ["Old/default.tokens.json"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("figma-propose", () => {
  it("names the token a Figma variable stands for", () => {
    assert.equal(tokenId("Colors/light.tokens.json", "brand/accent", TOKEN_DEFAULTS), "colors.brand.accent");
    assert.equal(tokenId("Palette/default.tokens.json", "gray-9", TOKEN_DEFAULTS), "palette.gray-9");
    assert.equal(tokenId("Radius/default.tokens.json", "sm", TOKEN_DEFAULTS), "rounded.sm");
    assert.equal(tokenId("Containers/default.tokens.json", "reading", TOKEN_DEFAULTS), "containers.reading");
  });

  it("proposes Figma's changes with their token ids and modes, and says when Figma is behind", () => {
    const baseline = { "Colors/light.tokens.json": { surface: "alias Palette/gray-1", link: "#0000ff" } };
    const incoming = { "Light.tokens.json": { surface: "alias Palette/gray-2", link: "#0000ff" } };
    const current = { "Colors/light.tokens.json": { surface: "alias Palette/gray-1", link: "#1111ff" } };
    const proposal = propose({ incoming, baseline, current, settings: TOKEN_DEFAULTS });
    assert.deepEqual(proposal.changes.map(({ token, mode, outcome }) => [token, mode, outcome]), [
      ["colors.link", "light", "code-changed"],
      ["colors.surface", "light", "figma-changed"],
    ]);
    const markdown = renderProposal(proposal);
    assert.match(markdown, /## Changed in Figma: proposed for the tokens \(1\)\n\n- `colors\.surface` \(light\): last export alias Palette\/gray-1; Figma alias Palette\/gray-2; tokens alias Palette\/gray-1/);
    assert.match(markdown, /## Changed in the tokens: Figma is behind, export again \(1\)/);
  });

  it("says when Figma and the tokens agree", () => {
    const same = { "Colors/light.tokens.json": { surface: "#fcfcfc" } };
    assert.match(renderProposal(propose({ incoming: { "Light.tokens.json": same["Colors/light.tokens.json"] }, baseline: same, current: same, settings: TOKEN_DEFAULTS })), /agree on every variable/);
  });
});

describe("figma-propose: Figma's files", () => {
  const canvas = { $type: "color", $value: { colorSpace: "srgb", components: [1, 1, 1], alpha: 1, hex: "#FFFFFF" }, $extensions: { "com.figma.aliasData": { targetVariableName: "white", targetVariableSetName: "Palette" } } };

  it("names Figma's string variables, outside DTCG, and refuses anything else the schema refuses", () => {
    assert.deepEqual(figmaFileProblems({ canvas, sans: { $type: "string", $value: "DM Sans" }, $extensions: { "com.figma.modeName": "default" } }), { problems: [], strings: 1 });
    assert.match(figmaFileProblems({ canvas: { $type: "color", $value: "#fff" } }).problems[0], /\$value is string, expected object/);
  });

  it("reads a folder with its subfolders, keys a file by the mode Figma names, and says why a file is left out", () => {
    const dir = mkdtempSync(join(tmpdir(), "design-system-figma-in-"));
    try {
      mkdirSync(join(dir, "Colors"));
      writeFileSync(join(dir, "Colors/Colors.default.tokens.json"), JSON.stringify({ canvas, $extensions: { "com.figma.modeName": "light" } }));
      writeFileSync(join(dir, "Mode 1.tokens.json"), JSON.stringify({ canvas, $extensions: { "com.figma.modeName": "dark" } }));
      writeFileSync(join(dir, "broken.json"), "{");
      writeFileSync(join(dir, "hex.json"), JSON.stringify({ canvas: { $type: "color", $value: "#fff" } }));
      const { files, unreadable } = readFolder(dir);
      assert.deepEqual(Object.keys(files).sort(), ["Colors/Colors.default.tokens.json", "dark.tokens.json"]);
      assert.deepEqual(unreadable.map((entry) => entry.split(" ")[0]), ["broken.json", "hex.json"]);
      assert.match(unreadable[1], /breaks the DTCG 2025\.10 schema/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
