// Known problems a project has not fixed yet, so a gate can block new ones
// while the old ones are worked off: the ratchet. It follows ESLint's bulk
// suppressions (https://eslint.org/docs/latest/use/suppressions), so a project
// learns one model for its lint and its token checks:
//
// - `--suppress-all` records every current problem in
//   design-system/suppressions.json, with a reason to fill in;
// - a suppressed problem no longer fails the check, a new one does;
// - a suppressed problem that no longer occurs fails the check until
//   `--prune-suppressions` removes it, so the file only shrinks.
//
// A problem is recorded by a key that holds its rule, its context and its
// subject, and no value: `tiers/contrast-pairs@light:components.button-whatsapp`
// stays the same while the ratio moves. No dependencies.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SUPPRESSIONS_FILE = "design-system/suppressions.json";

/** Rules whose problems have no single subject: the whole message is the key. */
const WHOLE_MESSAGE = new Set(["format/dtcg-valid"]);

/**
 * The key a problem is suppressed by: `<rule>@[<context>:]<subject>`, the subject being the first word after the
 * rule and the context (a token id, a component, a file). Undefined for a problem with no rubric rule (`config:`),
 * which is never suppressed.
 * @param {string} problem a check's problem line, `<rule>: [<context>: ]<subject> …`
 * @param {string[]} contexts the context names the check resolved
 */
export function problemKey(problem, contexts = []) {
  const match = /^([a-z]+\/[a-z0-9-]+): ([\s\S]*)$/.exec(problem);
  if (!match) return undefined;
  const [, rule, rest] = match;
  let text = rest;
  let context = "";
  const head = /^([^\s:]+): /.exec(text);
  if (head && contexts.includes(head[1])) {
    context = head[1];
    text = text.slice(head[0].length);
  }
  const subject = WHOLE_MESSAGE.has(rule) ? text : text.split(/\s/)[0].replace(/[:;,.]+$/, "");
  return `${rule}@${context ? `${context}:` : ""}${subject}`;
}

/**
 * The project's suppressions, key → reason; `problems` names a file that cannot be read.
 * @returns {{ entries: Record<string, string>, problems: string[] }}
 */
export function readSuppressions(root = process.cwd()) {
  const path = join(root, SUPPRESSIONS_FILE);
  if (!existsSync(path)) return { entries: {}, problems: [] };
  try {
    const entries = JSON.parse(readFileSync(path, "utf8")).suppressions ?? {};
    if (typeof entries !== "object" || Array.isArray(entries) || Object.values(entries).some((reason) => typeof reason !== "string")) throw new Error("suppressions must map each key to its reason");
    return { entries, problems: [] };
  } catch (error) {
    return { entries: {}, problems: [`config: ${SUPPRESSIONS_FILE} cannot be read: ${error.message}`] };
  }
}

/** Writes the suppressions, sorted, so a change shows as a small diff. */
export function writeSuppressions(root, entries) {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(root, SUPPRESSIONS_FILE), `${JSON.stringify({ $comment: "Known problems the gates do not fail on yet, each with its reason. Written by --suppress-all, shrunk by --prune-suppressions (references/conventions.md, Suppressions).", suppressions: sorted }, null, 2)}\n`);
}

/**
 * The problems split by the suppressions: `open` fail the check, `suppressed` do not, and `stale` are suppressions of
 * this check's rules that no longer occur, which fail it until pruned.
 * @param {string[]} problems
 * @param {{ contexts: string[], entries: Record<string, string>, rules: string[] }} options `rules`: the rules this check owns
 */
export function applySuppressions(problems, { contexts, entries, rules }) {
  const open = [];
  const suppressed = [];
  const seen = new Set();
  for (const problem of problems) {
    const key = problemKey(problem, contexts);
    if (key !== undefined) seen.add(key);
    if (key !== undefined && Object.hasOwn(entries, key)) suppressed.push(problem);
    else open.push(problem);
  }
  const stale = Object.keys(entries).filter((key) => rules.includes(key.split("@")[0]) && !seen.has(key));
  return { open, suppressed, stale };
}

/**
 * The suppressions after `--suppress-all` (every current problem of this check recorded, reasons kept, a new one
 * with an empty reason to fill in) or `--prune-suppressions` (this check's stale ones removed).
 */
export function updatedSuppressions(entries, problems, { contexts, rules, suppressAll, prune }) {
  const next = { ...entries };
  const { stale } = applySuppressions(problems, { contexts, entries, rules });
  if (prune) for (const key of stale) delete next[key];
  if (suppressAll) {
    for (const problem of problems) {
      const key = problemKey(problem, contexts);
      if (key !== undefined && !Object.hasOwn(next, key)) next[key] = "";
    }
  }
  return next;
}

/** The suppression flags in `argv`. */
export function suppressionFlags(argv = []) {
  return { suppressAll: argv.includes("--suppress-all"), prune: argv.includes("--prune-suppressions") };
}

/**
 * What fails a check once the suppressions are applied, and what to tell the person: `--suppress-all` or
 * `--prune-suppressions` in `argv` update the file first. The one place both checks run their problems through.
 * @param {string} root
 * @param {string[]} argv
 * @param {string[]} problems every problem the check found
 * @param {{ contexts: string[], rules: string[] }} options `rules`: the rules this check owns
 * @returns {{ failing: string[], suppressed: string[], notes: string[] }}
 */
export function gateProblems(root, argv, problems, { contexts, rules }) {
  const { entries, problems: unreadable } = readSuppressions(root);
  const flags = suppressionFlags(argv);
  const notes = [];
  let current = entries;
  if (unreadable.length === 0 && (flags.suppressAll || flags.prune)) {
    current = updatedSuppressions(entries, problems, { contexts, rules, ...flags });
    writeSuppressions(root, current);
    const added = Object.keys(current).filter((key) => !Object.hasOwn(entries, key)).length;
    const pruned = Object.keys(entries).filter((key) => !Object.hasOwn(current, key)).length;
    notes.push(`${SUPPRESSIONS_FILE}: ${added} added, ${pruned} pruned`);
  }
  const { open, suppressed, stale } = applySuppressions(problems, { contexts, entries: current, rules });
  const unexplained = Object.entries(current).filter(([key, reason]) => rules.includes(key.split("@")[0]) && !reason.trim()).map(([key]) => key);
  if (unexplained.length > 0) notes.push(`${unexplained.length} suppressions in ${SUPPRESSIONS_FILE} have no reason yet: ${unexplained.join(", ")}`);
  const staleProblems = stale.map((key) => `suppressions: ${key} no longer occurs; remove it with --prune-suppressions, so the file only shrinks`);
  return { failing: [...unreadable, ...open, ...staleProblems], suppressed, notes };
}
