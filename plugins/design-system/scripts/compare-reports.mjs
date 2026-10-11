#!/usr/bin/env node
// Compares two audit reports by finding id: what a fix resolved, what is new,
// what moved, what is unchanged. A finding that moved to a new location names
// its earlier id in `previousIds`, so it is not counted as resolved and new.
// A finding still there but now accepted (suppressed) or out of scope (exempt)
// is listed as such, never as resolved: the problem is still in the code.
//
//   node compare-reports.mjs <before.json> <after.json>          Markdown summary
//   node compare-reports.mjs <before.json> <after.json> --json   the same as JSON
//   node compare-reports.mjs --baseline [--json]                 the baseline in design-system/gates.json
//                                                                (audits.baseline) against the newest report
//
// A finding's id carries its rule and place and no line number, so the same
// problem keeps its id from one audit to the next (references/report.md).
// Exits 1 when the after report has a new error finding, so a fix that breaks
// something else does not pass as done. No dependencies, Node 20 or later.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readConfig } from "./lib/project-modules.mjs";
import { reportProblems, statusOf } from "./render-report.mjs";

/**
 * @param {{ findings: { id: string }[] }} before
 * @param {{ findings: { id: string }[] }} after
 */
export function compareReports(before, after) {
  const beforeIds = new Map(before.findings.map((finding) => [finding.id, finding]));
  const afterIds = new Set(after.findings.map((finding) => finding.id));
  const unchanged = [];
  const moved = [];
  const added = [];
  const accepted = [];
  const outOfScope = [];
  const claimed = new Set();
  for (const finding of after.findings) {
    if (beforeIds.has(finding.id)) {
      const was = statusOf(beforeIds.get(finding.id));
      const now = statusOf(finding);
      // A status that changed is a decision about the problem, not a fix of it.
      if (now === "out-of-scope" && was !== "out-of-scope") outOfScope.push(finding);
      else if (now === "accepted" && was === "open") accepted.push(finding);
      else unchanged.push(finding);
      claimed.add(finding.id);
      continue;
    }
    // The same problem at a new location names its earlier id (references/report.md, Moved findings).
    const earlier = (finding.previousIds ?? []).find((id) => beforeIds.has(id) && !afterIds.has(id));
    if (earlier) {
      moved.push({ ...finding, movedFrom: earlier });
      claimed.add(earlier);
    } else added.push(finding);
  }
  return {
    resolved: before.findings.filter((finding) => !claimed.has(finding.id)),
    new: added,
    moved,
    movedOutOfScope: outOfScope,
    accepted,
    unchanged,
  };
}

/** The comparison as Markdown, one list per outcome. */
export function renderComparison(comparison, beforeName, afterName) {
  const lines = [`# Audit comparison`, "", `- Before: ${beforeName}`, `- After: ${afterName}`, ""];
  for (const [title, findings] of [["Resolved", comparison.resolved], ["New", comparison.new], ["Moved", comparison.moved], ["Moved out of scope", comparison.movedOutOfScope], ["Accepted", comparison.accepted], ["Unchanged", comparison.unchanged]]) {
    lines.push(`## ${title} (${findings.length})`, "");
    if (findings.length === 0) lines.push("None.");
    for (const finding of findings) lines.push(`- ${finding.severity}: \`${finding.id}\`${finding.movedFrom ? ` (was \`${finding.movedFrom}\`)` : ""}: ${finding.title}${statusOf(finding) !== "open" ? ` (${finding.status}: ${finding.statusReason})` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

function readReport(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const problems = reportProblems(report);
  if (problems.length > 0) throw new Error(`${path} is not a complete report:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  return report;
}

/**
 * The baseline report and the newest report of the project at `root`: `audits.baseline` in design-system/gates.json,
 * and the last stamped report by name in design-system/audits (references/report.md, Files). Throws when either is
 * missing.
 */
export function baselinePaths(root = process.cwd()) {
  const baseline = readConfig(root).config.audits?.baseline;
  const dir = join(root, "design-system/audits");
  if (typeof baseline !== "string" || !baseline) throw new Error("no baseline: set audits.baseline in design-system/gates.json to a report in design-system/audits");
  if (!existsSync(join(dir, baseline))) throw new Error(`the baseline design-system/audits/${baseline} does not exist`);
  const newest = readdirSync(dir).filter((file) => /^\d{4}-\d{2}-\d{2}T\d{6}Z\.json$/.test(file)).sort().at(-1);
  return [join(dir, baseline), join(dir, newest ?? baseline)];
}

function main(argv) {
  let [beforePath, afterPath] = argv.filter((arg) => !arg.startsWith("--"));
  if (argv.includes("--baseline")) {
    try {
      [beforePath, afterPath] = baselinePaths();
    } catch (error) {
      console.error(error.message);
      return 2;
    }
  }
  if (!beforePath || !afterPath) {
    console.error("usage: compare-reports.mjs <before.json> <after.json> [--json], or compare-reports.mjs --baseline [--json]");
    return 2;
  }
  let comparison;
  try {
    comparison = compareReports(readReport(beforePath), readReport(afterPath));
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (argv.includes("--json")) process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
  else process.stdout.write(renderComparison(comparison, beforePath, afterPath));
  return comparison.new.some((finding) => finding.severity === "error" && statusOf(finding) === "open") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
