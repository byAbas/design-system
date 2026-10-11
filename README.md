# Agent-Ready Design System

Set up, audit, fix and gate a web project's design system, so AI coding agents stay on it: W3C Design Tokens (DTCG) as the one source of values, a `DESIGN.md` that holds the rules and no values, and hooks, a pre-commit hook and CI checks that stop an agent the moment it writes a value outside the tokens.

A plugin for [Claude Code](https://code.claude.com). Its checks are plain Node scripts with no dependencies, so the pre-commit hook and CI hold the same rules without any agent.

## Install

```bash
claude plugin marketplace add byAbas/design-system
```

```bash
claude plugin install design-system@abasturabli
```

## Commands

| Command | What it does |
|---|---|
| `/design-system:setup` | Plans a token architecture for a new project, waits for approval, then builds it |
| `/design-system:audit` | Checks the project against the Token Architecture rubric and writes a report with stable finding ids |
| `/design-system:fix` | Plans a fix for chosen findings, waits for approval, implements, re-audits and compares |
| `/design-system:harness` | Installs the gates: token and rules checks, Claude Code hooks, a git pre-commit hook and CI |
| `/design-system:figma-export` | Writes the tokens as variable files Figma imports natively, which are also the baseline for the way back |
| `/design-system:figma-propose` | Turns a designer's Figma changes into a proposal for the tokens, reviewed and gated, never written over them |

Stack, dependencies, the rubric and how each part works: [plugins/design-system](plugins/design-system/README.md). Every change, with its reason: [CHANGELOG](plugins/design-system/CHANGELOG.md).

### How setup runs

![/design-system:setup scans the project and stops if it already has tokens, asks what changes the plan, presents the plan and waits for approval, then writes the tokens, DESIGN.md and build config, builds the CSS, proves it with the plugin's checks and an audit, and hands off to harness.](docs/diagrams/setup.svg)

## About

Built by [Abas Turabli](https://abasturabli.com). MIT License.
