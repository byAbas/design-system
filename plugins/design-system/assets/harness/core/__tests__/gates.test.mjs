import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STAGES, checkFiles, gatesProblems, lintsOf, generatedReason, globToRegExp, isGitCommit, matchesAny, projectPaths } from "../gates.mjs";

describe("globToRegExp", () => {
  it("lets ** span folders, including none", () => {
    assert.ok(matchesAny("tokens/a.json", ["tokens/**/*.json"]));
    assert.ok(matchesAny("tokens/themes/dark.tokens.json", ["tokens/**/*.json"]));
    assert.ok(matchesAny("src/styles/deep/x.css", ["src/**"]));
  });

  it("keeps * and ? inside one folder", () => {
    assert.ok(matchesAny("src/styles/theme.generated.css", ["src/styles/*.generated.css"]));
    assert.ok(!matchesAny("src/styles/old/theme.generated.css", ["src/styles/*.generated.css"]));
    assert.ok(matchesAny("a1.css", ["a?.css"]));
    assert.ok(!matchesAny("a/1.css", ["a?.css"]));
  });

  it("expands {a,b} and escapes dots", () => {
    assert.ok(matchesAny("src/Card.tsx", ["src/**/*.{ts,tsx}"]));
    assert.ok(!matchesAny("src/Card.jsx", ["src/**/*.{ts,tsx}"]));
    assert.ok(!matchesAny("DESIGNxmd", ["DESIGN.md"]));
    assert.equal(globToRegExp("DESIGN.md").test("DESIGN.md"), true);
  });
});

describe("isGitCommit", () => {
  it("finds a commit at the start, after an operator, or with -c options", () => {
    assert.ok(isGitCommit("git commit -m 'x'"));
    assert.ok(isGitCommit("npm test && git commit -am x"));
    assert.ok(isGitCommit("git -c user.name=a commit -m x"));
  });

  it("ignores other git commands and the words inside a message", () => {
    assert.ok(!isGitCommit("git status"));
    assert.ok(!isGitCommit('echo "run git commit later"'));
    assert.ok(!isGitCommit("git log --grep=commit"));
    assert.ok(!isGitCommit(undefined));
  });
});

describe("gatesProblems", () => {
  it("accepts the example config", async () => {
    const { readFileSync } = await import("node:fs");
    const example = JSON.parse(readFileSync(new URL("../design-tokens.gates.json", import.meta.url), "utf8"));
    assert.deepEqual(gatesProblems(example), []);
  });

  it("refuses wrong shapes, and sources that run nothing", () => {
    assert.deepEqual(gatesProblems({ generated: "a.css", build: ["tokens:build"], lint: { files: ["x"] }, sources: ["tokens/**"] }), [
      "generated must be a list of non-empty strings",
      "build must be the command that rewrites the generated outputs",
      "lint needs files (globs) and command (the linter, which receives the edited files as its last arguments)",
      "sources is set but onSourceEdit runs nothing",
    ]);
    assert.deepEqual(gatesProblems(null), ["design-system/gates.json is not a JSON object"]);
  });
});

describe("projectPaths", () => {
  it("makes absolute and relative paths relative to the root, once each, and leaves out the rest", () => {
    assert.deepEqual(projectPaths(["/repo/src/a.tsx", "src/a.tsx", "./lib/site.ts", "/elsewhere/x.tsx", "/repo", "", 7], "/repo"), ["src/a.tsx", "lib/site.ts"]);
  });
});

describe("generatedReason", () => {
  const gates = { generated: ["src/styles/*.generated.css"], onSourceEdit: ["npm run -s tokens:check"], build: "npm run -s tokens:build" };

  it("names the first generated file and the build that writes it", () => {
    assert.equal(generatedReason(["src/a.tsx", "/repo/src/styles/theme.generated.css"], gates, { root: "/repo" }), "src/styles/theme.generated.css is generated from the design tokens. Change the token files (or the build's template), then rebuild with `npm run -s tokens:build`.");
  });

  it("names no command without build, never a check from onSourceEdit", () => {
    const reason = generatedReason(["src/styles/theme.generated.css"], { ...gates, build: undefined }, { root: "/repo" });
    assert.equal(reason, "src/styles/theme.generated.css is generated from the design tokens. Change the token files (or the build's template), then rebuild the outputs with the project's token build.");
    assert.ok(!reason.includes("tokens:check"));
  });

  it("gives nothing when no file is generated", () => {
    assert.equal(generatedReason(["src/a.tsx"], gates, { root: "/repo" }), undefined);
  });
});

describe("checkFiles", () => {
  const gates = { lint: { files: ["src/**/*.tsx"], command: "eslint", strictEnv: { DESIGN_LINT_STRICT: "1" } }, sources: ["design-system/tokens/**/*.json", "DESIGN.md"], generated: ["src/styles/*.generated.css"], onSourceEdit: ["tokens:build", "tokens:check"] };
  const recorder = ({ lintStatus = 0, failing } = {}) => {
    const calls = [];
    return {
      calls,
      options: {
        root: "/repo",
        exists: (file) => file !== "src/deleted.tsx",
        runCommand: (command, env) => (calls.push({ command, env }), { status: lintStatus, output: "1:1 error design/no-raw-color" }),
        runCommands: (commands) => (calls.push({ commands }), failing ? { command: failing, output: "3 problems" } : undefined),
      },
    };
  };

  it("lints the files in lint.files that still exist, in one call with the strict environment", () => {
    const { calls, options } = recorder();
    assert.equal(checkFiles(["src/a.tsx", "src/b.tsx", "src/deleted.tsx", "README.md"], gates, options), undefined);
    assert.deepEqual(calls, [{ command: 'eslint "src/a.tsx" "src/b.tsx"', env: { DESIGN_LINT_STRICT: "1" } }]);
  });

  it("runs each linter of a list on its own files: scripts with ESLint, stylesheets with Stylelint", () => {
    const { calls, options } = recorder();
    const two = { ...gates, lint: [{ files: ["src/**/*.tsx"], command: "eslint" }, { files: ["src/**/*.css"], command: "stylelint" }] };
    assert.equal(checkFiles(["src/a.tsx", "src/a.css", "README.md"], two, options), undefined);
    assert.deepEqual(calls, [{ command: 'eslint "src/a.tsx"', env: {} }, { command: 'stylelint "src/a.css"', env: {} }]);
    assert.deepEqual(lintsOf({}), []);
    assert.deepEqual(gatesProblems({ lint: [{ files: ["a"], command: "x" }, { files: ["b"] }] }), ["lint[1] needs files (globs) and command (the linter, which receives the edited files as its last arguments)"]);
  });

  it("runs onSourceEdit once however many sources changed", () => {
    const { calls, options } = recorder();
    checkFiles(["DESIGN.md", "design-system/tokens/semantic/colors.tokens.json"], gates, options);
    assert.deepEqual(calls, [{ commands: ["tokens:build", "tokens:check"] }]);
  });

  it("returns the lint failure, and the source failure, as the message the agent reads", () => {
    assert.match(checkFiles(["src/a.tsx"], gates, recorder({ lintStatus: 1 }).options), /^The design lint failed for src\/a\.tsx:\n1:1 error design\/no-raw-color/);
    assert.match(checkFiles(["DESIGN.md"], gates, recorder({ failing: "tokens:check" }).options), /^After editing DESIGN\.md, `tokens:check` failed:\n3 problems\n.*rebuild the outputs instead/);
    assert.match(checkFiles(["DESIGN.md"], { ...gates, build: "tokens:build" }, recorder({ failing: "tokens:check" }).options), /rebuild the outputs with `tokens:build` instead/);
  });

  it("runs onSourceEdit for a changed generated output, so a hand edit fails the staleness check", () => {
    const { calls, options } = recorder();
    checkFiles(["/repo/src/styles/theme.generated.css"], gates, options);
    assert.deepEqual(calls, [{ commands: ["tokens:build", "tokens:check"] }]);
  });

  it("runs nothing for files no gate covers", () => {
    const { calls, options } = recorder();
    assert.equal(checkFiles(["README.md", "src/deleted.tsx"], gates, options), undefined);
    assert.deepEqual(calls, []);
  });
});

describe("STAGES", () => {
  const gates = { beforeCommit: ["lint", "typecheck"], onSourceEdit: ["tokens:check"], generated: ["out/*.css"] };
  const runner = (failing) => {
    const calls = [];
    return { calls, options: { root: "/repo", runCommands: (commands, env) => (calls.push({ commands, env }), failing ? { command: failing, output: "2 errors" } : undefined) } };
  };

  it("runs each config key with the design rules as errors, and names the failing command", () => {
    const passing = runner();
    assert.equal(STAGES["before-commit"](gates, [], passing.options), undefined);
    assert.deepEqual(passing.calls, [{ commands: ["lint", "typecheck"], env: { DESIGN_LINT_STRICT: "1" } }]);
    assert.equal(STAGES["on-source-edit"](gates, [], runner("tokens:check").options), "`tokens:check` failed:\n2 errors");
  });

  it("gives the file stages the paths they were called with", () => {
    assert.match(STAGES["check-generated"](gates, ["/repo/out/theme.css"], { root: "/repo" }), /^out\/theme\.css is generated/);
    assert.equal(STAGES["check-files"](gates, ["README.md"], { root: "/repo" }), undefined);
  });
});
