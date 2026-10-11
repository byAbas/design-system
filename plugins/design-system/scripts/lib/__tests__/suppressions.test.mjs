import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { exemptionsOf, isExempt } from "../project-modules.mjs";
import { applySuppressions, gateProblems, problemKey, readSuppressions, SUPPRESSIONS_FILE, updatedSuppressions } from "../suppressions.mjs";

const contexts = ["light", "dark"];
const rules = ["tiers/contrast-pairs", "tiers/components-read-roles"];
const whatsapp = (ratio, context = "light") => `tiers/contrast-pairs: ${context}: components.button-whatsapp: textColor {colors.inverse} (#ffffff) on backgroundColor {colors.action-whatsapp} is ${ratio}:1, below 4.5:1 for text (WCAG 2.1 SC 1.4.3)`;
const card = "tiers/components-read-roles: src/Card.tsx reads colour roles, and no contract key starts with card; add components.card";

describe("problemKey", () => {
  it("holds the rule, the context and the subject, and no value, so it survives a moving ratio", () => {
    assert.equal(problemKey(whatsapp("2.27"), contexts), "tiers/contrast-pairs@light:components.button-whatsapp");
    assert.equal(problemKey(whatsapp("3.10"), contexts), problemKey(whatsapp("2.27"), contexts));
    assert.equal(problemKey(card, contexts), "tiers/components-read-roles@src/Card.tsx");
    assert.equal(problemKey("tiers/derived-rule-recorded: dark: colors.scrim is #111111, but its rule gives #ffffff", contexts), "tiers/derived-rule-recorded@dark:colors.scrim");
  });

  it("reads a word as a context only when the check resolved that context", () => {
    assert.equal(problemKey("tiers/contrast-pairs: components.x: textColor", ["default"]), "tiers/contrast-pairs@components.x");
  });

  it("keys a format problem by its whole message, and never keys a config problem", () => {
    assert.equal(problemKey("format/dtcg-valid: modifier theme declares 1 context", contexts), "format/dtcg-valid@modifier theme declares 1 context");
    assert.equal(problemKey("config: no tokens in the roles group colors", contexts), undefined);
  });
});

describe("applySuppressions", () => {
  const entries = { "tiers/contrast-pairs@light:components.button-whatsapp": "Brand green, redesign in Q1", "tiers/contrast-pairs@dark:components.gone": "Fixed since", "tiers/derived-rule-recorded@dark:colors.scrim": "another check's" };

  it("lets known problems through, fails new ones, and names this check's suppressions that no longer occur", () => {
    const result = applySuppressions([whatsapp("2.27"), whatsapp("2.27", "dark"), card], { contexts, entries, rules });
    assert.deepEqual(result.suppressed, [whatsapp("2.27")]);
    assert.deepEqual(result.open, [whatsapp("2.27", "dark"), card]);
    assert.deepEqual(result.stale, ["tiers/contrast-pairs@dark:components.gone"]);
  });

  it("never fails a config problem silently: it has no key, so it stays open", () => {
    assert.deepEqual(applySuppressions(["config: no tokens"], { contexts, entries, rules }).open, ["config: no tokens"]);
  });
});

describe("updatedSuppressions", () => {
  it("records every current problem with an empty reason and keeps the reasons it had, on --suppress-all", () => {
    const next = updatedSuppressions({ "tiers/contrast-pairs@light:components.button-whatsapp": "Brand green" }, [whatsapp("2.27"), card, "config: x"], { contexts, rules, suppressAll: true, prune: false });
    assert.deepEqual(next, { "tiers/contrast-pairs@light:components.button-whatsapp": "Brand green", "tiers/components-read-roles@src/Card.tsx": "" });
  });

  it("removes only this check's suppressions that no longer occur, on --prune-suppressions", () => {
    const entries = { "tiers/contrast-pairs@light:components.gone": "", "tiers/derived-rule-recorded@dark:colors.scrim": "" };
    assert.deepEqual(updatedSuppressions(entries, [], { contexts, rules, suppressAll: false, prune: true }), { "tiers/derived-rule-recorded@dark:colors.scrim": "" });
  });
});

describe("gateProblems", () => {
  it("suppresses, then fails a fixed problem until it is pruned: the file only shrinks", () => {
    const root = mkdtempSync(join(tmpdir(), "design-system-suppressions-"));
    mkdirSync(join(root, "design-system"));
    try {
      const first = gateProblems(root, ["--suppress-all"], [whatsapp("2.27"), card], { contexts, rules });
      assert.deepEqual(first.failing, []);
      assert.ok(first.notes.some((note) => note.includes("2 added")));
      assert.ok(first.notes.some((note) => note.includes("have no reason yet")));
      assert.deepEqual(Object.keys(readSuppressions(root).entries), ["tiers/components-read-roles@src/Card.tsx", "tiers/contrast-pairs@light:components.button-whatsapp"]);

      const fixed = gateProblems(root, [], [whatsapp("2.27")], { contexts, rules });
      assert.deepEqual(fixed.failing, ["suppressions: tiers/components-read-roles@src/Card.tsx no longer occurs; remove it with --prune-suppressions, so the file only shrinks"]);

      const pruned = gateProblems(root, ["--prune-suppressions"], [whatsapp("2.27")], { contexts, rules });
      assert.deepEqual(pruned.failing, []);
      assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(root, SUPPRESSIONS_FILE), "utf8")).suppressions), ["tiers/contrast-pairs@light:components.button-whatsapp"]);

      const regressed = gateProblems(root, [], [whatsapp("2.27"), whatsapp("1.90", "dark")], { contexts, rules });
      assert.deepEqual(regressed.failing, [whatsapp("1.90", "dark")]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on a suppressions file it cannot read, rather than passing everything", () => {
    const root = mkdtempSync(join(tmpdir(), "design-system-suppressions-"));
    mkdirSync(join(root, "design-system"));
    writeFileSync(join(root, SUPPRESSIONS_FILE), "{ not json");
    try {
      const { failing } = gateProblems(root, [], [whatsapp("2.27")], { contexts, rules });
      assert.match(failing[0], /^config: design-system\/suppressions\.json cannot be read/);
      assert.ok(failing.includes(whatsapp("2.27")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("exemptions", () => {
  it("reads exemptions with a reason, and names a malformed one", () => {
    const { exemptions, problems } = exemptionsOf({ exempt: [{ paths: ["public/flags/**"], reason: "Flag artwork" }, { paths: ["emails/**"], rules: ["tiers/no-literal-in-code"], reason: "Email HTML" }, { paths: ["x/**"] }, { paths: [], reason: "y" }] });
    assert.equal(exemptions.length, 2);
    assert.deepEqual(problems, ["exempt[2] needs paths (globs), a reason, and rules as rubric rule ids when it names any", "exempt[3] needs paths (globs), a reason, and rules as rubric rule ids when it names any"]);
  });

  it("covers a file for every rule, or only for the rules an exemption names", () => {
    const { exemptions } = exemptionsOf({ exempt: [{ paths: ["public/flags/**"], reason: "Flag artwork" }, { paths: ["emails/**"], rules: ["tiers/no-literal-in-code"], reason: "Email HTML" }] });
    assert.equal(isExempt("public/flags/Es.tsx", "tiers/components-read-roles", exemptions), true);
    assert.equal(isExempt("emails/Welcome.tsx", "tiers/no-literal-in-code", exemptions), true);
    assert.equal(isExempt("emails/Welcome.tsx", "tiers/components-read-roles", exemptions), false);
    assert.equal(isExempt("src/Card.tsx", "tiers/components-read-roles", exemptions), false);
  });
});
