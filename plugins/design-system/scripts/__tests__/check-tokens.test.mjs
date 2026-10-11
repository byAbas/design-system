import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { derivedRuleOf, groupProblems, readProjectTokens, tierProblems } from "../check-tokens.mjs";
import { flagSettings, readConfig, tokenSettings } from "../lib/project-modules.mjs";
import { TOKEN_DEFAULTS } from "../lib/project-modules.mjs";

const settings = { ...TOKEN_DEFAULTS, extensionKey: "com.example.design" };
const color = (hex, extra = {}) => ({ $type: "color", $value: { hex }, ...extra });
const derived = (hex, rule) => color(hex, { $extensions: { "com.example.design": { derived: rule } } });
const hoverRule = { kind: "lightness", from: "primary", lightness: -0.07 };

/** Two contexts that keep every rule; `derive` below returns what each rule "gives". */
function contexts() {
  const palette = { "palette.gray-1": color("#fcfcfc"), "palette.accent-9": color("#00aa88") };
  const context = (surfaceHex) => ({
    ...palette,
    "colors.surface": color(surfaceHex, { aliasOf: "palette.gray-1", aliasChain: ["palette.gray-1"] }),
    "colors.primary": color("#00aa88", { aliasOf: "palette.accent-9", aliasChain: ["palette.accent-9"] }),
    "colors.primary-hover": derived("#008866", hoverRule),
    "typography.body": { $type: "typography", originalValue: { $value: { fontFamily: "{font.sans}", fontWeight: "{font.weight.400}" } } },
  });
  return { light: context("#fcfcfc"), dark: context("#111111") };
}
const derive = () => "#008866";

describe("derivedRuleOf", () => {
  it("reads both rule kinds under the project's key", () => {
    assert.deepEqual(derivedRuleOf({ k: { derived: hoverRule } }, "k"), hoverRule);
    assert.deepEqual(derivedRuleOf({ k: { derived: { kind: "mix", from: "a", weight: 0.6, over: "b" } } }, "k"), { kind: "mix", from: "a", weight: 0.6, over: "b" });
    assert.deepEqual(derivedRuleOf({ k: { derived: { kind: "alpha", from: "a", alpha: 0.5 } } }, "k"), { kind: "alpha", from: "a", alpha: 0.5 });
    assert.equal(derivedRuleOf({ other: { derived: hoverRule } }, "k"), undefined);
  });

  it("names a malformed rule instead of accepting it", () => {
    assert.match(derivedRuleOf({ k: { derived: { kind: "mix", from: "a", weight: 1.5, over: "b" } } }, "k"), /^malformed derived rule/);
    assert.match(derivedRuleOf({ k: { derived: { kind: "darken", from: "a" } } }, "k"), /^malformed derived rule/);
    // An alpha of 1 is the base itself, an alias; an alpha above it is no colour.
    for (const alpha of [1, 1.2, -0.1, "0.5"]) assert.match(derivedRuleOf({ k: { derived: { kind: "alpha", from: "a", alpha } } }, "k"), /^malformed derived rule/, String(alpha));
  });
});

describe("tierProblems", () => {
  it("passes tokens that keep every rule", () => {
    assert.deepEqual(tierProblems(contexts(), settings, derive), []);
  });

  it("refuses a palette alias, a role pointing to a role, and a literal role", () => {
    const tokens = contexts();
    tokens.light["palette.gray-1"] = color("#fcfcfc", { aliasOf: "palette.accent-9", aliasChain: ["palette.accent-9"] });
    tokens.dark["colors.surface"] = color("#00aa88", { aliasOf: "palette.accent-9", aliasChain: ["colors.primary", "palette.accent-9"] });
    tokens.dark["colors.primary"] = color("#00aa88");
    assert.deepEqual(tierProblems(tokens, settings, derive), [
      "tiers/palette-literal: palette.gray-1 is an alias of palette.accent-9; the palette holds values only",
      "tiers/role-aliases-palette: dark: colors.surface points to colors.primary; a role points to the palette, or is derived by a recorded rule",
      "tiers/role-aliases-palette: dark: colors.primary is a literal; a role points to the palette, or is derived by a recorded rule",
    ]);
  });

  it("refuses a derived value its rule does not give, and a rule reading a missing role", () => {
    const tokens = contexts();
    tokens.light["colors.primary-hover"] = derived("#123456", hoverRule);
    tokens.dark["colors.primary-hover"] = derived("#008866", { kind: "mix", from: "primary", weight: 0.5, over: "missing" });
    const problems = tierProblems(tokens, settings, derive);
    assert.ok(problems.includes("tiers/derived-rule-recorded: light: colors.primary-hover is #123456, but its rule gives #008866"));
    assert.ok(problems.includes("tiers/derived-rule-recorded: dark: colors.primary-hover derives from missing, which is not a role"));
    assert.ok(problems.includes("format/themes-complete: colors.primary-hover is derived differently across light, dark"));
  });

  it("checks an alpha rule against its base, in each context, alpha included", () => {
    const scrim = (hex, alpha) => color(hex, { $value: { hex, alpha }, $extensions: { "com.example.design": { derived: { kind: "alpha", from: "on-surface", alpha: 0.5 } } } });
    const tokens = contexts();
    for (const [name, onSurface] of [["light", "#111111"], ["dark", "#fcfcfc"]]) tokens[name]["colors.on-surface"] = color(onSurface, { aliasOf: "palette.gray-1", aliasChain: ["palette.gray-1"] });
    tokens.light["colors.scrim"] = scrim("#111111", 0.5);
    tokens.dark["colors.scrim"] = scrim("#fcfcfc", 0.5);
    assert.deepEqual(tierProblems(tokens, settings, derive), []);
    // The base changed and the scrim was not rebuilt; and an alpha copied by hand drifted.
    tokens.dark["colors.scrim"] = scrim("#111111", 0.5);
    tokens.light["colors.scrim"] = scrim("#111111", 0.45);
    assert.deepEqual(tierProblems(tokens, settings, derive), [
      "tiers/derived-rule-recorded: light: colors.scrim is #111111 at alpha 0.45, but its rule gives #111111 at alpha 0.5",
      "tiers/derived-rule-recorded: dark: colors.scrim is #111111 at alpha 0.5, but its rule gives #fcfcfc at alpha 0.5",
    ]);
  });

  it("refuses a rule that reads a translucent role, and a lightness or mix value stored with an alpha", () => {
    const tokens = contexts();
    tokens.light["colors.primary"] = color("#00aa88", { $value: { hex: "#00aa88", alpha: 0.4 }, aliasOf: "palette.accent-9", aliasChain: ["palette.accent-9"] });
    tokens.dark["colors.primary-hover"] = derived("#008866", hoverRule);
    tokens.dark["colors.primary-hover"].$value = { hex: "#008866", alpha: 0.9 };
    assert.deepEqual(tierProblems(tokens, settings, derive), [
      "tiers/derived-rule-recorded: light: colors.primary-hover derives from primary, which is translucent; a rule reads opaque roles",
      "tiers/derived-rule-recorded: dark: colors.primary-hover is #008866 at alpha 0.9, but its rule gives #008866",
    ]);
  });

  it("refuses a role missing from one context", () => {
    const tokens = contexts();
    delete tokens.dark["colors.surface"];
    assert.deepEqual(tierProblems(tokens, settings, derive), ["format/themes-complete: colors.surface is defined in light only"]);
  });

  it("refuses a text style with a literal family or weight", () => {
    const tokens = contexts();
    tokens.light["typography.body"].originalValue.$value.fontFamily = ["Inter", "sans-serif"];
    assert.deepEqual(tierProblems(tokens, settings, derive), ["tiers/styles-alias-foundation: typography.body.fontFamily is a literal; a text style takes its fontFamily from font.*"]);
  });
});

describe("readProjectTokens", () => {
  const write = (files) => {
    const root = mkdtempSync(join(tmpdir(), "design-system-check-"));
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), JSON.stringify(content));
    }
    return root;
  };
  const palette = { palette: { $type: "color", "gray-1": { $value: { colorSpace: "srgb", components: [0.99, 0.99, 0.99], hex: "#fcfcfc" } }, "gray-12": { $value: { colorSpace: "srgb", components: [0.07, 0.07, 0.07], hex: "#111111" } } } };
  const theme = (surface) => ({ colors: { $type: "color", surface: { $value: `{palette.${surface}}` } } });

  it("resolves each context of the theme modifier, and the tier rules pass on them", () => {
    const root = write({
      "design-system/tokens/foundation/palette.tokens.json": palette,
      "design-system/tokens/themes/light.tokens.json": theme("gray-1"),
      "design-system/tokens/themes/dark.tokens.json": theme("gray-12"),
      "design-system/tokens/design.resolver.json": { version: "2025.10", sets: { base: { sources: [{ $ref: "foundation/palette.tokens.json" }] } }, modifiers: { theme: { contexts: { light: [{ $ref: "themes/light.tokens.json" }], dark: [{ $ref: "themes/dark.tokens.json" }] }, default: "light" } }, resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }] },
    });
    try {
      const { contexts, problems } = readProjectTokens(root, settings);
      assert.deepEqual(problems, []);
      assert.deepEqual(Object.keys(contexts), ["light", "dark"]);
      assert.deepEqual(contexts.dark["colors.surface"].aliasChain, ["palette.gray-12"]);
      assert.deepEqual(tierProblems(contexts, settings), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a modifier with one context as format/dtcg-valid", () => {
    const root = write({
      "design-system/tokens/foundation/palette.tokens.json": palette,
      "design-system/tokens/themes/dark.tokens.json": theme("gray-12"),
      "design-system/tokens/design.resolver.json": { version: "2025.10", sets: { base: { sources: [{ $ref: "foundation/palette.tokens.json" }] } }, modifiers: { theme: { contexts: { dark: [{ $ref: "themes/dark.tokens.json" }] }, default: "dark" } }, resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }] },
    });
    try {
      const { problems } = readProjectTokens(root, settings);
      assert.ok(problems.some((problem) => problem.startsWith("format/dtcg-valid: modifier theme declares 1 context")), problems.join("\n"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("says where to point it when there is no resolver and no files", () => {
    const root = write({});
    try {
      assert.match(readProjectTokens(root, settings).problems[0], /no resolver at design-system\/tokens\/design.resolver.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("groupProblems: no silent pass", () => {
  const ctx = (tokens) => ({ dark: tokens });
  const color = { $type: "color", $value: { hex: "#111111" } };

  it("names the groups the tokens have when the roles group is empty", () => {
    const { problems, counts } = groupProblems(ctx({ "color.surface": color, "typography.body": { $type: "typography" } }), settings);
    assert.deepEqual(counts, { palette: 0, roles: 0, styles: 1 });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^config: no tokens in the roles group colors, so no role could be checked; the tokens have color, typography\. Pass --roles <group>/);
  });

  it("reports a missing palette as a tier problem once roles exist", () => {
    const { problems } = groupProblems(ctx({ "colors.surface": color }), { ...settings, roles: "colors" });
    assert.deepEqual(problems, ["tiers/role-aliases-palette: there is no palette group palette for roles to alias; the tokens have colors. If the palette has another name, pass --palette <group>"]);
  });

  it("finds nothing to report, and counts, when the names match", () => {
    const { problems, counts } = groupProblems(contexts(), settings);
    assert.deepEqual(problems, []);
    assert.deepEqual(counts, { palette: 2, roles: 3, styles: 1 });
  });
});

describe("settings", () => {
  it("defaults to the canonical layout, and lets flags override the config", () => {
    const root = mkdtempSync(join(tmpdir(), "design-system-settings-"));
    try {
      assert.equal(tokenSettings(root).resolver, "design-system/tokens/design.resolver.json");
      mkdirSync(join(root, "design-system"));
      writeFileSync(join(root, "design-system/gates.json"), JSON.stringify({ tokens: { roles: "colors", resolver: "tokens/r.json" } }));
      assert.equal(tokenSettings(root).roles, "colors");
      assert.deepEqual(tokenSettings(root, flagSettings(["--roles", "role", "--resolver", "x.json"])), { ...tokenSettings(root), roles: "role", resolver: "x.json" });
      assert.deepEqual(flagSettings(["--extension-key", "com.ispanviza.design", "--modifier", "mode"]), { extensionKey: "com.ispanviza.design", modifier: "mode" });
      assert.deepEqual(readConfig(root).notes, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still reads the 0.3.x config at the root, with a note to move it", () => {
    const root = mkdtempSync(join(tmpdir(), "design-system-settings-"));
    try {
      writeFileSync(join(root, "design-tokens.gates.json"), JSON.stringify({ tokens: { roles: "colors" } }));
      assert.equal(tokenSettings(root).roles, "colors");
      assert.match(readConfig(root).notes[0], /move it to design-system\/gates.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
