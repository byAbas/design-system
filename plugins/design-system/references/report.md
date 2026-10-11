# The audit report

> Reference material for the design-system plugin. How the audit writes its report and how `fix` and `harness` read it. The report's shape is `assets/report.schema.json`. Load before writing or reading a report.

## Files

The audit writes two files into the audited project:
- `design-system/audits/<stamp>.json`: the source. `fix`, `harness` and `compare-reports` read it.
- `design-system/audits/<stamp>.md`: rendered from the JSON by `scripts/render-report.mjs`. Never written by hand.

Before 0.4.0 reports went to `design-tokens-audit/`. `fix` and `harness` still read that folder.

**The stamp** is the UTC time of the audit, to the second, with no separators inside the time: `2026-09-26T143005Z`. It comes from `date -u +%Y-%m-%dT%H%M%SZ`. Name order is then time order, so the last name is the newest report. A date with a counter (`2026-09-26-2`) does not have that property: it sorts before `2026-09-26`.

The audit never deletes an older report, because comparing two reports is how a fix is verified.

**Reports from 0.1.0** are named by date only, with `-2`, `-3` for later audits that day. Their name order is wrong. Among them, the newest is the one with the highest counter on the latest date. When that is unclear, ask the user.

## Top-level fields

| Field | Content |
|---|---|
| `schemaVersion` | `"1"` |
| `tool` | `{ "name": "design-system", "version": "<plugin.json version>" }`. Reports from design-tokens 0.1–0.5 carry `"design-tokens"`, which is still read |
| `project` | `{ "name", "root", "commit", "dirty" }`; `commit` is the short hash when the project is a git repository, and `dirty` is true when `git status --porcelain` lists changes, so the report says it audited uncommitted work |
| `date` | ISO date of the audit |
| `baseline` | Optional: the report this project compares against, `audits.baseline` in `design-system/gates.json` (Retention) |
| `stack` | `profile` (`"terrazzo-tailwind-v4"` or `null`), `targetProfile` (when `profile` is `null` and the recommended gates use a profile's assets, that profile, so the header does not say "none" beside Terrazzo gates), `tokenFormat`, `styling`, `rulesDocument`, `tokenSettings` (the resolver path and group names the checks used, when they differ from `conventions.md`), and `versions`: per tool, `installed` and `latest`. Every listed package has its `latest` from the registry (`sources.md`); `render-report.mjs` warns about one without it |
| `parts` | The four parts (`naming`, `tiers`, `format`, `docs`), each with `status` and a one-sentence `summary` |
| `findings` | See below |
| `gates` | See below |
| `sources` | Every document the audit relied on, `title`, `url`, and `version` where it applies. It includes every URL a finding cites in `source`: `render-report.mjs` refuses a report where a cited URL is missing |

## A finding

```json
{
  "id": "tiers/role-aliases-palette@tokens/themes/dark.tokens.json#colors.surface-overlay",
  "ruleId": "tiers/role-aliases-palette",
  "part": "tiers",
  "severity": "error",
  "title": "colors.surface-overlay aliases colors.surface-container instead of the palette",
  "location": { "file": "tokens/themes/dark.tokens.json", "pointer": "colors.surface-overlay" },
  "evidence": [{ "file": "tokens/themes/dark.tokens.json", "line": 41, "excerpt": "\"$value\": \"{colors.surface-container}\"" }],
  "why": "A role that points to a role hides the palette entry behind it (principles 2).",
  "source": "https://www.designtokens.org/faq/",
  "fix": "Point it at the palette entry, or record it as a derived role with its rule."
}
```

**The finding `id`** is `<ruleId>@<file>#<pointer>`:
- `pointer` is a token id, a front matter path, or a code symbol;
- for a finding about a whole file, use `#` alone;
- for a finding about the whole project, use `@project#`, with the finding's real severity;
- for the count that closes a group (below), use `@project#total`, always with severity `info`.

The id must not contain a line number: a line moves when unrelated code changes, and the id must stay the same from one audit to the next. The line goes in `evidence`.

**Grouping:** one finding per rule and place. A rule broken in forty files is one finding per file, capped at the ten files with the most matches. When the cap drops files, a further finding, `<ruleId>@project#total` with severity `info`, gives the total count and lists the dropped files as evidence. It is `info` because its errors are already counted in the per-file findings: counting them again would inflate the result. `render-report.mjs` refuses a `#total` finding with any other severity.

**Moved findings:** when the same problem is now at a new location (its values moved to another file, or a group was renamed), the finding keeps the new id and lists the old one in `previousIds`. `compare-reports` then shows it as moved, not as one resolved and one new finding.

**Fix order:** a finding whose fix breaks the project while another finding is open lists that finding's id in `requires`. The prerequisite is a finding of the same report: a closed one is no longer in it. Example: removing Tailwind's default palette (`--color-*: initial`) makes every default palette class (`bg-blue-50`, `from-black/60`) stop producing CSS, with no build error, so the interface loses styles silently. The reset finding requires each finding for a file that still uses those classes (and the group's `#total` finding when files were dropped). `render-report.mjs` refuses a `requires` that names no finding of the report, the finding itself, or a cycle. `fix` runs `scripts/plan-batch.mjs`, which refuses a batch whose prerequisites are neither closed nor in the batch, and orders the rest.

**Status:** a finding is `open` unless the project decided otherwise, and the decision is recorded where the gates read it:
- `accepted`: the problem is in `design-system/suppressions.json` (`conventions.md`, Suppressions). `statusReason` is the suppression's reason. It still counts in the totals and the part's status: the problem is still there.
- `out-of-scope`: the file is in an exemption of `design-system/gates.json` (`conventions.md`, Exemptions). `statusReason` is the exemption's reason. It is listed so the decision stays visible, and not counted.

A finding without `status` is open. `render-report.mjs` refuses an accepted or out-of-scope finding with no reason.

**One value in two documents:** a value the rules document and the code both state is one `docs/rules-hold-no-values` finding at the document location, with each code location as evidence. It is not one finding per code file under `format/single-source-build`, which is about generated outputs.

## A gate

```json
{
  "id": "gate/code-lint",
  "does": "Fails a class or style that reads the palette or states a literal colour, size or radius",
  "checks": ["tiers/no-primitive-in-code", "tiers/no-literal-in-code"],
  "closes": ["tiers/no-literal-in-code@src/components/Card.tsx#"],
  "tool": { "name": "ESLint rules token-classes and no-raw-color", "kind": "custom", "basis": "assets/harness/terrazzo-tailwind-v4/eslint-token-rules.mjs" },
  "runs": ["agent-edit", "commit", "ci"],
  "status": "missing"
}
```

- **`tool.kind`:**
  - `existing`: a rule the project's tools already have, to switch on;
  - `custom`: a rule to write.
  
  Recommend `existing` first (principles 9).
- **`runs`:** any of these:
  - `agent-edit`: a hook after an agent's edit;
  - `agent-commit`: a hook before an agent's commit;
  - `commit`: a git pre-commit hook;
  - `ci`.
- **`status`:**
  - `present`: the gate exists and fails on a probe;
  - `partial`: it exists but misses a rule or a place;
  - `missing`.

Every rule in the rubric whose Gate is machine-checkable appears in some gate's `checks`, whether or not it has a finding: the gates are how a clean project stays clean.

## Statuses of parts

Use `rubric.md`, Parts and statuses. The `summary` is one sentence and states the most important finding or, when the part is met, what holds it. The detail belongs in the findings. The summary is a table cell, and more than one sentence makes the table unreadable, so `render-report.mjs` warns about it.

## The Markdown

`render-report.mjs` writes these sections:
1. Header.
2. Summary: parts and statuses.
3. Findings, grouped by part, errors first.
4. Recommended gates.
5. Versions.
6. Sources.

It fails when a required field is missing, so an incomplete report never reaches the user.

## Comparing two reports

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-reports.mjs" <before.json> <after.json>
```

It prints the findings that are new, resolved, moved, moved out of scope, accepted or unchanged, by `id`. A finding that is still there but became accepted or out of scope is never counted as resolved. It exits 1 when the new report has a new open `error` finding. `fix` runs it after re-auditing. `--json` prints the same as JSON.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-reports.mjs" --baseline
```

compares the baseline (Retention) with the newest report.

## Retention

`design-system/gates.json` says which report is the baseline and how many to keep:

```json
"audits": { "baseline": "2026-09-27T201749Z.json", "keep": 10 }
```

- **The baseline** is the report the project measures its progress against: usually the audit taken when the gates were installed, or when the suppressions were written. The audit names it in its report's `baseline`, and `compare-reports.mjs --baseline` compares it with the newest.
- **Keep:** past `keep` reports, the audit lists the older ones and offers to delete them; it deletes only with the person's approval, and never the baseline. Without `keep`, nothing is deleted.
