import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { componentFiles, contractPrefix, contractProblems, contrastProblems, coverageProblems, frontMatterText, isLargeText, kebab, roleReader, withVariants } from "../check-rules-contract.mjs";
import { TOKEN_DEFAULTS } from "../lib/project-modules.mjs";

const tokenIds = new Set(["colors.surface", "colors.on-surface", "typography.body-md", "rounded.md", "palette.gray-1"]);
const valid = {
  version: "alpha",
  name: "App",
  imports: "./design-system/tokens/design.resolver.json",
  components: { page: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", typography: "{typography.body-md}", rounded: "{rounded.md}" } },
};

describe("frontMatterText", () => {
  it("returns the YAML between the fences, or undefined", () => {
    assert.equal(frontMatterText("---\nname: A\n---\n# A"), "name: A");
    assert.equal(frontMatterText("# A\n"), undefined);
  });
});

describe("contractProblems", () => {
  it("passes a document that holds no values and names existing roles", () => {
    assert.deepEqual(contractProblems(valid, tokenIds, TOKEN_DEFAULTS), []);
  });

  it("refuses values in the front matter and an import of anything but the resolver", () => {
    const front = { ...valid, colors: { primary: "#00aa88" }, imports: "./tokens.json" };
    assert.deepEqual(contractProblems(front, tokenIds, TOKEN_DEFAULTS), [
      "docs/rules-hold-no-values: the front matter holds `colors:`; values live in the token files it imports, the rules document holds rules",
      "docs/rules-reference-existing-tokens: `imports:` is ./tokens.json; it names the tokens at ./design-system/tokens/design.resolver.json",
    ]);
  });

  it("refuses a component that states a value, reads the palette or another group, or names a missing token", () => {
    const front = { ...valid, components: { card: { backgroundColor: "#ffffff", textColor: "{palette.gray-1}", typography: "{typography.huge}", rounded: "{spacing.md}" } } };
    assert.deepEqual(contractProblems(front, tokenIds, TOKEN_DEFAULTS), [
      'tiers/components-read-roles: components.card.backgroundColor is "#ffffff"; a component names a token ({group.name}), it does not state a value',
      "tiers/components-read-roles: components.card.textColor reads the palette entry gray-1; components read roles",
      "docs/rules-reference-existing-tokens: components.card.typography names {typography.huge}, which the tokens do not define",
      "tiers/components-read-roles: components.card.rounded reads spacing.*; a component reads colors, typography, rounded",
    ]);
  });
});

describe("isLargeText", () => {
  it("is 24px and up, or about 18.67px and up when bold, in px or rem", () => {
    assert.equal(isLargeText({ fontSize: { value: 24, unit: "px" }, fontWeight: 400 }), true);
    assert.equal(isLargeText({ fontSize: { value: 1.5, unit: "rem" }, fontWeight: 400 }), true);
    assert.equal(isLargeText({ fontSize: { value: 18.67, unit: "px" }, fontWeight: "bold" }), true);
    assert.equal(isLargeText({ fontSize: { value: 18.67, unit: "px" }, fontWeight: 600 }), false);
    assert.equal(isLargeText({ fontSize: { value: 23.9, unit: "px" }, fontWeight: 400 }), false);
    assert.equal(isLargeText(undefined), false);
  });
});

describe("withVariants", () => {
  it("gives a variant what it does not state, from the longest key it extends", () => {
    const merged = withVariants({ button: { textColor: "{colors.a}" }, "button-primary": { backgroundColor: "{colors.b}" }, "button-primary-hover": { backgroundColor: "{colors.c}" }, buttonless: { textColor: "{colors.d}" } });
    assert.deepEqual(merged["button-primary-hover"], { textColor: { value: "{colors.a}", from: "button" }, backgroundColor: { value: "{colors.c}" } });
    assert.deepEqual(merged.buttonless, { textColor: { value: "{colors.d}" } });
  });
});

describe("contrastProblems", () => {
  const color = (hex, alpha) => ({ $type: "color", $value: alpha === undefined ? { hex } : { hex, alpha } });
  const tokens = (overrides = {}) => ({
    "colors.surface": color("#ffffff"),
    "colors.on-surface": color("#111111"),
    "colors.muted": color("#767676"),
    "colors.faint": color("#777777"),
    "colors.primary": color("#d4a017"),
    "colors.on-primary": color("#ffffff"),
    "colors.ink-50": color("#000000", 0.5),
    "colors.scrim": color("#000000", 0.4),
    "typography.body": { $type: "typography", $value: { fontSize: { value: 16, unit: "px" }, fontWeight: 400 } },
    "typography.title": { $type: "typography", $value: { fontSize: { value: 24, unit: "px" }, fontWeight: 600 } },
    ...overrides,
  });
  const front = (components) => ({ components });

  it("passes WCAG's own boundary: #767676 on white is 4.54:1", () => {
    const result = contrastProblems(front({ caption: { backgroundColor: "{colors.surface}", textColor: "{colors.muted}" } }), { light: tokens() });
    assert.deepEqual(result, { problems: [], measured: 1, unmeasured: [] });
  });

  it("refuses a pair below 4.5:1, without rounding it up, and names the context", () => {
    const { problems } = contrastProblems(front({ caption: { backgroundColor: "{colors.surface}", textColor: "{colors.faint}" } }), { light: tokens(), dark: tokens({ "colors.faint": color("#111111") }) });
    assert.deepEqual(problems, ["tiers/contrast-pairs: light: components.caption: textColor {colors.faint} (#777777) on backgroundColor {colors.surface} (#ffffff) is 4.47:1, below 4.5:1 for text (WCAG 2.1 SC 1.4.3)"]);
  });

  it("holds large text to 3:1, from the component's typography", () => {
    const title = { backgroundColor: "{colors.surface}", textColor: "{colors.ink-50}", typography: "{typography.title}" };
    assert.deepEqual(contrastProblems(front({ title }), { light: tokens() }).problems, []);
    const { problems } = contrastProblems(front({ title: { ...title, typography: "{typography.body}" } }), { light: tokens() });
    assert.deepEqual(problems, ["tiers/contrast-pairs: components.title: textColor {colors.ink-50} (#000000 at alpha 0.5) on backgroundColor {colors.surface} (#ffffff) is 3.97:1, below 4.5:1 for text (WCAG 2.1 SC 1.4.3)"]);
  });

  it("holds an icon, named by its key, to non-text contrast: 3:1", () => {
    const components = { "trust-section-icon": { backgroundColor: "{colors.surface}", textColor: "{colors.ink-50}" }, "trust-section-iconography": { backgroundColor: "{colors.surface}", textColor: "{colors.ink-50}" } };
    const { problems } = contrastProblems(front(components), { light: tokens() });
    assert.deepEqual(problems, ["tiers/contrast-pairs: components.trust-section-iconography: textColor {colors.ink-50} (#000000 at alpha 0.5) on backgroundColor {colors.surface} (#ffffff) is 3.97:1, below 4.5:1 for text (WCAG 2.1 SC 1.4.3)"]);
    const faint = contrastProblems(front({ "badge-icon": { backgroundColor: "{colors.surface}", textColor: "{colors.primary}" } }), { light: tokens() }).problems;
    assert.deepEqual(faint, ["tiers/contrast-pairs: components.badge-icon: textColor {colors.primary} (#d4a017) on backgroundColor {colors.surface} (#ffffff) is 2.37:1, below 3:1 for an icon (WCAG 2.1 SC 1.4.11)"]);
  });

  it("checks a variant with the text it inherits, and skips a disabled one", () => {
    const components = { "button-primary": { backgroundColor: "{colors.on-surface}", textColor: "{colors.on-primary}" }, "button-primary-hover": { backgroundColor: "{colors.primary}" }, "button-primary-disabled": { backgroundColor: "{colors.surface}" } };
    const { problems, measured } = contrastProblems(front(components), { light: tokens() });
    assert.equal(measured, 2);
    assert.deepEqual(problems, ["tiers/contrast-pairs: components.button-primary-hover: textColor {colors.on-primary} (#ffffff) on backgroundColor {colors.primary} (#d4a017) is 2.37:1, below 4.5:1 for text (WCAG 2.1 SC 1.4.3); textColor from button-primary"]);
  });

  it("does not measure a translucent background, and says so", () => {
    const result = contrastProblems(front({ overlay: { backgroundColor: "{colors.scrim}", textColor: "{colors.on-primary}" } }), { light: tokens() });
    assert.deepEqual(result, { problems: [], measured: 0, unmeasured: ["components.overlay: backgroundColor {colors.scrim} is translucent"] });
  });
});

describe("contractPrefix", () => {
  it("is the file name in kebab-case, a folder's for an index file, and folder and name for a route file", () => {
    const cases = {
      "components/sections/CtaBannerSection/CtaBannerSection.tsx": "cta-banner-section",
      "components/FAQSection.tsx": "faq-section",
      "components/ui/Button.client.tsx": "button",
      "components/Button/index.tsx": "button",
      "app/[locale]/layout.tsx": "locale-layout",
      "app/[locale]/about/page.tsx": "about-page",
      "app/(marketing)/pricing/page.tsx": "pricing-page",
      "app/blog/[...slug]/page.tsx": "slug-page",
      "src/routes/about/+page.svelte": "about-page",
      "app/page.tsx": "app-page",
    };
    for (const [file, prefix] of Object.entries(cases)) assert.equal(contractPrefix(file), prefix, file);
    assert.equal(kebab("HTTPStatusBadge"), "http-status-badge");
  });
});

describe("roleReader", () => {
  const reads = roleReader(["surface", "on-surface", "primary"]);

  it("finds a colour utility or a variable naming a role", () => {
    for (const text of ['className="bg-surface"', "hover:text-on-surface/80", "var(--color-primary)", "bg-(--color-surface)", "border-t-primary"]) assert.ok(reads(text), text);
  });

  it("leaves words that only contain a role's name", () => {
    for (const text of ['variant="surface"', "bg-surface-2", "text-primary-foreground", "isPrimary", "--surface-gap: 4px"]) assert.ok(!reads(text), text);
  });
});

describe("coverageProblems", () => {
  const reads = roleReader(["surface"]);
  const file = (path, text = '<div className="bg-surface" />') => ({ path, text });

  it("passes a file whose prefix is a key, or starts one, and ignores a file that reads no role", () => {
    const files = [file("components/Card.tsx"), file("components/ButtonGroup.tsx"), file("components/Plain.tsx", "<div />")];
    assert.deepEqual(coverageProblems(["card", "button-group-item-hover"], files, reads), { problems: [], reading: 2 });
  });

  it("names each file that reads roles with no key, pages included, and is not fooled by a longer name", () => {
    const files = [file("components/Card.tsx"), file("app/about/page.tsx")];
    assert.deepEqual(coverageProblems(["cardigan", "about"], files, reads).problems, [
      "tiers/components-read-roles: components/Card.tsx reads colour roles, and no contract key starts with card; add components.card (or card-<part>) with the roles it reads",
      "tiers/components-read-roles: app/about/page.tsx reads colour roles, and no contract key starts with about-page; add components.about-page (or about-page-<part>) with the roles it reads",
    ]);
  });
});

describe("componentFiles", () => {
  it("lists component files under the folders that exist, without tests, stories, helpers or dependencies", () => {
    const root = mkdtempSync(join(tmpdir(), "design-system-coverage-"));
    const files = ["src/Card.tsx", "src/Card.test.tsx", "src/Card.stories.tsx", "src/cardVariants.ts", "src/__tests__/Fixture.tsx", "src/node_modules/x/Y.tsx", "app/about/page.tsx", "app/Nav.vue", "lib/Other.tsx"];
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "x");
    }
    try {
      assert.deepEqual(componentFiles(root, ["src", "app", "missing"]).map((file) => file.path), ["app/about/page.tsx", "app/Nav.vue", "src/Card.tsx"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
