# Changelog

The plugin follows Semantic Versioning. Its version lives in `.claude-plugin/plugin.json` only. From 0.6.0 each release is tagged `v<version>` in `DevAbas/design-system`; 0.1.0 to 0.5.2 were released as `design-tokens` in `DevAbas/skills`, tagged `design-tokens--v<version>`.

A version bump means:
- **Major:** a change to the rubric or the report schema that makes a new report incomparable with an older one.
- **Minor:** a new rule, gate, profile or skill.
- **Patch:** a fix or a clarification.

## 0.8.1

What the runs on cv-screener, ispanviza-web and abasturabli.com showed going wrong.

- **The generated-file message names the build, or no command.** It named `onSourceEdit[0]` as the rebuild, and in cv-screener that is `design:export -- --check`, a check that rewrites nothing; abasturabli.com had adapted the line by hand. `design-system/gates.json` takes `build`, the command that rewrites the outputs, and the message and the failed-source message name it. Without `build` they name no command.
- **Fix order is part of the report.** Removing Tailwind's default palette (`--color-*: initial`) makes every default palette class stop producing CSS without failing the build, and on ispanviza-web the suggested first batch was that reset. A finding now lists in `requires` the findings that must be closed before it. `render-report.mjs` refuses a `requires` that names no finding of the report, the finding itself, or a cycle, and renders it. The new `scripts/plan-batch.mjs` refuses a `fix` batch whose prerequisites are neither closed nor in the batch, and prints the rest in order. The field is optional, so the schema stays 1 and older reports are read as before.
- **Every commit leaves the tree working.** `fix` plans its commits by that rule, not one per finding: a token migration and the code renames it needs are one commit. On ispanviza-web the agent had to merge two planned commits for this reason.
- **Named colours are raw colours.** `no-raw-color` let `red` and `rebeccapurple` through. It now reports a CSS Color 4 named colour where CSS reads a colour: a colour property of a style object (`{ color: "red" }`), a colour attribute of an HTML or SVG element (`fill="red"`), and a declaration in a string or template (`color: red;`). A word alone, such as a variant named `red`, a `color` prop of a component or prose, is not reported. `transparent` and `currentcolor` stay allowed.
- **Installs use the project's package manager version.** pnpm 12 on a pnpm 10 project wrote unfilled `allowBuilds` placeholders into `pnpm-workspace.yaml` (ispanviza-web). `references/sources.md`, Before an install: the version comes from `packageManager`, or from the lock file and settings; another major runs as the project's (Corepack, or `npx <manager>@<major>`); a missing `packageManager` is proposed; the install's diff is checked. `setup`, `fix` and `harness` follow it, and CI's `pnpm/action-setup` gets the version. The scan reports `packageJson.packageManager` and `packageJson.lockfileVersion`.

**Upgrading from 0.8.0**
- A project with the harness copies `assets/harness/core/gates.mjs` to `design-system/harness/` again, and adds `build` to `design-system/gates.json`. A `gates.mjs` adapted to name the project's build in the generated-file message goes back to the plugin's copy, with the command in `build`.
- A project with the profile's ESLint rules copies `eslint-token-rules.mjs` again, keeping its adapted lines, and runs the lint: a named colour it now reports is a finding to fix, not a reason to weaken the rule.

## 0.8.0

Nothing under `design-system/` names an agent. The core decides, and each agent's adapters only translate.

- **Layout.** `design-system/harness/` holds the core: `gates.mjs` with every decision as a stage, `run-gates.mjs` to run a stage from the command line, and `with-node.sh`, which finds Node for a hook a desktop app started. The Claude Code hooks move from `design-system/harness/claude/` to `.claude/hooks/design-system/`, Claude Code's own folder. In 0.7.0 the design system's folder held one agent's name and protocol; a second agent would have added another.
- **The adapters decide nothing.** The generated-file reason and the rule that a changed generated output runs the staleness check were in the Claude hooks, so another agent would have had to copy them. They are core stages now (`check-generated`, `check-files`), beside `before-commit` and `on-source-edit`. The four hooks read Claude Code's JSON through `hook-io.mjs`, call one stage, and answer. Claude Code's protocol (the hook JSON, exit 2, the deny decision) left `gates.mjs`.
- **One way to find Node, and it works without `.nvmrc`.** The pre-commit hook runs the gates through `with-node.sh` instead of its own copy of the nvm fallback. That fallback ended the script under `set -e` when a project had no `.nvmrc`: `nvm use` failed as the last command of an `&&` list, though loading nvm had already put its default Node on PATH. A person whose terminal had no Node on PATH, or a hook started by a desktop app, got exit 127 instead of the gates. A failed `nvm use` now leaves nvm's default in place.
- **Tests hold it.** No file of the core mentions an agent. Every settings command runs a script in `.claude/hooks/design-system/` through `design-system/harness/with-node.sh`, and no adapter matches a glob, runs a command or exits on its own.
- The scan reports the 0.7.0 layout as `legacy-0.7`, and the upgrade section moves it.

**Upgrading from 0.7.x or earlier:** run `/design-system:harness`. It finds the old layout and follows the upgrade section.

## 0.7.0

The harness lives with the rest of the design system, and an installed one can be upgraded without hand-written notes.

- **Layout.** `design-system/harness/` holds the runner every stage calls (`run-gates.mjs`) and the shared library (`gates.mjs`); `design-system/harness/claude/` holds the Claude Code hooks. Pre-commit and CI call `node design-system/harness/run-gates.mjs before-commit`, not a path under `.claude/`: the core is agent-independent, and another agent's adapters get their own folder beside `claude/`. Outside `design-system/` stay only the files a tool requires: `.claude/settings.json` (pointing into `harness/claude/`), the git hook and `.github/`. A test holds the templates to this.
- **Upgrading an installed harness** is a section of the harness skill. The scan reports `gates.harnessLayout` (`canonical`, `legacy-0.6`, `legacy-0.5` or null); an older layout is compared with the plugin's current files (the project's adapted lines are kept and shown), moved with `git mv`, repointed, checked with `git grep` for any old path, and proven.
- **A project with its own harness.** Where a project's own hooks run its gates, harness offers to migrate every check into `gates.json` and the plugin's hooks, each exactly as strict, removing the old files only with approval; or it adds only the missing gates beside them. It never leaves both running the same check. This replaces "new gates never replace what exists", which forced one of those two.
- **Every gap in the report.** For each partial or missing gate, harness lists every gap the report names and closes it or says why not. A run on a real project had dropped one ("every component has a contract entry").

**Upgrading from 0.6.x:** run `/design-system:harness`; it finds the old layout and follows the upgrade section.

## 0.6.2

- **CI follows GitHub's own guidance** ("Secure use reference"). The template grants the token read access to contents only, cancels a superseded run, has a time limit, and never uses `pull_request_target`. Harness pins each action to the full commit SHA of its latest release (read with `git ls-remote`, never copied from the plugin), takes the default branch from git, Node from the project's `.nvmrc`, `.node-version` or `engines`, and the install command from its lock file (npm, pnpm or yarn). It offers a Dependabot file for the pinned actions, runs actionlint when installed, and says that a check blocks a merge only when the branch requires it. An existing workflow gets a step instead of a second workflow.
- Before, the template shipped `@v4` tags, which were two majors behind, assumed `main` and `.nvmrc`, and supported npm only.

**Migrating from 0.6.1:** a workflow copied from the old template gets `permissions`, `concurrency`, `timeout-minutes` and SHA-pinned actions as above.

## 0.6.1

- **`check-after-bash` is back, and 0.5.1 was wrong to remove it.** 0.5.1 said Claude Code rarely records the files a shell command changes in auto mode. The evidence was the agent's own tool results in one session, where the list is not shown. The transcripts of real auto-mode sessions on a production site show otherwise: every shell edit was recorded in `tool_response.bashEditDiff`, including a `node -e` script that rewrote a token file, `lib/site.ts` and a generated stylesheet in one command. With the hook removed, those edits reached no check before the commit.
- **Generated outputs are triggers.** When a command changes a generated output, the hook also runs the source checks: the build's own output passes the staleness check, a hand edit fails it. `protect-generated` sees only the Edit and Write tools, so this closes the shell path to a generated file before the commit.
- **Live proof.** The harness skill asks for an ordinary task that touches a colour, not a deliberate violation: a violation shows only that a hook loads, an ordinary task shows what the agent does with the gates in place.

**Migrating from 0.6.0:** copy `check-after-bash.mjs` and the new `gates.mjs` to `.claude/hooks/design-system/`, and merge the `PostToolUse` `Bash` entry of `assets/harness/core/settings.hooks.json` into `.claude/settings.json`.

## 0.6.0

The plugin moves to its own repository, `DevAbas/design-system`, and is renamed `design-system`, shown as **Agent-Ready Design System**. The repository will hold more design-system skills; the rubric is still Token Architecture.

- **Ids.** Marketplace `abasturabli`, plugin `design-system`, install id `design-system@abasturabli`. Commands are `/design-system:setup`, `:audit`, `:fix` and `:harness`, and the auditor is `design-system:token-auditor`. The name people see is `displayName`, which can change without breaking an install.
- **Reports.** `tool.name` is `design-system`. Reports written by design-tokens 0.1–0.5 carry `design-tokens`, and are still read, rendered and compared.
- **Harness paths.** The hooks go to `.claude/hooks/design-system/`, the CI template is `design-system.yml`, and the ESLint rules are `design-system/token-classes` and `design-system/no-raw-color`.
- **Unchanged.** The rubric, its rule ids, the report schema version (1), the canonical layout and every check. The legacy locations of 0.3.x (`design-tokens.gates.json`) and before 0.4.0 (`design-tokens-audit/`) are still read.

**Migrating from design-tokens 0.5.x**
- Install: `claude plugin marketplace remove fearchitect` (this also uninstalls `design-tokens`), then `claude plugin marketplace add DevAbas/design-system` and `claude plugin install design-system@abasturabli`.
- A project with the harness: rename `.claude/hooks/design-tokens/` to `.claude/hooks/design-system/`, and update that path in `.claude/settings.json`, the git pre-commit hook, the CI workflow and the agent instructions. Copy the checks and hooks again, so they match 0.6.0. A project that uses the plugin's ESLint rules renames `design-tokens/*` to `design-system/*` in its config and in any disable comments.
- Old reports keep working; there is nothing to convert.

## 0.5.2

- **Migration note corrected.** The 0.5.0 note asked to copy only `dtcg.mjs`, but the `colors` default lives in `lib/project-modules.mjs`. A project that followed it and removed `tokens.roles` had `check-tokens` look for `color` and check no role. It failed loudly, as it should (`config: no tokens in the roles group color`). The note now says to copy the whole checks set.

## 0.5.1

- **`check-after-bash` is removed.** It read the files a shell command changed from Claude Code's `tool_response.bashEditDiff`. By default Claude Code records that list only when its Bash tool handles file edits, not when an agent that has the Edit tool runs `sed` on its own: many shell edits in an auto-mode session carried no list. Turning it on everywhere takes a setting that only a person's own or managed settings can set (`bashEditDiffEnabled`), never a project's. So in a typical project the hook received nothing, while every project copied it. A shell edit is still caught by the commit gate (`guard-commit`, pre-commit, CI); the harness skill and README now say so. `gates.mjs` keeps `editProblems`, which `check-on-edit` uses.

**Migrating from 0.5.0:** a project that copied `check-after-bash.mjs` deletes it from `.claude/hooks/design-tokens/`, and removes the `PostToolUse` `Bash` entry from `.claude/settings.json`.

## 0.5.0

What the first harness on a real project and the second audit taught.

- **The roles group is `colors`.** The rules document is written in the design.md format, whose front matter has fixed sections (`colors`, `typography`, `rounded`, `spacing`, `components`), and the contract check requires a contract id to be a token id. 0.4.0's `color` would have broken the design.md lint of a project that composes its front matter from the tokens. `setup`, the checks' defaults and the Terrazzo template now use `colors`; `palette`, `font` and `shadow` keep their names (`references/conventions.md`).
- **Moving to the canonical layout** is a written procedure with its proof: the rebuilt output differs in comment lines only, and `check-tokens` reports the same problems before and after (`references/conventions.md`). `fix` follows it; `harness` says in one line when a project differs, and never moves files itself.
- **Edits through Bash are checked.** The new `check-after-bash` hook (PostToolUse, Bash) gives the files a command changed the same checks as an Edit or Write, from Claude Code's `tool_response.bashEditDiff` (v2.1.269 or later). `check-on-edit` and it share `editProblems` in `gates.mjs`. The harness skill says which hooks prevent (PreToolUse) and which report after the write (PostToolUse), and asks for the proof in a live session.
- **Report.** An optional `stack.targetProfile` names the profile the recommended gates use when none was detected, so the header no longer says "none" beside Terrazzo gates. A listed package without its latest version is a warning; the auditor reads every listed package's latest from the registry. The schema stays 1.
- **Hand copies of token values.** The profile's recipe: server code imports resolved values from `@terrazzo/plugin-js` (verified beside plugin-css and plugin-tailwind: the CSS outputs unchanged, 162 colour values in two contexts equal to `check-tokens`'s own), and client code that follows the theme reads the variable at runtime.
- **Fixes.**
  - `dtcg.mjs` no longer binds an unused `$extends`, which a project's ESLint reported as a warning.
  - The example `gates.json` names the canonical paths (`design-system/tokens/**`, `design-system/theme.template.css`), missed in 0.4.0.

**Migrating from 0.4.0**
- A project whose roles group is `color`: set `tokens.roles` and `tokens.readable` in `design-system/gates.json`, or move with the procedure above.
- Copy `check-after-bash.mjs` and the new `gates.mjs` to `.claude/hooks/design-tokens/`, and merge the `PostToolUse` `Bash` entry of `assets/harness/core/settings.hooks.json`.
- Copy the whole checks set again, so `design-system/checks/` matches the plugin: `scripts/check-tokens.mjs`, `scripts/check-rules-contract.mjs` and `scripts/lib/*.mjs`. The `colors` default lives in `lib/project-modules.mjs`: with only `dtcg.mjs` copied (as this note said until 0.5.2), removing `tokens.roles` makes the check look for `color` and check no role.

## 0.4.0

A canonical layout, and the lessons from the first migration of a real project.

- **Canonical layout.**
  - `DESIGN.md` at the root. Under `design-system/`: `tokens/` (foundation, semantic, themes, one resolver), `checks/`, `audits/` and `gates.json`.
  - Group names are singular: `palette`, `font`, `color`, `typography`, `spacing`, `rounded` and `shadow`.
  - `setup` creates the layout, with a resolver for one context (sets only) or for several (a `theme` modifier). The checks default to it.
  - A project with other names or paths states them in `design-system/gates.json`, and that is not a finding (`references/conventions.md`).
- **No silent passes.** `check-tokens` fails when the roles group holds no token, and names the groups the tokens do have. It reports a missing palette, and ends with what it checked. New flags `--resolver`, `--roles`, `--palette`, `--typography`, `--fonts` and `--modifier`. The audit passes them, and records them in `stack.tokenSettings`.
- **Report traceability.**
  - `previousIds` marks a finding that moved to a new location, and `compare-reports` lists it as moved.
  - `project.dirty` says that the audit read uncommitted changes.
  - Both are optional, so the schema stays 1.
- **`fix`.**
  - The visual check is confirmed to test this project, and covers interactive states.
  - A visual problem is measured before it is explained.
  - A change of approach cites its standard.
- **Profile Pitfalls, with sources.**
  - How a line height ratio lays out (DTCG §9.8, CSS 2.1 §10.8.1, MDN, Tailwind's defaults, Blink's float32 and 1/64 px truncation), and the rule to store the smallest 4-decimal ratio that does not fall below the pixel value.
  - Tailwind ignores `--text-*--font-family`.
  - Optical centring is not a token fix.
- **Scan.**
  - Agent configuration folders and `public/` are not rules-document candidates.
  - Husky's internal `.husky/_/` scripts are not gates.
  - `design-system/audits/` is skipped.
- **Migrating from 0.3.x.** Move `design-tokens.gates.json` to `design-system/gates.json`. It is still read, with a note. Reports in `design-tokens-audit/` are still read.

## 0.3.0

The checks no longer depend on the build tool.

- **An in-house DTCG 2025.10 reader, `scripts/lib/dtcg.mjs`.**
  - It covers the resolver with sets, modifiers, input validation and `$ref`s; alias chains and cycles; `$type` inheritance; `$root`; `$extends`; and JSON Pointer references.
  - Its resolved values match `@terrazzo/parser` on a real token set of 138 tokens in two contexts.
- **In-house colour maths, `scripts/lib/color.mjs`.**
  - It gives the same hex as lightningcss for derived roles: identical on 19,865 random lightness and mix rules, with a committed reference table.
  - Unlike reading lightningcss's output, it never breaks on a named colour (`indigo`).
- **`scripts/check-tokens.mjs` is now a core check with no dependencies.**
  - `audit` runs it on any project with DTCG files, as deterministic evidence.
  - It also reports what the reader finds wrong with the files (`format/dtcg-valid`), and accepts plain token files (`tokens.files`).
- **The checks moved to `scripts/`, keeping their relative imports:** `check-rules-contract.mjs`, `lib/`, and `profiles/terrazzo-tailwind-v4/check-generated.mjs`. `harness` copies them with that layout. The profile assets keep the ESLint rules and the build templates.
- **Correction to 0.2.1.** A modifier needs two or more contexts (Resolver §4.1.5.1), so a single theme is a set in a resolver without modifiers, built with `@tz(tzMode: ".")`. The 0.2.1 advice, a one-context modifier, was invalid DTCG.
- **README** gains a "Stack and dependencies" section: the standards the plugin applies, what each part needs and adds, and the profile's packages with licence and tested version.

## 0.2.1

Lessons from migrating a real project to DTCG with Terrazzo.

- **Fix: the Terrazzo config template now keeps the recommended lint rules.** Terrazzo applies its recommended rules only when `lint.rules` is undefined, so the 0.2.0 template, which set two rules, ran none of the recommended ones. It now spreads `RECOMMENDED_CONFIG` from `@terrazzo/parser`.
- **`check-generated.mjs`** fails an output that declares no token. A template `@tz(...)` that matches no context builds an empty theme with exit 0.
- **Profile: new Pitfalls section.**
  - `lint.rules` replaces the recommended rules.
  - A relative template path resolves against `outDir`.
  - A single context still gets a resolver modifier, not Terrazzo's internal `tzMode`.
  - A DTCG `lineHeight` is a ratio that children inherit.
- **Decisions, Text styles:** the line height ratio, and the fix when a migration changes rendering.
- **Sources:** `designmd export --format dtcg` (0.4.0) is not a migration source. It loses alpha, turns a px line height into a ratio, and renames `colors` to `color`.
- **`fix`:** a batch that must not change rendering is proven with the project's own visual check, whose output location comes from its config, never from a disk search.
- **Search guardrail.**
  - `scripts/search-scope.mjs` blocks a search outside the project, the plugin and the scratchpad: Bash `find`, recursive `grep`, `rg`, `fd`, `ls -R`, `mdfind`, `locate`, and Glob or Grep.
  - The four skills register it in their frontmatter, for the rest of a session that uses them.
  - `hooks/hooks.json` registers it for the auditor subagent only.

## 0.2.0

Changes from the first audits of real projects.

- **New rule `docs/rules-document-exists`.** A project without a rules document gets one finding that `fix` can act on, and `docs` is `missing` exactly then.
- **Scan:** reports `rulesDocumentCandidates`, the Markdown and MDX files that may be a rules document under another name. The auditor reads them before deciding a project has none.
- **Report:**
  - a group's total is `<ruleId>@project#total` with severity `info`, so its errors are not counted twice;
  - `render-report.mjs` refuses a total with another severity, and a cited source URL missing from `sources`;
  - it warns about a part summary of more than one sentence.
- **Rubric:** a value written in both the rules document and code is one `docs/rules-hold-no-values` finding; `format/single-source-build` is about generated outputs only.
- **`fix`:** a new rules document starts from `assets/setup/DESIGN.md`; an existing one of another name is kept and brought to the rules.
- **`audit`:** looks for earlier reports with Glob, so a first audit shows no failing `ls`.
- **Report names:** a report is named by its UTC stamp (`2026-09-26T143005Z.json`), so name order is time order. 0.1.0 used `<date>-2.json`, which sorts before `<date>.json`. That made a comparison run in the wrong order, and the "newest report" come out as an older one. `fix` and `harness` read the rule for 0.1.0 names from `references/report.md`.
- **README:** the test command is `node --test` run from the plugin folder. The 0.1.0 command, `node --test plugins/design-tokens`, fails on Node 21 and later, which read the path as a file.

## 0.1.0

- Skills `setup`, `audit`, `fix` and `harness`, and the read-only `token-auditor` subagent.
- The Token Architecture rubric (naming, tiers, format, docs), with stable rule ids.
- Principles, decisions with sources, and a sources index for version checks.
- Report schema 1: JSON source, Markdown rendered by `render-report.mjs`, compared by `compare-reports.mjs`.
- `scan.mjs`: a read-only inventory of a project.
- Core gates: `design-tokens.gates.json`, Claude Code hooks, git pre-commit, CI.
- Profile `terrazzo-tailwind-v4`:
  - token, rules-contract and staleness checks;
  - ESLint rules `token-classes` and `no-raw-color`;
  - Terrazzo config and Tailwind template.
