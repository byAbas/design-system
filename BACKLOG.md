# Backlog

What the plugin should do next, and why. Each item names the project run that showed the gap. When an item ships, it moves to the plugin's CHANGELOG with its release and leaves this file.

## Audit

- **Versions table: say when the latest cannot be installed.** It listed ESLint 10.11.0 as latest, but `eslint-config-next` 16 depends on `eslint-plugin-react`, `-import` and `-jsx-a11y`, whose peer ranges stop at ESLint 9. Read the peer ranges of the installed dependents and mark a latest version as blocked, naming the blocker. (ispanviza-web, cv-screener)
- **"Runs in" needs one meaning.** `gate/theme-palette-reset` says "Runs in: ci", but it is a state of the theme file, enforced by the build. Define the column (where a check runs) and use a separate kind for configuration states.
- **Exemptions have a home.** Flag icons, a logo SVG, email HTML and a CRM setup script hold literal colours that are artwork or non-UI output. The auditor left them out and asked, which was right, but there is nowhere to record the decision, so the next audit asks again. Record exemptions in `design-system/gates.json` (paths and reason), read by the audit and the code lint. (ispanviza-web)
- **Accepted and out-of-scope findings** in the report, and "moved out of scope" in `compare-reports`.
- **Baseline and ratchet gates**, so a project with many findings can gate on "no new ones".
- **Audit retention:** keep the newest reports, and say which one is the baseline.
- **Scan candidates carry evidence**, so the auditor does not re-derive why a file was picked.
- **A token without `$type`** is valid DTCG when its type is inherited or resolved; the check should accept it.
- **Derived rules for dimensions**, not only colours.
- **`--extension-key` flag**, and `tokenSettings` keys that match the setting names in `gates.json`.
- **Before proposing a dependency,** the auditor proposes the project's own reader or tool when one exists.
- **Studies:** `@shadcn/lint` and fallow, for overlap with the rubric.

## Fix

- **Visual verification for migrations.** The ispanviza-web batch captured computed styles (colour, background, border, shadow, font size, line height, weight, max-width) of every element on every route at two widths, plus screenshots and interaction states, before and after, and stopped on any difference. Make this the default proof for a batch that must not change rendering, run from the session scratchpad, never added to the project. Diff the pre-rendered HTML too: on ispanviza-web every screenshot was identical while two routes lost a CTA link from the server HTML (the browser added it back), which only the HTML diff showed. And check the base build on its own: a comparison of two builds cannot see a fault both share.
- **Confirm a fresh build before comparing reports.**

## Harness

- **Prove CI in a clean checkout.** The gates passed locally because `.next/types` existed; CI's fresh checkout had none, and `tsc` failed on `LayoutProps`. Before calling CI proven, run the commit gate in a fresh `git clone` with no build artifacts. (cv-screener)
- **CSS lint by default:** extend the project's existing linter (`@eslint/css` with ESLint; Stylelint where the project already uses it; else Stylelint), with the same colour functions as `hasRawColor`. (cv-screener)
- **Contract coverage: keys start with the component's file name.** The rubric asks that every component has a contract entry, but cv-screener's keys named visual parts (`button-primary-hover`) and nothing mapped component files to them, so harness could not check coverage. ispanviza-web started every key with its component's file name in kebab-case (`Button.tsx` → `button-*`, `CtaBannerSection.tsx` → `cta-banner-section-*`), and the next audit computed coverage mechanically: it named the 15 files that read roles with no key, and all were then added, page files included. Make this the convention in `references/conventions.md`, the setup skeleton and the rules-contract check, with no exemption for pages. (cv-screener, ispanviza-web)

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
