import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareMode, figmaColor, figmaFiles, figmaVariables, matchFiles } from "../figma.mjs";
import { schemaProblems } from "../dtcg-schema.mjs";
import { TOKEN_DEFAULTS } from "../project-modules.mjs";

const color = (hex, extra = {}) => ({ $type: "color", $value: { hex }, ...extra });
const contexts = () => {
  const shared = {
    "palette.gray-1": color("#fcfcfc"),
    "palette.gray-12": color("#111111"),
    "font.family.sans": { $type: "fontFamily", $value: ["Inter", "sans-serif"] },
    "font.weight.bold": { $type: "fontWeight", $value: 700 },
    "spacing.md": { $type: "dimension", $value: { value: 1, unit: "rem" }, $description: "The default gap" },
    "rounded.sm": { $type: "dimension", $value: { value: 4, unit: "px" } },
    "spacing.fluid": { $type: "dimension", $value: { value: 2, unit: "vw" } },
    "typography.body": { $type: "typography", $value: {} },
    "motion.duration-short": { $type: "duration", $value: { value: 150, unit: "ms" } },
    "motion.ease-standard": { $type: "cubicBezier", $value: [0.2, 0, 0, 1] },
    "containers.reading": { $type: "dimension", $value: { value: 42, unit: "rem" } },
  };
  return {
    light: { ...shared, "colors.surface": color("#fcfcfc", { aliasChain: ["palette.gray-1"], $description: "The page" }), "colors.scrim": color("#111111", { $value: { hex: "#111111", alpha: 0.5 } }) },
    dark: { ...shared, "colors.surface": color("#111111", { aliasChain: ["palette.gray-12"], $description: "The page" }), "colors.scrim": color("#fcfcfc", { $value: { hex: "#fcfcfc", alpha: 0.5 } }) },
  };
};

describe("figmaColor", () => {
  it("writes the srgb object Figma's import needs, components as channel/255 and an upper-case hex", () => {
    assert.deepEqual(figmaColor({ colorSpace: "srgb", components: [0, 0.4117647058823529, 0.5607843137254902], hex: "#00698f" }), { colorSpace: "srgb", components: [0, 105 / 255, 143 / 255], alpha: 1, hex: "#00698F" });
    assert.equal(figmaColor({ colorSpace: "oklch", components: [0.7, 0.4, 30] }).colorSpace, "srgb");
  });
});

describe("figmaFiles", () => {
  const { files, skipped } = figmaFiles(contexts(), TOKEN_DEFAULTS);

  it("makes a palette, a mode per context for the roles, fonts, and px numbers", () => {
    assert.deepEqual(Object.keys(files), ["Palette/default.tokens.json", "Colors/light.tokens.json", "Colors/dark.tokens.json", "Font/default.tokens.json", "Spacing/default.tokens.json", "Radius/default.tokens.json", "Containers/default.tokens.json", "Motion/default.tokens.json"]);
    assert.deepEqual(files["Spacing/default.tokens.json"], { md: { $type: "dimension", $value: { value: 16, unit: "px" }, $description: "The default gap" } });
    assert.deepEqual(files["Font/default.tokens.json"], { family: { sans: { $type: "fontFamily", $value: "Inter" } }, weight: { bold: { $type: "number", $value: 700 } } });
  });

  it("keeps a role that points to the palette an alias of it, with its description, and a derived role a value", () => {
    assert.deepEqual(files["Colors/dark.tokens.json"].surface.$extensions, { "com.figma.aliasData": { targetVariableSetName: "Palette", targetVariableName: "gray-12" } });
    assert.equal(files["Colors/dark.tokens.json"].surface.$description, "The page");
    assert.equal(files["Colors/light.tokens.json"].scrim.$value.alpha, 0.5);
    assert.equal(files["Colors/light.tokens.json"].scrim.$extensions, undefined);
  });

  it("gives every other group with numbers its own collection: px, durations in seconds", () => {
    assert.deepEqual(files["Containers/default.tokens.json"], { reading: { $type: "dimension", $value: { value: 672, unit: "px" } } });
    assert.deepEqual(files["Motion/default.tokens.json"], { "duration-short": { $type: "duration", $value: { value: 0.15, unit: "s" } } });
  });

  it("writes every file to the DTCG 2025.10 schema", () => {
    for (const [file, tree] of Object.entries(files)) assert.deepEqual(schemaProblems(tree), [], file);
  });

  it("names what no Figma variable holds: styles, easing curves, other units", () => {
    assert.deepEqual(skipped, ["motion.ease-standard", "spacing.fluid", "typography.body"]);
  });
});

describe("figmaVariables", () => {
  it("reads an alias either way Figma may write it, a colour by hex and alpha, a dimension or number by its value", () => {
    const tree = {
      a: { $type: "color", $value: { hex: "#FCFCFC" }, $extensions: { "com.figma.aliasData": { targetVariableSetName: "Palette", targetVariableName: "gray-1" } } },
      group: { b: { $type: "color", $value: "{gray.12}" } },
      c: { $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.5, hex: "#000000" } },
      d: { $type: "dimension", $value: { value: 16, unit: "px" } },
      e: { $type: "number", $value: 700 },
    };
    assert.deepEqual(figmaVariables(tree), { a: "alias Palette/gray-1", "group/b": "alias gray/12", c: "#000000 at alpha 0.5", d: "16", e: "700" });
  });
});

describe("figmaVariables: what Figma's own export writes", () => {
  it("reads a dimension Figma exported as a plain float32 number as the value it was given, so a round trip changes nothing", () => {
    const ours = figmaVariables({ h1: { $type: "dimension", $value: { value: 47.776, unit: "px" } }, sm: { $type: "dimension", $value: { value: 13.328, unit: "px" } } });
    const figmas = figmaVariables({ h1: { $type: "number", $value: 47.7760009765625 }, sm: { $type: "number", $value: 13.32800006866455 }, $extensions: { "com.figma.modeName": "Typography.default" } });
    assert.deepEqual(figmas, ours);
    assert.notDeepEqual(figmaVariables({ h1: { $type: "number", $value: 47.78 } }), ours);
  });
});

describe("matchFiles: the collections Figma's zips unpack into", () => {
  it("matches a file by its collection's folder before its names: a radius and a breakpoint share sm, md, lg, xl", () => {
    const known = { "Breakpoints/default.tokens.json": { sm: "640", md: "768", lg: "1024", xl: "1280" }, "Radius/default.tokens.json": { none: "0", sm: "8", md: "12", lg: "16", xl: "20", full: "9999" } };
    const incoming = { "Breakpoints/default.tokens.json": { sm: "640", md: "768", lg: "1024", xl: "1280" }, "Radius/default.tokens.json": { none: "0", sm: "8", md: "12", lg: "16", xl: "20", full: "9999" } };
    assert.deepEqual(matchFiles(incoming, known), { matches: { "Breakpoints/default.tokens.json": "Breakpoints/default.tokens.json", "Radius/default.tokens.json": "Radius/default.tokens.json" }, unmatched: [] });
  });

  it("matches one to one, and leaves a file unmatched when its names fit two collections and nothing settles it", () => {
    const known = { "Breakpoints/default.tokens.json": { sm: "640", md: "768" }, "Radius/default.tokens.json": { sm: "8", md: "12" } };
    assert.deepEqual(matchFiles({ "default.tokens.json": { sm: "8", md: "12" } }, known), { matches: {}, unmatched: ["default.tokens.json"] });
    assert.deepEqual(matchFiles({ "Radius/default.tokens.json": { sm: "8" }, "radius.default.tokens.json": { sm: "8" } }, known).matches, { "Radius/default.tokens.json": "Radius/default.tokens.json", "radius.default.tokens.json": "Breakpoints/default.tokens.json" });
  });
});

describe("figmaVariables: durations", () => {
  it("compares a duration in seconds: Figma takes seconds on import and gives milliseconds on export", () => {
    assert.deepEqual(figmaVariables({ short: { $type: "duration", $value: { value: 150, unit: "ms" } } }), figmaVariables({ short: { $type: "duration", $value: { value: 0.15, unit: "s" } } }));
  });
});

describe("matchFiles", () => {
  const known = { "Colors/light.tokens.json": { surface: "#fcfcfc", scrim: "x" }, "Colors/dark.tokens.json": { surface: "#111111", scrim: "y" }, "Palette/default.tokens.json": { "gray-1": "#fcfcfc", "gray-12": "#111111" } };

  it("matches Figma's files by the variables they share, and settles a tie between modes by the mode's name", () => {
    const incoming = { "Dark.tokens.json": { surface: "#111111", scrim: "y" }, "Light.tokens.json": { surface: "#fcfcfc" }, "Mode 1.tokens.json": { "gray-1": "#fcfcfc" }, "Other.tokens.json": { unrelated: "1" } };
    assert.deepEqual(matchFiles(incoming, known), { matches: { "Dark.tokens.json": "Colors/dark.tokens.json", "Light.tokens.json": "Colors/light.tokens.json", "Mode 1.tokens.json": "Palette/default.tokens.json" }, unmatched: ["Other.tokens.json"] });
  });
});

describe("compareMode", () => {
  it("tells a Figma change from a token change, and both apart from a conflict", () => {
    const base = { kept: "1", figma: "1", code: "1", both: "1", same: "1", gone: "1", stale: "1" };
    const figma = { kept: "1", figma: "2", code: "1", both: "2", same: "3", stale: "1", fresh: "9" };
    const code = { kept: "1", figma: "1", code: "4", both: "5", same: "3", gone: "1", added: "7" };
    assert.deepEqual(compareMode(base, figma, code).map(({ name, outcome }) => [name, outcome]), [
      ["added", "code-added"],
      ["both", "conflict"],
      ["code", "code-changed"],
      ["figma", "figma-changed"],
      ["fresh", "figma-added"],
      ["gone", "figma-removed"],
      ["stale", "code-removed"],
    ]);
  });
});
