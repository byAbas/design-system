#!/usr/bin/env node
// The rules document (DESIGN.md) as rules only:
//
// - docs/rules-hold-no-values: its front matter holds only its identity,
//   `imports:` and the `components:` contract, never token values;
// - `imports:` names the project's resolver;
// - tiers/components-read-roles: every contract property names a token
//   (`{colors.primary}`), never a value and never the palette;
// - docs/rules-reference-existing-tokens: every token it names exists;
// - tiers/contrast-pairs: each component's textColor over its backgroundColor
//   meets WCAG 2.1 AA in every context (lib/color.mjs): 4.5:1, or 3:1 when its
//   typography is large text. A variant (`button-primary-hover`) takes what it
//   does not state from the component its key extends (`button-primary`), as
//   the design.md format reads variants; a disabled variant is exempt.
//
//   node check-rules-contract.mjs        exit 1 and one line per problem
//
// Reads the front matter with the project's `yaml`, and the token ids with the
// plugin's own DTCG reader (lib/dtcg.mjs). The settings come from
// design-system/gates.json (`tokens`, lib/project-modules.mjs), then from the
// flags check-tokens.mjs accepts (--resolver, --roles, --palette …).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectTokens } from "./check-tokens.mjs";
import { colorHex, contrastRatio, readColor } from "./lib/color.mjs";
import { flagSettings, importFromProject, tokenSettings } from "./lib/project-modules.mjs";

/** The keys a rules document's front matter may hold: identity, the import, the contract. */
export const ALLOWED_KEYS = ["version", "name", "description", "imports", "components"];
const REFERENCE = /^\{([a-z][a-z0-9-]*)\.([a-z0-9][a-z0-9.-]*)\}$/;

/** The YAML text between a Markdown file's opening and closing `---`, or undefined. */
export function frontMatterText(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return undefined;
  const end = lines.indexOf("---", 1);
  return end === -1 ? undefined : lines.slice(1, end).join("\n");
}

/**
 * Every broken contract rule, one sentence each, prefixed with its rubric rule id.
 * @param {Record<string, unknown>} front the parsed front matter
 * @param {ReadonlySet<string>} tokenIds every token id in the tokens (`colors.primary`)
 * @param {typeof import("./lib/project-modules.mjs").TOKEN_DEFAULTS} settings
 */
export function contractProblems(front, tokenIds, settings) {
  const problems = [];
  for (const key of Object.keys(front)) {
    if (!ALLOWED_KEYS.includes(key)) problems.push(`docs/rules-hold-no-values: the front matter holds \`${key}:\`; values live in the token files it imports, the rules document holds rules`);
  }
  const imports = String(front.imports ?? "").replace(/^\.\//, "");
  if (imports !== settings.resolver.replace(/^\.\//, "")) problems.push(`docs/rules-reference-existing-tokens: \`imports:\` is ${front.imports ?? "missing"}; it names the tokens at ./${settings.resolver}`);
  const components = front.components ?? {};
  if (typeof components !== "object" || Array.isArray(components)) return [...problems, "tiers/components-read-roles: `components:` is not a map of component → property → token"];
  for (const [component, properties] of Object.entries(components)) {
    for (const [property, value] of Object.entries(properties ?? {})) {
      const where = `components.${component}.${property}`;
      const reference = REFERENCE.exec(String(value));
      if (!reference) {
        problems.push(`tiers/components-read-roles: ${where} is ${JSON.stringify(value)}; a component names a token ({group.name}), it does not state a value`);
        continue;
      }
      const [, group, name] = reference;
      if (group === settings.palette) problems.push(`tiers/components-read-roles: ${where} reads the palette entry ${name}; components read roles`);
      else if (!settings.readable.includes(group)) problems.push(`tiers/components-read-roles: ${where} reads ${group}.*; a component reads ${settings.readable.join(", ")}`);
      else if (!tokenIds.has(`${group}.${name}`)) problems.push(`docs/rules-reference-existing-tokens: ${where} names {${group}.${name}}, which the tokens do not define`);
    }
  }
  return problems;
}

/** The CSS Fonts weight keywords DTCG accepts for fontWeight (Format §8.4), by number. */
const WEIGHTS = { thin: 100, hairline: 100, "extra-light": 200, "ultra-light": 200, light: 300, normal: 400, regular: 400, book: 400, medium: 500, "semi-bold": 600, "demi-bold": 600, bold: 700, "extra-bold": 800, "ultra-bold": 800, black: 900, heavy: 900, "extra-black": 950, "ultra-black": 950 };

/** A DTCG dimension in CSS pixels, a rem being 16px; undefined for anything else. */
function pixels(dimension) {
  if (typeof dimension === "object" && dimension !== null) return dimension.unit === "px" ? dimension.value : dimension.unit === "rem" ? dimension.value * 16 : undefined;
  const match = /^([\d.]+)(px|rem)$/.exec(String(dimension));
  return match ? Number(match[1]) * (match[2] === "rem" ? 16 : 1) : undefined;
}

/**
 * True when a resolved typography value is large text in WCAG's terms: at least 18pt (24px), or 14pt (about
 * 18.67px) and bold (700 or more). https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */
export function isLargeText(typography) {
  const size = pixels(typography?.fontSize);
  if (size === undefined) return false;
  const weight = typeof typography.fontWeight === "number" ? typography.fontWeight : WEIGHTS[String(typography.fontWeight).toLowerCase()] ?? 400;
  return size * 0.75 >= 18 || (size * 0.75 >= 14 && weight >= 700);
}

/**
 * Each component's properties with what a variant inherits: a key that extends another (`button-primary-hover`
 * extends `button-primary`) takes each property it does not state from the longest key it extends that does.
 * @param {Record<string, Record<string, unknown>>} components
 * @returns {Record<string, Record<string, { value: unknown, from?: string }>>}
 */
export function withVariants(components) {
  const keys = Object.keys(components);
  return Object.fromEntries(
    keys.map((key) => {
      const bases = keys.filter((base) => key.startsWith(`${base}-`)).sort((a, b) => b.length - a.length);
      const properties = {};
      for (const base of [...bases].reverse()) for (const [property, value] of Object.entries(components[base] ?? {})) properties[property] = { value, from: base };
      for (const [property, value] of Object.entries(components[key] ?? {})) properties[property] = { value };
      return [key, properties];
    }),
  );
}

/**
 * Every contract pair below WCAG 2.1 AA, in each context, one sentence each, prefixed with its rubric rule id; and
 * how many pairs were measured, and which could not be: a translucent background has no colour until it is painted
 * over something the contract does not name.
 * @param {Record<string, unknown>} front the parsed front matter
 * @param {Record<string, Record<string, any>>} contexts context name → resolved tokens
 */
export function contrastProblems(front, contexts) {
  const problems = [];
  const unmeasured = [];
  let measured = 0;
  const components = typeof front.components === "object" && front.components !== null && !Array.isArray(front.components) ? front.components : {};
  for (const [component, properties] of Object.entries(withVariants(components))) {
    if (/(^|-)disabled(-|$)/.test(component)) continue;
    const text = properties.textColor;
    const background = properties.backgroundColor;
    if (!text || !background) continue;
    const id = (property) => REFERENCE.exec(String(property.value))?.slice(1).join(".");
    for (const [context, tokens] of Object.entries(contexts)) {
      const fore = tokens[id(text)];
      const back = tokens[id(background)];
      if (fore?.$type !== "color" || back?.$type !== "color") continue;
      const [foreHex, backHex] = [colorHex(fore.$value), colorHex(back.$value)];
      const [foreAlpha, backAlpha] = [readColor(fore.$value).alpha, readColor(back.$value).alpha];
      const where = `${Object.keys(contexts).length > 1 ? `${context}: ` : ""}components.${component}`;
      if (backAlpha < 1) {
        unmeasured.push(`${where}: backgroundColor ${background.value} is translucent`);
        continue;
      }
      measured += 1;
      const typography = properties.typography && tokens[id(properties.typography)]?.$value;
      const large = isLargeText(typography);
      const minimum = large ? 3 : 4.5;
      const ratio = contrastRatio(foreHex, backHex, foreAlpha);
      if (ratio >= minimum) continue;
      const inherited = [text, background].filter((property) => property.from).map((property) => `${property === text ? "textColor" : "backgroundColor"} from ${property.from}`);
      problems.push(
        `tiers/contrast-pairs: ${where}: textColor ${text.value} (${foreHex}${foreAlpha < 1 ? ` at alpha ${foreAlpha}` : ""}) on backgroundColor ${background.value} (${backHex}) is ${(Math.floor(ratio * 100) / 100).toFixed(2)}:1, below ${minimum}:1 for ${large ? "large " : ""}text (WCAG 2.1 SC 1.4.3)${inherited.length > 0 ? `; ${inherited.join(", ")}` : ""}`,
      );
    }
  }
  return { problems, measured, unmeasured };
}

async function main() {
  const root = process.cwd();
  const settings = tokenSettings(root, flagSettings(process.argv.slice(2)));
  const { parse: parseYaml } = await importFromProject("yaml", root);
  const markdown = readFileSync(join(root, settings.rulesDocument), "utf8");
  const yaml = frontMatterText(markdown);
  if (yaml === undefined) {
    console.error(`docs/rules-reference-existing-tokens: ${settings.rulesDocument} has no front matter; it needs \`imports:\` and the \`components:\` contract`);
    return 1;
  }
  const { contexts, problems: tokenProblems } = readProjectTokens(root, settings);
  if (tokenProblems.length > 0) {
    console.error(`The tokens cannot be read:\n${tokenProblems.map((problem) => `  - ${problem}`).join("\n")}`);
    return 1;
  }
  const tokenIds = new Set(Object.values(contexts).flatMap((tokens) => Object.keys(tokens)));
  const front = parseYaml(yaml) ?? {};
  const contrast = contrastProblems(front, contexts);
  const problems = [...contractProblems(front, tokenIds, settings), ...contrast.problems];
  for (const pair of contrast.unmeasured) console.error(`note: not measured, ${pair}; its contrast depends on what it is painted over`);
  const checked = `${contrast.measured} contrast pairs in ${Object.keys(contexts).join(", ") || "no context"}`;
  if (problems.length > 0) {
    console.error(`${settings.rulesDocument} breaks the rules document's contract:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\ncheck-rules-contract: checked ${checked}`);
    return 1;
  }
  console.log(`check-rules-contract: ${settings.rulesDocument} holds no values, names ${tokenIds.size > 0 ? "existing" : "no"} tokens, and meets WCAG 2.1 AA in ${checked}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => (process.exitCode = code), (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
