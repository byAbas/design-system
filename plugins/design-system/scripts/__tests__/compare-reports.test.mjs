import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { baselinePaths, compareReports, renderComparison } from "../compare-reports.mjs";
import { sampleReport } from "./sampleReport.mjs";

describe("compareReports", () => {
  it("sorts findings into resolved, new and unchanged by id", () => {
    const before = sampleReport();
    const after = sampleReport();
    after.findings = [after.findings[1], { ...after.findings[0], id: "tiers/role-aliases-palette@tokens/themes/light.tokens.json#color.outline" }];
    const comparison = compareReports(before, after);
    assert.deepEqual(comparison.resolved.map((finding) => finding.id), ["tiers/role-aliases-palette@tokens/themes/dark.tokens.json#color.surface-overlay"]);
    assert.deepEqual(comparison.new.map((finding) => finding.id), ["tiers/role-aliases-palette@tokens/themes/light.tokens.json#color.outline"]);
    assert.deepEqual(comparison.unchanged.map((finding) => finding.id), ["docs/rules-hold-no-values@DESIGN.md#colors"]);
  });

  it("treats a finding whose evidence moved as unchanged: the id carries no line", () => {
    const after = sampleReport();
    after.findings[0].evidence[0].line = 99;
    const comparison = compareReports(sampleReport(), after);
    assert.equal(comparison.unchanged.length, 2);
    assert.equal(comparison.new.length + comparison.resolved.length, 0);
  });
});

describe("compareReports: moved findings", () => {
  it("pairs a finding at a new location with the id it names in previousIds", () => {
    const before = sampleReport();
    const after = sampleReport();
    const oldId = before.findings[0].id;
    after.findings[0] = { ...after.findings[0], id: "tiers/role-aliases-palette@tokens/colors.tokens.json#color.surface-overlay", previousIds: [oldId] };
    const comparison = compareReports(before, after);
    assert.deepEqual(comparison.moved.map((finding) => [finding.id, finding.movedFrom]), [["tiers/role-aliases-palette@tokens/colors.tokens.json#color.surface-overlay", oldId]]);
    assert.deepEqual(comparison.resolved, []);
    assert.deepEqual(comparison.new, []);
  });

  it("treats a previousIds that names nothing in the earlier report as new", () => {
    const after = sampleReport();
    after.findings[0] = { ...after.findings[0], id: "tiers/role-aliases-palette@x.json#y", previousIds: ["tiers/role-aliases-palette@nowhere#z"] };
    const comparison = compareReports(sampleReport(), after);
    assert.equal(comparison.new.length, 1);
    assert.equal(comparison.resolved.length, 1);
  });
});

describe("renderComparison", () => {
  it("prints a count and a line per finding for each outcome", () => {
    const after = sampleReport();
    after.findings = [];
    const markdown = renderComparison(compareReports(sampleReport(), after), "before.json", "after.json");
    assert.match(markdown, /## Resolved \(2\)/);
    assert.match(markdown, /## New \(0\)\n\nNone\./);
    assert.match(markdown, /## Moved \(0\)/);
    assert.match(markdown, /- error: `tiers\/role-aliases-palette@/);
  });
});

describe("compareReports: status", () => {
  it("lists a finding that became accepted or out of scope as such, never as resolved", () => {
    const before = sampleReport();
    const after = sampleReport();
    after.findings[0] = { ...after.findings[0], status: "accepted", statusReason: "Known" };
    after.findings[1] = { ...after.findings[1], status: "out-of-scope", statusReason: "Email HTML" };
    const comparison = compareReports(before, after);
    assert.deepEqual(comparison.resolved, []);
    assert.deepEqual(comparison.accepted.map((finding) => finding.id), [before.findings[0].id]);
    assert.deepEqual(comparison.movedOutOfScope.map((finding) => finding.id), [before.findings[1].id]);
    assert.match(renderComparison(comparison, "a", "b"), /## Moved out of scope \(1\)\n\n- warning: `docs\/rules-hold-no-values@DESIGN\.md#colors`: DESIGN\.md holds colours \(out-of-scope: Email HTML\)/);
  });
});

describe("baselinePaths", () => {
  it("pairs the baseline in gates.json with the newest stamped report", () => {
    const root = mkdtempSync(join(tmpdir(), "design-system-baseline-"));
    mkdirSync(join(root, "design-system/audits"), { recursive: true });
    for (const name of ["2026-09-26T100000Z.json", "2026-09-28T090000Z.json", "2026-09-27T120000Z.json", "2026-09-28T090000Z.md"]) writeFileSync(join(root, "design-system/audits", name), "{}");
    try {
      assert.throws(() => baselinePaths(root), /no baseline: set audits\.baseline/);
      writeFileSync(join(root, "design-system/gates.json"), JSON.stringify({ audits: { baseline: "2026-09-26T100000Z.json" } }));
      assert.deepEqual(baselinePaths(root), [join(root, "design-system/audits/2026-09-26T100000Z.json"), join(root, "design-system/audits/2026-09-28T090000Z.json")]);
      writeFileSync(join(root, "design-system/gates.json"), JSON.stringify({ audits: { baseline: "gone.json" } }));
      assert.throws(() => baselinePaths(root), /the baseline design-system\/audits\/gone\.json does not exist/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
