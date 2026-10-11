# Profile: DTCG → Terrazzo → Tailwind CSS v4

> Reference material for the design-system plugin. How the rubric's rules are built, checked and gated in a web project that builds DTCG tokens with Terrazzo into a Tailwind CSS v4 theme. Load when the scan reports this profile, or when `setup` chooses it. Every API named here is confirmed in the installed version's documentation before use (`sources.md`).

## When this profile applies

The scan reports `profile: "terrazzo-tailwind-v4"` when the project depends on:
- `tailwindcss` 4.x;
- `@terrazzo/cli` or `@terrazzo/parser`.

When it has Tailwind v4 but no Terrazzo, the profile is still the recommendation for `setup` and `fix`: the audit reports a `format/single-source-build` finding when theme values are written by hand.

## Layout

The token files follow the canonical layout (`references/conventions.md`), under `design-system/tokens/`. This profile adds:

```
terrazzo.config.ts                    # at the root, where Terrazzo looks for it: tokens → CSS variables + Tailwind theme
design-system/theme.template.css      # the Tailwind wiring, filled by Terrazzo (hand-written, holds no values)
<framework path>/*.generated.css      # built outputs, never edited (src/styles/, or app/ in Next.js)
```

A project with other paths records them once, in `design-system/gates.json`, and every check reads them from there.

## Build

`assets/harness/terrazzo-tailwind-v4/terrazzo.config.ts` and `theme.template.css` are the starting point. What they encode:

- **`@terrazzo/plugin-css`:** every token of the default context as `:root` variables. The other contexts produce nothing here, because they reach the page through the Tailwind theme's variant.
- **`@terrazzo/plugin-tailwind`:** the template's `@tz (<modifier>: "<context>")` rules receive each context. The `theme` option maps token groups to Tailwind namespaces, so each group makes its utilities:

  | Token group | Tailwind namespace |
  |---|---|
  | `colors.*` | `color` |
  | `typography.*` | `text` |
  | `rounded.*` | `radius` |
  | `spacing.*` | `spacing` |
  | `shadow.*` | `shadow` |

  **The palette group is never mapped**, so no utility can name a primitive (`tiers/no-primitive-in-code`).
- **`--color-*: initial`** inside `@theme` removes Tailwind's default palette (Tailwind docs, theme: overriding a namespace). After this reset, an unknown colour class produces no CSS and no error. That is why the code lint exists, and why the reset is fixed last: its finding `requires` every finding for a file that still uses a default palette class (`report.md`, Fix order).
- **Typography composites** become `--text-<style>` with `--text-<style>--line-height`, `--letter-spacing` and `--font-weight`. One class (`text-body-md`) applies the whole style. A documented borrow reads the other style's part: `leading-(--text-label-lg--line-height)`.
- **Dark (or any second context)** is a `@custom-variant` in the template, `@variant <name> { @tz (theme: "<name>"); }`. Confirm the variant syntax in Tailwind's dark mode docs.
- **An output directory override** (`DESIGN_TOKENS_OUT_DIR`) lets the staleness check build into a temporary folder.
- **Resolved values for code that cannot read CSS variables** (Pitfalls, Hand copies): `@terrazzo/plugin-js` in the same `plugins` list, `js({ filename: "tokens.js" })` (https://terrazzo.app/docs/integrations/js). It writes `tokens.js` and `tokens.d.ts` and leaves the CSS outputs as they were. Its `contexts` option limits the permutations it builds, `properties` the fields.

## Checks and gates per rule

| Rule | Existing tool first | Plugin check |
|---|---|---|
| `format/dtcg-valid` | `tz check`, which checks the files and runs the lint rules | none |
| `naming/consistent-case` | Terrazzo `core/consistent-naming` (`["error", { format: "kebab-case" }]`) | none |
| `docs/token-descriptions` | Terrazzo `core/descriptions`, with `ignore` for the palette | none |
| `tiers/contrast-pairs` | Terrazzo `a11y/min-contrast` with `pairs`, and @google/design.md's `contrast-ratio`. Confirm whether each checks every resolver context; design.md's reads one, holds every pair to 4.5:1 and does not composite alpha | `scripts/check-rules-contract.mjs`: each contract pair in every context, translucent text composited, large text at 3:1, variants with what they inherit |
| `tiers/palette-literal`, `tiers/role-aliases-palette`, `tiers/derived-rule-recorded`, `tiers/styles-alias-foundation`, `format/themes-complete` | none: DTCG leaves tier rules to the team | `scripts/check-tokens.mjs`: reads the resolver with the plugin's own DTCG reader (`scripts/lib/dtcg.mjs`), resolves every context, checks the tiers, and recomputes derived values (`scripts/lib/color.mjs`). No dependencies |
| `tiers/components-read-roles`, `docs/rules-hold-no-values`, `docs/rules-reference-existing-tokens` | @google/design.md `lint` on a document composed in memory (until `imports:` is supported) | `scripts/check-rules-contract.mjs`: front matter keys, `imports:`, every contract reference is a known role, every component file that reads roles has a key, and the contract's contrast pairs (`tiers/contrast-pairs`). It reads the front matter with the project's `yaml` |
| `tiers/no-primitive-in-code`, `tiers/no-literal-in-code` | Tailwind's theme mapping and the palette reset | `assets/harness/terrazzo-tailwind-v4/eslint-token-rules.mjs`: `token-classes` (a token utility must name a token the generated theme defines; no arbitrary values, no modifiers, no palette variables) and `no-raw-color` (no hex or literal colour functions in source, and no CSS named colour where CSS reads a colour: a style object's colour property, an element's `fill` or `stroke`, a `color: red` declaration in a string) |
| `format/single-source-build` | `tz build` | `scripts/profiles/terrazzo-tailwind-v4/check-generated.mjs`: builds into a temporary folder, compares with the committed outputs, and fails an output with no tokens. `protect-generated.mjs` (core hook) denies an agent's edit to an output |

**Why the tier rules are the plugin's own script, not a Terrazzo lint rule:** a Terrazzo lint rule receives one resolved token set (`LintRuleContext.tokens`), and the tier and completeness rules need every context. The plugin's DTCG reader and colour maths also make the check independent of the build tool, so it runs the same way on a project that builds with Terrazzo, Style Dictionary or nothing. Its results match Terrazzo's resolved values and lightningcss's derived colours (verified on a real token set, and by `scripts/lib/__tests__`).

## Wiring the checks

The project's `package.json` gets two scripts; the names are the project's choice, and are recorded in `design-tokens.gates.json`:
- `tokens:build`: runs `tz build`;
- `tokens:check`: runs the copied `check-tokens.mjs`, then `check-rules-contract.mjs`, then `check-generated.mjs`, then `tz check`.

The ESLint rules join the project's flat config twice, once in each severity (`decisions.md`, Gate severity):
- `recommended`: `warn`;
- `strict`: `error`, selected by an environment variable that the hooks and CI set.

## Dependencies this profile adds

Ask before adding each one:
- `@terrazzo/cli`, `@terrazzo/parser`, `@terrazzo/plugin-css`, `@terrazzo/plugin-tailwind`, for the build (the config imports `RECOMMENDED_CONFIG` from `@terrazzo/parser`);
- `@terrazzo/plugin-js`, only when server code needs resolved values (Pitfalls, Hand copies);
- `yaml`, which the contract check uses to read the front matter;
- `@google/design.md`, only when the project wants its contrast and structure lint.

The token check needs none of them.

## Pitfalls

Found while migrating a real project, and confirmed in Terrazzo 2.7.1. Re-check each one in the installed version.

- **`lint.rules` replaces the recommended rules.** Terrazzo applies its recommended set only when `lint.rules` is undefined, so a config that sets any rule runs only those rules. Spread the recommended set first: `rules: { ...RECOMMENDED_CONFIG, … }`, with `RECOMMENDED_CONFIG` from `@terrazzo/parser`. The template config does this.
- **A relative template path resolves against `outDir`, not the project root.** The build then fails with "Could not locate template". Pass the path through `resolve()`, as the template config does.
- **One context is a set, not a modifier.** A modifier must declare two or more contexts (Resolver §4.1.5.1; the resolver schema's `minProperties: 2`), so a single theme goes in a set, and the resolver has no modifier. Terrazzo accepts a one-context modifier, but the file is not valid DTCG, and `check-tokens.mjs` reports it.
  - With no modifier, the template uses `@tz(tzMode: ".")`: Terrazzo documents `tzMode` as its virtual modifier for tokens without resolver modifiers, and warns against mixing it with resolver modifiers.
  - A missing or wrong argument (`@tz()`, `@tz(tzMode: "nope")`) builds an empty `@theme` with exit 0 and only a "matched 0 tokens" warning. `check-generated.mjs` fails on an output with no tokens for this reason.
- **Line height is a ratio, and its product must not fall below the pixel value.**
  - *The standards.*
    - DTCG requires a number: `lineHeight` "MUST be a valid number value or a reference to a number token" (Format 2025.10, §9.8, https://www.designtokens.org/tr/2025.10/format/).
    - CSS multiplies a number by each element's font size and inherits the number (CSS 2.1 §10.8.1, https://www.w3.org/TR/CSS2/visudet.html).
    - MDN calls the unitless number "the preferred way" (https://developer.mozilla.org/en-US/docs/Web/CSS/line-height).
    - Tailwind v4's own defaults are ratios, for example `--text-sm--line-height: calc(1.25 / 0.875)` (tailwindlabs/tailwindcss, packages/tailwindcss/theme.css).
  - *What a browser does with it.* Blink stores the number as a 32-bit float percentage (`style_builder_converter.cc`, `ConvertLineHeight`), truncates the used height to 1/64 px (`layout_unit.h`, `length_functions.cc`), and floors the top half-leading to a whole pixel (`line_utils.cc`). So a product a hair under the intended pixel (36/28 × 28 = 35.99…) moves the text up by one pixel.
  - *The rule.* Store the smallest ratio with 4 decimals whose product with the font size is not below the pixel line height (`1.2858` for 36/28). It stays a DTCG number and lays out as the whole pixel. Do not store px: it is not valid DTCG, even though Terrazzo accepts it.
  - *Inheritance.* A child that changes font size without its own text style gets the ratio times its own size. When a migration from px changes rendering, give that element its own `text-<role>` class (decisions, Text styles).
- **Tailwind does not apply `--text-*--font-family`.** A `text-*` utility sets the font size and the `--line-height`, `--letter-spacing` and `--font-weight` sub-properties (https://tailwindcss.com/docs/font-size). The family Terrazzo writes beside them has no effect.
  - Wire the family separately: a `font-*` utility from the `font` group, or the framework's font loader (Next.js `next/font`).
  - Gate that the loaded family matches `font.family.*`, so a change to the token is not silently ignored.
- **Measure before you blame a token.** A visual problem after a token change is measured first (element rects, text ranges, computed styles, before and after). Text that is centred by its box but looks off-centre is optical: the box includes the font's ascent and descent, and `text-box: trim-both cap alphabetic` (CSS Inline 3) is the standard remedy. It is a design decision, not a token fix.
- **Hand copies of token values.** Some code needs a value, not a CSS variable: `ImageResponse` (OG images), `metadata.themeColor`, WebGL uniforms, a Mermaid theme. A hand copy of the value is a second source that drifts (`tiers/no-literal-in-code`). Two answers, by where the code runs:
  - *Server code* (`ImageResponse`, metadata) imports the values the build generated. `@terrazzo/plugin-js` writes `tokens.js`, whose `resolver.apply({ theme: "dark" })["colors.surface"].$value` is one context's resolved value (with `hex` for a colour). The module has no runtime imports; its `.d.ts` imports types from `@terrazzo/token-types`. List it in `generated`, so the hooks deny an edit and the staleness check covers it. The docs call it heavy and meant for server rendering, so keep it out of client bundles.
  - *Client code that follows the active theme* (WebGL, Mermaid) reads the role at runtime: `getComputedStyle(document.documentElement).getPropertyValue("--color-<role>")`, converted where the API needs numbers, and read again when the theme changes. It reads the Tailwind variable, so it runs after the stylesheet has loaded.
  - *Verified* with plugin-js 2.7.1 beside plugin-css and plugin-tailwind in one config, on a two-context token set: the CSS outputs were byte-identical to the build without it, and all 162 colour values in both contexts matched `check-tokens.mjs`'s own resolution.
