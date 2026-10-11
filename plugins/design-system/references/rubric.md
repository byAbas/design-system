# Rubric: Token Architecture

> Reference material for the design-system plugin. The audit checks a project against these rules, and `fix` and `harness` close what it finds. A rule id is stable across versions of the plugin: a finding keeps its id from one audit to the next. Load in full for an audit. Load the rules a finding names for a fix.

## Parts and statuses

The rubric has four parts. Each gets one status in the report:

| Part | Question |
|---|---|
| `naming` | Are tokens named for their purpose, the same way everywhere? |
| `tiers` | Does each value live in its tier, and does code read only roles? |
| `format` | Can tools read the tokens, and is every output built from them? |
| `docs` | Does the rules document explain the tokens, stay current, and hold no values? |

| Status | When |
|---|---|
| `met` | The part's foundation exists and no `error` or `warning` finding remains in it |
| `partial` | The foundation exists, but the part has `error` or `warning` findings |
| `missing` | The foundation is absent: no token files (for `naming`, `tiers`, `format`), or no rules document (for `docs`, exactly when the report has a `docs/rules-document-exists` finding) |

There is no numeric score: a weighted number would be a threshold chosen by eye. The statuses and the findings are the result.

## What is not a finding

Paths and group names other than the canonical ones (`references/conventions.md`) are not a finding: DTCG does not prescribe them. The report records them in `stack.tokenSettings`, and renaming them is an optional `fix` batch.

## Severities

| Severity | Meaning |
|---|---|
| `error` | Breaks a source of truth or a tier. A gate should fail on it |
| `warning` | Lets the system drift, or leaves a rule unchecked |
| `info` | An improvement, or a gap between the installed and the latest version of a tool |

Every rule below has a default severity. The auditor may raise or lower one finding with a reason in the finding.

## How each rule is written

Each rule block has five fields:
- **What:** the rule.
- **Why:** the reason, pointing to `principles.md` or `decisions.md`.
- **Check (core):** how an auditor verifies it by reading the project, in any stack.
- **Gate:** what enforces it once fixed. The profile gives the stack-specific tool.
- **Default:** the default severity.

---

## naming

### `naming/semantic-roles`

- **What:** role tokens are named by purpose (`surface`, `on-primary`, `outline`), not by appearance or scale (`blue`, `gray-9`, `light-bg`).
- **Why:** principles 2; decisions, Naming.
- **Check (core):** list the role group's ids. Flag a role whose name contains a hue word, a scale number, or a theme word.
- **Gate:** review. Not machine-checkable in general.
- **Default:** `warning`.

### `naming/consistent-case`

- **What:** every token and group name follows one case convention.
- **Why:** decisions, Naming.
- **Check (core):** compare the names' case across all token files.
- **Gate:** the build tool's naming lint (Terrazzo: `core/consistent-naming`).
- **Default:** `warning`.

### `naming/one-name-everywhere`

- **What:** a token keeps one name in the tokens, the rules document and the code, mapped by one documented rule (`colors.surface` → `bg-surface` / `var(--color-surface)`).
- **Why:** decisions, Naming.
- **Check (core):**
  - compare the ids the rules document cites, the ids in the token files, and the names code uses (CSS variables, utility classes);
  - flag renamed or translated names;
  - flag a missing mapping rule.
- **Gate:** the rules-contract check (every cited id exists) and the code lint (every token class exists).
- **Default:** `warning`.

---

## tiers

### `tiers/palette-literal`

- **What:** palette entries are literal values, never aliases.
- **Why:** principles 2.
- **Check (core):** in the palette group, flag any `$value` that is a reference (`{…}` or `$ref`).
- **Gate:** token check (`scripts/check-tokens.mjs`, no dependencies).
- **Default:** `error`.

### `tiers/role-aliases-palette`

- **What:**
  - in every theme, each colour role aliases a palette entry directly, or carries a derived rule;
  - a role never aliases another role, and never holds a literal.
- **Why:** principles 2 and 5.
- **Check (core):**
  - resolve each context;
  - for each role, the first step of its alias chain must be a palette id, or the token must carry a derived rule in `$extensions`.
- **Gate:** token check (`scripts/check-tokens.mjs`, no dependencies).
- **Default:** `error`.

### `tiers/derived-rule-recorded`

- **What:**
  - a derived role records its rule (`$extensions`) and states it in `$description`;
  - its stored value equals what the rule gives in each theme, its alpha included;
  - the rule reads opaque roles. A translucent role (a scrim, a faint fill) is itself derived, by an `alpha` rule from its opaque base, not a literal copy of the base with an alpha.
- **Why:** principles 5; decisions, Interaction states.
- **Check (core):**
  - find state and blend roles (hover, pressed, active, overlays, muted text…) that are literals;
  - flag those without a recorded rule;
  - flag a rule whose result differs from the stored value.
- **Gate:** token check, which recomputes each derived value (profile).
- **Default:** `error`.

### `tiers/styles-alias-foundation`

- **What:** a composite style (typography) takes its family and weight from the foundation's font tokens, never from literals.
- **Why:** principles 2 and 6; decisions, Text styles.
- **Check (core):** read the authored `$value` of each text style. `fontFamily` and `fontWeight` must be references.
- **Gate:** token check (`scripts/check-tokens.mjs`, no dependencies).
- **Default:** `warning`.

### `tiers/no-primitive-in-code`

- **What:** no code reads a palette entry: no palette utility class, no palette CSS variable, and no palette id in component styles.
- **Why:** principles 2; decisions, Primitives are not exposed to code.
- **Check (core):**
  - search code for the palette's generated names;
  - check whether the framework theme exposes palette entries as utilities;
  - check whether the framework's default palette is still available.
- **Gate:** code lint (profile), and a framework theme that maps only role groups.
- **Default:** `error`.

### `tiers/no-literal-in-code`

- **What:** code states no colour, size, radius, shadow or type value outside the token outputs. This covers:
  - hex and colour functions with literal channels;
  - arbitrary utility values (`text-[13px]`, `bg-[#fff]`);
  - opacity modifiers on role utilities;
  - the framework's default scale utilities where tokens exist.
- **Why:** principles 1 and 4.
- **Check (core):** count raw colours (the scan's `rawColors`). Read the files with the most matches and the component styles.
- **Gate:** code lint (profile).
- **Default:** `error`.

### `tiers/components-read-roles`

- **What:** the component contract names roles only (`{colors.*}`, `{typography.*}`, `{rounded.*}`), never palette entries or values.
- **Why:** principles 2.
- **Check (core):** read the contract in the rules document's front matter. Flag palette references, literal values, and missing components that code has.
- **Gate:** rules-contract check (profile).
- **Default:** `error`.

### `tiers/contrast-pairs`

- **What:** each pair the contract combines meets WCAG 2.1 AA in every context: a component's `textColor` over its `backgroundColor`, at 4.5:1, or 3:1 when its `typography` is large text (24px, or about 18.67px and bold).
- **Why:** decisions, Contrast. A role is chosen per context, so a pair that passes in light can fail in dark.
- **Check (core):**
  - for each component in the contract, and each context, compute the ratio with the plugin's colour maths (`scripts/lib/color.mjs`);
  - composite a translucent `textColor` over the background first;
  - a variant (`button-primary-hover`) takes the properties it does not state from the component its key extends (`button-primary`), as the design.md format reads variants; a disabled variant is exempt (SC 1.4.3);
  - a translucent `backgroundColor` is not measured, and is named as such: its contrast depends on what it is painted over;
  - the pairs the rules document approves in prose only are read and checked by hand, and named in the finding as unchecked.
- **Gate:** rules-contract check (core). The ratio is never rounded up: 4.49:1 fails.
- **Default:** `error`.

---

## format

### `format/dtcg-valid`

- **What:** the token files are valid DTCG 2025.10:
  - every token resolves to a type (Format 5.2.2);
  - names are legal (5.1.1);
  - dimensions use `px` or `rem` (8.2);
  - every alias resolves.
- **Why:** decisions, Token format.
- **Check (core):** run the project's DTCG parser or validator if one is installed. Otherwise read the files against the format.
- **Gate:** the build tool's check (Terrazzo: `tz check`).
- **Default:** `error`. When the project has tokens in another format, one `warning` names the format and the migration path.

### `format/themes-complete`

- **What:** every context defines the same roles, and a role is derived the same way in each.
- **Why:** principles 3.
- **Check (core):** compare the role ids per context (resolver contexts, or per-theme files).
- **Gate:** token check (`scripts/check-tokens.mjs`, no dependencies).
- **Default:** `error`.

### `format/single-source-build`

- **What:**
  - every output the code reads (CSS variables, framework theme) is generated from the tokens by a build tool;
  - no output is edited by hand;
  - a check fails when an output is stale.
- **Why:** principles 1 and 7.
- **Check (core):**
  - find where the code's CSS variables and theme are defined;
  - flag hand-written values that duplicate what the build generates from the tokens;
  - check whether a staleness check and an edit guard exist.
- **Scope:** this rule covers the token build's outputs against the tokens. A value written both in the rules document and in code is not this rule: it is one `docs/rules-hold-no-values` finding at the document location, with each code location as evidence.
- **Gate:** `--check` build comparison, a pre-commit, and an agent hook denying edits to outputs.
- **Default:** `error` for a duplicated source, `warning` for a missing check.

### `format/machine-readable-contract`

- **What:** which roles each component reads is machine-readable (the rules document's front matter), not prose only.
- **Why:** decisions, The rules document.
- **Check (core):** find the contract. Flag a contract that is prose only, or absent while the code has components.
- **Gate:** rules-contract check.
- **Default:** `warning`.

---

## docs

### `docs/rules-document-exists`

- **What:** the project has one rules document that explains the tokens: what each role means, when it is used, and which roles each component reads. `DESIGN.md` is the recommended form. Another document qualifies when it does that job (decisions, The rules document).
- **Why:** principles 1 and 11. Without it, no rule has a home and no agent can tell a role's use from its value.
- **Check (core):** read the scan's `rulesDocument` and every entry of `rulesDocumentCandidates` before deciding. A README section or a Storybook page that lists tokens without their rules does not qualify.
- **Gate:** review.
- **Default:** `error`. When this finding exists, the `docs` part is `missing`, and the other `docs` rules are not reported.

### `docs/rules-hold-no-values`

- **What:** the rules document states no token value (hex, px, rem, font sizes, durations) in its front matter or its prose. It cites token ids.
- **Why:** principles 1.
- **Check (core):** search the rules document for values. Ignore code blocks that document syntax. A value that the document and the code both state is one finding here, at the document location, with each code location as evidence.
- **Gate:** rules-contract check (front matter). Prose is a review item.
- **Default:** `error` in the front matter, `warning` in the prose.

### `docs/rules-reference-existing-tokens`

- **What:** every token id the rules document cites exists in the tokens.
- **Why:** principles 1.
- **Check (core):** collect the cited ids (front matter references, backticked ids in prose) and resolve them.
- **Gate:** rules-contract check.
- **Default:** `error`.

### `docs/reading-guide`

- **What:** the rules document says where the tokens live, how contexts apply, and how an id maps to code.
- **Why:** an agent or a new person must get from a rule to a value and to a class without guessing.
- **Check (core):** look for that section.
- **Gate:** review.
- **Default:** `warning`.

### `docs/token-descriptions`

- **What:** roles and derived tokens carry a `$description` that states their use or rule.
- **Why:** the description travels with the token into every tool.
- **Check (core):** count roles without `$description`.
- **Gate:** the build tool's description lint (Terrazzo: `core/descriptions`, scoped to roles).
- **Default:** `info` for roles, `warning` for derived tokens.

### `docs/current`

- **What:** the documents agree with the tokens and the tools:
  - no stale statements about where values come from;
  - no commands that no longer exist;
  - no gap between the installed and the latest stable version of the token tools that changes a rule.
- **Why:** principles 10.
- **Check (core):**
  - compare the documents' claims with the files;
  - compare installed versions (the scan's `dependencies`) with the latest stable versions in the official docs.
- **Gate:** review.
- **Default:** `warning` for a stale statement, `info` for a version gap.
