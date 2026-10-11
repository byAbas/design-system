// Design tokens as Figma variables, in the DTCG 2025.10 dialect Figma's own
// "Import mode" and "Export modes" read and write (Figma help, Modes for
// variables): one file per collection and mode, `<Collection>/<mode>.tokens.json`
// (Figma names an imported mode after its file), groups as nested objects
// (Figma shows them as `group/name`), colours as srgb objects with `hex`,
// dimensions as px numbers, and an alias into another collection as
// `com.figma.aliasData`. The token files stay the one source of values
// (references/decisions.md, Figma); these files are generated from them.
//
// The collections, in the canonical group names (references/conventions.md):
// - Palette: the palette's colours, one mode, never published;
// - Colors: the colour roles, a mode per context of the resolver's theme
//   modifier; a role that points to the palette stays an alias of it there;
// - Font: the font group, a family as its first name (Figma holds one, the
//   fallbacks are the code's) and a weight as a number;
// - Spacing and Radius: `spacing` and `rounded`, as px numbers;
// - every other group with dimensions, durations or numbers, a collection of
//   its own named after it (`containers` → Containers): px numbers, durations
//   in seconds as Figma's import takes them, and plain numbers.
// Figma has no variable for a text style, a shadow, a gradient or an easing
// curve: those are named as skipped. No dependencies.

import { colorHex, readColor } from "./color.mjs";

/** The group of each collection besides the palette and the roles, which come from the settings. */
const NUMBER_COLLECTIONS = [
  ["Spacing", "spacing"],
  ["Radius", "rounded"],
];
const ALIAS_DATA = "com.figma.aliasData";

/** A DTCG colour value as Figma writes it: srgb components (channel/255), alpha, and an upper-case hex. */
export function figmaColor(value) {
  const hex = colorHex(value);
  const components = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return { colorSpace: "srgb", components, alpha: readColor(value).alpha, hex: hex.toUpperCase() };
}

/** A DTCG dimension in px, a rem being 16px; undefined for any other unit, which Figma cannot hold. */
function pixels(value) {
  if (typeof value === "object" && value !== null) return value.unit === "px" ? value.value : value.unit === "rem" ? value.value * 16 : undefined;
  const match = /^(-?[\d.]+)(px|rem)$/.exec(String(value));
  return match ? Number(match[1]) * (match[2] === "rem" ? 16 : 1) : undefined;
}

/** A DTCG duration in seconds, the one unit Figma's import takes; undefined for anything else. */
function seconds(value) {
  if (typeof value === "object" && value !== null) return value.unit === "s" ? value.value : value.unit === "ms" ? value.value / 1000 : undefined;
  const match = /^(-?[\d.]+)(ms|s)$/.exec(String(value));
  return match ? Number(match[1]) / (match[2] === "ms" ? 1000 : 1) : undefined;
}

/** A token as a Figma number variable (a px dimension, a duration in seconds, or a number), or undefined when Figma cannot hold it. */
function numberEntry(token) {
  const described = token.$description ? { $description: token.$description } : {};
  if (token.$type === "dimension") {
    const px = pixels(token.$value);
    return px === undefined ? undefined : { $type: "dimension", $value: { value: px, unit: "px" }, ...described };
  }
  if (token.$type === "duration") {
    const s = seconds(token.$value);
    return s === undefined ? undefined : { $type: "duration", $value: { value: s, unit: "s" }, ...described };
  }
  if (token.$type === "number" && typeof token.$value === "number") return { $type: "number", $value: token.$value, ...described };
  return undefined;
}

/** Puts `entry` at the path of `name` (dot-separated) in `tree`, groups as nested objects. */
function place(tree, name, entry) {
  const parts = name.split(".");
  let node = tree;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts.at(-1)] = entry;
}

/**
 * The Figma collections the tokens make, each mode a DTCG tree, and the tokens that have no Figma variable.
 * @param {Record<string, Record<string, any>>} contexts context name → resolved tokens (lib/dtcg.mjs)
 * @param {{ palette: string, roles: string, fonts: string }} settings
 * @returns {{ files: Record<string, object>, skipped: string[] }} files by `<Collection>/<mode>.tokens.json`
 */
export function figmaFiles(contexts, settings) {
  const names = Object.keys(contexts);
  const first = contexts[names[0]] ?? {};
  const files = {};
  const skipped = [];
  const entry = (token, value) => ({ $type: token.$type, $value: value, ...(token.$description ? { $description: token.$description } : {}) });
  const inGroup = (tokens, group) => Object.entries(tokens).filter(([id]) => id.startsWith(`${group}.`)).map(([id, token]) => [id.slice(group.length + 1), token]);

  const palette = {};
  for (const [name, token] of inGroup(first, settings.palette)) {
    if (token.$type === "color") place(palette, name, entry(token, figmaColor(token.$value)));
    else skipped.push(`${settings.palette}.${name}`);
  }
  if (Object.keys(palette).length > 0) files["Palette/default.tokens.json"] = palette;

  for (const context of names) {
    const colors = {};
    for (const [name, token] of inGroup(contexts[context], settings.roles)) {
      if (token.$type !== "color") {
        if (context === names[0]) skipped.push(`${settings.roles}.${name}`);
        continue;
      }
      const target = token.aliasChain?.[0];
      const result = entry(token, figmaColor(token.$value));
      // A role that points to the palette stays an alias of it in Figma, so the designer sees the same tier.
      if (target?.startsWith(`${settings.palette}.`)) result.$extensions = { [ALIAS_DATA]: { targetVariableSetName: "Palette", targetVariableName: target.slice(settings.palette.length + 1).split(".").join("/") } };
      place(colors, name, result);
    }
    if (Object.keys(colors).length > 0) files[`Colors/${context}.tokens.json`] = colors;
  }

  const font = {};
  for (const [name, token] of inGroup(first, settings.fonts)) {
    const family = token.$type === "fontFamily" ? [token.$value].flat()[0] : undefined;
    const weight = token.$type === "fontWeight" && typeof token.$value === "number" ? token.$value : undefined;
    if (typeof family === "string") place(font, name, entry(token, family));
    else if (weight !== undefined) place(font, name, { ...entry(token, weight), $type: "number" });
    else skipped.push(`${settings.fonts}.${name}`);
  }
  if (Object.keys(font).length > 0) files["Font/default.tokens.json"] = font;

  // Spacing and Radius first, by their canonical names; then each other group that holds numbers, under its own name.
  const covered = new Set([settings.palette, settings.roles, settings.fonts]);
  const others = [...new Set(Object.keys(first).map((id) => id.split(".")[0]))].filter((group) => !covered.has(group) && !NUMBER_COLLECTIONS.some(([, known]) => known === group)).sort();
  const collections = [...NUMBER_COLLECTIONS, ...others.map((group) => [group.charAt(0).toUpperCase() + group.slice(1), group])];
  for (const [collection, group] of collections) {
    const tree = {};
    for (const [name, token] of inGroup(first, group)) {
      const result = numberEntry(token);
      if (result === undefined) skipped.push(`${group}.${name}`);
      else place(tree, name, result);
    }
    if (Object.keys(tree).length > 0) files[`${collection}/default.tokens.json`] = tree;
  }
  return { files, skipped: [...new Set(skipped)].sort() };
}

/**
 * A number as compared: to float32's precision, since Figma stores variables as 32-bit floats (47.776 comes back as
 * 47.7760009765625), and with no unit, since Figma exports a dimension as a plain number.
 */
const numberKey = (value) => String(Number(Math.fround(value).toPrecision(7)));

/**
 * A Figma mode file as variables by name (`gray/9`), each with what is compared: an alias by its target, a colour by
 * its hex and alpha, a dimension or number by its value to float32's precision, a duration in seconds (Figma takes
 * seconds on import and gives milliseconds on export). Figma's own export writes an alias as
 * its resolved value with `com.figma.aliasData` (2026-10, checked by a round trip); a `{name}` reference is read too.
 * @param {object} tree a mode file's JSON
 * @returns {Record<string, string>}
 */
export function figmaVariables(tree) {
  const out = {};
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node ?? {})) {
      if (key.startsWith("$") || typeof value !== "object" || value === null) continue;
      const name = [...path, key].join("/");
      if (!("$value" in value)) {
        walk(value, [...path, key]);
        continue;
      }
      const alias = value.$extensions?.[ALIAS_DATA];
      const reference = typeof value.$value === "string" ? /^\{(.+)\}$/.exec(value.$value)?.[1] : undefined;
      if (alias?.targetVariableName) out[name] = `alias ${alias.targetVariableSetName ? `${alias.targetVariableSetName}/` : ""}${alias.targetVariableName}`;
      else if (reference) out[name] = `alias ${reference.split(".").join("/")}`;
      else if (value.$type === "color" || value.$value?.colorSpace) out[name] = colorKey(value.$value);
      else if (typeof value.$value === "object" && value.$value !== null && typeof value.$value.value === "number") out[name] = numberKey(value.$value.unit === "ms" ? value.$value.value / 1000 : value.$value.value);
      else if (typeof value.$value === "number") out[name] = numberKey(value.$value);
      else out[name] = JSON.stringify(value.$value);
    }
  };
  walk(tree, []);
  return out;
}

/** A colour as compared: its hex, and its alpha to three places when it is translucent. */
function colorKey(value) {
  try {
    const alpha = readColor(value).alpha;
    return alpha < 1 ? `${colorHex(value)} at alpha ${Number(alpha.toFixed(3))}` : colorHex(value);
  } catch {
    return JSON.stringify(value);
  }
}

/**
 * Which file of `known` each file of `incoming` is, one to one. A file whose collection and mode name a known file
 * (the folder Figma's zip unpacks into, `Radius/default.tokens.json`) is that file. Any other file is matched by the
 * share of variable names it has in common with each file still free, a tie settled by the mode's name: Figma names
 * its exported files after the mode, so a name may not say which collection a file holds. Collections share names
 * (`sm`, `md` are a radius and a breakpoint), so a share decides only where the names do not. A file sharing less
 * than half its names, or tied with no mode to settle it, is left unmatched.
 * @param {Record<string, Record<string, string>>} incoming file → variables
 * @param {Record<string, Record<string, string>>} known file → variables
 * @returns {{ matches: Record<string, string>, unmatched: string[] }} incoming file → known file
 */
export function matchFiles(incoming, known) {
  const matches = {};
  const taken = new Set();
  const key = (file) => `${collectionOf(file).toLowerCase()}/${modeOf(file)}`;
  const byName = new Map(Object.keys(known).map((file) => [key(file), file]));
  for (const file of Object.keys(incoming)) {
    const named = byName.get(key(file));
    if (named !== undefined && !taken.has(named)) {
      matches[file] = named;
      taken.add(named);
    }
  }
  const unmatched = [];
  for (const [file, variables] of Object.entries(incoming)) {
    if (file in matches) continue;
    const names = Object.keys(variables);
    const scored = Object.entries(known)
      .filter(([candidate]) => !taken.has(candidate))
      .map(([candidate, knownVariables]) => ({ candidate, share: names.filter((name) => name in knownVariables).length / Math.max(names.length, 1), sameMode: modeOf(candidate) === modeOf(file) }))
      .filter((entry) => entry.share >= 0.5)
      .sort((a, b) => b.share - a.share || Number(b.sameMode) - Number(a.sameMode));
    const [best, next] = scored;
    const settled = best !== undefined && (next === undefined || best.share > next.share || (best.sameMode && !next.sameMode));
    if (settled) {
      matches[file] = best.candidate;
      taken.add(best.candidate);
    } else unmatched.push(file);
  }
  return { matches, unmatched };
}

/** A file's mode: its name without `.tokens.json`, and without the collection a folder or a dot gives it. */
export const modeOf = (file) => file.replace(/\.tokens\.json$/, "").split(/[/.]/).at(-1).toLowerCase();

/** A file's collection: its folder (`Colors/light.tokens.json`), or what precedes the mode (`Colors.light.tokens.json`). */
export const collectionOf = (file) => file.replace(/\.tokens\.json$/, "").split(/[/.]/)[0];

/** The outcomes of a three-way comparison, in the order a person reads them. */
export const OUTCOMES = ["figma-changed", "figma-added", "figma-removed", "conflict", "code-changed", "code-added", "code-removed"];

/**
 * What changed in Figma since the last export, against what changed in the tokens: each variable of each mode the
 * designer exported, by the last export (`base`), Figma's file (`figma`) and a fresh export of the tokens (`code`).
 * - figma-changed, figma-added, figma-removed: a proposal for the tokens;
 * - code-changed, code-added, code-removed: the tokens moved on and Figma is behind, so export again;
 * - conflict: both moved, apart; a person decides.
 * Unchanged variables, and those both sides changed the same way, are left out. Nothing is written anywhere.
 * @param {Record<string, string>} base
 * @param {Record<string, string>} figma
 * @param {Record<string, string>} code
 * @returns {{ name: string, outcome: string, base?: string, figma?: string, code?: string }[]}
 */
export function compareMode(base, figma, code) {
  const changes = [];
  for (const name of [...new Set([...Object.keys(base), ...Object.keys(figma), ...Object.keys(code)])].sort()) {
    const [b, f, c] = [base[name], figma[name], code[name]];
    if (f === c) continue;
    let outcome;
    if (f === undefined) outcome = b === undefined ? "code-added" : c === b ? "figma-removed" : "conflict";
    else if (c === undefined) outcome = b === undefined ? "figma-added" : f === b ? "code-removed" : "conflict";
    else if (b === c) outcome = "figma-changed";
    else if (b === f) outcome = "code-changed";
    else outcome = "conflict";
    changes.push({ name, outcome, ...(b !== undefined ? { base: b } : {}), ...(f !== undefined ? { figma: f } : {}), ...(c !== undefined ? { code: c } : {}) });
  }
  return changes;
}
