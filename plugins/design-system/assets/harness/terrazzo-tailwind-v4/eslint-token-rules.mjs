// Two ESLint rules that hold code to the design tokens in a Tailwind CSS v4
// project whose theme Terrazzo generates (references/profiles/terrazzo-tailwind-v4.md):
//
// - `design-system/token-classes` (tiers/no-primitive-in-code, tiers/no-literal-in-code):
//   a utility Tailwind builds from a theme namespace (colour, text style, line
//   height, letter spacing, font, radius, shadow, easing, animation) must name a
//   token the generated theme defines. Refused as well:
//   - an arbitrary value (`text-[13px]`, `bg-[#fff]`), a value no document knows;
//   - a modifier on a token (`bg-primary/10`), a new colour made in code;
//   - a variable from the palette (`bg-(--palette-gray-9)`), since code reads roles.
// - `design-system/no-raw-color` (tiers/no-literal-in-code): no hex value, and
//   no colour function with a literal channel, in a string or template literal;
//   and no CSS named colour (`red`, `rebeccapurple`) where CSS reads a colour:
//   a style object's colour property (`{ color: "red" }`), a colour attribute of
//   an SVG or HTML element (`fill="red"`), or a declaration in a string
//   (`color: red;`). A word alone is not a colour: `"red"` as a variant name or
//   in prose is left alone.
//
// Both rules read CSS too, through ESLint's CSS language (@eslint/css): in a
// stylesheet, `no-raw-color` checks every declaration's value, a custom
// property's included (`--brand: #d4a017` is a value outside the tokens), and
// `token-classes` checks the classes of `@apply`. Generated outputs are not
// linted: they are the tokens' own values.
//
// Why a lint and not the build: after the palette reset (`--color-*: initial`)
// an unknown colour class produces no CSS and no error, so the element is
// silently unstyled; an arbitrary value does produce CSS, which is worse.
//
// Where classes are read: JSX `className` and `class`, and every string inside
// a call to a class helper (`cn`, `clsx`, `cx`, `cva`, `tv`, `twMerge`,
// `twJoin` by default), including object keys (`clsx({ "bg-surface": on })`).
// Words that are not a token utility (a variant name such as `md`) are ignored.
// Known limitation: a class list assembled at runtime from non-literal parts,
// or held in a variable, is checked only where it is literal.
//
// Usage in eslint.config.mjs, strict for agents and CI, with the exemptions of
// design-system/gates.json (artwork, email HTML) turned off where they apply:
//   import { readFileSync } from "node:fs";
//   import { designSystemPlugin, exemptionConfigs } from "./eslint-token-rules.mjs";
//   const strict = process.env.DESIGN_LINT_STRICT === "1" || process.env.CI === "true";
//   const gates = JSON.parse(readFileSync("design-system/gates.json", "utf8"));
//   export default [designSystemPlugin.configs[strict ? "strict" : "recommended"], ...exemptionConfigs(gates)];
// and for stylesheets, with the project's @eslint/css (and tailwind-csstree for Tailwind's syntax):
//   import css from "@eslint/css";
//   import { tailwind4 } from "tailwind-csstree";
//   { files: ["src/**/*.css"], ignores: gates.generated, plugins: { css, "design-system": designSystemPlugin },
//     language: "css/css", languageOptions: { customSyntax: tailwind4, tolerant: true },
//     rules: designSystemPlugin.configs[strict ? "strict" : "recommended"].rules },
//
// Known violations a project has not fixed yet go in ESLint's own bulk
// suppressions (`eslint --suppress-rule design-system/no-raw-color`), the same
// ratchet the token checks keep in design-system/suppressions.json.
//
// Rule options (both rules share the file settings):
//   { theme: ["src/styles/theme.generated.css"], variables: ["src/styles/tokens.generated.css"],
//     palette: "palette", helpers: ["cn", "clsx", "cx", "cva", "tv", "twMerge", "twJoin"] }
// No dependencies beyond ESLint itself.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULTS = {
  theme: ["src/styles/theme.generated.css"],
  variables: ["src/styles/tokens.generated.css"],
  palette: "palette",
  helpers: ["cn", "clsx", "cx", "cva", "tv", "twMerge", "twJoin"],
};

/** The Tailwind v4 theme namespaces, longest first so `--font-weight-x` is a weight, not a family. */
export const NAMESPACES = ["font-weight", "color", "text", "leading", "tracking", "font", "radius", "shadow", "ease", "animate", "container", "breakpoint", "spacing"];

// ---------- reading a class ----------

/** The index of a `/` outside brackets, or -1. */
function modifierIndex(base) {
  let depth = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base[i];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === "/" && depth === 0) return i;
  }
  return -1;
}

/**
 * A class split into its variants, base and modifier. Colons inside `[…]` and `(…)` belong to an arbitrary value.
 * @param {string} raw
 */
export function parseClass(raw) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) {
      parts.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  let base = parts.pop() ?? "";
  if (base.startsWith("!")) base = base.slice(1);
  if (base.endsWith("!")) base = base.slice(0, -1);
  if (base.startsWith("-")) base = base.slice(1);
  let modifier;
  const slash = modifierIndex(base);
  if (slash !== -1) {
    modifier = base.slice(slash + 1);
    base = base.slice(0, slash);
  }
  return { raw, variants: parts, base, modifier };
}

// ---------- reading the tokens ----------

/**
 * Every `--<namespace>-<name>` declared inside a `@theme` block, by namespace. A declaration whose value is
 * `initial` (a namespace reset) registers nothing.
 * @param {string} css
 */
export function parseThemeTokens(css) {
  const tokens = new Map(NAMESPACES.map((namespace) => [namespace, new Set()]));
  let from = 0;
  for (;;) {
    const start = css.indexOf("@theme", from);
    if (start === -1) break;
    const open = css.indexOf("{", start);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    for (const [, property, value] of css.slice(open + 1, end).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      if (value.trim() === "initial") continue;
      const namespace = NAMESPACES.find((candidate) => property.startsWith(`${candidate}-`));
      if (namespace) tokens.get(namespace).add(property.slice(namespace.length + 1));
    }
    from = end + 1;
  }
  return tokens;
}

/** Every custom property a stylesheet declares, without the `--`. */
export function declaredVariables(css) {
  return new Set([...css.matchAll(/(?:^|[\s;{])--([a-zA-Z0-9-]+)\s*:/g)].map(([, name]) => name));
}

const cache = new Map();
/** The theme's tokens and the variables code may read, from the generated files at `cwd`. */
function loadTokens(cwd, options) {
  const key = JSON.stringify([cwd, options.theme, options.variables]);
  if (cache.has(key)) return cache.get(key);
  const read = (file) => {
    try {
      return readFileSync(join(cwd, file), "utf8");
    } catch {
      throw new Error(`design-system lint: cannot read ${file}; build the tokens first, or set the rule's \`theme\` and \`variables\` options`);
    }
  };
  const theme = new Map(NAMESPACES.map((namespace) => [namespace, new Set()]));
  const variables = new Set();
  for (const file of options.theme) {
    const css = read(file);
    for (const [namespace, names] of parseThemeTokens(css)) for (const name of names) theme.get(namespace).add(name);
    for (const name of declaredVariables(css)) variables.add(name);
  }
  for (const file of options.variables) for (const name of declaredVariables(read(file))) variables.add(name);
  const tokens = { theme, variables, palette: options.palette };
  cache.set(key, tokens);
  return tokens;
}

// ---------- judging a class ----------

const COLOR_KEYWORDS = ["transparent", "current", "inherit"];

/**
 * The utilities a theme namespace owns: the namespaces a suffix must name, a word for messages, Tailwind's static
 * keywords (no token involved), patterns for other static forms, and whether a bare number is a width. Longest
 * prefix first, so `border-b` wins over `border`.
 */
const UTILITIES = [
  ...["border-x", "border-y", "border-t", "border-r", "border-b", "border-l", "border-s", "border-e"].map((prefix) => ({ prefix, namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS], numeric: true })),
  { prefix: "border", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "solid", "dashed", "dotted", "double", "hidden", "none", "collapse", "separate"], patterns: [/^spacing-(x-|y-)?\d/], numeric: true },
  { prefix: "bg", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "none", "cover", "contain", "auto", "fixed", "local", "scroll", "top", "bottom", "left", "right", "center"], patterns: [/^(linear|radial|conic)-/, /^(clip|origin|position|size|repeat|no-repeat|blend)(-|$)/, /^(top|bottom)-(left|right)$/] },
  { prefix: "text", namespaces: ["color", "text"], kind: "colour or text style", keywords: [...COLOR_KEYWORDS, "left", "center", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"] },
  { prefix: "ring", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "inset"], patterns: [/^offset-\d/], numeric: true },
  { prefix: "outline", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "none", "hidden", "solid", "dashed", "dotted", "double"], patterns: [/^offset-\d/], numeric: true },
  { prefix: "fill", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "none"] },
  { prefix: "stroke", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "none"], numeric: true },
  { prefix: "decoration", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "solid", "double", "dotted", "dashed", "wavy", "auto", "from-font"], numeric: true },
  { prefix: "divide", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "x", "y", "solid", "dashed", "dotted", "double", "none"], patterns: [/^(x|y)-\d/, /^(x|y)-reverse$/], numeric: true },
  { prefix: "accent", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS, "auto"] },
  { prefix: "caret", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS] },
  { prefix: "placeholder", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS] },
  { prefix: "from", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS], numeric: true },
  { prefix: "via", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS], numeric: true },
  { prefix: "to", namespaces: ["color"], kind: "colour", keywords: [...COLOR_KEYWORDS], numeric: true },
  { prefix: "leading", namespaces: ["leading"], kind: "line height", keywords: ["none"] },
  { prefix: "tracking", namespaces: ["tracking"], kind: "letter spacing", keywords: ["normal"] },
  { prefix: "font", namespaces: ["font", "font-weight"], kind: "font", keywords: [] },
  ...["rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-s", "rounded-e"].map((prefix) => ({ prefix, namespaces: ["radius"], kind: "radius", keywords: ["none", "full"] })),
  { prefix: "rounded", namespaces: ["radius"], kind: "radius", keywords: ["none", "full"], bare: true },
  { prefix: "shadow", namespaces: ["shadow"], kind: "shadow", keywords: ["none"], bare: true },
  { prefix: "ease", namespaces: ["ease"], kind: "easing", keywords: ["linear", "initial"] },
  { prefix: "animate", namespaces: ["animate"], kind: "animation", keywords: ["none"] },
].sort((a, b) => b.prefix.length - a.prefix.length);

/** True when `--name` is a variable the generated files declare and it is not a palette entry. */
function isTokenVariable(name, tokens) {
  const property = name.replace(/^--/, "");
  if (property.startsWith(`${tokens.palette}-`)) return false;
  if (tokens.variables.has(property)) return true;
  return NAMESPACES.some((namespace) => property.startsWith(`${namespace}-`) && tokens.theme.get(namespace).has(property.slice(namespace.length + 1)));
}

/**
 * Why a class is not a token, or undefined when it is one or is no token utility at all.
 * @param {string} base the class without variants and modifier
 * @param {{ theme: Map<string, Set<string>>, variables: Set<string>, palette: string }} tokens
 * @param {string | undefined} modifier
 * @returns {{ messageId: "unknownToken" | "arbitraryValue" | "bareUtility" | "modifier" | "paletteReference", kind: string, example: string } | undefined}
 */
export function judgeClass(base, tokens, modifier) {
  const utility = UTILITIES.find((candidate) => base === candidate.prefix || base.startsWith(`${candidate.prefix}-`));
  if (!utility) return undefined;
  const example = () =>
    utility.namespaces
      .map((namespace) => [...(tokens.theme.get(namespace) ?? [])].find((name) => !name.includes("--")))
      .filter(Boolean)
      .map((name) => `${utility.prefix}-${name}`)
      .join("` or `") || `${utility.prefix}-<token>`;
  if (base === utility.prefix) return utility.bare ? { messageId: "bareUtility", kind: utility.kind, example: example() } : undefined;
  const suffix = base.slice(utility.prefix.length + 1);
  if (suffix.includes(`--${tokens.palette}-`)) return { messageId: "paletteReference", kind: utility.kind, example: example() };
  if (modifier !== undefined && !utility.keywords.includes(suffix)) return { messageId: "modifier", kind: utility.kind, example: example() };
  if (suffix.startsWith("(") && suffix.endsWith(")")) {
    const variable = suffix.slice(1, -1).replace(/^[a-z-]+:/, "");
    return isTokenVariable(variable, tokens) ? undefined : { messageId: "unknownToken", kind: utility.kind, example: example() };
  }
  if (suffix.startsWith("[") && suffix.endsWith("]")) {
    const content = suffix.slice(1, -1);
    const variables = [...content.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map(([, name]) => name);
    if (variables.some((name) => name.startsWith(`--${tokens.palette}-`))) return { messageId: "paletteReference", kind: utility.kind, example: example() };
    return variables.length > 0 || /--[a-z]+\(/.test(content) ? undefined : { messageId: "arbitraryValue", kind: utility.kind, example: example() };
  }
  if (utility.keywords.includes(suffix)) return undefined;
  if (utility.patterns?.some((pattern) => pattern.test(suffix))) return undefined;
  if (utility.numeric && /^\d+(\.\d+)?$/.test(suffix)) return undefined;
  // `text-body-md--line-height` is part of a style, read through a variable, never a class of its own.
  if (!suffix.includes("--") && utility.namespaces.some((namespace) => tokens.theme.get(namespace)?.has(suffix))) return undefined;
  return { messageId: "unknownToken", kind: utility.kind, example: example() };
}

// ---------- raw colours ----------

const HEX = /(?<![\w#&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w#])/;
const COLOR_FUNCTION = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi;

/** True when `text` holds a hex colour, or a colour function with a literal digit in its arguments. */
export function hasRawColor(text) {
  if (HEX.test(text)) return true;
  COLOR_FUNCTION.lastIndex = 0;
  let match;
  while ((match = COLOR_FUNCTION.exec(text)) !== null) {
    const from = match.index + match[0].length;
    let depth = 1;
    let end = -1;
    for (let i = from; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end !== -1 && /\d/.test(text.slice(from, end))) return true;
  }
  return false;
}

/**
 * The CSS Color 4 named colours (https://www.w3.org/TR/css-color-4/#named-colors). `transparent` and
 * `currentcolor` are keywords that state no colour of their own, so they stay allowed, as in `token-classes`.
 */
export const NAMED_COLORS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue " +
    "chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
    "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray " +
    "darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen " +
    "fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen " +
    "lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
    "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue " +
    "slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke " +
    "yellow yellowgreen").split(" "),
);

/** The CSS properties and SVG presentation attributes whose value is or holds a colour, in kebab case. */
const COLOR_PROPERTY =
  /^(?:-webkit-)?(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|(?:box|text)-shadow|text-decoration(?:-color)?|text-emphasis(?:-color)?|caret-color|accent-color|column-rule(?:-color)?|scrollbar-color|fill|stroke|stop-color|flood-color|lighting-color|text-fill-color|text-stroke(?:-color)?|tap-highlight-color)$/;

/** True when a property or attribute name (`backgroundColor`, `border-top`, `stopColor`, `WebkitTextFillColor`) takes a colour. */
export function isColorProperty(name) {
  return COLOR_PROPERTY.test(String(name).replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`));
}

/** The first named colour in a CSS value (`1px solid red`), or undefined. A `url(…)` or quoted text is not read. */
export function namedColorIn(value) {
  const words = String(value).replace(/url\([^)]*\)|"[^"]*"|'[^']*'/gi, " ").toLowerCase().split(/[\s,()/]+/);
  return words.find((word) => NAMED_COLORS.has(word));
}

/** The first named colour that a declaration in `text` gives a colour property (`color: red;`), or undefined. */
export function namedColorInDeclarations(text) {
  for (const [, property, value] of String(text).matchAll(/(?:^|[\s;{])(-?[a-zA-Z][\w-]*)\s*:\s*([^;{}]+)/g)) {
    const name = isColorProperty(property) ? namedColorIn(value) : undefined;
    if (name) return name;
  }
  return undefined;
}

/**
 * What a stylesheet declaration states that the tokens do not know, or undefined: a hex value or a colour function
 * with a literal channel in any value; a named colour in a colour property; and, for a custom property, a value that
 * is a named colour on its own (`--brand: rebeccapurple`), since a custom property's words are not all colours
 * (`--font: Red Hat Display`).
 * @param {string} property the declaration's property, `color` or `--brand`
 * @param {string} value its value as written
 * @returns {{ messageId: "rawColor" } | { messageId: "namedColor", data: { name: string } } | undefined}
 */
export function cssDeclarationProblem(property, value) {
  if (hasRawColor(value)) return { messageId: "rawColor" };
  const name = property.startsWith("--") ? (NAMED_COLORS.has(value.trim().toLowerCase()) ? value.trim().toLowerCase() : undefined) : isColorProperty(property) ? namedColorIn(value) : undefined;
  return name ? { messageId: "namedColor", data: { name } } : undefined;
}

/**
 * The named colour a string node gives CSS, from where it stands: the value of a colour property in an object, a
 * colour attribute of a lowercase (HTML or SVG) element, or a declaration inside the text. Undefined otherwise.
 * @param {any} node a string Literal or a TemplateLiteral
 * @param {string} text its text
 */
export function namedColorAt(node, text) {
  const parent = node.parent;
  if (parent?.type === "Property" && parent.value === node) {
    const key = parent.key.type === "Identifier" ? parent.key.name : parent.key.value;
    if (!parent.computed && isColorProperty(key)) return namedColorIn(text);
  }
  if (parent?.type === "JSXAttribute" || (parent?.type === "JSXExpressionContainer" && parent.parent?.type === "JSXAttribute")) {
    const attribute = parent.type === "JSXAttribute" ? parent : parent.parent;
    const element = attribute.parent?.name;
    if (element?.type === "JSXIdentifier" && /^[a-z]/.test(element.name) && isColorProperty(attribute.name?.name)) return namedColorIn(text);
  }
  return namedColorInDeclarations(text);
}

// ---------- collecting class strings ----------

/** The string texts an expression holds: literals, template parts, conditional and logical branches, arrays, object keys and values, nested helper calls. */
function stringsOf(node, helpers, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push({ node, text: node.value });
      break;
    case "TemplateLiteral":
      for (const quasi of node.quasis) out.push({ node, text: quasi.value.raw });
      for (const expression of node.expressions) stringsOf(expression, helpers, out);
      break;
    case "JSXExpressionContainer":
      stringsOf(node.expression, helpers, out);
      break;
    case "ConditionalExpression":
      stringsOf(node.consequent, helpers, out);
      stringsOf(node.alternate, helpers, out);
      break;
    case "LogicalExpression":
      if (node.operator !== "&&") stringsOf(node.left, helpers, out);
      stringsOf(node.right, helpers, out);
      break;
    case "ArrayExpression":
      for (const element of node.elements) stringsOf(element, helpers, out);
      break;
    case "ObjectExpression":
      for (const property of node.properties) {
        if (property.type !== "Property") continue;
        if (property.key.type === "Literal" && typeof property.key.value === "string") out.push({ node: property.key, text: property.key.value });
        stringsOf(property.value, helpers, out);
      }
      break;
    case "CallExpression":
      if (node.callee.type === "Identifier" && helpers.includes(node.callee.name)) for (const argument of node.arguments) stringsOf(argument, helpers, out);
      break;
    default:
  }
  return out;
}

/** True inside a JSX class attribute or a helper call, where an outer visitor already collects. */
function insideCollected(node, helpers) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "JSXAttribute") return ["className", "class"].includes(current.name?.name);
    if (current.type === "CallExpression" && current.callee.type === "Identifier" && helpers.includes(current.callee.name)) return true;
  }
  return false;
}

const MESSAGES = {
  unknownToken: "`{{class}}` is not a {{kind}} token of the design tokens. Use a token (`{{example}}`), or add the token to the token files, record its use in the rules document, and rebuild.",
  arbitraryValue: "`{{class}}` states a literal {{kind}} that no document knows. Use a token (`{{example}}`), or reference one (`var(--…)`).",
  bareUtility: "`{{class}}` is Tailwind's default {{kind}}, not a token. Name the token (`{{example}}`).",
  modifier: "`{{class}}` changes a token with a modifier, making a {{kind}} the tokens do not know. Use the token as it is (`{{example}}`); a new tint is a derived role in the token files.",
  paletteReference: "`{{class}}` reads the palette. Code reads roles, never primitives: use the role that points to it (`{{example}}`).",
};

const optionsSchema = [
  {
    type: "object",
    properties: {
      theme: { type: "array", items: { type: "string" } },
      variables: { type: "array", items: { type: "string" } },
      palette: { type: "string" },
      helpers: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  },
];

/** @type {import("eslint").Rule.RuleModule} */
export const tokenClasses = {
  meta: { type: "problem", docs: { description: "Every token-owned utility names a design token" }, messages: MESSAGES, schema: optionsSchema },
  create(context) {
    const options = { ...DEFAULTS, ...(context.options[0] ?? {}) };
    const tokens = loadTokens(context.cwd, options);
    const checkText = (node, text) => {
      for (const [raw] of text.matchAll(/\S+/g)) {
        const parsed = parseClass(raw);
        const verdict = judgeClass(parsed.base, tokens, parsed.modifier);
        if (verdict) context.report({ node, messageId: verdict.messageId, data: { class: raw, kind: verdict.kind, example: verdict.example } });
      }
    };
    const check = (root) => {
      for (const { node, text } of stringsOf(root, options.helpers)) checkText(node, text);
    };
    return {
      // A stylesheet's `@apply bg-surface text-on-surface` lists classes as markup does.
      Atrule(node) {
        if (node.name === "apply" && node.prelude) checkText(node, context.sourceCode.getText(node.prelude));
      },
      JSXAttribute(node) {
        if (["className", "class"].includes(node.name?.name) && node.value) check(node.value);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && options.helpers.includes(node.callee.name) && !insideCollected(node, options.helpers)) check(node);
      },
    };
  },
};

const TEST_FILE = /(^|[\\/])(__tests__|__mocks__)[\\/]|\.(test|spec)\.[cm]?[jt]sx?$/;

/** What `no-raw-color` says, shared with the Stylelint rule (stylelint-token-rules.mjs), `{{name}}` filled in by each. */
export const RAW_COLOR_MESSAGES = {
  rawColor: "A raw colour in source: the tokens do not know it and no other theme can change it. Use a colour role (a `bg-`/`text-` token class, or `var(--color-…)`); a new colour becomes a role in the token files first.",
  namedColor: "`{{name}}` is a CSS named colour: the tokens do not know it and no other theme can change it. Use a colour role (a `bg-`/`text-` token class, or `var(--color-…)`); a new colour becomes a role in the token files first.",
};
const HOLE = "\u0000";

/** @type {import("eslint").Rule.RuleModule} */
export const noRawColor = {
  meta: {
    type: "problem",
    docs: { description: "No raw colour values in source: every colour traces to a design token" },
    messages: RAW_COLOR_MESSAGES,
    schema: [],
  },
  create(context) {
    if (TEST_FILE.test(context.filename)) return {};
    return {
      // A stylesheet's declarations, through ESLint's CSS language; a JavaScript file has none.
      Declaration(node) {
        const problem = node.value && cssDeclarationProblem(node.property, context.sourceCode.getText(node.value));
        if (problem) context.report({ node, ...problem });
      },
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (hasRawColor(node.value)) return context.report({ node, messageId: "rawColor" });
        const name = namedColorAt(node, node.value);
        if (name) context.report({ node, messageId: "namedColor", data: { name } });
      },
      TemplateLiteral(node) {
        // Each `${…}` stands in as a hole, so a channel read from a variable is never a literal digit.
        const text = node.quasis.map((quasi) => quasi.value.raw).join(HOLE);
        if (hasRawColor(text)) return context.report({ node, messageId: "rawColor" });
        const name = namedColorAt(node, text);
        if (name) context.report({ node, messageId: "namedColor", data: { name } });
      },
    };
  },
};

const rules = { "token-classes": tokenClasses, "no-raw-color": noRawColor };

/** The ESLint rules that hold each rubric rule, for an exemption that names rules. */
const RULES_FOR = { "tiers/no-literal-in-code": ["token-classes", "no-raw-color"], "tiers/no-primitive-in-code": ["token-classes"] };

/**
 * Flat-config entries that turn this plugin's rules off for the paths design-system/gates.json exempts: every rule
 * for an exemption that names none, else the rules that hold the rubric rules it names. ESLint matches the globs
 * itself, so the exemption reads the same here as in the audit and the checks.
 * @param {{ exempt?: { paths: string[], rules?: string[], reason: string }[] }} gates the parsed gates config
 */
export function exemptionConfigs(gates) {
  return (Array.isArray(gates?.exempt) ? gates.exempt : [])
    .map((exemption) => {
      const names = exemption.rules === undefined ? Object.keys(rules) : [...new Set(exemption.rules.flatMap((rule) => RULES_FOR[rule] ?? []))];
      if (names.length === 0 || !Array.isArray(exemption.paths)) return undefined;
      return { name: `design-system/exempt: ${exemption.reason}`, files: exemption.paths, rules: Object.fromEntries(names.map((name) => [`design-system/${name}`, "off"])) };
    })
    .filter(Boolean);
}
const at = (severity) => Object.fromEntries(Object.keys(rules).map((name) => [`design-system/${name}`, severity]));

/** The rules as an ESLint plugin, with `recommended` (warn, for a person) and `strict` (error, for agents and CI). */
export const designSystemPlugin = { meta: { name: "design-system" }, rules, configs: {} };
designSystemPlugin.configs.recommended = { plugins: { "design-system": designSystemPlugin }, rules: at("warn") };
designSystemPlugin.configs.strict = { plugins: { "design-system": designSystemPlugin }, rules: at("error") };
