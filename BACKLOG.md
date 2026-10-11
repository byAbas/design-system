# Backlog

What the plugin should do next, and why. Each item names the project run that showed the gap. When an item ships, it moves to the plugin's CHANGELOG with its release and leaves this file.

## Audit

- **A token without `$type`** is valid DTCG when its type is inherited or resolved; the check should accept it.
- **Derived rules for dimensions**, not only colours.
- **Before proposing a dependency,** the auditor proposes the project's own reader or tool when one exists.
- **Studies:** `@shadcn/lint` and fallow, for overlap with the rubric.

## Fix

- **Visual verification for migrations.** The ispanviza-web batch captured computed styles (colour, background, border, shadow, font size, line height, weight, max-width) of every element on every route at two widths, plus screenshots and interaction states, before and after, and stopped on any difference. Make this the default proof for a batch that must not change rendering, run from the session scratchpad, never added to the project. Diff the pre-rendered HTML too: on ispanviza-web every screenshot was identical while two routes lost a CTA link from the server HTML (the browser added it back), which only the HTML diff showed. And check the base build on its own: a comparison of two builds cannot see a fault both share.

## Profile: terrazzo-tailwind-v4 (Terrazzo 2.7.1)

Found migrating hand-written CSS with a sets-only resolver (one context). cv-screener has a `theme` modifier, so none of these showed there. (ispanviza-web)

- **Sets-only resolver:** `@tz(tzMode: ".")` matches no tokens, because plugin-tailwind's legacy-modes branch never applies. Use `@tz;` with an explicit plugin-css permutation `{ input: {} }`.
- **Variable names from an array mapping** take the prefix from the last glob only (`colors.canvas` becomes `--color-colors-canvas`). Ship a `variableName` function in the template.
- **Gradients:** a DTCG gradient holds stops only, with no angle or shape. Keep the geometry in `$extensions` and ship the transform that writes `linear-gradient(...)` or `radial-gradient(...)`.
- **Typography composites** are written as a `font` shorthand under the `--text-*` name Tailwind uses for size. Set `omitTypographyShorthand: true`.
- **plugin-tailwind reads plugin-css's transforms,** so plugin-css must transform every token, and it writes a `:root` copy of the roles. Document that the two copies are expected.
- **`legacyHex` rounds alpha** (0.12 became about 0.1216). Write colours with transparency as `rgb(r g b / alpha)`.

## The design source

The design source (Figma later) exports the tokens: a token carries its value and its definition (`$description`), and the rules document holds only the rules for using them.

- Principle 1 and decisions, "The rules document".
- Rubric wording for `docs/rules-document-exists` and `docs/token-descriptions`.
- Setup skeletons with definitions in the tokens.
- A fix batch that moves definitions from the rules document into the tokens.
- Conventions, "The design source".

## Figma

- Read and write DTCG from Figma Variables, test on a project whose tokens came from Figma (ispanviza-web's `styles/tokens.css` was extracted from a Figma node).

## Projects and proof

- **abasturabli.com:** upgrade the harness to 0.8 (legacy-0.6), palette tier, DESIGN.md.
- **inarra:** upgrade the harness (legacy-0.5).
- **PoC 2:** a greenfield `setup`.
- **The README:** a page that shows what the plugin does, with the transcripts of real runs.
