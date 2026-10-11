# Agent-Ready Design System

A Claude Code plugin by [Abas Turabli](https://abasturabli.com) that sets up, audits, fixes and gates a web project's design system, so AI coding agents stay on it:
- W3C Design Tokens (DTCG) as the one source of values;
- a rules document (`DESIGN.md`) that explains the tokens and holds no values;
- code that reads roles, never the palette;
- gates that hold agents, people and CI to all of it.

## Install

```bash
claude plugin marketplace add DevAbas/design-system
```

```bash
claude plugin install design-system@abasturabli
```

Formerly `design-tokens` in `DevAbas/skills`; moving from it is in the CHANGELOG, 0.6.0.

## Stack and dependencies

Read this before you install. The plugin is opinionated in two layers: standards every skill applies, and one tool profile that its ready-made gates are written for.

### Standards every skill applies

| Standard | What the plugin expects |
|---|---|
| [W3C Design Tokens (DTCG) 2025.10](https://www.designtokens.org/tr/2025.10/) | Token values live in DTCG files. The audit reports other formats (Sass variables, a JS theme object, design.md front matter) as a finding with a migration path |
| [DESIGN.md](https://github.com/google-labs-code/design.md) (Google, alpha) | The recommended rules document. Another document qualifies when it holds the rules and no values |
| [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) | Contrast between text or icons and the surfaces they sit on |

### What each part needs, and what it adds to your project

| Part | Works with | Adds to your project |
|---|---|---|
| The plugin itself | Claude Code, Node.js 20 or later | Nothing. Its scripts have no dependencies, including its own DTCG reader and colour maths |
| `audit` | Any web stack. On a project with DTCG files it also runs the token check, deterministically, with no install | Only its reports, in `design-system/audits/` |
| `fix` | Any web stack | What the approved plan names. Every new dependency is asked for first |
| `setup` | Web. It proposes the Terrazzo + Tailwind v4 profile, and other stacks choose a build tool with you | Token files, `DESIGN.md`, the build config, and the approved dependencies |
| `harness`, core gates and checks | Any web stack that runs Node. The token check and the rules-document check are copied as plain scripts | `design-system/gates.json`, `design-system/checks/`, `design-system/harness/` (the agent-agnostic core), `.claude/hooks/design-system/` (the Claude Code adapters), a git pre-commit hook, an optional CI job. Changes to `.claude/settings.json`, git hooks, `package.json` or CI are asked for first |
| `harness`, profile checks | The profile below | The build staleness check and the ESLint rules, adapted from the plugin |

### Profile: Terrazzo + Tailwind CSS v4

The only profile today. It assumes **Tailwind CSS v4**, and builds the Tailwind theme from DTCG tokens with **Terrazzo**. When a skill applies it, it may add these packages, each only after you approve it. The token check needs none of them: the plugin reads DTCG and computes derived colours itself.

| Package | Why | License | Tested with |
|---|---|---|---|
| `@terrazzo/cli`, `@terrazzo/parser`, `@terrazzo/plugin-css`, `@terrazzo/plugin-tailwind` | Build the CSS and the Tailwind theme from the tokens, and lint the token files | MIT | 2.7.1 |
| `@terrazzo/plugin-js` | Optional: resolved values for server code that cannot read CSS variables (OG images, metadata) | MIT | 2.7.1 |
| `yaml` | Read `DESIGN.md`'s front matter in the contract check | ISC | 2.9.1 |
| ESLint (flat config) | Run the `token-classes` and `no-raw-color` rules. The project's own ESLint is used | MIT | 9.39. ESLint 10 is not tested yet |
| `@google/design.md` | Optional: lint `DESIGN.md` and its contrast pairs | Apache-2.0 | 0.4.0 |

### Without a matching profile

- **Supported web stacks:** Sass, CSS Modules, CSS-in-JS (styled-components, Emotion, vanilla-extract), Style Dictionary, Vue or Svelte. These get the core rubric.
- **What changes:** the token and rules-document checks work as they are, but the code lint and the build check have no ready-made version. `harness` writes the gates for that stack's own tools, and asks before adding anything.
- **Results:** they are comparable with any other audit, but lean more on the model's reading than on scripts.

### Not covered

- Native platforms: iOS, Android, React Native.
- Agents other than Claude Code.

## The layout it creates

`setup` creates, and the checks default to, one layout: `DESIGN.md` at the root, and everything else under `design-system/`: the DTCG tokens in `tokens/` (foundation, semantic, themes, one resolver), the copied checks in `checks/`, the audit reports in `audits/`, and the settings in `gates.json`. A project with other paths or group names keeps them and states them in `gates.json`; the audit does not count that against it. See `references/conventions.md`.

## Skills

| Skill | What it does |
|---|---|
| `/design-system:setup` | Plans a token architecture for a new project, waits for approval, then builds it: resolver, palette from seeds, roles per theme, derived states, `DESIGN.md`, and the build |
| `/design-system:audit` | Scans the project and checks it against the Token Architecture rubric: naming, tiers, format, docs. Writes `design-system/audits/<UTC stamp>.json`, for example `2026-09-26T143005Z.json`, and its Markdown. Changes nothing else |
| `/design-system:fix` | Takes finding ids from a report, checks them against the report's fix order, plans each fix in commits that each leave the project working, waits for approval, implements, then re-audits and compares the reports to show what closed |
| `/design-system:harness` | Installs the gates a report recommends: token and rules checks, a staleness check, ESLint rules, Claude Code hooks, a git pre-commit hook and CI, all from one `design-system/gates.json`. Proves each gate by making it fail once |

The audit runs its analysis in a read-only subagent, `design-system:token-auditor`.

While a skill of this plugin is in use, a hook keeps its searches inside the project, the plugin and the session scratchpad. A search of the whole disk (`find /`, `rg ~`, a Glob at `/`) is blocked with the reason, so the agent reads a tool's output location from its config instead. This also avoids macOS access prompts for folders such as Downloads and Desktop. Sessions that never invoke the plugin's skills are not affected.

### The hooks `harness` installs

| Hook | When | What it can do |
|---|---|---|
| `protect-generated` | Before an Edit or Write | Denies an edit to a generated output |
| `check-on-edit` | After an Edit or Write | Lints the file, or runs the token checks after a token or rules edit, and reports a failure to the agent |
| `check-after-bash` | After a Bash command | The same checks on the files the command changed, from Claude Code's changed-file list (v2.1.269 or later); a generated output changed by hand fails the staleness check |
| `guard-commit` | Before an agent's `git commit` | Runs the commit gates and refuses the commit when one fails |

A hook that runs after the tool reports; it cannot undo the write. The commit gates, for an agent, a person and CI, are what enforce.

The hooks live in `.claude/hooks/design-system/` and only translate: each reads Claude Code's input, runs one stage of the core in `design-system/harness/`, and answers. Every decision is the core's, and nothing under `design-system/` names an agent, so another agent needs only its own adapters (`references/conventions.md`, The harness).

## The rubric

Four parts, each `met`, `partial` or `missing`. Every finding names a rule id that stays stable across audits:

| Part | Checks |
|---|---|
| `naming` | Roles named by purpose, one case convention, one name from tokens to code |
| `tiers` | Palette holds values, roles alias the palette or record a derived rule, text styles alias the fonts, code never reads the palette or states a literal, the component contract names roles |
| `format` | Valid DTCG, every theme complete, outputs generated and checked for staleness, a machine-readable contract |
| `docs` | A rules document exists; it holds no values, cites existing tokens, explains how to read them, and stays current |

See `references/rubric.md`. The reasons behind each rule, with sources, are in `references/principles.md` and `references/decisions.md`.

## Knowledge that stays current

The plugin records procedures and sources, not version facts:
- **New project:** the skills read the latest stable documentation of each tool.
- **Existing project:** they read the documentation of the version it has installed.
- **The gap:** the difference between the two is reported.

See `references/sources.md`.

## Tests

From `plugins/design-system`, with no path: from Node 21 on, a path given to `node --test` is read as a file or glob, not a folder to search.

```bash
node --test
```

## About

Built by Abas Turabli.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
