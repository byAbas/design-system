# Decisions

> Reference material for the design-system plugin. Each decision is written as a condition and a choice, with its reason and source. Load when setting up a token architecture, or when an audit finding needs its "why". Re-read a cited source when the decision matters to the project: sources move, and `sources.md` lists what to verify.

## Token format

**Choice:** W3C Design Tokens (DTCG) 2025.10, files named `*.tokens.json`.

**Why:** DTCG is the interchange format the token tools read. 2025.10 is its first stable version, with Format, Color and Resolver modules. Two rules to keep in mind:
- Format 5.1.1: names must not start with `$` or contain `{`, `}` or `.`.
- Format 8.2: dimensions take `px` or `rem` only.

Source: https://www.designtokens.org/tr/2025.10/format/

**When the project uses another format:** report it (`format/dtcg-valid`) and propose a migration. Style Dictionary documents its DTCG support and a converter for older token files. Check whether its installed version covers 2025.10: https://styledictionary.com/info/dtcg/

## Themes

**Choice:**
- When the interface has more than one context (light and dark, brands, densities), the contexts are declared in a DTCG resolver (`*.resolver.json`): sets always apply, and modifiers switch between contexts.
- Only the tokens that change with a context live in that context's file; everything else lives in a set.

**Why:** The Resolver module is the standard way to express contexts. It keeps one file per context instead of a copy of the whole token tree per theme.

Source: https://www.designtokens.org/tr/2025.10/resolver/

**When there is one context:** a resolver is optional. Plain token files are enough, and adding a resolver later changes no token id.

## Tier rules are the team's

**Choice:** the plugin's tier rules (palette, roles, contract; `principles.md` 2) are checked by the project's own gates.

**Why:** DTCG defines the format for exchanging tokens, "while leaving organizational strategy to design system teams". No format validator checks tiers, so a team that wants them enforced writes the check.

Source: https://www.designtokens.org/faq/

## Component tokens

**Choice for a single product that owns its components:**
- No component token tier in DTCG.
- The component contract lives in the rules document, naming the roles each component reads.

**When a component token tier is warranted:**
- the components are published as a library that other products theme (Material 3 publishes component tokens as that library's public API, each mapped to a system token);
- or a component must be themed independently of the roles;
- or design tools must set component values on their own.

**Why:**
- A component token that only repeats a role adds a name without adding a decision.
- Adobe Spectrum's per-component token files stay small, because most component values resolve through alias tokens.

Sources:
- https://m3.material.io/foundations/design-tokens/overview
- https://github.com/adobe/spectrum-design-data/blob/main/packages/tokens/src/color-aliases.json

## Interaction states (hover, pressed, and blends)

**Choice:**
- Each state colour is a role with a static value in every theme.
- When the palette's next step is distinct enough, the state role aliases it.
- When it is not, the state role is derived by a recorded rule, for example an OKLCH lightness shift, or a mix over the surface.
- A translucent role (a scrim, a faint status fill) is derived too, by an `alpha` rule: its opaque base at a fixed alpha. A literal copy of the base with an alpha does not follow when the base changes.
- The three kinds the checks recompute, under the project's `$extensions` key as `derived`:
  - `{ "kind": "lightness", "from": "<role>", "lightness": -0.07 }`: the OKLCH lightness of `from` moved, hue and chroma kept;
  - `{ "kind": "mix", "from": "<role>", "weight": 0.6, "over": "<role>" }`: `from` at `weight` over `over`, in sRGB;
  - `{ "kind": "alpha", "from": "<role>", "alpha": 0.5 }`: `from` at `alpha`.

  A rule reads opaque roles: a translucent role is only a colour once it is painted over something.
- The rule is stored in the token's `$extensions` and restated in its `$description`. A check confirms the stored value equals what the rule gives.

**Why:** the major systems ship states as tokens with fixed values per theme, not as colour maths at runtime:
- **Radix:** each scale reserves a step for the hovered solid colour.
- **Primer:** each button state is its own token, overridden per theme.
- **Spectrum:** hover and down states are alias tokens.
- **Material:** each state is a state-layer token, an overlay at a fixed opacity per state.
- **Tokens Studio:** its colour modifiers are resolved to static values on export.
- **DTCG:** has no colour functions.

Sources:
- https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- https://github.com/primer/primitives/blob/main/src/tokens/component/button.json5
- https://github.com/adobe/spectrum-design-data/blob/main/packages/tokens/src/color-aliases.json
- https://m3.material.io/foundations/interaction/states/state-layers
- https://docs.tokens.studio/manage-tokens/token-types/color/modified

## Palette generation and provenance

**Choice:**
- The palette comes from seeds through a documented generator, for example Radix's custom palette generator.
- The generator (tool, version or commit) and the seeds are recorded in `$extensions` on the palette group.
- A hand-picked palette records why it was hand-picked.

**Why:**
- A palette someone can regenerate can be extended without guessing.
- DTCG Format 5.2.3 reserves `$extensions` for tool and team data, and recommends reverse domain name notation for the key, for example `com.example.design`.

**Watch:** a generator may place the seed on a different step than expected, for example when the seed is close to the background. Compare the generated scale against the seeds before naming roles.

Sources:
- https://www.radix-ui.com/colors/custom
- https://www.designtokens.org/tr/2025.10/format/

## Scale anatomy

**Choice:** when the palette follows the Radix 12-step anatomy, roles pick steps by use:

| Steps | Use |
|---|---|
| 1–2 | Backgrounds |
| 3–5 | Component fills (normal, hover, pressed) |
| 6–8 | Borders |
| 9–10 | Solid fills (normal, hover) |
| 11–12 | Text |

Source: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale

## Primitives are not exposed to code

**Choice:**
- With a utility framework, only role groups become utilities.
- The palette reaches the page as plain CSS variables at most, and the framework's default palette is removed.
- Code that names a palette entry fails a gate.

**Why:** a primitive that is one class away will be used, and the second tier stops meaning anything.

Checked by `tiers/no-primitive-in-code`. The profile says how, per stack.

## Text styles

**Choice:** a text style is a DTCG `typography` composite, and code applies it as one unit, for example one utility class. Family and weight alias the foundation's font tokens.

**Why:** a style split into separate size, line height and weight utilities drifts one property at a time.

**Line height is a ratio.** DTCG stores `lineHeight` as a unitless number relative to the font size, and CSS inherits a unitless line height as that ratio. A child that sets its own font size, without its own text style, therefore gets a line height scaled to its size, not the parent's pixel value. When a move from px line heights changes an element's rendering, give that element its own text style class. Do not store px: it is not valid DTCG.

Source: https://www.designtokens.org/tr/2025.10/format/ (Typography type)

## Contrast

**Choice:**
- The rules document lists which text and icon roles may sit on which surfaces.
- Each pair meets WCAG 2.1 AA in every theme:
  - 4.5:1 for text (SC 1.4.3), 3:1 for large text;
  - 3:1 for icons, borders that identify controls, and focus indicators (SC 1.4.11).
- Text in a disabled control is exempt (SC 1.4.3 exception for inactive components).

**How it is checked:** the contract names each component's `backgroundColor`, `textColor` and `typography`, so the pairs a component combines are machine-readable. The rules-contract check computes each pair in each context with the plugin's own colour maths (`tiers/contrast-pairs`):
- a translucent text colour is composited over the background first, as CSS paints it;
- large text, from the component's `typography`, is held to 3:1, and so is an icon, a key ending in `-icon` (SC 1.4.11);
- a variant takes the colours it does not state from the component it extends, so a hover background is checked against the text it shows;
- a translucent background is not measured: what it sits on is not in the contract.

Pairs the rules document approves only in prose stay a review item.

**Own maths, no colour library:** WCAG 2.x relative luminance and source-over compositing are a few lines each and have not changed in years. The design systems that compute contrast mostly write them in-house with no runtime dependency: Meta's Astryx ("Dependency-free WCAG 2.x contrast math"), Google's Material Color Utilities, Atlassian, and Adobe Leonardo; GitHub Primer keeps its colour libraries as build-time devDependencies. The checks are copied into a project and run in its pre-commit hook and CI, where a dependency would be one more thing to install. The maths is tested against WCAG's reference values (21:1, `#767676` on white at 4.54:1).

Sources:
- https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG22/Techniques/general/G18
- https://github.com/facebook/astryx/blob/main/packages/core/src/theme/contrast.ts
- https://github.com/material-foundation/material-color-utilities/blob/main/typescript/contrast/contrast.ts

## The rules document

**Choice:** `DESIGN.md` in the Google design.md format:
- the front matter holds only the document's identity, an `imports:` path to the tokens (the resolver, or the token entry file), and the `components:` contract, where each property names a token id (`{colors.primary}`);
- the prose explains meaning, use and reasons, and cites token ids, never values.

**Why:**
- The format pairs a machine-readable contract with prose an agent reads.
- Its maintainer describes referencing or importing token files into DESIGN.md as the direction, instead of copying tokens into the front matter (google-labs-code/design.md#28, comment of 2026-06-02).

**Until the format reads `imports:`:** its linter needs values in the front matter. Compose that document in memory from the tokens, lint it, and never write it to disk.

**When the project uses another rules document:** keep it, and check that it holds no values, that it has a machine-readable contract, and that every token id it cites exists.

Sources:
- https://github.com/google-labs-code/design.md
- https://github.com/google-labs-code/design.md/issues/28

**Alpha:** the format and its CLI are pre-1.0. Confirm commands and front matter keys in the installed version.

## Naming

**Choice:**
- Roles are named by purpose (`surface`, `on-surface`, `primary`, `outline`), the palette by scale (`gray-1` to `gray-12`).
- One case convention everywhere, kebab-case unless the project has another.
- The same id maps to code by one documented rule, for example `colors.surface` becomes `bg-surface` and `var(--color-surface)`.

**Why:** a name that encodes appearance (`blue-button`) breaks the day the colour changes. A name that changes between the tokens, the rules and the code has to be translated by every reader.

Further reading: Nathan Curtis, "Naming Tokens in Design Systems", https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676

## Build tool

**Choice:**
- **Web with a DTCG resolver, especially with Tailwind v4:** Terrazzo. It reads DTCG and resolvers natively, has CSS and Tailwind plugins, and ships lint rules including a WCAG contrast check. This is the plugin's first profile (`profiles/terrazzo-tailwind-v4.md`).
- **Several native platforms:** Style Dictionary. The plugin has no profile for it yet, so audit it with the core rules.

Sources:
- https://terrazzo.app/docs/
- https://terrazzo.app/docs/linting/
- https://styledictionary.com/info/dtcg/

## Gate severity

**Choice:** each design lint has two configurations:
- **recommended:** warns, for a person mid-edit;
- **strict:** errors, for agents, commits and CI.

**Why:** a warning keeps exit code 0, so an agent or a pipeline passes over it.
