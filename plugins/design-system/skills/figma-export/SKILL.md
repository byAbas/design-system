---
name: figma-export
description: >-
  Export a project's design tokens to Figma as variables, in the DTCG files Figma's own "Import mode"
  reads: a palette collection, the colour roles with a mode per theme, fonts, spacing and radii. The
  files are generated from the token files, committed, and kept fresh by a gate, and they are the
  baseline a designer's later Figma changes are compared against. Use when the user asks to "send the
  tokens to Figma", "update the Figma variables", "sync Figma with the code", "set up Figma
  variables from our tokens", or after the tokens changed and Figma is behind. It never reads from
  Figma and never changes the token files.
license: MIT
compatibility: Claude Code, as part of the design-system plugin. Node.js 20 or later. Figma with variables; a project with several themes needs a plan with several modes per collection (Professional or above; Starter holds one).
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-export.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/check-tokens.mjs *) Read Grep Glob
hooks:
  PreToolUse:
    - matcher: "Bash|Glob|Grep"
      hooks:
        - type: command
          command: node
          args: ["${CLAUDE_PLUGIN_ROOT}/scripts/search-scope.mjs"]
metadata:
  author: Abas Turabli
  author-title: AI-First Frontend Architect
  website: https://abasturabli.com
  linkedin: https://www.linkedin.com/in/turabli/
---

# design-system:figma-export, Tokens to Figma

> By [Abas Turabli](https://abasturabli.com), AI-First Frontend Architect

The token files are the one source of values, and Figma reflects them (`${CLAUDE_PLUGIN_ROOT}/references/decisions.md`, Figma). This skill writes the tokens as the files Figma imports itself, so a designer works with the same values the code reads. A change a designer makes in Figma comes back as a proposal, through `/design-system:figma-propose`, never by writing over the tokens.

## Before starting

1. **The tokens hold.** Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/check-tokens.mjs --root .`. Export only tokens that pass: a broken role would reach Figma as it is.
2. **Read** `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, Figma, for the collections and how each token maps.
3. **An earlier export.** When `design-system/figma/` exists, it is the baseline of the designer's current Figma file. If the designer changed Figma since then, run `/design-system:figma-propose` first: a new export moves the baseline, and their changes would then read as the tokens' own.

## Step 1: Export

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-export.mjs --root .
```

It writes one file per collection and mode, `design-system/figma/<Collection>/<mode>.tokens.json` (`tokens.figma` in `design-system/gates.json` moves it), each checked against the DTCG 2025.10 schema first: a file the schema refuses stops the export, and nothing is written. It names the tokens no Figma variable holds: text styles, shadows, gradients, easing curves, and dimensions in units other than px and rem. Report those to the user; they stay in the code until an agent writes them to Figma as styles.

For a trial, `--out <folder>` writes elsewhere and leaves the baseline as it is.

## Step 2: Gate the files

The files are generated outputs, so `design-system/gates.json` holds them like the CSS:
- add `design-system/figma/*.tokens.json` to `generated`, so no edit writes them by hand;
- add `node design-system/checks/figma-export.mjs --check` to `onSourceEdit` and `beforeCommit`, so a token change fails until the files are exported again. Copy `scripts/figma-export.mjs` and `scripts/lib/figma.mjs` into `design-system/checks/` with the other checks.

Ask before changing the gates.

## Step 3: Import in Figma

Figma imports the files itself; nothing here needs a Figma token or plan beyond variable modes. Tell the designer, collection by collection, `Palette` first: the roles alias it by name, and Figma links an alias only to a collection it finds.
1. Open **Variables** with nothing selected.
2. Create the collection with the folder's name (`Palette`, `Colors`, …), exactly: an alias names its collection.
3. In the empty collection, **Import**, and choose the folder's file (`Palette/default.tokens.json`). The mode takes the file's name. For a collection with several modes (`Colors/light`, `Colors/dark`), import the first, then add a mode and right-click it, **Import mode**, for each other.
4. Check that a role shows its palette entry as a linked pill (`canvas` → `white`), not a bare colour.
5. Hide `Palette` from publishing: code never reads the palette, and neither should a design.

Proven on ispanviza-web's tokens (2026-10-11): all six collections imported, every role linked to its palette entry, and a round trip back through Figma's export compared with no change.

Figma updates the variables whose name and type match, and adds the rest. It does not delete a variable the file no longer has; say which ones to delete by hand when a token was removed.

## Step 4: Commit

Commit the files with the token change that produced them, so the baseline and the tokens move together. Propose the message and wait for approval.

## Rules

- **The tokens are the source.** Never edit a file in `design-system/figma/` by hand, and never copy a Figma value into the token files here.
- **Figma changes first.** Run `/design-system:figma-propose` before exporting over a Figma file a designer has changed.
- **Nothing is lost silently.** Name every token the export leaves out.
- **Search inside the project.** A hook blocks searches outside the project, the plugin and the scratchpad.

## About

Built by Abas Turabli.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
