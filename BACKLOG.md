# Backlog

What the plugin should do next, and why. Each item names the project run that showed the gap. When an item ships, it moves to the plugin's CHANGELOG with its release and leaves this file.

## Audit

- **Derived rules for dimensions**, not only colours.
- **Before proposing a dependency,** the auditor proposes the project's own reader or tool when one exists.
- **Studies:** `@shadcn/lint` and fallow, for overlap with the rubric.

## Fix

- **Visual verification for migrations.** The ispanviza-web batch captured computed styles (colour, background, border, shadow, font size, line height, weight, max-width) of every element on every route at two widths, plus screenshots and interaction states, before and after, and stopped on any difference. Make this the default proof for a batch that must not change rendering, run from the session scratchpad, never added to the project. Diff the pre-rendered HTML too: on ispanviza-web every screenshot was identical while two routes lost a CTA link from the server HTML (the browser added it back), which only the HTML diff showed. And check the base build on its own: a comparison of two builds cannot see a fault both share.

## The design source

The design source (Figma later) exports the tokens: a token carries its value and its definition (`$description`), and the rules document holds only the rules for using them.

- Principle 1 and decisions, "The rules document".
- Rubric wording for `docs/rules-document-exists` and `docs/token-descriptions`.
- Setup skeletons with definitions in the tokens.
- A fix batch that moves definitions from the rules document into the tokens.
- Conventions, "The design source".

## Figma

The first way shipped in 0.13.0: `figma-export` writes Figma's native import files, and `figma-propose` turns a designer's export into a proposal. The second, `figma-propose` reading Figma through its MCP server, shipped in 0.14.0.

- **Prove two modes in one Figma collection.** ispanviza-web (one context) and cv-screener's light theme round-tripped with no change on 2026-10-11, on Figma Starter, which holds one mode per collection. On Professional: import cv-screener's `Colors/light` and `Colors/dark` as two modes of `Colors`, export (one zip, two files), and run `figma-propose`; then change a colour and a role's alias in Figma, in one mode, and run it again.
- **Styles through the MCP server:** text styles, shadows and gradients, which no variable holds, written as Figma styles bound to the variables, behind a checkpoint, with a person publishing (as Astryx's Figma Librarian does).

## Projects and proof

- **abasturabli.com:** upgrade the harness to 0.8 (legacy-0.6), palette tier, DESIGN.md.
- **inarra:** upgrade the harness (legacy-0.5).
- **PoC 2:** a greenfield `setup`.
- **The README:** a page that shows what the plugin does, with the transcripts of real runs.
