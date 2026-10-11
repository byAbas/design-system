#!/usr/bin/env node
// Turns a designer's Figma export into a proposal for the tokens: what changed
// in Figma since the last export, what changed in the tokens, and where both
// changed apart. It reads three things, and writes nothing:
// - the baseline: the files figma-export.mjs last wrote, committed in
//   design-system/figma/;
// - Figma: the files the designer exported (Variables, right-click a
//   collection, Export modes), in any folder;
// - the tokens now, exported in memory.
//
//   node figma-propose.mjs <folder of Figma's files> [--root <project>] [--baseline <folder>] [--json]
//   --baseline   the last export, when it is not the project's design-system/figma (a trial export written with --out)
//
// A Figma change becomes a token change only through a reviewed fix batch
// (references/decisions.md, Figma). No dependencies.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectTokens } from "./check-tokens.mjs";
import { schemaProblems } from "./lib/dtcg-schema.mjs";
import { collectionOf, compareMode, figmaFiles, figmaVariables, matchFiles, modeOf, OUTCOMES } from "./lib/figma.mjs";
import { flagSettings, tokenSettings } from "./lib/project-modules.mjs";

/** The token id a Figma variable stands for: `Colors/light.tokens.json` and `brand/accent` → `colors.brand.accent`. */
export function tokenId(file, name, settings) {
  const collection = collectionOf(file);
  const group = { Palette: settings.palette, Colors: settings.roles, Font: settings.fonts, Spacing: "spacing", Radius: "rounded" }[collection];
  return `${group ?? collection.charAt(0).toLowerCase() + collection.slice(1)}.${name.split("/").join(".")}`;
}

/**
 * A Figma file held to the DTCG 2025.10 schema. Figma writes a string variable with `$type: "string"`, which DTCG
 * does not have (Figma help: "accepted on import"); those variables are taken out before the check and counted, so
 * the deviation is named, never forgiven silently. Anything else the schema refuses refuses the file.
 * @returns {{ problems: string[], strings: number }}
 */
export function figmaFileProblems(tree) {
  let strings = 0;
  const strip = (node) => {
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object" && value.$type === "string" && "$value" in value) strings += 1;
      else out[key] = key.startsWith("$") ? value : strip(value);
    }
    return out;
  };
  return { problems: schemaProblems(strip(tree)), strings };
}

/**
 * Every `.json` file of a folder and its subfolders as variables by name, keyed by its path from the folder; a file
 * that is not JSON, or that the DTCG schema refuses, is named in `unreadable` with why. Figma exports each collection
 * as a zip, which unpacks into a folder. A file that names its mode (`com.figma.modeName`, as Figma's export does)
 * is keyed by that mode's name. `strings` counts Figma's string variables, outside DTCG.
 */
export function readFolder(dir) {
  const files = {};
  const unreadable = [];
  let strings = 0;
  const paths = existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).filter((name) => name.endsWith(".json")).sort() : [];
  for (const file of paths) {
    try {
      const tree = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const checked = figmaFileProblems(tree);
      if (checked.problems.length > 0) {
        unreadable.push(`${file} (breaks the DTCG 2025.10 schema: ${checked.problems.slice(0, 2).join("; ")})`);
        continue;
      }
      strings += checked.strings;
      const mode = tree?.$extensions?.["com.figma.modeName"];
      const key = typeof mode === "string" && !file.includes("/") ? `${mode}.tokens.json` : file.split("\\").join("/");
      files[files[key] ? file : key] = figmaVariables(tree);
    } catch {
      unreadable.push(`${file} (not JSON)`);
    }
  }
  return { files, unreadable, strings };
}

/**
 * The proposal: each matched Figma file compared with its baseline and with the tokens now, the changes labelled with
 * their token ids and modes.
 */
export function propose({ incoming, baseline, current, settings }) {
  const { matches, unmatched } = matchFiles(incoming, baseline);
  const changes = Object.entries(matches).flatMap(([file, known]) =>
    compareMode(baseline[known], incoming[file], current[known] ?? {}).map((change) => ({ ...change, file: known, mode: modeOf(known), token: tokenId(known, change.name, settings), from: file })),
  );
  return { changes, unmatched };
}

const TITLES = {
  "figma-changed": "Changed in Figma: proposed for the tokens",
  "figma-added": "Added in Figma: proposed as new tokens",
  "figma-removed": "Removed in Figma: proposed for removal, never removed by itself",
  conflict: "Changed in both, apart: a person decides",
  "code-changed": "Changed in the tokens: Figma is behind, export again",
  "code-added": "Added in the tokens: Figma is behind, export again",
  "code-removed": "Removed from the tokens: Figma is behind, export again",
};

/** The proposal as Markdown, one section per outcome that has changes. */
export function renderProposal({ changes, unmatched }) {
  const lines = ["# Figma proposal", ""];
  if (changes.length === 0) lines.push("Figma and the tokens agree on every variable the export holds.", "");
  for (const outcome of OUTCOMES) {
    const of = changes.filter((change) => change.outcome === outcome);
    if (of.length === 0) continue;
    lines.push(`## ${TITLES[outcome]} (${of.length})`, "");
    for (const change of of) {
      const values = [change.base !== undefined ? `last export ${change.base}` : "", change.figma !== undefined ? `Figma ${change.figma}` : "", change.code !== undefined ? `tokens ${change.code}` : ""].filter(Boolean).join("; ");
      lines.push(`- \`${change.token}\` (${change.mode}): ${values}`);
    }
    lines.push("");
  }
  if (unmatched.length > 0) lines.push(`Not compared: ${unmatched.join(", ")}, whose variables match no exported collection.`, "");
  return lines.join("\n");
}

function main(argv) {
  const [folder] = argv.filter((arg, index) => !arg.startsWith("--") && !["--root", "--baseline"].includes(argv[index - 1]));
  const at = argv.indexOf("--root");
  const root = at === -1 ? process.cwd() : argv[at + 1];
  if (!folder) {
    console.error("usage: figma-propose.mjs <folder of Figma's exported files> [--root <project>] [--json]");
    return 2;
  }
  const settings = tokenSettings(root, flagSettings(argv));
  const at2 = argv.indexOf("--baseline");
  const baselineDir = at2 === -1 ? join(root, settings.figma) : argv[at2 + 1];
  const baseline = readFolder(baselineDir).files;
  if (Object.keys(baseline).length === 0) {
    console.error(`No baseline in ${baselineDir}: run figma-export.mjs and import its files into Figma first, so a change can be told from where it was made.`);
    return 2;
  }
  const { files: incoming, unreadable, strings } = readFolder(folder);
  if (strings > 0) console.error(`note: ${strings} Figma string variables use $type "string", which DTCG 2025.10 does not have; they are compared as text`);
  if (Object.keys(incoming).length === 0) {
    console.error(`No Figma export in ${folder}: in Figma, Variables, right-click a collection, Export modes, and put the files there.`);
    return 2;
  }
  const { contexts, problems } = readProjectTokens(root, settings);
  if (problems.length > 0) {
    console.error(`The tokens cannot be read:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    return 1;
  }
  const current = Object.fromEntries(Object.entries(figmaFiles(contexts, settings).files).map(([file, tree]) => [file, figmaVariables(tree)]));
  const proposal = propose({ incoming, baseline, current, settings });
  proposal.unmatched.push(...unreadable);
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(proposal, null, 2)}\n` : renderProposal(proposal));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
