#!/usr/bin/env node
// Reads a Figma file's variables through the Figma MCP server, for
// figma-propose.mjs, in place of a designer's "Export modes". The agent runs
// the plugin's read script (figma/read-variables.js) through use_figma, one
// call per page, and saves each result as it came; this script checks every
// page against the hash the read script computed inside Figma, so a value the
// agent mistyped while saving is refused, and writes the variables as the
// files Figma's own export writes: `<Collection>/<mode>.tokens.json`.
//
//   node figma-read.mjs script [--page N]                 the code to pass to use_figma
//   node figma-read.mjs assemble <pages folder> --out <folder>
//
// It writes nothing in Figma and nothing in the project. No dependencies.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { figmaFileProblems } from "./figma-propose.mjs";

const SCRIPT = new URL("./figma/read-variables.js", import.meta.url);
const PAGE_LINE = /^const PAGE = \d+;$/m;

/** The read script for one page: the shipped text with its PAGE line set, and nothing else changed. */
export function readScript(page = 0) {
  const text = readFileSync(SCRIPT, "utf8");
  if (!PAGE_LINE.test(text)) throw new Error("figma/read-variables.js has lost its PAGE line");
  if (!Number.isInteger(page) || page < 0) throw new Error(`a page is a whole number from 0, not ${page}`);
  return text.replace(PAGE_LINE, `const PAGE = ${page};`);
}

/** True when `code` is the read script for some page, whitespace at its ends aside. */
export function isReadScript(code) {
  return typeof code === "string" && PAGE_LINE.test(code) && code.replace(PAGE_LINE, "const PAGE = 0;").trim() === readScript(0).trim();
}

/** FNV-1a over UTF-16 code units, as the read script computes it inside Figma. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

/**
 * The pages of one read, checked and joined: each page's hash recomputed, every page present once, the same file
 * on every page, and the row count equal to the total the script counted. Throws with what is wrong.
 * @param {{ data: any, fnv1a: string }[]} results the use_figma results, as saved
 */
export function joinPages(results) {
  if (results.length === 0) throw new Error("no page was saved");
  for (const [index, result] of results.entries()) {
    if (!result || typeof result !== "object" || !result.data || typeof result.fnv1a !== "string") throw new Error(`page file ${index + 1} is not a use_figma result of the read script ({ data, fnv1a })`);
    if (result.data.v !== 1) throw new Error(`page ${result.data.page} is from read script version ${result.data.v}, not 1`);
    if (fnv1a(JSON.stringify(result.data)) !== result.fnv1a) throw new Error(`page ${result.data.page} does not match the hash Figma computed (${result.fnv1a}): it changed between Figma and the file. Save the result again, exactly as use_figma returned it`);
  }
  const first = results[0].data;
  const pages = [...results].sort((a, b) => a.data.page - b.data.page);
  if (pages.length !== first.pages || pages.some((result, index) => result.data.page !== index)) throw new Error(`the read has ${first.pages} pages; saved: ${pages.map((result) => result.data.page).join(", ")}`);
  for (const { data } of pages) {
    if (data.pages !== first.pages || data.total !== first.total || JSON.stringify(data.collections) !== JSON.stringify(first.collections)) throw new Error(`page ${data.page} comes from another read: its file or its count differs. Read every page again`);
  }
  const rows = pages.flatMap(({ data }) => data.rows);
  if (rows.length !== first.total) throw new Error(`the pages hold ${rows.length} variables, the read counted ${first.total}`);
  return { collections: first.collections, rows };
}

const hexObject = (hex, alpha = 1) => ({ colorSpace: "srgb", components: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), alpha, hex: hex.toUpperCase() });

/**
 * The joined read as the files Figma's own "Export modes" writes, one per collection and mode: a colour as an srgb
 * object, a number as a number, a timing (held in seconds) as a duration in milliseconds, a string as Figma's `string`
 * type, and an alias as its resolved value with `com.figma.aliasData` naming its target. A variable that cannot be
 * written is named in `skipped`: a boolean, which the tokens never hold, a type figma-export never writes (an easing),
 * or an alias whose target the file does not hold (a library variable).
 * @param {{ collections: [string, string[]][], rows: any[] }} read
 * @returns {{ files: Record<string, object>, skipped: string[] }}
 */
export function figmaExportFiles({ collections, rows }) {
  const modes = new Map(collections);
  const byName = new Map(rows.map((row) => [`${row[0]}\u0000${row[1]}`, row]));
  const skipped = [];
  /** A value resolved through aliases: the target's value in the mode of the same name, else its first. */
  const resolve = (value, mode, depth = 0) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !("a" in value)) return value;
    if (!value.a || depth > 16) return undefined;
    const target = byName.get(`${value.a[0]}\u0000${value.a[1]}`);
    if (!target) return undefined;
    const targetModes = modes.get(target[0]) ?? [];
    const index = Math.max(0, targetModes.indexOf(mode));
    return resolve(target[3][index], mode, depth + 1);
  };
  const files = {};
  for (const [collection, name, type, values, description] of rows) {
    (modes.get(collection) ?? []).forEach((mode, index) => {
      const raw = values[index];
      const alias = raw && typeof raw === "object" && !Array.isArray(raw) && "a" in raw ? raw.a : undefined;
      const value = resolve(raw, mode);
      const label = `${collection}/${name} (${mode})`;
      if (type === "BOOLEAN") return skipped.push(`${label}: a boolean, which the tokens never hold`);
      if (value === undefined) return skipped.push(`${label}: an alias of ${alias ? alias.join("/") : "a variable"} the file does not hold (a library variable)`);
      let entry;
      if (type === "COLOR") entry = { $type: "color", $value: Array.isArray(value) ? hexObject(value[0], value[1]) : hexObject(value) };
      else if (type === "FLOAT") entry = { $type: "number", $value: value };
      else if (type === "TIMING") entry = { $type: "duration", $value: { value: Number((Math.fround(value) * 1000).toPrecision(7)), unit: "ms" } };
      else if (type === "STRING") entry = { $type: "string", $value: String(value) };
      else return skipped.push(`${label}: Figma's ${type} type, which figma-export never writes`);
      if (description) entry.$description = description;
      if (alias) entry.$extensions = { "com.figma.aliasData": { targetVariableSetName: alias[0], targetVariableName: alias[1] } };
      const file = `${collection}/${mode}.tokens.json`;
      files[file] ??= { $extensions: { "com.figma.modeName": mode } };
      let node = files[file];
      const parts = name.split("/");
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      node[parts.at(-1)] = entry;
    });
  }
  return { files, skipped };
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === "script") {
    const at = rest.indexOf("--page");
    process.stdout.write(readScript(at === -1 ? 0 : Number(rest[at + 1])));
    return 0;
  }
  if (command === "assemble") {
    const folder = rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--out");
    const at = rest.indexOf("--out");
    if (!folder || at === -1) {
      console.error("usage: figma-read.mjs assemble <pages folder> --out <folder>");
      return 2;
    }
    let read;
    try {
      const results = readdirSync(folder).filter((file) => file.endsWith(".json")).sort().map((file) => JSON.parse(readFileSync(join(folder, file), "utf8")));
      read = joinPages(results);
    } catch (error) {
      console.error(`The read cannot be used: ${error.message}`);
      return 1;
    }
    const { files, skipped } = figmaExportFiles(read);
    const invalid = Object.entries(files).flatMap(([file, tree]) => figmaFileProblems(tree).problems.map((problem) => `${file} ${problem}`));
    if (invalid.length > 0) {
      console.error(`The read breaks the DTCG 2025.10 schema, so nothing was written:\n${invalid.map((problem) => `  - ${problem}`).join("\n")}`);
      return 1;
    }
    for (const [file, tree] of Object.entries(files)) {
      mkdirSync(dirname(join(rest[at + 1], file)), { recursive: true });
      writeFileSync(join(rest[at + 1], file), `${JSON.stringify(tree, null, 2)}\n`);
    }
    for (const skip of skipped) console.error(`note: not read: ${skip}`);
    console.log(`figma-read: ${read.rows.length} variables in ${read.collections.length} collections, written as ${Object.keys(files).length} files to ${rest[at + 1]}. Compare them with figma-propose.mjs.`);
    return 0;
  }
  console.error("usage: figma-read.mjs script [--page N] | assemble <pages folder> --out <folder>");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
