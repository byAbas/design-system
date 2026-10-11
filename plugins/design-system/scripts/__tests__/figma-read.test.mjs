import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { refusal } from "../figma-read-guard.mjs";
import { figmaExportFiles, fnv1a, isReadScript, joinPages, readScript } from "../figma-read.mjs";
import { figmaFileProblems, propose } from "../figma-propose.mjs";
import { figmaFiles, figmaVariables } from "../lib/figma.mjs";
import { TOKEN_DEFAULTS } from "../lib/project-modules.mjs";

const AsyncFunction = (async () => {}).constructor;

/**
 * A Figma file as the Plugin API sees it, built from files in the export's dialect: what a designer has after
 * importing them. Aliases point at the target variable's id; colours are 0–1 floats, and numbers and durations
 * 32-bit floats, a duration a TIMING variable in seconds, as Figma holds them (2026-10, read through use_figma).
 */
function figmaFrom(files) {
  const collections = new Map();
  const variables = [];
  const ids = new Map();
  let next = 1;
  const flat = (tree, path = []) => Object.entries(tree).flatMap(([key, value]) => (key.startsWith("$") ? [] : "$value" in value ? [[[...path, key].join("/"), value]] : flat(value, [...path, key])));
  for (const [file, tree] of Object.entries(files)) {
    const [name, modeFile] = file.split("/");
    const mode = modeFile.replace(/\.tokens\.json$/, "");
    const collection = collections.get(name) ?? { id: `C:${name}`, name, modes: [], variableIds: [] };
    collections.set(name, collection);
    const modeId = `M:${name}:${mode}`;
    collection.modes.push({ modeId, name: mode });
    for (const [variableName, token] of flat(tree)) {
      let variable = ids.get(`${name}/${variableName}`);
      if (!variable) {
        variable = { id: `V:${next++}`, name: variableName, variableCollectionId: collection.id, description: token.$description ?? "", resolvedType: token.$type === "color" ? "COLOR" : token.$type === "duration" ? "TIMING" : typeof token.$value === "string" ? "STRING" : "FLOAT", valuesByMode: {} };
        ids.set(`${name}/${variableName}`, variable);
        variables.push(variable);
        collection.variableIds.push(variable.id);
      }
      variable.valuesByMode[modeId] = { token };
    }
  }
  for (const variable of variables) {
    for (const [modeId, { token }] of Object.entries(variable.valuesByMode)) {
      const alias = token.$extensions?.["com.figma.aliasData"];
      if (alias) variable.valuesByMode[modeId] = { type: "VARIABLE_ALIAS", id: ids.get(`${alias.targetVariableSetName}/${alias.targetVariableName}`).id };
      else if (token.$type === "color") variable.valuesByMode[modeId] = { r: token.$value.components[0], g: token.$value.components[1], b: token.$value.components[2], a: token.$value.alpha };
      else if (typeof token.$value === "string") variable.valuesByMode[modeId] = token.$value;
      else variable.valuesByMode[modeId] = Math.fround(typeof token.$value === "object" ? token.$value.value : token.$value);
    }
  }
  return {
    variables: {
      getLocalVariableCollectionsAsync: async () => [...collections.values()],
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async (id) => variables.find((variable) => variable.id === id) ?? null,
      getVariableCollectionByIdAsync: async (id) => [...collections.values()].find((collection) => collection.id === id) ?? null,
    },
  };
}

/** Every page of a read, run as use_figma would run the read script, and saved as JSON text. */
async function readAll(figma) {
  const first = await new AsyncFunction("figma", readScript(0))(figma);
  const results = [first];
  for (let page = 1; page < first.data.pages; page++) results.push(await new AsyncFunction("figma", readScript(page))(figma));
  return results.map((result) => JSON.parse(JSON.stringify(result)));
}

const color = (hex, extra = {}) => ({ $type: "color", $value: { hex }, ...extra });
const contexts = {
  light: { "palette.white": color("#ffffff"), "palette.ink": color("#111111"), "colors.surface": color("#ffffff", { aliasChain: ["palette.white"], $description: "The page" }), "colors.scrim": color("#111111", { $value: { hex: "#111111", alpha: 0.5 } }), "font.family.sans": { $type: "fontFamily", $value: ["Inter", "sans-serif"] }, "spacing.md": { $type: "dimension", $value: { value: 1, unit: "rem" } }, "motion.fast": { $type: "duration", $value: { value: 150, unit: "ms" } } },
  dark: { "palette.white": color("#ffffff"), "palette.ink": color("#111111"), "colors.surface": color("#111111", { aliasChain: ["palette.ink"], $description: "The page" }), "colors.scrim": color("#ffffff", { $value: { hex: "#ffffff", alpha: 0.5 } }), "font.family.sans": { $type: "fontFamily", $value: ["Inter", "sans-serif"] }, "spacing.md": { $type: "dimension", $value: { value: 1, unit: "rem" } }, "motion.fast": { $type: "duration", $value: { value: 150, unit: "ms" } } },
};

describe("the read script, run against a Figma file made from the export", () => {
  it("reads back what the export wrote, so figma-propose finds nothing changed", async () => {
    const exported = figmaFiles(contexts, TOKEN_DEFAULTS).files;
    const read = joinPages(await readAll(figmaFrom(exported)));
    const { files, skipped } = figmaExportFiles(read);
    assert.deepEqual(skipped, []);
    for (const tree of Object.values(files)) assert.deepEqual(figmaFileProblems(tree).problems, []);
    assert.deepEqual(files["Motion/default.tokens.json"].fast, { $type: "duration", $value: { value: 150, unit: "ms" } });
    const incoming = Object.fromEntries(Object.entries(files).map(([file, tree]) => [file, figmaVariables(tree)]));
    const baseline = Object.fromEntries(Object.entries(exported).map(([file, tree]) => [file, figmaVariables(tree)]));
    assert.deepEqual(Object.keys(incoming).sort(), Object.keys(baseline).sort());
    assert.deepEqual(propose({ incoming, baseline, current: baseline, settings: TOKEN_DEFAULTS }).changes, []);
  });

  it("proposes a designer's change made in Figma: a role re-pointed in one mode", async () => {
    const exported = figmaFiles(contexts, TOKEN_DEFAULTS).files;
    const figma = figmaFrom(exported);
    const surface = (await figma.variables.getLocalVariablesAsync()).find((variable) => variable.name === "surface");
    const ink = (await figma.variables.getLocalVariablesAsync()).find((variable) => variable.name === "ink");
    surface.valuesByMode["M:Colors:light"] = { type: "VARIABLE_ALIAS", id: ink.id };
    const { files } = figmaExportFiles(joinPages(await readAll(figma)));
    const incoming = Object.fromEntries(Object.entries(files).map(([file, tree]) => [file, figmaVariables(tree)]));
    const baseline = Object.fromEntries(Object.entries(exported).map(([file, tree]) => [file, figmaVariables(tree)]));
    assert.deepEqual(propose({ incoming, baseline, current: baseline, settings: TOKEN_DEFAULTS }).changes.map(({ token, mode, outcome, figma: value }) => [token, mode, outcome, value]), [["colors.surface", "light", "figma-changed", "alias Palette/ink"]]);
  });

  it("pages a large file under use_figma's 20kb, and joins the pages into every variable", async () => {
    const many = { light: Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`palette.a-rather-long-palette-entry-name-${i}`, color(`#${(i * 4099).toString(16).padStart(6, "0").slice(-6)}`)])) };
    const results = await readAll(figmaFrom(figmaFiles(many, TOKEN_DEFAULTS).files));
    assert.ok(results.length > 1, `${results.length} pages`);
    for (const result of results) assert.ok(JSON.stringify(result).length < 20000, `page ${result.data.page} is ${JSON.stringify(result).length} characters`);
    assert.equal(joinPages(results).rows.length, 600);
  });

  it("names a boolean, an easing and a library alias it cannot write, and writes the rest", () => {
    const { files, skipped } = figmaExportFiles({ collections: [["Colors", ["light"]]], rows: [["Colors", "on", "BOOLEAN", [true]], ["Colors", "ease", "EASING", [{ type: "EASE_OUT" }]], ["Colors", "brand", "COLOR", [{ a: ["Library", "blue"] }]], ["Colors", "ink", "COLOR", ["#111111"]]] });
    assert.deepEqual(skipped, ["Colors/on (light): a boolean, which the tokens never hold", "Colors/ease (light): Figma's EASING type, which figma-export never writes", "Colors/brand (light): an alias of Library/blue the file does not hold (a library variable)"]);
    assert.deepEqual(Object.keys(files["Colors/light.tokens.json"]).filter((key) => !key.startsWith("$")), ["ink"]);
  });
});

describe("joinPages", () => {
  const page = (data) => ({ data, fnv1a: fnv1a(JSON.stringify(data)) });
  const base = { v: 1, pages: 2, total: 2, collections: [["Palette", ["default"]]] };

  it("refuses a page that changed after Figma hashed it, a missing page, and pages of two reads", () => {
    const tampered = page({ ...base, page: 0, rows: [["Palette", "ink", "COLOR", ["#111111"]]] });
    tampered.data.rows[0][3][0] = "#111112";
    assert.throws(() => joinPages([tampered, page({ ...base, page: 1, rows: [] })]), /does not match the hash Figma computed/);
    assert.throws(() => joinPages([page({ ...base, page: 0, rows: [] })]), /the read has 2 pages; saved: 0/);
    assert.throws(() => joinPages([page({ ...base, page: 0, rows: [["Palette", "a", "COLOR", ["#000000"]]] }), page({ ...base, total: 3, page: 1, rows: [["Palette", "b", "COLOR", ["#000000"]]] })]), /comes from another read/);
    assert.throws(() => joinPages([page({ ...base, page: 0, rows: [] }), page({ ...base, page: 1, rows: [] })]), /hold 0 variables, the read counted 2/);
  });

  it("accepts a page saved with other whitespace, since the hash is over the data, not the file's text", () => {
    const one = { ...base, pages: 1, total: 1, page: 0, rows: [["Palette", "ink", "COLOR", ["#111111"]]] };
    const saved = JSON.parse(JSON.stringify(page(one), null, 4));
    assert.equal(joinPages([saved]).rows.length, 1);
  });
});

describe("figma-read-guard", () => {
  const call = (code, tool = "mcp__plugin_figma_figma__use_figma") => ({ tool_name: tool, tool_input: { fileKey: "x", code } });

  it("lets the read script through on any page, under each name use_figma may have", () => {
    for (const tool of ["mcp__plugin_figma_figma__use_figma", "mcp__figma__use_figma", "mcp__claude_ai_Figma__use_figma"]) assert.equal(refusal(call(readScript(4), tool)), undefined, tool);
    assert.equal(refusal(call(`\n${readScript(0)}\n`)), undefined);
  });

  it("refuses any other code, a read script with a line added, and a call with no code", () => {
    assert.match(refusal(call("figma.root.children[0].remove()")), /runs only the plugin's read script/);
    assert.ok(refusal(call("return 1;")).includes(`node ${join(import.meta.dirname, "..", "figma-read.mjs")} script --page N`));
    assert.match(refusal(call(readScript(0).replace("const LIMIT = 16000;", "const LIMIT = 16000;\nawait figma.variables.getLocalVariablesAsync().then((all) => all.forEach((v) => v.remove()));"))), /runs only/);
    assert.match(refusal({ tool_name: "mcp__figma__use_figma", tool_input: {} }), /runs only/);
  });

  it("leaves every other tool alone", () => {
    assert.equal(refusal({ tool_name: "mcp__plugin_figma_figma__whoami", tool_input: {} }), undefined);
    assert.equal(refusal({ tool_name: "Bash", tool_input: { command: "ls" } }), undefined);
  });

  it("recognises only the shipped script's text, whose PAGE line it may change", () => {
    assert.equal(isReadScript(readScript(7)), true);
    assert.equal(isReadScript(readScript(0).replace("const PAGE = 0;", "const PAGE = 0; figma.root.remove();")), false);
  });
});
