#!/usr/bin/env node
// Writes the design tokens as Figma variable files, for Figma's own "Import
// mode": one DTCG 2025.10 file per collection and mode (lib/figma.mjs). The
// files are generated outputs, never edited by hand, and committed: they are
// the baseline figma-propose.mjs compares a designer's export against.
//
//   node figma-export.mjs [--root <project>] [--check] [--out <folder>] [--resolver <path>] [--roles <group>] …
//   --check   writes nothing; exit 1 when the files differ from what the tokens give now
//   --out     writes to another folder, for a trial import, and leaves the baseline as it is
//
// Every file is checked against the DTCG 2025.10 JSON Schema before anything
// is written (lib/dtcg-schema.mjs): a file the schema refuses is never written.
// The token files stay the one source of values (references/decisions.md,
// Figma). No dependencies.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectTokens } from "./check-tokens.mjs";
import { schemaProblems } from "./lib/dtcg-schema.mjs";
import { collectionOf, figmaFiles } from "./lib/figma.mjs";
import { flagSettings, tokenSettings } from "./lib/project-modules.mjs";

/** The files' text, as written: two-space JSON and a final newline, so a change shows as a small diff. */
export const fileText = (tree) => `${JSON.stringify(tree, null, 2)}\n`;

/** The files the folder holds that this export does not write, and those whose content differs. */
export function staleFiles(dir, files) {
  const present = existsSync(dir) ? readdirSync(dir, { recursive: true }).map((file) => String(file).split("\\").join("/")).filter((file) => file.endsWith(".tokens.json")) : [];
  const differing = Object.entries(files).filter(([file, tree]) => !present.includes(file) || readFileSync(join(dir, file), "utf8") !== fileText(tree)).map(([file]) => file);
  const extra = present.filter((file) => !(file in files));
  return { differing, extra };
}

function main(argv) {
  const at = argv.indexOf("--root");
  const root = at === -1 ? process.cwd() : argv[at + 1];
  const settings = tokenSettings(root, flagSettings(argv));
  const { contexts, problems } = readProjectTokens(root, settings);
  if (problems.length > 0) {
    console.error(`The tokens cannot be read:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    return 1;
  }
  const { files, skipped } = figmaFiles(contexts, settings);
  const invalid = Object.entries(files).flatMap(([file, tree]) => schemaProblems(tree).map((problem) => `${file}${problem.startsWith("/") ? "#" : " "}${problem}`));
  if (invalid.length > 0) {
    console.error(`The export breaks the DTCG 2025.10 schema, so nothing was written:\n${invalid.map((problem) => `  - ${problem}`).join("\n")}`);
    return 1;
  }
  const out = argv.indexOf("--out");
  const dir = out === -1 ? join(root, settings.figma) : resolve(argv[out + 1]);
  const modes = {};
  for (const file of Object.keys(files)) (modes[collectionOf(file)] ??= []).push(file.split("/")[1].replace(/\.tokens\.json$/, ""));
  for (const [collection, names] of Object.entries(modes)) {
    if (names.length > 1) console.error(`note: ${collection} has ${names.length} modes (${names.join(", ")}); Figma's Starter plan holds one mode per collection, so importing them needs Professional or above`);
  }
  if (skipped.length > 0) console.error(`note: no Figma variable holds ${skipped.length} tokens (text styles, shadows, gradients and easing curves are Figma styles, not variables; other units have no variable): ${skipped.join(", ")}`);
  if (argv.includes("--check")) {
    const { differing, extra } = staleFiles(dir, files);
    if (differing.length + extra.length > 0) {
      console.error(`Out of date in ${settings.figma}: ${[...differing, ...extra.map((file) => `${file} (no longer written)`)].join(", ")}. Run figma-export.mjs to write them from the tokens; never edit them by hand.`);
      return 1;
    }
    console.log(`figma-export: ${Object.keys(files).length} files in ${settings.figma} match the tokens`);
    return 0;
  }
  for (const file of staleFiles(dir, files).extra) {
    unlinkSync(join(dir, file));
    // A collection the tokens no longer make leaves an empty folder; remove it, and only an empty one.
    if (readdirSync(dirname(join(dir, file))).length === 0 && dirname(join(dir, file)) !== dir) rmdirSync(dirname(join(dir, file)));
  }
  for (const [file, tree] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), fileText(tree));
  }
  console.log(`figma-export: wrote ${Object.keys(files).join(", ")} to ${out === -1 ? settings.figma : dir}. In Figma, Variables: create each collection with its folder's name, Palette first, and Import its file; a second mode is added, then filled with Import mode.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
