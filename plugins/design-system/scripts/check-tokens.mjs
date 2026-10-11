#!/usr/bin/env node
// The tier rules DTCG leaves to a team ("leaving organizational strategy to
// design system teams", https://www.designtokens.org/faq/), checked on every
// context the resolver declares, and the token files checked against the
// format itself:
//
// - format/dtcg-valid: what the reader finds wrong with the files or the
//   resolver (lib/dtcg.mjs), including a modifier with fewer than two contexts;
// - tiers/palette-literal: a palette entry is a colour value, never an alias;
// - tiers/role-aliases-palette: a colour role points to the palette itself,
//   not to another role and not a literal, or it is derived;
// - tiers/derived-rule-recorded: a derived role records its rule under the
//   project's `$extensions` key, and its value is what the rule gives in that
//   context (lib/color.mjs), its alpha included;
// - format/themes-complete: every context defines the same roles, derived the
//   same way;
// - tiers/styles-alias-foundation: a text style's family and weight alias the
//   font group.
//
//   node check-tokens.mjs [--root <project>] [--resolver <path>] [--roles <group>]
//                         [--palette <group>] [--typography <group>] [--fonts <group>]
//   exit 1 and one line per problem; the last line says what was checked
//
// It never passes silently: a roles group that holds no token is a config
// problem that names the groups the tokens do have, and the summary counts the
// palette entries, roles and text styles it checked.
//
// No dependencies: it runs from the plugin on any project with DTCG files, and
// the same file runs from a project that copied it. The settings come from the
// project's design-system/gates.json (`tokens`, lib/project-modules.mjs), then
// from the flags.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { colorHex, derivedHex, readColor } from "./lib/color.mjs";
import { loadResolver, loadTokenFiles, modifiersOf, resolveTokens } from "./lib/dtcg.mjs";
import { flagSettings, readConfig, tokenSettings } from "./lib/project-modules.mjs";

/**
 * The derived rule a token records, undefined when it has none, or a string saying why the rule is malformed.
 * Three kinds, each reading opaque roles:
 * - `lightness` moves the OKLCH lightness of `from` by `lightness` (−1 to 1), hue and chroma kept;
 * - `mix` puts `from` at `weight` (0 to 1) over `over` in sRGB;
 * - `alpha` is `from` itself at `alpha` (0 to below 1), for a scrim or a faint fill that follows its base.
 * @returns {{ kind: "lightness", from: string, lightness: number } | { kind: "mix", from: string, weight: number, over: string } | { kind: "alpha", from: string, alpha: number } | undefined | string}
 */
export function derivedRuleOf(extensions, key) {
  const rule = extensions?.[key]?.derived;
  if (rule === undefined) return undefined;
  if (rule?.kind === "lightness" && typeof rule.from === "string" && typeof rule.lightness === "number" && Math.abs(rule.lightness) <= 1) return rule;
  if (rule?.kind === "mix" && typeof rule.from === "string" && typeof rule.over === "string" && typeof rule.weight === "number" && rule.weight >= 0 && rule.weight <= 1) return rule;
  if (rule?.kind === "alpha" && typeof rule.from === "string" && typeof rule.alpha === "number" && rule.alpha >= 0 && rule.alpha < 1) return rule;
  return `malformed derived rule ${JSON.stringify(rule)}: expected { kind: "lightness", from, lightness }, { kind: "mix", from, weight, over } or { kind: "alpha", from, alpha }`;
}

const hexOf = (value) => {
  try {
    return colorHex(value);
  } catch {
    return "";
  }
};
const alphaOf = (value) => {
  try {
    return readColor(value).alpha;
  } catch {
    return 1;
  }
};
/** A colour as a reader sees it: its hex, and its alpha when it is translucent. */
const shown = (hex, alpha) => (alpha < 1 ? `${hex} at alpha ${alpha}` : hex);
const inGroup = (tokens, group) => Object.entries(tokens).filter(([id]) => id.startsWith(`${group}.`)).map(([id, token]) => [id.slice(group.length + 1), token]);

/**
 * Every broken tier rule, one sentence each, prefixed with its rubric rule id.
 * @param {Record<string, Record<string, any>>} contexts context name → resolved tokens (lib/dtcg.mjs resolveTokens)
 * @param {typeof import("./lib/project-modules.mjs").TOKEN_DEFAULTS} settings
 * @param {(rule: object, roleHex: (role: string) => string) => string} [derive] the hex a rule gives
 */
export function tierProblems(contexts, settings, derive = derivedHex) {
  const problems = [];
  const names = Object.keys(contexts);
  const first = contexts[names[0]] ?? {};

  for (const [name, token] of inGroup(first, settings.palette)) {
    if (token.$type !== "color") continue;
    if (token.aliasOf) problems.push(`tiers/palette-literal: ${settings.palette}.${name} is an alias of ${token.aliasOf}; the palette holds values only`);
  }

  /** context → role → { kind, rule?, hex } */
  const roles = {};
  for (const context of names) {
    const inContext = new Map();
    for (const [role, token] of inGroup(contexts[context], settings.roles)) {
      const rule = derivedRuleOf(token.$extensions, settings.extensionKey);
      if (typeof rule === "string") {
        problems.push(`tiers/derived-rule-recorded: ${context}: ${settings.roles}.${role} has a ${rule}`);
        continue;
      }
      const hex = hexOf(token.$value);
      const alpha = alphaOf(token.$value);
      if (rule) {
        inContext.set(role, { kind: "derived", rule, hex, alpha });
        continue;
      }
      // What the token points to itself: a role that points to another role hides the palette entry behind it.
      const target = token.aliasChain?.[0];
      if (!target?.startsWith(`${settings.palette}.`)) {
        problems.push(`tiers/role-aliases-palette: ${context}: ${settings.roles}.${role} ${target ? `points to ${target}` : "is a literal"}; a role points to the palette, or is derived by a recorded rule`);
      }
      inContext.set(role, { kind: "alias", hex, alpha });
    }
    for (const [role, entry] of inContext) {
      if (entry.kind !== "derived") continue;
      const reads = [entry.rule.from, ...(entry.rule.kind === "mix" ? [entry.rule.over] : [])];
      const missing = reads.filter((from) => !inContext.has(from));
      if (missing.length > 0) {
        problems.push(`tiers/derived-rule-recorded: ${context}: ${settings.roles}.${role} derives from ${missing.join(", ")}, which is not a role`);
        continue;
      }
      // A rule reads what a role is, and a translucent role is only a colour once it is painted over something.
      const translucent = reads.filter((from) => inContext.get(from).alpha < 1);
      if (translucent.length > 0) {
        problems.push(`tiers/derived-rule-recorded: ${context}: ${settings.roles}.${role} derives from ${translucent.join(", ")}, which is translucent; a rule reads opaque roles`);
        continue;
      }
      const expected = entry.rule.kind === "alpha" ? { hex: inContext.get(entry.rule.from).hex, alpha: entry.rule.alpha } : { hex: derive(entry.rule, (from) => inContext.get(from).hex), alpha: 1 };
      if (expected.hex !== entry.hex || Math.abs(expected.alpha - entry.alpha) > 1e-9) problems.push(`tiers/derived-rule-recorded: ${context}: ${settings.roles}.${role} is ${shown(entry.hex, entry.alpha)}, but its rule gives ${shown(expected.hex, expected.alpha)}`);
    }
    roles[context] = inContext;
  }

  const all = new Set(names.flatMap((context) => [...roles[context].keys()]));
  for (const role of all) {
    const defined = names.filter((context) => roles[context].has(role));
    if (defined.length !== names.length) {
      problems.push(`format/themes-complete: ${settings.roles}.${role} is defined in ${defined.join(", ")} only`);
      continue;
    }
    const shapes = new Set(defined.map((context) => JSON.stringify(roles[context].get(role).rule ?? null)));
    if (shapes.size > 1) problems.push(`format/themes-complete: ${settings.roles}.${role} is derived differently across ${names.join(", ")}`);
  }

  for (const [name, token] of inGroup(first, settings.typography)) {
    if (token.$type !== "typography") continue;
    const authored = token.originalValue?.$value;
    for (const part of ["fontFamily", "fontWeight"]) {
      const value = authored?.[part];
      if (typeof value !== "string" || !value.startsWith(`{${settings.fonts}.`)) problems.push(`tiers/styles-alias-foundation: ${settings.typography}.${name}.${part} is a literal; a text style takes its ${part} from ${settings.fonts}.*`);
    }
  }
  return problems;
}

/** The top-level groups the tokens have, in the order they appear. */
export function topGroups(tokens) {
  return [...new Set(Object.keys(tokens).map((id) => id.split(".")[0]))];
}

/**
 * What the configured group names find in the tokens: a config problem when the roles group is empty (nothing
 * could be checked), a tier problem when there is no palette, and the counts for the summary line.
 */
export function groupProblems(contexts, settings) {
  const first = Object.values(contexts)[0] ?? {};
  const found = topGroups(first);
  const count = (group) => inGroup(first, group).length;
  const counts = { palette: count(settings.palette), roles: count(settings.roles), styles: count(settings.typography) };
  const hint = `the tokens have ${found.join(", ") || "no groups"}`;
  const problems = [];
  if (counts.roles === 0) problems.push(`config: no tokens in the roles group ${settings.roles}, so no role could be checked; ${hint}. Pass --roles <group>, or set tokens.roles in design-system/gates.json`);
  if (counts.roles > 0 && counts.palette === 0) problems.push(`tiers/role-aliases-palette: there is no palette group ${settings.palette} for roles to alias; ${hint}. If the palette has another name, pass --palette <group>`);
  return { problems, counts, found };
}

/**
 * The project's tokens, read through its resolver (or its plain token files), resolved once per context of the
 * theme modifier; and every problem the reader found, as format/dtcg-valid.
 */
export function readProjectTokens(root, settings) {
  const resolverPath = join(root, settings.resolver);
  let source;
  if (existsSync(resolverPath)) source = loadResolver(resolverPath);
  else if (settings.files.length > 0) source = loadTokenFiles(settings.files.map((file) => join(root, file)));
  else return { contexts: {}, problems: [`format/dtcg-valid: no resolver at ${settings.resolver}; pass --resolver <path>, or set tokens.resolver (or tokens.files for plain token files) in design-system/gates.json`] };
  const contextNames = modifiersOf(source)[settings.modifier]?.contexts ?? [];
  const inputs = contextNames.length > 0 ? contextNames.map((context) => [context, { [settings.modifier]: context }]) : [["default", {}]];
  const problems = new Set();
  const contexts = {};
  for (const [name, input] of inputs) {
    const { tokens, problems: found } = resolveTokens(source, input);
    contexts[name] = tokens;
    for (const problem of found) problems.add(`format/dtcg-valid: ${problem}`);
  }
  return { contexts, problems: [...problems] };
}

function main(argv) {
  const at = argv.indexOf("--root");
  const root = at === -1 ? process.cwd() : argv[at + 1];
  const { notes } = readConfig(root);
  for (const note of notes) console.error(`note: ${note}`);
  const settings = tokenSettings(root, flagSettings(argv));
  const { contexts, problems: formatProblems } = readProjectTokens(root, settings);
  const names = Object.keys(contexts);
  const groups = names.length > 0 ? groupProblems(contexts, settings) : { problems: [], counts: { palette: 0, roles: 0, styles: 0 } };
  const problems = [...formatProblems, ...groups.problems, ...(groups.counts.roles > 0 ? tierProblems(contexts, settings) : [])];
  const { palette, roles, styles } = groups.counts;
  const checked = `checked ${palette} palette entries (${settings.palette}), ${roles} roles (${settings.roles}) and ${styles} text styles (${settings.typography}) in ${names.join(", ") || "no context"}`;
  if (problems.length > 0) {
    console.error(`The tokens break the rules:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\ncheck-tokens: ${checked}`);
    return 1;
  }
  console.log(`check-tokens: ${checked}; the format and tier rules hold`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
