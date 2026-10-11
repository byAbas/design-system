import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planBatch } from "../plan-batch.mjs";
import { renderReport, reportProblems } from "../render-report.mjs";
import { sampleReport } from "./sampleReport.mjs";

/** The sample report with a palette reset that must wait for two files still using default palette classes. */
function reportWithOrder() {
  const report = sampleReport();
  const base = report.findings[0];
  const classes = ["src/Hero.tsx", "src/Card.tsx"].map((file) => ({ ...base, id: `tiers/no-primitive-in-code@${file}#`, ruleId: "tiers/no-primitive-in-code", title: `${file} uses default palette classes`, location: { file } }));
  const reset = { ...base, id: "tiers/no-primitive-in-code@src/app.css#--color-*", ruleId: "tiers/no-primitive-in-code", title: "The default palette is still available", location: { file: "src/app.css", pointer: "--color-*" }, requires: classes.map((finding) => finding.id) };
  report.findings.push(reset, ...classes);
  return report;
}

describe("requires in a report", () => {
  it("accepts prerequisites that are findings of the report, and renders them", () => {
    const report = reportWithOrder();
    assert.deepEqual(reportProblems(report), []);
    assert.match(renderReport(report), /- Requires, closed first: `tiers\/no-primitive-in-code@src\/Hero\.tsx#`, `tiers\/no-primitive-in-code@src\/Card\.tsx#`/);
  });

  it("refuses an unknown prerequisite, a finding that requires itself, and a cycle", () => {
    const unknown = reportWithOrder();
    unknown.findings[2].requires = ["tiers/no-primitive-in-code@src/Gone.tsx#", unknown.findings[2].id];
    assert.deepEqual(reportProblems(unknown), [
      'findings[2].requires names "tiers/no-primitive-in-code@src/Gone.tsx#", which is not a finding of this report',
      "findings[2].requires names the finding itself",
    ]);
    const cycle = reportWithOrder();
    cycle.findings[3].requires = [cycle.findings[2].id];
    assert.deepEqual(reportProblems(cycle), [
      "findings require each other in a cycle, so no order can fix them: tiers/no-primitive-in-code@src/app.css#--color-* → tiers/no-primitive-in-code@src/Hero.tsx# → tiers/no-primitive-in-code@src/app.css#--color-*",
    ]);
  });
});

describe("planBatch", () => {
  const report = reportWithOrder();
  const [reset, hero, card] = report.findings.slice(2).map((finding) => finding.id);

  it("refuses a batch whose prerequisites are still open, naming them", () => {
    assert.deepEqual(planBatch(report, [reset, hero]), { blocked: [{ id: reset, requires: [card] }] });
  });

  it("orders a batch so prerequisites come first", () => {
    assert.deepEqual(planBatch(report, [reset, card, hero]), { order: [hero, card, reset] });
    assert.deepEqual(planBatch(report, [hero, report.findings[1].id]), { order: [hero, report.findings[1].id] });
  });

  it("names ids the report does not have", () => {
    assert.deepEqual(planBatch(report, ["tiers/x@y#"]), { unknown: ["tiers/x@y#"] });
  });
});
