#!/usr/bin/env node
// Checks a fix batch against the report's fix order, and prints it in that
// order: every finding after the findings it requires.
//
//   node plan-batch.mjs <report.json> <finding-id…>
//
// A finding's `requires` names the findings whose fix must land first, because
// its own fix breaks the project while they are open (references/report.md,
// Fix order). Every finding in the report is open, so a batch is refused when
// it holds a finding whose prerequisite is neither in the batch nor closed.
// Exit 1 with the missing prerequisites, 2 on a usage error or an invalid
// report. No dependencies, Node 20 or later.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { reportProblems } from "./render-report.mjs";

/**
 * The batch in fix order, or why it cannot be fixed yet. Assumes a report that passed `reportProblems`, so every
 * `requires` names a finding of the report and none forms a cycle.
 * @param {{ findings: { id: string, requires?: string[] }[] }} report
 * @param {string[]} ids
 * @returns {{ order: string[] } | { unknown: string[] } | { blocked: { id: string, requires: string[] }[] }}
 */
export function planBatch(report, ids) {
  const byId = new Map(report.findings.map((finding) => [finding.id, finding]));
  const batch = [...new Set(ids)];
  const unknown = batch.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { unknown };
  const inBatch = new Set(batch);
  const blocked = batch
    .map((id) => ({ id, requires: (byId.get(id).requires ?? []).filter((required) => !inBatch.has(required)) }))
    .filter((entry) => entry.requires.length > 0);
  if (blocked.length > 0) return { blocked };
  const order = [];
  const placed = new Set();
  const place = (id) => {
    if (placed.has(id)) return;
    placed.add(id);
    for (const required of byId.get(id).requires ?? []) place(required);
    order.push(id);
  };
  for (const id of batch) place(id);
  return { order };
}

function main(argv) {
  const [path, ...ids] = argv;
  if (!path || ids.length === 0) {
    console.error("usage: plan-batch.mjs <report.json> <finding-id…>");
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Cannot read ${path} as JSON: ${error.message}`);
    return 2;
  }
  const problems = reportProblems(report);
  if (problems.length > 0) {
    console.error(`${path} is not a complete report:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    return 2;
  }
  const plan = planBatch(report, ids);
  if ("unknown" in plan) {
    console.error(`Not findings of ${path}:\n${plan.unknown.map((id) => `  - ${id}`).join("\n")}`);
    return 2;
  }
  if ("blocked" in plan) {
    console.error("The batch cannot be fixed yet: these findings require others that are still open. Close those first, or add them to the batch.");
    for (const { id, requires } of plan.blocked) console.error(`  - ${id}\n    requires ${requires.join(", ")}`);
    return 1;
  }
  console.log("Fix order:");
  plan.order.forEach((id, index) => console.log(`  ${index + 1}. ${id}`));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
