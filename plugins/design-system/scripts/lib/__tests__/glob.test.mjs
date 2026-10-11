import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as core from "../../../assets/harness/core/gates.mjs";
import { globToRegExp, matchesAny } from "../glob.mjs";

describe("glob", () => {
  const cases = [
    ["tokens/**/*.json", "tokens/a.json", true],
    ["tokens/**/*.json", "tokens/themes/dark.tokens.json", true],
    ["src/styles/*.generated.css", "src/styles/old/theme.generated.css", false],
    ["a?.css", "a1.css", true],
    ["a?.css", "a/1.css", false],
    ["src/**/*.{ts,tsx}", "src/Card.tsx", true],
    ["src/**/*.{ts,tsx}", "src/Card.jsx", false],
    ["public/flags/**", "public/flags/es.svg", true],
    ["DESIGN.md", "DESIGNxmd", false],
    ["emails/{a.b}/*", "emails/a.b/x.html", true],
  ];

  it("matches as the harness core does, case for case: the two copies may not drift", () => {
    for (const [glob, file, expected] of cases) {
      assert.equal(matchesAny(file, [glob]), expected, `${glob} ${file}`);
      assert.equal(core.matchesAny(file, [glob]), expected, `core: ${glob} ${file}`);
      assert.equal(globToRegExp(glob).source, core.globToRegExp(glob).source, glob);
    }
  });
});
