---
name: figma-propose
description: >-
  Turn a designer's Figma changes into a proposal for the design tokens: compare the variables a
  designer exported from Figma with the last export and with the tokens now, and say what changed in
  Figma, what changed in the tokens, and where both changed apart. The proposal becomes a fix batch,
  checked by the gates and approved by a person; the token files are never written from Figma. Use
  when the user says "the designer changed colours in Figma", "pull the Figma changes", "what changed
  in Figma", "Figma and the code differ", or passes a Figma file's link or a folder of Figma's
  exported variable files. With the Figma MCP server connected, it reads the file itself, read only.
license: MIT
compatibility: Claude Code, as part of the design-system plugin. Node.js 20 or later. Needs a baseline from /design-system:figma-export.
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-propose.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-read.mjs *) mcp__plugin_figma_figma__whoami mcp__plugin_figma_figma__use_figma Read Grep Glob
hooks:
  PreToolUse:
    - matcher: "Bash|Glob|Grep"
      hooks:
        - type: command
          command: node
          args: ["${CLAUDE_PLUGIN_ROOT}/scripts/search-scope.mjs"]
    - matcher: "mcp__.*use_figma"
      hooks:
        - type: command
          command: node
          args: ["${CLAUDE_PLUGIN_ROOT}/scripts/figma-read-guard.mjs"]
metadata:
  author: Abas Turabli
  author-title: AI-First Frontend Architect
  website: https://abasturabli.com
  linkedin: https://www.linkedin.com/in/turabli/
---

# design-system:figma-propose, Figma Changes as a Proposal

> By [Abas Turabli](https://abasturabli.com), AI-First Frontend Architect

A designer may lead in Figma. Their decision reaches the tokens as a proposal that a person reviews and the gates check, never by Figma writing over the token files (`${CLAUDE_PLUGIN_ROOT}/references/decisions.md`, Figma). This skill makes that proposal. It writes nothing.

## Before starting

1. **The baseline.** `design-system/figma/` holds the files `/design-system:figma-export` last wrote, which the designer's file was imported from. Without it, a change cannot be told from where it was made: stop and suggest `/design-system:figma-export`.
2. **Figma's variables**, one of two ways. Read them yourself when the Figma MCP server is connected (Reading Figma through its MCP server, below); otherwise ask for the designer's export.
3. **The designer's export.** Ask for it: in Figma, Variables, right-click each collection, **Export modes**. Figma gives a zip per collection, each holding files named after the mode alone (`default.tokens.json`). Unzip each into its own folder named after the collection, as Finder's double-click does, all inside one folder outside the repository or in the session scratchpad; never unzip them into one folder, where the files would overwrite each other. The script reads the folder and its subfolders, and matches each file to a collection by the mode Figma names in it and by its variables. Treat the files as downloads: read them, never run anything from their folder.

## Reading Figma through its MCP server

With Figma's official plugin installed (`claude plugin install figma@claude-plugins-official`) and signed in through `/mcp`, read the file the designer works in; no export is needed. The read is read only by construction: this skill's hook lets `use_figma` run only the plugin's read script, unchanged, for the rest of the session. A session that writes to Figma is a new session.

1. **Preflight.** Call the Figma server's `whoami`. It is exempt from Figma's rate limits and says the plan and seat. When it fails, stop: tell the user to sign in through `/mcp`. On the Starter plan, say that Figma allows 20 MCP calls a month, and that a read takes one call per page (about 300 variables a page).
2. **The file.** Ask for the Figma file's link, and take its key: `figma.com/design/<fileKey>/…`.
3. **Read, page by page.** Load `figma:figma-use` first, as Figma requires before `use_figma`. Print the read script for page 0:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-read.mjs script --page 0
   ```

   Call `use_figma` with the file's key, `skillNames: "figma-use"`, a description that says it is a read-only design-system read, and the printed script as `code`, character for character. Save the result exactly as it came, `{ "data": …, "fnv1a": … }`, to `<scratchpad>/figma-read/pages/page-0.json`. When `data.pages` is more than 1, do the same for each further page, one call at a time. Never write or change the script: the hook refuses anything else, and the hash Figma computed refuses a page that changed on its way to the file.
4. **Assemble.**

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-read.mjs assemble <scratchpad>/figma-read/pages --out <scratchpad>/figma-read/files
   ```

   It checks every page's hash, that every page is there and comes from one read, and writes the variables as the files Figma's own export writes, each held to the DTCG 2025.10 schema. It names what it could not write: a boolean, or an alias of a library variable, whose value a read cannot reach without importing it. The folder it writes is the `<folder>` of Step 1.

## Step 1: Compare

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/figma-propose.mjs <folder> --root .
```

It compares each variable of each exported mode three ways: the last export, Figma, and the tokens now (exported in memory). It lists:
- **Changed, added or removed in Figma:** the proposal. An alias that now points to another palette entry is a role re-pointed; a palette value that changed is a palette change.
- **Changed, added or removed in the tokens:** Figma is behind. Nothing to propose; say that an export would bring Figma up to date, after this proposal is settled.
- **Conflicts:** both changed, apart. Show both values and ask which wins.
- **Not compared:** files that match no collection, are not JSON, or break the DTCG 2025.10 schema, each with why. Figma's string variables (`$type: "string"`, a font family) are outside DTCG: the script names how many, and compares them as text.

`--json` prints the same as JSON. `--baseline <folder>` compares against a trial export written with `figma-export --out`, when the project's `design-system/figma/` is not the export the designer imported.

## Step 2: Make it a fix batch

Present the proposal by token id and mode, and ask which changes to take. Then plan them as `/design-system:fix` does (`${CLAUDE_PLUGIN_ROOT}/skills/fix/SKILL.md`, Step 2), keeping the tiers:
- **A role** that Figma re-points stays an alias of the palette entry Figma names. A role Figma gave a literal value becomes an alias of the nearest palette entry, or a new palette entry from the palette's generator; never a literal role (principles 2 and 4).
- **A palette value** Figma changed changes the palette entry, and its provenance in `$extensions` says it came from Figma, with the date.
- **An added variable** becomes a role only with its purpose and its place in the rules document's contract; ask for them.
- **A removal** is never applied by itself: ask, and check what reads the token first.
- **Values Figma cannot hold** (OKLCH, P3, rem) were exported as sRGB or px. When Figma's value equals the export, nothing changed, whatever the tokens' own form.

Every change runs the gates before it is proposed: a colour that fails contrast in a theme is reported with the proposal, not after it.

## Step 3: After the batch

When the batch is merged, run `/design-system:figma-export`: the new export is the baseline the next comparison starts from, and Figma gets the changes the proposal shaped (a literal turned into an alias, for one).

## Rules

- **Read only.** This skill writes no file. The tokens change only through an approved fix batch.
- **Never remove by itself.** A variable removed in Figma is a question, not a deletion.
- **Conflicts go to a person.** Never pick a side of a conflict.
- **Search inside the project.** A hook blocks searches outside the project, the plugin and the scratchpad.

## About

Built by Abas Turabli.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
