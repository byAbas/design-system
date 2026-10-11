---
name: fix
description: >-
  Fix the findings of a design-system audit report, one approved finding at a time: plan each change,
  wait for approval, implement it, then re-audit and compare the reports to show what closed. Use when
  the user asks to "fix the audit findings", "fix the token architecture", "move the colours into
  tokens", or passes finding ids from design-system/audits/*.json. Needs an audit report; run
  /design-system:audit first when there is none.
license: MIT
compatibility: Claude Code, as part of the design-system plugin. Node.js 20 or later.
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/compare-reports.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/plan-batch.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs *)
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

# design-system:fix, Fix Audit Findings

> By [Abas Turabli](https://abasturabli.com), AI-First Frontend Architect

This skill closes findings from an audit report. The order is fixed: plan, approval, change, verification. Nothing changes before the user approves the plan.

## Before starting

1. **Find the report.** Use the one the user names. Otherwise use the newest report in `design-system/audits/` (or `design-tokens-audit/` from before 0.4.0): the last by name for stamped reports, and by the rule for 0.1.0 names (`${CLAUDE_PLUGIN_ROOT}/references/report.md`, Files). If there is none, stop and suggest `/design-system:audit`.
2. **Read the references:**
   - `${CLAUDE_PLUGIN_ROOT}/references/report.md`;
   - `${CLAUDE_PLUGIN_ROOT}/references/principles.md`;
   - for each finding, its rule in `${CLAUDE_PLUGIN_ROOT}/references/rubric.md` and the decision it cites in `${CLAUDE_PLUGIN_ROOT}/references/decisions.md`;
   - the profile, when the report's `stack.profile` names one.
3. **Read the project's own rules** (CLAUDE.md, AGENTS.md, contributing notes). They win over this skill where they are stricter: commit rules, dependency rules, generated files.

## Step 1: Choose the findings

Take the finding ids the user gave. If they gave none, propose an order, errors first:
1. `format` findings, because a valid source comes first;
2. `tiers`;
3. `docs`;
4. `naming`.

Ask which to take. Fix a small batch at a time: a batch that touches the token files, the rules document and code together is hard to review.

**The fix order.** A finding's `requires` names findings whose fix must land first (`${CLAUDE_PLUGIN_ROOT}/references/report.md`, Fix order). Check the chosen batch before planning it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/plan-batch.mjs <report.json> <finding-id…>
```

It exits 1 when a finding in the batch requires one that is still open and not in the batch, and names them. Then do not plan that finding: say what it waits for, and propose its prerequisites as the batch, or add them to it. When it passes, it prints the batch in fix order, and the plan follows that order. A dependency the report does not record but you find while planning (a change that would break the build or rendering until another finding is closed) is treated the same way, and named in the plan.

## Step 2: Plan

For each finding, write:
- **Change:** what will change, file by file. Token files come first, then the rules document, then code (principles 11).
- **Tier:** which tier each new value belongs to. A missing colour becomes a role that aliases the palette, or a derived role with its rule recorded. It never becomes a literal (principles 4 and 5).
- **Dependencies:** any new dependency, named with its reason. Adding one needs the user's approval, and it is installed with the project's own package manager version (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`, Before an install).
- **Generated outputs:** which outputs the build will regenerate, and the command. Outputs are rebuilt, never edited.
- **Verification:** how the change will be verified.
- **Commits:** the batch's commits, in order, with what each holds.

**Every commit leaves the tree working.** After each commit the build, the checks and the rendering hold. Group commits by that rule, not by finding: a token migration and the code renames it needs are one commit, because a commit with only the token change breaks every class that reads the old name. A finding that changes no other file's correctness may be its own commit. Before proposing a commit, name what would break if it stood alone, and fold that change into it.

Before planning code that uses a tool's API, confirm the API in the documentation for the installed version (`${CLAUDE_PLUGIN_ROOT}/references/sources.md`). If the documentation disagrees with the report or this plugin, stop and report the difference.

Present the plan and wait for approval. Use plan mode when the session offers it.

**The rules document.** For `docs/rules-document-exists`, or when a rules document is rewritten:
- **No rules document:** start from `${CLAUDE_PLUGIN_ROOT}/assets/setup/DESIGN.md`, keep its sections and fill them from the project's tokens and components.
- **Another rules document:** keep it, and bring it to the rules (decisions, The rules document: no values, a machine-readable contract, only existing token ids). Do not add a second document beside it.
- **Contract keys** start with their component's file name in kebab-case (`${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, The contract). Renaming keys that named visual parts (`button-primary-hover` for `Button.tsx` already fits; `hero-cta` for `CtaBannerSection.tsx` does not) is its own batch, with the rules document's prose.

**Batches that must not change rendering.** A migration, a rename or a move of values should leave every page looking the same. The plan says how that is proven:
- **Baseline and compare.** Take a baseline with the project's own visual check (its screenshot or visual-regression script) before any change, and compare after it.
- **Confirm the target.** Before the baseline, confirm the check tests this project: the port it loads answers with this app (its page title or a known element), not another server on the same port.
- **Interactive states.** Cover the states a change can reach, not only each route's first paint: an open dialog or menu, hover, focus, a filled form.
- **Output location.** Read where that tool writes its output from its config, its script or its documentation. Never search the disk for it.
- **No visual check.** If the project has none, say so and ask how to verify. Do not install one unasked.
- **Any difference** stops the batch and is reported with the pages and elements it touches.

**Measure first.** When something looks wrong, measure it before explaining it: element rects, text ranges (`Range.getBoundingClientRect`), computed styles, in the committed code and in the change. A fix that changes an approach cites the standard it rests on (the spec, MDN, the tool's documentation for the installed version), not a hypothesis.

**Names and paths.** A batch that moves a project to the canonical layout or names follows `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, Moving to the canonical layout: its steps, and its proof (the rebuilt output differs in comments only, and `check-tokens` reports the same problems). A rename changes token ids, the rules document's contract and the code that reads them. Propose it as its own batch; never fold it into another, and never add a missing tier in it.

## Step 3: Implement

- **Stay in scope.** Change only what the approved plan lists. A new problem found on the way is reported, not fixed in passing.
- **Values in tokens.** Keep every value in the token files. Update the rules document's prose and contract when a role is added, renamed or removed.
- **Rebuild.** Rebuild the generated outputs with the project's build command.
- **Run the checks.** Run the project's existing checks and tests after each finding, and stop at the first failure.

## Step 4: Verify

1. **A fresh build first.** Rebuild the generated outputs with the project's build (`build` in `design-system/gates.json`), and confirm the staleness check passes. A report taken against outputs the last build left behind measures that build, not the change.
2. **Re-audit.** Run `/design-system:audit`, or for a small batch re-check only the rules the batch touched, and write a new report file.
3. **Compare the reports:**

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/compare-reports.mjs <before.json> <after.json>
   ```

   It lists the findings that were resolved, are new, or are unchanged. It exits 1 when the new report has a new `error` finding.
4. **Report the outcome.** Say which finding ids closed and which did not, and why. A finding counts as closed only when the new report no longer has it.

## Step 5: Hand back

- **Commit messages.** Propose one per planned commit, in the project's format, and wait for approval. Add no attribution trailers unless the project asks for them.
- **Gates.** If the gates that would keep these findings closed are `missing`, suggest `/design-system:harness`.

## Rules

- **Search inside the project.** Search only the project, the plugin's files and the session scratchpad. Find where a tool writes its output from its config or documentation, never by searching the disk. A hook blocks searches outside those places (`${CLAUDE_PLUGIN_ROOT}/scripts/search-scope.mjs`).
- **Plan first.** Nothing changes before approval.
- **Prerequisites first.** Never fix a finding while a finding it requires is open.
- **Every commit works.** No commit leaves the build, the checks or the rendering broken for a later commit to repair.
- **No hand edits to outputs.** Never edit a generated output by hand.
- **Approval for new things.** Never add a dependency, a command or a CI job without approval.
- **No hiding findings.** Never lower a finding's severity, delete a report, suppress a problem or add an exemption to make a result look better. Suppressions and exemptions are the person's decisions, each with its reason.
- **Prune what a batch fixed.** When a fixed problem was suppressed, run the check with `--prune-suppressions` (and ESLint with `--prune-suppressions`) in the same commit, so the suppressions only shrink.

## Tone

Write for senior engineers. State what changes and why, cite the rule, show the result. No filler.

## About

Built by Abas Turabli. The fix order and its checks come from moving a product's styling onto DTCG tokens with generated outputs and gates.

- Website: https://abasturabli.com
- LinkedIn: https://www.linkedin.com/in/turabli/
- License: MIT
