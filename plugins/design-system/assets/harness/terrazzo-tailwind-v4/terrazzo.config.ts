// Terrazzo builds the project's CSS from its W3C Design Tokens
// (https://terrazzo.app/docs/integrations/tailwind/). A starting point from
// the design-system plugin; confirm every option in the installed version's
// documentation before relying on it.
//
// - plugin-css: every token of the default context as a `:root` variable. The
//   other contexts reach the page through the Tailwind theme's variant, so
//   their permutation writes nothing here; plugin-tailwind still needs it,
//   and reads every value from plugin-css, so plugin-css transforms every token.
// - plugin-tailwind: the Tailwind v4 theme, from theme.template.css, whose
//   `@tz` rules receive each context. NAMESPACE maps each role group to the
//   Tailwind namespace that makes its utilities. The palette group is not
//   mapped, so no class can name a primitive.
// - One name per token: both plugins name a variable with cssVar(), so
//   `colors.canvas` is `--color-canvas` in `:root` and in the theme, and
//   Tailwind's `bg-canvas` reads it. The role's `:root` copy is expected.
//
// DESIGN_TOKENS_OUT_DIR builds elsewhere, for check-generated.mjs.
// This is the two-context form (a `theme` modifier with light and dark). With
// one context the resolver has no modifier: replace the permutations with
// `[{ input: {}, prepare: (contents) => `:root {\n${contents}\n}` }]` and write
// `@tz(tzMode: ".")` in the template (profile, Pitfalls).
// Replace the output folder with the framework's, and keep the paths and group
// names of references/conventions.md unless the project has its own.

import { resolve } from "node:path";
import { defineConfig } from "@terrazzo/cli";
import { RECOMMENDED_CONFIG } from "@terrazzo/parser";
import css from "@terrazzo/plugin-css";
import tailwind from "@terrazzo/plugin-tailwind";

/** The project's `$extensions` key (DTCG Format 5.2.3): `tokens.extensionKey` in design-system/gates.json. */
const EXTENSION_KEY = "com.example.design";

/** Role group → Tailwind namespace (conventions, Group names). A group not listed makes no utility. */
const NAMESPACE: Record<string, string> = {
  colors: "color",
  typography: "text",
  spacing: "spacing",
  rounded: "radius",
  shadow: "shadow",
};

/**
 * The one CSS variable a token id maps to: a role group takes its Tailwind namespace
 * (`colors.brand.accent` → `--color-brand-accent`), any other group keeps its name
 * (`palette.gray-9` → `--palette-gray-9`).
 */
function cssVar(id: string): string {
  const [group, ...rest] = id.split(".");
  return `--${NAMESPACE[group] ?? group}-${rest.join("-")}`;
}

interface GradientToken {
  id: string;
  $type: string;
  $value: { color: { hex?: string; alpha?: number }; position: number }[];
  $extensions?: Record<string, { css?: { function: string; prelude?: string } }>;
  partialAliasOf?: { color?: string }[];
}

/**
 * A DTCG gradient holds its stops only, with no angle or shape. The CSS function and what
 * precedes the stops are recorded in the token's `$extensions`
 * (`{ "css": { "function": "linear-gradient", "prelude": "90deg" } }`); this writes the whole
 * value, each stop reading its palette variable. A gradient without them is an error, since
 * its stops alone are no CSS image.
 */
function gradient(token: GradientToken): string | undefined {
  if (token.$type !== "gradient") return undefined;
  const geometry = token.$extensions?.[EXTENSION_KEY]?.css;
  if (!geometry) throw new Error(`terrazzo.config.ts: ${token.id} has no "css" geometry in $extensions["${EXTENSION_KEY}"]`);
  const stops = token.$value.map((stop, i) => {
    const alias = token.partialAliasOf?.[i]?.color;
    const color = alias ? `var(${cssVar(alias)})` : literal(stop.color);
    return `${color} ${Number((stop.position * 100).toFixed(4))}%`;
  });
  return `${geometry.function}(${[geometry.prelude, ...stops].filter(Boolean).join(", ")})`;
}

/** A literal stop colour: its hex, or rgb() with its alpha, which 8-digit hex would round to 1/255. */
function literal({ hex = "#000000", alpha = 1 }: { hex?: string; alpha?: number }): string {
  if (alpha === 1) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

export default defineConfig({
  tokens: ["./design-system/tokens/design.resolver.json"],
  outDir: process.env.DESIGN_TOKENS_OUT_DIR ?? "./src/styles/",
  lint: {
    // Setting lint.rules replaces Terrazzo's recommended rules instead of adding to them (it applies
    // RECOMMENDED_CONFIG only when lint.rules is undefined), so the recommended set is spread in first.
    rules: {
      ...RECOMMENDED_CONFIG,
      "core/consistent-naming": ["error", { format: "kebab-case" }],
      "core/descriptions": ["warn", { ignore: ["palette.*"] }],
    },
  },
  plugins: [
    css({
      filename: "tokens.generated.css",
      variableName: (token) => cssVar(token.id),
      // A text style keeps only its parts here: its shorthand would take `--text-<style>`, the
      // name Tailwind gives the font size.
      omitTypographyShorthand: true,
      transform: (token) => gradient(token as unknown as GradientToken),
      permutations: [
        { input: { theme: "light" }, prepare: (contents) => `:root {\n${contents}\n}` },
        { input: { theme: "dark" }, prepare: () => "" },
      ],
    }),
    tailwind({
      template: resolve("design-system/theme.template.css"),
      filename: "theme.generated.css",
      variableName: (_, { token }) => cssVar(token.id),
      // One group per namespace, as a string: given an array of groups, plugin-tailwind 2.7.1 strips
      // the last group's prefix from every token (profile, Pitfalls).
      theme: Object.fromEntries(Object.entries(NAMESPACE).map(([group, namespace]) => [namespace, `${group}.*`])),
    }),
  ],
});
