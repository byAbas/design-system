import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { countRawColors, frontMatterKeys, harnessLayoutOf, isRulesDocumentCandidate, listFiles, lockfileVersionOf, scanProject } from "../scan.mjs";
import { writeProjectFixture } from "./projectFixture.mjs";

describe("countRawColors", () => {
  it("counts hex values and colour functions with a literal channel", () => {
    assert.equal(countRawColors('a = "#fff"; b = "#1a2b3c80"; c = "rgb(1, 2, 3)"; d = "oklch(0.5 0.1 200)"'), 4);
  });

  it("ignores ids, entities, and colour functions built from variables", () => {
    assert.equal(countRawColors('const id = "#main-nav"; const e = "&#123;"; const c = `rgb(${r}, ${g}, ${b})`; x = "#abcdefg"'), 0);
  });
});

describe("frontMatterKeys", () => {
  it("lists the top-level keys, not nested ones", () => {
    assert.deepEqual(frontMatterKeys("---\nname: A\ncomponents:\n  card:\n    backgroundColor: x\n---\nbody"), ["name", "components"]);
  });

  it("is null without a closed front matter", () => {
    assert.equal(frontMatterKeys("# Title\n"), null);
    assert.equal(frontMatterKeys("---\nname: A\n"), null);
  });
});

describe("isRulesDocumentCandidate", () => {
  it("accepts names that suggest a design rules document", () => {
    for (const file of ["DESIGN.md", "docs/design-system.md", "design-tokens.mdx", "src/StyleGuide.mdx", "stories/tokens.mdx", "docs/ui/design-principles.md"]) assert.ok(isRulesDocumentCandidate(file), file);
  });

  it("refuses other documents and files that are not Markdown", () => {
    for (const file of ["README.md", "docs/getting-started.md", "design-system.ts", "notes/design.txt", "src/design-review.md", ".agents/skills/x/design-system.md", "public/topics/design-tokens.md"]) assert.ok(!isRulesDocumentCandidate(file), file);
  });
});

describe("scanProject", () => {
  let fixture;
  let scan;
  before(() => {
    fixture = writeProjectFixture();
    scan = scanProject(fixture.root);
  });
  after(() => fixture.cleanup());

  it("never walks node_modules", () => {
    assert.ok(!listFiles(fixture.root).some((file) => file.startsWith("node_modules/")));
  });

  it("reads installed versions from node_modules, not the declared range", () => {
    assert.deepEqual(scan.dependencies.tailwindcss, { declared: "^4.1.0", installed: "4.1.3" });
    assert.equal(scan.dependencies.lodash, undefined);
  });

  it("reports the lock file, its format and the declared package manager", () => {
    assert.equal(scan.packageJson.lockfile, "package-lock.json");
    assert.equal(scan.packageJson.lockfileVersion, "3");
    assert.equal(scan.packageJson.packageManager, null);
    const pinned = writeProjectFixture({ "package.json": JSON.stringify({ name: "pinned", packageManager: "pnpm@10.18.0" }) });
    try {
      assert.equal(scanProject(pinned.root).packageJson.packageManager, "pnpm@10.18.0");
    } finally {
      pinned.cleanup();
    }
  });

  it("reports the Terrazzo + Tailwind v4 profile", () => {
    assert.equal(scan.profile, "terrazzo-tailwind-v4");
  });

  it("finds token files, the resolver and the rules document's keys", () => {
    assert.deepEqual(scan.tokens.dtcgFiles, ["tokens/themes/light.tokens.json"]);
    assert.deepEqual(scan.tokens.resolvers, ["tokens/design.resolver.json"]);
    assert.deepEqual(scan.rulesDocument, { path: "DESIGN.md", frontMatterKeys: ["name", "imports", "colors", "components"] });
  });

  it("lists other files that may be the rules document, with their front matter keys", () => {
    assert.deepEqual(scan.rulesDocumentCandidates, [
      { path: "DESIGN.md", frontMatterKeys: ["name", "imports", "colors", "components"] },
      { path: "docs/design-system.md", frontMatterKeys: ["title"] },
    ]);
  });

  it("counts raw colours in source, skipping tests and generated outputs", () => {
    assert.deepEqual(scan.rawColors, { total: 3, files: 1, top: [{ file: "src/components/Card.tsx", count: 3 }], exempted: [] });
    assert.deepEqual(scan.styles.generated, ["src/styles/theme.generated.css"]);
    assert.equal(scan.styles.tailwindThemeFiles.length, 2);
  });

  it("leaves the files gates.json exempts out of the count, and lists them", () => {
    const exempt = writeProjectFixture({
      "design-system/gates.json": JSON.stringify({ exempt: [{ paths: ["src/flags/**"], reason: "Flag artwork" }] }),
      "src/flags/Es.tsx": 'export const Es = () => <svg fill="#aa151b" />;\n',
    });
    try {
      const { rawColors } = scanProject(exempt.root);
      assert.equal(rawColors.files, 1);
      assert.deepEqual(rawColors.exempted, ["src/flags/Es.tsx"]);
    } finally {
      exempt.cleanup();
    }
  });

  it("keeps agent configuration, static content and earlier audits out", () => {
    assert.ok(!scan.rulesDocumentCandidates.some((candidate) => candidate.path.startsWith(".agents/") || candidate.path.startsWith("public/")));
    assert.deepEqual(scan.gates.gitHooks, [".husky/pre-commit"]);
    assert.ok(!listFiles(fixture.root).some((file) => file.startsWith("design-system/audits/")));
  });

  it("finds the existing gates", () => {
    assert.deepEqual(scan.gates.claudeSettings, [".claude/settings.json"]);
    assert.deepEqual(scan.gates.ciWorkflows, [".github/workflows/ci.yml"]);
    assert.equal(scan.gates.gatesConfig, null);
  });

  it("reports no profile without Terrazzo", () => {
    const plain = writeProjectFixture({ "package.json": JSON.stringify({ name: "plain", dependencies: { tailwindcss: "^4.1.0" } }) });
    try {
      assert.equal(scanProject(plain.root).profile, null);
    } finally {
      plain.cleanup();
    }
  });
});

describe("lockfileVersionOf", () => {
  it("reads each manager's lock file format", () => {
    assert.equal(lockfileVersionOf("package-lock.json", '{"lockfileVersion": 2}'), "2");
    assert.equal(lockfileVersionOf("pnpm-lock.yaml", "lockfileVersion: '9.0'\n\nsettings:\n"), "9.0");
    assert.equal(lockfileVersionOf("yarn.lock", "# THIS IS AN AUTOGENERATED FILE.\n# yarn lockfile v1\n"), "yarn-v1");
    assert.equal(lockfileVersionOf("yarn.lock", '__metadata:\n  version: 8\n  cacheKey: 10c0\n'), "8");
  });

  it("is null for a lock file without a format version, or one it cannot read", () => {
    assert.equal(lockfileVersionOf("bun.lockb", "binary"), null);
    assert.equal(lockfileVersionOf("package-lock.json", "{"), null);
    assert.equal(lockfileVersionOf("package-lock.json", "{}"), null);
  });
});

describe("harnessLayoutOf", () => {
  it("tells the canonical layout from the three older ones, and a project without the plugin's harness", () => {
    assert.equal(harnessLayoutOf(["design-system/harness/run-gates.mjs", "design-system/harness/with-node.sh", ".claude/hooks/design-system/check-on-edit.mjs"]), "canonical");
    assert.equal(harnessLayoutOf(["design-system/harness/run-gates.mjs", "design-system/harness/claude/with-node.sh"]), "legacy-0.7");
    assert.equal(harnessLayoutOf([".claude/hooks/design-system/run-gates.mjs"]), "legacy-0.6");
    assert.equal(harnessLayoutOf([".claude/hooks/design-tokens/run-gates.mjs"]), "legacy-0.5");
    assert.equal(harnessLayoutOf([".claude/hooks/lintEditedFile.mjs", ".githooks/pre-commit"]), null);
  });
});
