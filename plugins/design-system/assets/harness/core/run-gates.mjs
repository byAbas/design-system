#!/usr/bin/env node
// Runs one stage of design-system/gates.json from the command line: the git
// pre-commit hook and CI call it, and so can any agent whose hooks run a
// shell command. An agent's adapter may import STAGES from gates.mjs instead;
// both run the same function, so a person, an agent and CI pass the same gates.
//
//   node design-system/harness/run-gates.mjs before-commit
//   node design-system/harness/run-gates.mjs on-source-edit
//   node design-system/harness/run-gates.mjs check-files <file…>       the checks a changed file gets
//   node design-system/harness/run-gates.mjs check-generated <file…>   fails when a file is a generated output
//   node design-system/harness/run-gates.mjs summary                   what the gates caught since the last summary
//
// Exit 1 with the reason on stderr when the stage fails, 2 on a usage error.
// `summary` only reports: it reads design-system/gate-log.jsonl and exits 0.

import { STAGES, readGates, summarize } from "./gates.mjs";

const [stage, ...files] = process.argv.slice(2);
if (stage === "summary") {
  console.log(summarize(readGates()) ?? "design-system gates: nothing caught since the last summary");
  process.exit(0);
}
if (!Object.hasOwn(STAGES, stage ?? "")) {
  console.error(`usage: run-gates.mjs ${Object.keys(STAGES).join(" | ")} [file…] | summary`);
  process.exit(2);
}
const problem = STAGES[stage](readGates(), files);
if (problem) {
  console.error(problem.trimEnd());
  process.exit(1);
}
console.log(`design-system gates (${stage}): passed`);
