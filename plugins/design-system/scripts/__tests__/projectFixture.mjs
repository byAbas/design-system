// A small web project written to a temporary folder for the scan's tests. It
// is built at test time rather than committed, because it needs a
// node_modules folder, which version control ignores.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const FILES = {
  "package.json": JSON.stringify({ name: "fixture-app", scripts: { build: "next build", lint: "eslint ." }, dependencies: { tailwindcss: "^4.1.0", lodash: "^4.17.21" }, devDependencies: { "@terrazzo/cli": "^2.7.1" } }),
  "package-lock.json": JSON.stringify({ name: "fixture-app", lockfileVersion: 3 }),
  "node_modules/tailwindcss/package.json": JSON.stringify({ name: "tailwindcss", version: "4.1.3" }),
  "node_modules/@terrazzo/cli/package.json": JSON.stringify({ name: "@terrazzo/cli", version: "2.7.1" }),
  "node_modules/lodash/index.js": 'export const x = "#ff0000";\n',
  "tokens/design.resolver.json": JSON.stringify({ version: "2025.10" }),
  "tokens/themes/light.tokens.json": JSON.stringify({ color: { $type: "color" } }),
  "DESIGN.md": '---\nname: Fixture\nimports: ./tokens/design.resolver.json\ncolors:\n  primary: "#000000"\ncomponents: {}\n---\n\n# Fixture\n',
  "src/components/Card.tsx": 'export const Card = () => <div style={{ color: "#1a2b3c", background: "rgb(10, 20, 30)" }} className="bg-surface" />;\nconst spare = "#fff";\n',
  "src/components/Clean.tsx": 'export const Clean = () => <p className="text-on-surface">ok</p>;\n',
  "src/components/Card.test.tsx": 'it("reads #ffffff", () => {});\n',
  "src/styles/theme.generated.css": "@theme {\n  --color-surface: #ffffff;\n}\n",
  "src/styles/app.css": '@import "tailwindcss";\n@theme { --color-*: initial; }\n',
  "docs/design-system.md": "---\ntitle: Design system\n---\n# Design system\n",
  "docs/getting-started.md": "# Getting started\n",
  "README.md": "# Fixture\n",
  ".claude/settings.json": "{}",
  ".agents/skills/x/references/design-system.md": "# not this project's rules\n",
  "public/topics/design-tokens.md": "# an article\n",
  ".husky/_/pre-commit": "husky internal\n",
  ".husky/pre-commit": "npm test\n",
  "design-system/audits/2026-09-26T100000Z.json": '{"color": "#abcdef"}',
  ".github/workflows/ci.yml": "name: ci\n",
};

/** Writes the fixture project; returns its root and a cleanup function. */
export function writeProjectFixture(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "design-system-scan-"));
  for (const [file, content] of Object.entries({ ...FILES, ...extra })) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
