---
name: setup
description: >-
  Set up a design-token architecture for a new web project, or one without tokens: W3C Design Tokens
  (DTCG) behind a resolver, a palette generated from seeds with its provenance recorded, roles per
  theme, derived state colours, a DESIGN.md that holds the rules and no values, and the build that
  turns tokens into CSS and a Tailwind v4 theme. Plans first and waits for approval. Use when the
  user asks to "set up design tokens", "start a design system", "create the token architecture",
  "add light and dark themes with tokens", or starts a web project that needs a design system.
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

# design-system:setup, Token Architecture Setup

> By [Abas Turabli](https://abasturabli.com), AI-First Frontend Architect

This skill builds a token architecture that meets the Token Architecture rubric from its first commit:
- values in DTCG token files;
- rules in a rules document that holds no values;
- code that reads roles only;
- outputs generated from the tokens.

Nothing is written before the user approves the plan.

## Before starting

1. **Scan the project** (`node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs .`). If it already has token files or a rules document, this is not a setup: suggest `/design-system:audit` and stop, unless the user wants to start over.
2. **Read the references:**
   - `${CLAUDE_PLUGIN_ROOT}/references/principles.md`;
   - `${CLAUDE_PLUGIN_ROOT}/references/decisions.md`;
   - `${CLAUDE_PLUGIN_ROOT}/references/rubric.md`, the target the result must meet.
3. **Read the project's own rules** (CLAUDE.md, AGENTS.md). Their commit, dependency and planning rules apply.

## Step 1: Constraints

Ask only what is unknown and changes the plan:
- **Contexts:** light only, light and dark, brands, densities.
- **Seeds:** brand accent, neutral and background, per context. Or ask whether to generate them.
- **Stack:**
  - The framework and styling. With Tailwind CSS v4, propose the Terrazzo profile (`${CLAUDE_PLUGIN_ROOT}/references/profiles/terrazzo-tailwind-v4.md`).
  - With another stack, apply the core principles, and choose the build tool with the user (decisions, Build tool).
- **Components:** the components the product starts with, for the contract.
- **Fonts:** families and weights.

## Step 2: Read the current documentation

For each tool in the plan, read the official documentation of its latest stable version (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`):
- DTCG: check whether a version newer than 2025.10 exists;
- Terrazzo;
- Tailwind;
- the palette generator;
- @google/design.md.

Record the versions. Where the documentation differs from this plugin, follow the documentation and tell the user.

## Step 3: Plan

Present the plan and wait for approval. Use plan mode when the session offers it. The plan covers the parts below.

**Token files.** Exactly the canonical layout, `design-system/tokens/` (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`), started from `${CLAUDE_PLUGIN_ROOT}/assets/setup/design-system/tokens/`:
- **The resolver.** `design.resolver.json` for one context (sets only), or `design.resolver.themes.json`, saved as `design.resolver.json`, for two or more (a `theme` modifier);
- **Foundation.** `foundation/palette.tokens.json`, with the generator and seeds in `$extensions` under the project's own reverse-domain key, and `foundation/font.tokens.json`;
- **Semantic.** `semantic/typography`, `spacing` and `rounded`, plus `semantic/colors.tokens.json` for one context;
- **Themes.** `themes/<context>.tokens.json`, one per context, only for two or more.

The group names are the canonical ones, so the checks need no configuration.

**Palette.** Generated from the seeds with a named generator, for example Radix's custom palette. Its steps are named by scale (`gray-1` to `gray-12`), not by use. Check where the generator placed each seed (decisions, Palette generation and provenance).

**Roles.**
- A list of roles named by purpose (decisions, Naming), each aliasing a palette step per context. For a 12-step scale, choose steps by the scale anatomy (decisions, Scale anatomy).
- Every context defines every role.
- State roles alias the next step when it reads as a state. Otherwise they are derived by a recorded rule, with the rule in `$extensions` and in `$description`, and the stored value computed at build (decisions, Interaction states).
- A translucent role (a scrim, a faint fill) is derived by an `alpha` rule from its opaque base, never a literal copy of it.

**Text styles.** DTCG `typography` composites whose family and weight alias `font.*` tokens.

**Other groups.** Radii, spacing and shadows, as the product needs them. Shadows are per context when they differ.

**Rules document.** A `DESIGN.md` from `${CLAUDE_PLUGIN_ROOT}/assets/setup/DESIGN.md`:
- the front matter holds `imports:` and the `components:` contract, by role id. Each component names its `backgroundColor`, `textColor` and `typography`, so the check can measure its contrast in every context. Each key starts with its component's file name in kebab-case (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, The contract);
- every section explains meaning, use and reasons, and cites ids, never values;
- it includes the "Reading the tokens" guide;
- it lists the contrast pairs (decisions, Contrast).

**Build.** For the Terrazzo profile:
- `terrazzo.config.ts` and `theme.template.css` from `${CLAUDE_PLUGIN_ROOT}/assets/harness/terrazzo-tailwind-v4/`, with the config's `EXTENSION_KEY` set to the project's `extensionKey`;
- only role groups are mapped to Tailwind namespaces, and each token has one CSS variable name (profile, Build);
- the Tailwind default palette is reset.

**Dependencies.** Each one with its version and reason. Adding them needs approval.

**Gates.** Hand off to `/design-system:harness` after the files exist.

## Step 4: Build

After approval:
1. Write the token files, then the rules document, then the build config.
2. Generate the palette with the chosen generator, and record its version and seeds.
3. Compute each derived role's value per context with the rule, and store it. `${CLAUDE_PLUGIN_ROOT}/scripts/check-tokens.mjs` recomputes them.
4. Install the approved dependencies with the project's own package manager version (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`, Before an install), and run the build.
5. Wire the project's global CSS to the generated outputs, following the profile.

## Step 5: Verify

Run the checks the harness will install. Where the harness has not run yet, run the plugin's checks directly, with the project as the working directory: `${CLAUDE_PLUGIN_ROOT}/scripts/check-tokens.mjs` and `check-rules-contract.mjs`, and `scripts/profiles/terrazzo-tailwind-v4/check-generated.mjs`:
- the token check;
- the rules contract check;
- the generated-output check;
- `tz check`.

All must pass.

Then run `/design-system:audit`. A fresh setup meets every part (`met`), apart from the gates, until `/design-system:harness` installs them.

## Rules

- **Search inside the project.** Search only the project, the plugin's files and the session scratchpad. Find where a tool writes its output from its config or documentation, never by searching the disk. A hook blocks searches outside those places (`${CLAUDE_PLUGIN_ROOT}/scripts/search-scope.mjs`).
- **Plan first.** Nothing is written before approval.
- **Values in one place.** No value in the rules document, the code or the build template. Every value is in a token file.
- **No palette in code.** No palette entry is reachable from code.
- **Approval for dependencies.** Never add one without approval.

## Tone

Write for senior engineers. Recommend by constraints, and state the condition behind each choice. No filler.

## About

Built by Abas Turabli. The setup order comes from building a DTCG token architecture with Terrazzo and Tailwind v4 end to end.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
