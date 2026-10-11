#!/usr/bin/env node
// Renders an audit report (JSON, assets/report.schema.json) to Markdown.
//
//   node render-report.mjs <report.json>            writes <report>.md beside it
//   node render-report.mjs <report.json> --stdout   prints the Markdown instead
//
// The JSON is the source; the Markdown is never written by hand. The report is
// checked first, against the fields the schema requires, and nothing is
// written when a field is missing: an incomplete report never reaches a
// reader. No dependencies, Node 20 or later.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PARTS = ["naming", "tiers", "format", "docs"];
const STATUSES = ["met", "partial", "missing"];
/** The plugin's name in a report, and the name it had before 0.6.0 (design-tokens), which older reports carry. */
const TOOL_NAMES = ["design-system", "design-tokens"];
/** The profiles a report may name (references/profiles). */
const PROFILES = ["terrazzo-tailwind-v4"];
const SEVERITIES = ["error", "warning", "info"];
const RUNS = ["agent-edit", "agent-commit", "commit", "ci"];
const GATE_STATUSES = ["present", "partial", "missing"];
const RULE_ID = /^(naming|tiers|format|docs)\/[a-z0-9-]+$/;
/** A finding's status: open by default, accepted (suppressed), or out of scope (exempt). */
export const STATUSES_OF_FINDINGS = ["open", "accepted", "out-of-scope"];
export const statusOf = (finding) => finding.status ?? "open";

const isText = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Where a report breaks the schema's required shape, as one sentence each; empty when it holds.
 * @param {unknown} report
 * @returns {string[]}
 */
export function reportProblems(report) {
  const problems = [];
  if (!report || typeof report !== "object") return ["the report is not a JSON object"];
  const r = /** @type {Record<string, any>} */ (report);
  if (r.schemaVersion !== "1") problems.push(`schemaVersion is ${JSON.stringify(r.schemaVersion)}, expected "1"`);
  if (!TOOL_NAMES.includes(r.tool?.name) || !isText(r.tool?.version)) problems.push(`tool needs name "${TOOL_NAMES[0]}" and a version`);
  if (!isText(r.project?.name)) problems.push("project.name is missing");
  if (typeof r.project?.root !== "string") problems.push("project.root is missing");
  if (r.project?.dirty !== undefined && typeof r.project.dirty !== "boolean") problems.push("project.dirty must be true or false");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date ?? ""))) problems.push("date is not an ISO date (YYYY-MM-DD)");
  if (r.baseline !== undefined && !isText(r.baseline)) problems.push("baseline must name the baseline report's file");
  if (!r.stack || typeof r.stack !== "object" || !("profile" in r.stack)) problems.push("stack.profile is missing (null when no profile applies)");
  else if (r.stack.targetProfile !== undefined && (r.stack.profile !== null || !PROFILES.includes(r.stack.targetProfile))) problems.push(`stack.targetProfile is ${JSON.stringify(r.stack.targetProfile)}: it names one of ${PROFILES.join(", ")}, and only when stack.profile is null`);

  if (!Array.isArray(r.parts)) problems.push("parts is not a list");
  else {
    for (const id of PARTS) {
      const part = r.parts.find((candidate) => candidate?.id === id);
      if (!part) problems.push(`parts has no entry for ${id}`);
      else {
        if (!STATUSES.includes(part.status)) problems.push(`parts.${id}.status is ${JSON.stringify(part.status)}, expected one of ${STATUSES.join(", ")}`);
        if (!isText(part.summary)) problems.push(`parts.${id}.summary is missing`);
      }
    }
    for (const part of r.parts) if (!PARTS.includes(part?.id)) problems.push(`parts has an unknown part ${JSON.stringify(part?.id)}`);
  }

  if (!Array.isArray(r.findings)) problems.push("findings is not a list");
  else {
    const seen = new Set();
    r.findings.forEach((finding, index) => {
      const at = `findings[${index}]`;
      if (!finding || typeof finding !== "object") return problems.push(`${at} is not an object`);
      if (!RULE_ID.test(String(finding.ruleId))) problems.push(`${at}.ruleId ${JSON.stringify(finding.ruleId)} is not a rubric rule id`);
      else if (finding.part !== finding.ruleId.split("/")[0]) problems.push(`${at}.part is ${JSON.stringify(finding.part)}, but its rule belongs to ${finding.ruleId.split("/")[0]}`);
      if (!isText(finding.id) || !finding.id.startsWith(`${finding.ruleId}@`) || !finding.id.includes("#")) problems.push(`${at}.id must be <ruleId>@<file>#<pointer>`);
      else if (seen.has(finding.id)) problems.push(`${at}.id ${finding.id} is not unique`);
      else seen.add(finding.id);
      if (!SEVERITIES.includes(finding.severity)) problems.push(`${at}.severity is ${JSON.stringify(finding.severity)}, expected one of ${SEVERITIES.join(", ")}`);
      // A group's count repeats the per-file findings; any severity but info would count their errors twice.
      if (isText(finding.id) && finding.id.endsWith("@project#total") && finding.severity !== "info") problems.push(`${at} is a group total (${finding.id}), so its severity is info, not ${finding.severity}`);
      for (const field of ["title", "why", "fix"]) if (!isText(finding[field])) problems.push(`${at}.${field} is missing`);
      if (typeof finding.location?.file !== "string") problems.push(`${at}.location.file is missing`);
      if (finding.status !== undefined && !STATUSES_OF_FINDINGS.includes(finding.status)) problems.push(`${at}.status is ${JSON.stringify(finding.status)}, expected one of ${STATUSES_OF_FINDINGS.join(", ")}`);
      else if (statusOf(finding) !== "open" && !isText(finding.statusReason)) problems.push(`${at} is ${finding.status}, so it needs statusReason: the suppression's or the exemption's reason`);
      if (finding.previousIds !== undefined && (!Array.isArray(finding.previousIds) || finding.previousIds.some((id) => !isText(id) || !id.includes("@") || !id.includes("#")))) problems.push(`${at}.previousIds must list earlier finding ids (<ruleId>@<file>#<pointer>)`);
    });
    problems.push(...requiresProblems(r.findings));
  }

  if (!Array.isArray(r.gates)) problems.push("gates is not a list");
  else {
    r.gates.forEach((gate, index) => {
      const at = `gates[${index}]`;
      if (!/^gate\/[a-z0-9-]+$/.test(String(gate?.id))) problems.push(`${at}.id must be gate/<name>`);
      if (!isText(gate?.does)) problems.push(`${at}.does is missing`);
      if (!Array.isArray(gate?.checks) || gate.checks.length === 0) problems.push(`${at}.checks names no rule`);
      else for (const rule of gate.checks) if (!RULE_ID.test(String(rule))) problems.push(`${at}.checks has ${JSON.stringify(rule)}, not a rubric rule id`);
      if (!isText(gate?.tool?.name) || !["existing", "custom"].includes(gate?.tool?.kind)) problems.push(`${at}.tool needs a name and kind existing or custom`);
      if (!Array.isArray(gate?.runs) || gate.runs.length === 0 || gate.runs.some((run) => !RUNS.includes(run))) problems.push(`${at}.runs must list ${RUNS.join(", ")}`);
      if (!GATE_STATUSES.includes(gate?.status)) problems.push(`${at}.status is ${JSON.stringify(gate?.status)}, expected one of ${GATE_STATUSES.join(", ")}`);
    });
  }

  if (!Array.isArray(r.sources)) problems.push("sources is not a list");
  else {
    r.sources.forEach((source, index) => {
      if (!isText(source?.title) || !isText(source?.url)) problems.push(`sources[${index}] needs a title and a url`);
    });
    // Every URL a finding cites is a document the audit relied on, so it is listed in sources.
    const listed = new Set(r.sources.map((source) => source?.url));
    const cited = new Set((Array.isArray(r.findings) ? r.findings : []).map((finding) => finding?.source).filter((source) => /^https?:\/\//.test(String(source))));
    for (const url of cited) if (!listed.has(url)) problems.push(`sources does not list ${url}, which a finding cites`);
  }
  return problems;
}

/**
 * Where the findings' `requires` break the fix order: a prerequisite that is not a finding of this report, a finding
 * that requires itself, or a cycle, which no order can satisfy (references/report.md, Fix order).
 * @param {any[]} findings
 * @returns {string[]}
 */
export function requiresProblems(findings) {
  const problems = [];
  const byId = new Map(findings.filter((finding) => isText(finding?.id)).map((finding) => [finding.id, finding]));
  findings.forEach((finding, index) => {
    if (finding?.requires === undefined) return;
    const at = `findings[${index}].requires`;
    if (!Array.isArray(finding.requires)) return problems.push(`${at} must list finding ids of this report`);
    for (const id of finding.requires) {
      if (id === finding.id) problems.push(`${at} names the finding itself`);
      else if (!byId.has(id)) problems.push(`${at} names ${JSON.stringify(id)}, which is not a finding of this report`);
    }
  });
  if (problems.length > 0) return problems;
  // Depth-first: a finding met again while its own prerequisites are being walked closes a cycle.
  const state = new Map();
  const walk = (id, path) => {
    if (state.get(id) === "done") return undefined;
    if (state.get(id) === "walking") return [...path.slice(path.indexOf(id)), id];
    state.set(id, "walking");
    for (const next of byId.get(id)?.requires ?? []) {
      const cycle = walk(next, [...path, id]);
      if (cycle) return cycle;
    }
    state.set(id, "done");
    return undefined;
  };
  for (const id of byId.keys()) {
    const cycle = walk(id, []);
    if (cycle) return [`findings require each other in a cycle, so no order can fix them: ${cycle.join(" → ")}`];
  }
  return problems;
}

/**
 * What a reader should know but that does not make the report incomplete: a part summary of more than one sentence,
 * which makes the summary table hard to read (references/report.md). A warning, not a failure: a sentence count is
 * a heuristic, and a threshold that refuses a report would be one chosen by eye.
 * @param {Record<string, any>} report a report that passed `reportProblems`
 * @returns {string[]}
 */
export function reportWarnings(report) {
  const sentences = report.parts
    .filter((part) => (part.summary.match(/[.!?]\s+(?=[A-Z`])/g) ?? []).length > 0)
    .map((part) => `parts.${part.id}.summary has more than one sentence; keep one, and move the detail into findings`);
  const unchecked = Object.entries(report.stack?.versions ?? {})
    .filter(([, version]) => !version?.latest)
    .map(([name]) => `stack.versions.${name} has no latest; check it in the registry (references/sources.md), or leave the package out`);
  return [...sentences, ...unchecked];
}

const SEVERITY_ORDER = Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index]));
const cell = (text) => String(text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const code = (text) => `\`${String(text).replaceAll("`", "'")}\``;

/**
 * The report as Markdown. Call `reportProblems` first: this assumes a valid report.
 * @param {Record<string, any>} report
 * @returns {string}
 */
export function renderReport(report) {
  const lines = [];
  const { project, tool, stack } = report;
  lines.push("# Design Token Architecture Audit", "");
  lines.push(`- Project: ${project.name}${project.commit ? ` (${code(project.commit)})` : ""}${project.dirty ? ", with uncommitted changes" : ""}`);
  lines.push(`- Date: ${report.date}`);
  if (report.baseline) lines.push(`- Baseline: ${code(report.baseline)}`);
  lines.push(`- Profile: ${stack.profile ?? (stack.targetProfile ? `none detected; the recommended gates target ${stack.targetProfile}` : "none (core rules only)")}`);
  if (stack.tokenFormat) lines.push(`- Token format: ${stack.tokenFormat}`);
  if (stack.rulesDocument) lines.push(`- Rules document: ${code(stack.rulesDocument)}`);
  lines.push("");

  lines.push("## Summary", "", "| Part | Status | Summary |", "|---|---|---|");
  for (const id of PARTS) {
    const part = report.parts.find((candidate) => candidate.id === id);
    lines.push(`| ${id} | ${part.status} | ${cell(part.summary)} |`);
  }
  // Out-of-scope findings are recorded, not counted: an exemption says the rubric does not apply there.
  const inScope = report.findings.filter((finding) => statusOf(finding) !== "out-of-scope");
  const counts = SEVERITIES.map((severity) => `${inScope.filter((finding) => finding.severity === severity).length} ${severity}`);
  const accepted = inScope.filter((finding) => statusOf(finding) === "accepted").length;
  const outOfScope = report.findings.length - inScope.length;
  const aside = [accepted > 0 ? `${accepted} of them accepted` : "", outOfScope > 0 ? `${outOfScope} out of scope, not counted` : ""].filter(Boolean).join("; ");
  lines.push("", `Findings: ${counts.join(", ")}${aside ? ` (${aside})` : ""}.`, "");

  lines.push("## Findings", "");
  if (report.findings.length === 0) lines.push("None.", "");
  for (const id of PARTS) {
    const findings = report.findings
      .filter((finding) => finding.part === id)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id));
    if (findings.length === 0) continue;
    lines.push(`### ${id}`, "");
    for (const finding of findings) {
      lines.push(`#### ${finding.severity}: ${finding.title}`, "");
      if (statusOf(finding) !== "open") lines.push(`- Status: ${finding.status}: ${finding.statusReason}`);
      lines.push(`- Rule: ${code(finding.ruleId)}`);
      lines.push(`- Id: ${code(finding.id)}`);
      if (finding.previousIds?.length) lines.push(`- Previously: ${finding.previousIds.map(code).join(", ")}`);
      if (finding.requires?.length) lines.push(`- Requires, closed first: ${finding.requires.map(code).join(", ")}`);
      lines.push(`- Location: ${code(finding.location.file)}${finding.location.pointer ? ` at ${code(finding.location.pointer)}` : ""}`);
      for (const evidence of finding.evidence ?? []) {
        const where = `${evidence.file}${evidence.line ? `:${evidence.line}` : ""}`;
        lines.push(`- Evidence: ${code(where)}${evidence.excerpt ? ` ${code(evidence.excerpt)}` : ""}`);
      }
      lines.push(`- Why: ${finding.why}${finding.source ? ` (${finding.source})` : ""}`);
      lines.push(`- Fix: ${finding.fix}`, "");
    }
  }

  lines.push("## Recommended gates", "");
  if (report.gates.length === 0) lines.push("None.", "");
  else {
    lines.push("| Gate | Does | Checks | Tool | Runs in | Status |", "|---|---|---|---|---|---|");
    for (const gate of report.gates) {
      const tool = `${gate.tool.name} (${gate.tool.kind}${gate.tool.basis ? `, from ${gate.tool.basis}` : ""})`;
      lines.push(`| ${code(gate.id)} | ${cell(gate.does)} | ${gate.checks.map(code).join(", ")} | ${cell(tool)} | ${gate.runs.join(", ")} | ${gate.status} |`);
    }
    lines.push("");
  }

  const versions = Object.entries(stack.versions ?? {});
  if (versions.length > 0) {
    lines.push("## Versions", "", "| Package | Installed | Latest stable |", "|---|---|---|");
    for (const [name, version] of versions) lines.push(`| ${name} | ${version.installed ?? "not installed"} | ${version.latest ?? "not checked"} |`);
    lines.push("");
  }

  if (report.sources.length > 0) {
    lines.push("## Sources", "");
    for (const source of report.sources) lines.push(`- ${source.title}${source.version ? ` (${source.version})` : ""}: ${source.url}`);
    lines.push("");
  }

  lines.push("---", "", `Audited with ${tool.name === TOOL_NAMES[0] ? "Agent-Ready Design System" : tool.name} ${tool.version}, by [Abas Turabli](https://abasturabli.com).`, "");
  return lines.join("\n");
}

function main(argv) {
  const [path, ...flags] = argv;
  if (!path) {
    console.error("usage: render-report.mjs <report.json> [--stdout]");
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Cannot read ${path} as JSON: ${error.message}`);
    return 1;
  }
  const problems = reportProblems(report);
  if (problems.length > 0) {
    console.error(`${path} is not a complete report:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    return 1;
  }
  for (const warning of reportWarnings(report)) console.error(`warning: ${warning}`);
  const markdown = renderReport(report);
  if (flags.includes("--stdout")) process.stdout.write(markdown);
  else {
    const out = path.replace(/\.json$/, "") + ".md";
    writeFileSync(out, markdown);
    console.log(`wrote ${out}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
