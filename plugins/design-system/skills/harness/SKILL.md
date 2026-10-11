---
name: harness
description: >-
  Write and install the gates that keep a web project on its design tokens: token and rules checks,
  a staleness check for generated outputs, code lint rules, Claude Code hooks, a git pre-commit hook
  and a CI job, all driven by one design-system/gates.json. Existing tools first; custom checks only
  where no tool has the rule. Use when the user asks to "add design-token gates", "enforce the
  tokens", "set up the token lint", "install the hooks", or after /design-system:audit reports
  missing gates.
license: MIT
compatibility: Claude Code, as part of the design-system plugin. Node.js 20 or later.
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs *)
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

# design-system:harness, Design-Token Gates

> By [Abas Turabli](https://abasturabli.com), AI-First Frontend Architect

This skill installs the gates an audit recommends, or the ones the user asks for. A gate is a check that fails when a token rule breaks. The same gate runs in four places:
- after an agent's edit;
- before an agent's commit;
- before a person's commit;
- in CI.

A rule that nobody enforces is a rule that drifts (principles 8).

## Before starting

1. **Read the gates.** From the newest report in `design-system/audits/` (or `design-tokens-audit/` from before 0.4.0) (`${CLAUDE_PLUGIN_ROOT}/references/report.md`, Files), read `gates`. With no report, run the scan (`node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs .`) and derive the gates from the rubric's Gate lines.
2. **Read the references:**
   - `${CLAUDE_PLUGIN_ROOT}/references/principles.md` (8 and 9);
   - the profile the scan reports, for example `${CLAUDE_PLUGIN_ROOT}/references/profiles/terrazzo-tailwind-v4.md`.
3. **Read the project's rules and harness:**
   - its CLAUDE.md or AGENTS.md;
   - its `.claude/settings.json`;
   - its git hooks (`.githooks`, `.husky`, lefthook);
   - its CI workflows;
   - its lint config.

   The scan's `gates.harnessLayout` says whether the plugin's harness is installed and where: `canonical`, `legacy-0.7`, `legacy-0.6`, `legacy-0.5` or null. An older layout is upgraded first (Upgrading an installed harness). A project that runs its gates through its own hooks or scripts follows A project with its own harness.

## Step 1: Choose the gates with the user

Start from the report's `gates`. For each gate that is `partial` or `missing`, list every gap its "Does" text and status explanation name, for example a check that does not read CSS, or that does not check a component's contract entry. Each gap is either closed by a gate you propose, or named with the reason it stays open. None is dropped silently.

List each gate with:
- what it does;
- the rules it checks;
- the tool: `existing` or `custom`;
- where it runs;
- what it adds (files, scripts, dependencies).

Ask which to install. Existing tools come first (principles 9):
- the build tool's check and lint rules (for example `tz check`, `core/consistent-naming`, `core/descriptions`, `a11y/min-contrast`);
- the rules document's linter;
- the framework's lint ecosystem.

A custom check is written only for a rule no installed tool has.

Before configuring a tool, confirm its options in the documentation for the installed version (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`).

## Step 2: One config

Write `design-system/gates.json`, starting from `${CLAUDE_PLUGIN_ROOT}/assets/harness/core/design-tokens.gates.json`. A project with a 0.3.x `design-tokens.gates.json` at the root moves it there. It is the one place the gates read from:
- `generated`: globs of the outputs an agent may never edit;
- `sources`: globs of the files whose edit runs `onSourceEdit` (tokens, rules document, build template and config);
- `onSourceEdit`: commands run after such an edit;
- `build`: the one command that rewrites the generated outputs (for example `npm run -s tokens:build`). The message that stops an edit to an output names it. It is never a check: a `--check` command rewrites nothing, and an agent told to rebuild with it runs it and edits the output again. Without a build command, leave it out, and the message names none;
- `lint`: `files` and `command`, for the linter an edited file gets, and `strictEnv`, the variables that make its rules errors;
- `beforeCommit`: the commands every commit and CI run;
- `tokens` (the checks): `resolver`, `modifier`, `palette`, `roles`, `typography`, `fonts`, `extensionKey`, `outDir`, `rulesDocument`, `readable` and `code` (the folders whose component files need a contract key). Write every one that differs from the canonical layout, for example the `stack.tokenSettings` the audit recorded. A check that finds an empty roles group fails and names the groups the tokens have. `files` lists plain token files for a project without a resolver. Defaults are in `${CLAUDE_PLUGIN_ROOT}/scripts/lib/project-modules.mjs`.

- `exempt`: paths whose content is not interface (artwork, email HTML), each with its `reason` and, when it covers some rules only, `rules` (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, Exemptions). Write one only for a decision the person made;
- `audits`: `baseline` (the report progress is measured against) and `keep` (`${CLAUDE_PLUGIN_ROOT}/references/report.md`, Retention).

Every path and command in it is the project's own. None is copied from the example.

**A project off the canonical layout.** When `tokens` differs from the canonical layout (other paths or group names), say so in one line of the final report. Name the optional move (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, Moving to the canonical layout), and suggest it as its own `fix` batch after the harness commit. Harness records the project's layout and never moves files itself.

## Step 3: Checks

**Token and rules checks (any stack, no dependencies).** Copy them from the plugin into `design-system/checks/` (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`), keeping their layout so the relative imports hold:

| File | Rules |
|---|---|
| `scripts/check-tokens.mjs` | DTCG validity (a modifier needs two or more contexts), palette literal, roles alias the palette or are derived, derived values match their rule (lightness, mix or alpha), every context complete, text styles alias the fonts |
| `scripts/check-rules-contract.mjs` | The rules document's front matter holds no values, imports the resolver, its contract names existing roles, every component file that reads roles has a key (`conventions.md`, The contract), and each component's text meets WCAG 2.1 AA on its background in every context. It reads the front matter with the project's `yaml` |
| `scripts/lib/*.mjs`: `dtcg.mjs`, `color.mjs`, `project-modules.mjs`, `glob.mjs`, `suppressions.mjs` | The DTCG reader, the colour maths, the shared settings and exemptions, glob matching, and the suppressions the checks use |

**Profile checks (Terrazzo + Tailwind v4).**

| File | Rules |
|---|---|
| `scripts/profiles/terrazzo-tailwind-v4/check-generated.mjs` | Generated outputs match a fresh build, and none is empty |
| `assets/harness/terrazzo-tailwind-v4/eslint-token-rules.mjs` | `token-classes` and `no-raw-color` |
| `assets/harness/terrazzo-tailwind-v4/terrazzo.config.ts`, `theme.template.css` | The build, when the project has none |

**When you adapt a copied file:**
- **Read the file first**, and keep its comments, which say what each rule does and why.
- **Change only what the project needs:** names, paths, the class helpers the code uses, the utilities it has. Settings belong in `design-system/gates.json`, not in the copied code.
- **Test what you change.** Write a unit test for each pure function you change, in the project's test framework, with a negative case: the input the rule must reject.
- **Ask before dependencies.** Only `check-rules-contract.mjs` (`yaml`) and the profile's build and lint (Terrazzo, ESLint) need packages. Ask before adding any, and install them with the project's own package manager version (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`, Before an install).

Wire the checks into the project's scripts, for example a `tokens:check` script, and into `beforeCommit` and `onSourceEdit`. Add the ESLint rules to the project's flat config in two severities:
- `recommended` (warn) for a person;
- `strict` (error) when `DESIGN_LINT_STRICT=1` or `CI=true`.

Spread `exemptionConfigs(gates)` from the ESLint rules after the plugin's config, so the lint skips the exempt paths with the same globs.

**A project with many findings: the ratchet.** When the checks or the lint would fail on problems the project cannot fix in this change, a gate that blocks everything would be turned off. Offer the ratchet instead (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, Suppressions): run each check once with `--suppress-all`, and ESLint with `--suppress-rule design-system/token-classes --suppress-rule design-system/no-raw-color`. Ask the person for each suppression's reason and write it in. Then prove that a new violation still fails. The suppressions file is committed; the checks name every suppression without a reason, and every one that no longer occurs.

For a stack without a profile, the token and rules checks work as they are. Write the code lint and the build check for that stack's own tools. Follow the same order: existing rule first, custom rule as a plugin of an existing tool second, a standalone script last.

## Step 4: Core, agent hooks, pre-commit, CI

The core is agent-agnostic and every agent's adapters only translate (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, The harness). The files come from `${CLAUDE_PLUGIN_ROOT}/assets/harness/`:

1. **Core.** Copy `core/` `run-gates.mjs`, `gates.mjs` and `with-node.sh` to `design-system/harness/`. Make `with-node.sh` executable. Pre-commit, CI and every agent run this one core.
2. **Claude Code adapters.** Copy `adapters/claude-code/` `hook-io.mjs`, `protect-generated.mjs`, `check-on-edit.mjs`, `check-after-bash.mjs` and `guard-commit.mjs` to `.claude/hooks/design-system/`. Each reads Claude Code's hook JSON, calls one stage of the core, and answers; none decides anything.
   - What each Claude hook can do:
     - `protect-generated` (PreToolUse, Edit and Write) denies an edit to a generated output before it happens.
     - `check-on-edit` (PostToolUse, Edit and Write) and `check-after-bash` (PostToolUse, Bash) run after the file is written. They report the failure to the agent; they cannot undo the write. The commit gate is what enforces.
     - `check-after-bash` reads the files a shell command changed (`sed`, a heredoc, a `node -e` script) from Claude Code's `tool_response.bashEditDiff` (v2.1.269 or later, public beta). Claude Code records it in auto and bypassPermissions mode when it has the agent edit through Bash, and in every mode when the person's own settings set `bashEditDiffEnabled: true`, which a project's settings cannot turn on (https://code.claude.com/docs/en/settings-reference). A command that changes a generated output also runs the source checks, so a shell write to it fails the staleness check at once. Without the list the hook passes, and the commit gate still holds.
3. **Settings.** Merge `adapters/claude-code/settings.hooks.json` into `.claude/settings.json`. Show the merged `hooks` object and wait for approval: settings change what runs on every edit.
4. **Pre-commit.** Add `core/pre-commit` (it runs `run-gates.mjs before-commit` through `with-node.sh`) to the project's git hooks. If a pre-commit hook exists, add its last line to that hook instead. Ask before changing `core.hooksPath` or `package.json`.
5. **CI (optional).** Follow GitHub's own guidance ("Secure use reference", https://docs.github.com/en/actions/reference/security/secure-use). With an existing workflow, add one step running `run-gates.mjs before-commit` to its job instead of a second workflow. Otherwise start from `core/design-system.yml` and fill every placeholder:
   - **Branch:** the project's default branch, read from git (`git symbolic-ref refs/remotes/origin/HEAD`), never assumed `main`.
   - **Actions:** pin each to the full commit SHA of its latest release, the version in the comment. Find the release with `git ls-remote --tags --refs https://github.com/<owner>/<action>.git`, the highest `vX.Y.Z`; resolve it with `git ls-remote https://github.com/<owner>/<action>.git refs/tags/vX.Y.Z refs/tags/vX.Y.Z^{}`, taking the `^{}` commit when there is one. Never copy a SHA or a tag from this plugin.
   - **Node:** `node-version-file` with the project's `.nvmrc` or `.node-version`, else `node-version` from `engines.node`; with none of these, ask.
   - **Package manager**, from the lock file: npm `npm ci`, pnpm `pnpm install --frozen-lockfile` (with `pnpm/action-setup` before `setup-node`, pinned the same way), yarn `yarn install --immutable`; `cache` names the same manager. CI runs the project's version of it (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`, Before an install): `pnpm/action-setup` reads `packageManager` when it is set, and otherwise needs its `version` input set to the project's major.
   - Keep `permissions: contents: read`, `concurrency` and `timeout-minutes`; never use `pull_request_target`.
   - **Dependabot:** offer `core/dependabot.yml` for `.github/`, so the pinned SHAs stay current; it is a new file, so ask first, and merge into an existing `dependabot.yml`.
   - **Lint:** run `actionlint` on the workflow when it is installed; when it is not, say so instead of installing it.
   - **Blocking:** a CI check blocks a merge only when the branch's protection or ruleset requires it. Tell the person to make the job's check (`Design-system gates`) required; it is a GitHub setting, theirs to change. A push straight to the default branch runs CI after the fact.
   - **Proof:** the first run on the pushed commit, its link or its status.

## Upgrading an installed harness

When the scan's `gates.harnessLayout` is `legacy-0.7`, `legacy-0.6` or `legacy-0.5`, move the harness to the canonical layout (Step 4) before adding anything. The CHANGELOG records what each release changed; this procedure is how a project gets there.

| Layout | Core (`run-gates.mjs`, `gates.mjs`) | Claude Code hooks | `with-node.sh` |
|---|---|---|---|
| `legacy-0.7` | stays in `design-system/harness/` | `design-system/harness/claude/` → `.claude/hooks/design-system/` | `design-system/harness/claude/` → `design-system/harness/` |
| `legacy-0.6` | `.claude/hooks/design-system/` → `design-system/harness/` | stay in `.claude/hooks/design-system/` | `.claude/hooks/design-system/` → `design-system/harness/` |
| `legacy-0.5` | `.claude/hooks/design-tokens/` → `design-system/harness/` | `.claude/hooks/design-tokens/` → `.claude/hooks/design-system/` | `.claude/hooks/design-tokens/` → `design-system/harness/` |

1. **Compare before replacing.** Diff each installed file against the plugin's current version. Lines the project adapted (a message naming its own commands, a path) are listed and shown to the person. An adapted line that makes a decision (a message, a glob, a command) goes into the core or `design-system/gates.json`, never into an adapter. A generated-file message adapted to name the project's build command (before 0.8.1 the core named `onSourceEdit[0]`) becomes `build` in `design-system/gates.json`, and the core is copied unchanged.
2. **Move.** `git mv` each file as the table says (`mv` for a file not yet committed), then copy the plugin's current versions over them (and add `hook-io.mjs`), with the adapted lines kept.
3. **Repoint.** Update the paths in `.claude/settings.json` (show the merged `hooks` object for approval), the pre-commit hook, CI, the checks copied into `design-system/checks/` (copy the plugin's current ones), and the agent instructions and README.
4. **No old path left.** `git grep -n` for the old folder (`design-system/harness/claude`, `.claude/hooks/design-system/run-gates`, or `design-tokens`) finds nothing outside git history, and `git grep -il claude -- design-system/harness/` finds nothing.
5. **Prove** every gate as in Step 5, and ask for the live test in a new session: settings load when a session starts.

## A project with its own harness

A project may already run its gates through its own hooks or scripts, with paths and commands written into each file. Two installs of the same check would run it twice, so choose one:

- **Migrate (recommended when the person agrees).** Write every check the project's hooks run into `design-system/gates.json`, with the same commands and globs, and install the plugin's hooks, which read that one config and add the Bash-edit check.
  - Keep each check exactly as strict as it was. A message that names the project's own commands is kept, as an adapted line of the core (`gates.mjs`), never of an adapter.
  - Remove the project's own hook files only with the person's approval: removing code that looks redundant is theirs to decide.
  - Prove it: each old check fails on its violation through the new hook, then passes.
- **Keep theirs.** Add only the gates they lack, beside them, and name the checks the project's hooks already run so the plugin's hooks do not run them again.

Never leave both running the same check.

## Step 5: Prove each gate

A gate that never failed is not yet a gate. For each installed gate:
1. Make one known violation in a scratch copy or a temporary file. Examples:
   - a role aliasing another role;
   - a hex value in a component;
   - a `bg-[#fff]` class;
   - a value in the rules document's front matter;
   - an edit to a generated output.
2. Run the gate and confirm it fails with a message that names the rule.
3. Remove the violation and confirm the gate passes.

Report each gate as proven, with the command and both results. Leave no violation behind.

A hook run by hand proves its script, not that Claude Code loads it. The hooks load from `.claude/settings.json` when a session starts, so after the commit ask the person to start a new session, approve the hooks, and give the agent there an ordinary task that touches a colour, without saying it is a test, and read the transcript for each hook that fires. A deliberate violation shows only that a hook is loaded; an ordinary task shows what the agent does with the gates in place. The transcript line of each hook firing is the proof.

## Step 6: Record

- **Document.** Add the gates to the project's agent instructions (CLAUDE.md or AGENTS.md): what runs, when, and the one command to run them all (`node design-system/harness/run-gates.mjs before-commit`).
- **Commit message.** Propose one and wait for approval. Add no attribution trailers unless the project asks for them.

## Rules

- **Search inside the project.** Search only the project, the plugin's files and the session scratchpad. Find where a tool writes its output from its config or documentation, never by searching the disk. A hook blocks searches outside those places (`${CLAUDE_PLUGIN_ROOT}/scripts/search-scope.mjs`).
- **Approval before changes** to settings, git hooks, `package.json`, CI or dependencies.
- **No weakening.** Never weaken an existing gate or lint rule to make a new one pass. A migrated check stays exactly as strict.
- **Existing tools first.** Custom checks only where no tool has the rule.
- **Prove before reporting.** Every gate is shown failing before it is reported as installed.
- **No agent in `design-system/`.** Nothing under `design-system/` names an agent or reads an agent's protocol. An agent's adapters live in its own folder and only translate; a decision an adapter would make belongs in the core (`gates.mjs`) or `design-system/gates.json`.
- **Say what a hook can do.** A PreToolUse hook prevents; a PostToolUse hook reports after the write. Never describe an after-the-fact check as a block.

## Tone

Write for senior engineers. Name the gate, the rule it holds and the proof. No filler.

## About

Built by Abas Turabli. The gates come from a token system where agents, people and CI pass the same checks.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
