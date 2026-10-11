---
name: audit
description: >-
  Audit a web project's design-token architecture and write a structured report. Covers four parts:
  naming, tiers (palette, roles, component contract), a tool-readable format (W3C DTCG, generated
  outputs), and a rules document that stays current and holds no values. Use when the user asks to
  "audit the design tokens", "check the design system", "review the token architecture", "is our
  design system AI-ready", or before fixing or gating a token system. Read-only: it never edits the
  project, and writes only its report.
license: MIT
compatibility: Claude Code, as part of the design-system plugin. Node.js 20 or later.
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/check-tokens.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs *) Bash(date -u *) Bash(git status --porcelain) Read Grep Glob
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

# design-system:audit, Token Architecture Audit

> By [Abas Turabli](https://abasturabli.com), AI-First Frontend Architect

This skill audits the current project against the Token Architecture rubric. It writes a JSON report and its Markdown rendering, and gives a short summary in chat. It changes nothing in the project except the new report files.

## Before starting

1. The project root is the current working directory, unless the user named another folder.
2. Read `${CLAUDE_PLUGIN_ROOT}/references/report.md` for the report's shape and file names.
3. Keep `${CLAUDE_PLUGIN_ROOT}/references/rubric.md` at hand; the auditor reads it in full.

## Step 1: Scan

Run the inventory. It is read-only and prints JSON:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs .
```

It lists:
- token files, resolvers and build configs;
- the rules document and its front matter keys;
- token and styling packages with their installed versions;
- the lock file, its format version, and the package manager `package.json` pins;
- raw colours per source file;
- generated outputs and existing gates;
- the profile (`terrazzo-tailwind-v4` or `null`).

If the scan fails, read the project directly and say so in the report. Do not block on the script.

## Step 2: Run the deterministic checks

When the project has DTCG token files, run the plugin's token check. It is read-only and needs no dependency. It reads `design-system/gates.json` when the project has one, and defaults to the canonical layout (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`):

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/check-tokens.mjs --root .
```

- **Other paths or group names.** When the scan found the resolver elsewhere, pass it: `--resolver <path>`. When the check says a group is empty and lists the groups the tokens have, read the token files, choose the matching groups yourself, and run it again with them (`--roles color`, `--palette …`). Never guess a group from its name alone.
- **Record the settings.** Put the names you passed in the report's `stack.tokenSettings`. A project's own names are not a finding (conventions.md).
- **Read the result.** Its lines, each prefixed with a rule id, are evidence for the `format` and `tiers` findings. Its last line says what it checked: a pass that checked no roles is not a pass. A non-zero exit means it found problems; that is a result, not a failure of the audit.

### The project's existing checks

If the project already has token checks, run them and keep their output as evidence. These can be package scripts that check tokens, rules or generated outputs, or `npx tz check` when Terrazzo is installed.

- **Read-only only.** Run a check only if it reads and reports. A build that writes files is not a check. Ask before running anything that writes.
- **Ask about new commands.** Running a command the user has not run before needs their approval.

## Step 3: Delegate the analysis

Start the read-only auditor, `design-system:token-auditor`, with a prompt that contains:
- the project root;
- the scan's JSON;
- the output of step 2: the token check and the project's own checks, if any.

The auditor reads the rubric, checks every rule, and returns one JSON object: `stack`, `parts`, `findings`, `gates` and `sources`. Its context is its own, so a large project does not fill this conversation.

If a subagent is not available, do the analysis here, with the auditor's instructions (`${CLAUDE_PLUGIN_ROOT}/agents/token-auditor.md`).

## Step 4: Write the report

1. Complete the auditor's object into a report:
   - `schemaVersion: "1"`;
   - `tool: { name: "design-system", version }`, where `version` comes from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`;
   - `project: { name, root: ".", commit, dirty }`, with the short commit from `git rev-parse --short HEAD` when the project is a git repository, and `dirty: true` when `git status --porcelain` lists changes;
   - `date`, as today's ISO date.
2. Write it to `design-system/audits/<stamp>.json` in the project.
   - The stamp is the audit's UTC time from `date -u +%Y-%m-%dT%H%M%SZ`, for example `2026-09-26T143005Z`, so name order is time order (`${CLAUDE_PLUGIN_ROOT}/references/report.md`, Files).
   - Never overwrite or delete an earlier report.
   - Look for earlier reports with the Glob tool (`design-system/audits/*.json`, and `design-tokens-audit/*.json` from before 0.4.0), not with `ls`: on a first audit the folder does not exist, and a failing `ls` reads as an error.
3. Render and validate:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs design-system/audits/<file>.json
   ```

   It refuses an incomplete report and lists what is missing. Fix the JSON and run it again. Never write the Markdown by hand.

## Step 5: Summarise in chat

Print these, and nothing more:
- the four part statuses;
- the error, warning and info counts;
- the three most important findings;
- the gates with status `missing`;
- the paths of the two report files.

Then offer the next steps:
- `/design-system:fix`, with the finding ids the user picks, which plans before changing anything;
- `/design-system:harness`, to install the recommended gates.

## Rules

- **Search inside the project.** Search only the project, the plugin's files and the session scratchpad. Find where a tool writes its output from its config or documentation, never by searching the disk. A hook blocks searches outside those places (`${CLAUDE_PLUGIN_ROOT}/scripts/search-scope.mjs`).
- **Read-only.** The only files this skill writes are the report files.
- **Evidence you read.** Every finding cites a file and line the auditor read. A rule that cannot be confirmed is stated as unconfirmed, not reported as broken.
- **Rubric only.** Findings are the rubric's rules and nothing else.
- **The report stays.** Suggest adding `design-system/audits/` to version control, so a fix can be compared with the audit that asked for it.

## Tone

Write for senior engineers. State the finding, cite the source, give the fix. No filler, no marketing language.

## About

Built by Abas Turabli. The rubric comes from building a DTCG token architecture with its rules, gates and generated outputs end to end.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
