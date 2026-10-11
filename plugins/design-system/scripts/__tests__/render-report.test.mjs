import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockers, renderReport, reportProblems, reportWarnings } from "../render-report.mjs";
import { TOKEN_DEFAULTS } from "../lib/project-modules.mjs";
import { sampleReport } from "./sampleReport.mjs";

describe("reportProblems", () => {
  it("accepts a complete report", () => {
    assert.deepEqual(reportProblems(sampleReport()), []);
  });

  it("refuses a report missing a part, a field or a valid status", () => {
    const report = sampleReport();
    report.parts = report.parts.filter((part) => part.id !== "docs");
    report.parts[0].status = "good";
    delete report.findings[1].fix;
    assert.deepEqual(reportProblems(report), [
      "parts.naming.status is \"good\", expected one of met, partial, missing",
      "parts has no entry for docs",
      "findings[1].fix is missing",
    ]);
  });

  it("refuses a finding whose id, part or rule does not match the rubric", () => {
    const report = sampleReport();
    report.findings[0].part = "docs";
    report.findings[1].id = "docs/rules-hold-no-values:DESIGN.md";
    report.findings.push({ ...sampleReport().findings[0], ruleId: "tiers/Unknown Rule" });
    report.findings.push(sampleReport().findings[0]);
    const problems = reportProblems(report);
    assert.ok(problems.includes("findings[0].part is \"docs\", but its rule belongs to tiers"));
    assert.ok(problems.includes("findings[1].id must be <ruleId>@<file>#<pointer>"));
    assert.ok(problems.includes("findings[2].ruleId \"tiers/Unknown Rule\" is not a rubric rule id"));
    assert.ok(problems.some((problem) => problem.startsWith("findings[3].id") && problem.endsWith("is not unique")));
  });

  it("refuses a gate without checks, with an unknown place to run, or a bad kind", () => {
    const report = sampleReport();
    report.gates[0].checks = [];
    report.gates[0].runs = ["nightly"];
    report.gates[0].tool.kind = "script";
    assert.deepEqual(reportProblems(report), [
      "gates[0].checks names no rule",
      "gates[0].tool needs a name and kind existing or custom",
      "gates[0].runs must list agent-edit, agent-commit, commit, ci",
    ]);
  });

  it("refuses a group total that is not info, so its errors are not counted twice", () => {
    const report = sampleReport();
    const total = { ...sampleReport().findings[0], id: "tiers/role-aliases-palette@project#total", location: { file: "." }, title: "12 roles alias a role" };
    report.findings.push(total);
    assert.deepEqual(reportProblems(report), ["findings[2] is a group total (tiers/role-aliases-palette@project#total), so its severity is info, not error"]);
    total.severity = "info";
    assert.deepEqual(reportProblems(report), []);
  });

  it("keeps a whole-project finding at its own severity", () => {
    const report = sampleReport();
    report.findings.push({ ...sampleReport().findings[1], id: "docs/rules-document-exists@project#", ruleId: "docs/rules-document-exists", severity: "error", location: { file: "." } });
    assert.deepEqual(reportProblems(report), []);
  });

  it("refuses a cited source that sources does not list", () => {
    const report = sampleReport();
    report.sources = report.sources.filter((source) => !source.url.endsWith("/faq/"));
    assert.deepEqual(reportProblems(report), ["sources does not list https://www.designtokens.org/faq/, which a finding cites"]);
  });

  it("accepts previousIds and dirty, and refuses malformed ones", () => {
    const report = sampleReport();
    report.project.dirty = true;
    report.findings[0].previousIds = ["tiers/role-aliases-palette@DESIGN.md#colors"];
    assert.deepEqual(reportProblems(report), []);
    report.project.dirty = "yes";
    report.findings[0].previousIds = ["colors"];
    assert.deepEqual(reportProblems(report), ["project.dirty must be true or false", "findings[0].previousIds must list earlier finding ids (<ruleId>@<file>#<pointer>)"]);
  });

  it("refuses what is not a report at all", () => {
    assert.deepEqual(reportProblems(null), ["the report is not a JSON object"]);
    assert.ok(reportProblems({}).length > 5);
  });
});

describe("reportWarnings", () => {
  it("warns about a summary of more than one sentence, without refusing the report", () => {
    const report = sampleReport();
    report.parts[1].summary = "One role aliases another role. The palette also has aliases.";
    assert.deepEqual(reportWarnings(report), ["parts.tiers.summary has more than one sentence; keep one, and move the detail into findings"]);
    assert.deepEqual(reportProblems(report), []);
  });

  it("warns about a listed package whose latest version was not checked", () => {
    const report = sampleReport();
    report.stack.versions.eslint = { installed: "9.39.4" };
    assert.deepEqual(reportWarnings(report), ["stack.versions.eslint has no latest; check it in the registry (references/sources.md), or leave the package out"]);
  });

  it("stays quiet for one sentence, even with inner punctuation", () => {
    const report = sampleReport();
    report.parts[0].summary = "Roles use purpose names in kebab-case (surface, on-surface), and ids map to classes.";
    assert.deepEqual(reportWarnings(report), []);
  });
});

describe("renderReport", () => {
  const markdown = renderReport(sampleReport());

  it("writes every section, the parts in rubric order", () => {
    const sections = markdown.split("\n").filter((line) => line.startsWith("## "));
    assert.deepEqual(sections, ["## Summary", "## Findings", "## Recommended gates", "## Versions", "## Sources"]);
    assert.ok(markdown.indexOf("| naming |") < markdown.indexOf("| tiers |"));
    assert.match(markdown, /Findings: 1 error, 1 warning, 0 info\./);
  });

  it("lists each finding with its id, evidence and fix", () => {
    assert.match(markdown, /#### error: color\.surface-overlay aliases a role/);
    assert.match(markdown, /- Id: `tiers\/role-aliases-palette@tokens\/themes\/dark\.tokens\.json#color\.surface-overlay`/);
    assert.match(markdown, /- Evidence: `tokens\/themes\/dark\.tokens\.json:41`/);
    assert.match(markdown, /- Fix: Point it at the palette entry/);
  });

  it("shows a dirty tree and a finding's previous id", () => {
    const report = sampleReport();
    report.project.dirty = true;
    report.findings[0].previousIds = ["tiers/role-aliases-palette@DESIGN.md#colors"];
    const rendered = renderReport(report);
    assert.match(rendered, /- Project: fixture-app \(`abc1234`\), with uncommitted changes/);
    assert.match(rendered, /- Previously: `tiers\/role-aliases-palette@DESIGN\.md#colors`/);
  });

  it("names the profile the gates target when none was detected, and refuses one beside a detected profile", () => {
    const report = sampleReport();
    report.stack.profile = null;
    report.stack.targetProfile = "terrazzo-tailwind-v4";
    assert.deepEqual(reportProblems(report), []);
    assert.match(renderReport(report), /- Profile: none detected; the recommended gates target terrazzo-tailwind-v4/);
    delete report.stack.targetProfile;
    assert.match(renderReport(report), /- Profile: none \(core rules only\)/);
    const both = sampleReport();
    both.stack.targetProfile = "terrazzo-tailwind-v4";
    const unknown = sampleReport();
    unknown.stack.profile = null;
    unknown.stack.targetProfile = "shadcn";
    for (const bad of [both, unknown]) assert.match(reportProblems(bad)[0], /^stack\.targetProfile is "(terrazzo-tailwind-v4|shadcn)": it names one of terrazzo-tailwind-v4, and only when stack\.profile is null$/);
  });

  it("escapes a pipe inside a table cell", () => {
    const report = sampleReport();
    report.parts[0].summary = "a | b";
    assert.match(renderReport(report), /\| naming \| met \| a \\\| b \|/);
  });

  it("credits the author, not a tool vendor", () => {
    assert.match(markdown, /Audited with Agent-Ready Design System 0\.1\.0, by \[Abas Turabli\]\(https:\/\/abasturabli\.com\)\./);
  });

  it("still reads a report from design-tokens 0.1–0.5, and refuses another tool's", () => {
    const old = sampleReport();
    old.tool.name = "design-tokens";
    assert.deepEqual(reportProblems(old), []);
    assert.match(renderReport(old), /Audited with design-tokens 0\.1\.0, by /);
    old.tool.name = "other-tool";
    assert.ok(reportProblems(old).includes('tool needs name "design-system" and a version'));
  });
});

describe("finding status", () => {
  it("needs a reason for an accepted or out-of-scope finding, and a known status", () => {
    const report = sampleReport();
    report.findings[0].status = "accepted";
    report.findings[1].status = "ignored";
    assert.deepEqual(reportProblems(report), [
      "findings[0] is accepted, so it needs statusReason: the suppression's or the exemption's reason",
      'findings[1].status is "ignored", expected one of open, accepted, out-of-scope',
    ]);
  });

  it("counts accepted findings, leaves out-of-scope ones out of the count, and shows each status and the baseline", () => {
    const report = sampleReport();
    report.baseline = "2026-09-26T100000Z.json";
    report.findings[0] = { ...report.findings[0], status: "accepted", statusReason: "Brand green, redesign in Q1" };
    report.findings[1] = { ...report.findings[1], status: "out-of-scope", statusReason: "Email HTML" };
    assert.deepEqual(reportProblems(report), []);
    const markdown = renderReport(report);
    assert.match(markdown, /- Baseline: `2026-09-26T100000Z\.json`/);
    assert.match(markdown, /Findings: 1 error, 0 warning, 0 info \(1 of them accepted; 1 out of scope, not counted\)\./);
    assert.match(markdown, /- Status: accepted: Brand green, redesign in Q1/);
    assert.match(markdown, /- Status: out-of-scope: Email HTML/);
  });
});

describe("versions: a latest release that cannot be installed yet", () => {
  const eslint = { installed: "9.39.1", latest: "10.12.0", peers: [{ package: "eslint-plugin-react", version: "7.37.5", range: "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7" }, { package: "eslint-config-next", version: "16.4.0", range: ">=9.0.0" }] };

  it("names each installed package whose peer range leaves the latest out", () => {
    assert.deepEqual(blockers(eslint).map((peer) => peer.package), ["eslint-plugin-react"]);
    assert.deepEqual(blockers({ ...eslint, latest: "9.40.0" }), []);
    assert.deepEqual(blockers({ installed: "9.39.1" }), []);
  });

  it("says so in the versions table", () => {
    const report = sampleReport();
    report.stack.versions.eslint = eslint;
    assert.match(renderReport(report), /\| eslint \| 9\.39\.1 \| 10\.12\.0, blocked: eslint-plugin-react 7\.37\.5 allows `\^3 \\\|\\\| \^4/);
  });
});

describe("gates: a check runs somewhere, a state runs nowhere", () => {
  it("renders a state with no runs, and refuses runs on a state or none on a check", () => {
    const report = sampleReport();
    report.gates.push({ id: "gate/theme-palette-reset", kind: "state", does: "The theme resets Tailwind's default palette", checks: ["tiers/no-primitive-in-code"], tool: { name: "the theme template, held by the build", kind: "existing" }, status: "present" });
    assert.deepEqual(reportProblems(report), []);
    assert.match(renderReport(report), /`gate\/theme-palette-reset` .* \| a state, held by the tool \| present \|/);
    report.gates[1].runs = ["ci"];
    delete report.gates[0].runs;
    assert.deepEqual(reportProblems(report), ["gates[0].runs must list agent-edit, agent-commit, commit, ci", "gates[1] is a state, which runs nowhere; leave runs out and name what holds it in tool"]);
  });
});

describe("tokenSettings", () => {
  it("warns about a key that is not a gates.json setting", () => {
    const report = sampleReport();
    report.stack.tokenSettings = { roles: "color", resolverPath: "tokens/x.json" };
    assert.deepEqual(reportWarnings(report).filter((warning) => warning.includes("tokenSettings")), [`stack.tokenSettings.resolverPath is not a setting of design-system/gates.json tokens (${Object.keys(TOKEN_DEFAULTS).join(", ")}); use the setting's own name, so harness can copy it as it is`]);
  });
});
