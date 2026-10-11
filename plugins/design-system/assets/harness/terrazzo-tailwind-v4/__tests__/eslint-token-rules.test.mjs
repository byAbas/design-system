import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NAMED_COLORS, cssDeclarationProblem, declaredVariables, exemptionConfigs, hasRawColor, isColorProperty, judgeClass, namedColorAt, namedColorIn, namedColorInDeclarations, parseClass, parseThemeTokens } from "../eslint-token-rules.mjs";

const theme = parseThemeTokens(`
@theme { --color-*: initial; }
@theme {
  --color-surface: #fff;
  --color-on-surface: #111;
  --text-body-md: 1rem;
  --text-body-md--line-height: 1.5;
  --radius-md: 0.5rem;
  --shadow-raised: 0 1px 2px #0002;
}`);
const tokens = { theme, variables: new Set(["color-surface", "motion-duration-short", "palette-gray-9"]), palette: "palette" };
const verdict = (raw) => {
  const parsed = parseClass(raw);
  return judgeClass(parsed.base, tokens, parsed.modifier)?.messageId;
};

describe("parseThemeTokens", () => {
  it("registers each namespace's names and skips a reset", () => {
    assert.deepEqual([...theme.get("color")], ["surface", "on-surface"]);
    assert.deepEqual([...theme.get("text")], ["body-md", "body-md--line-height"]);
  });
});

describe("parseClass", () => {
  it("splits variants, keeps colons inside brackets, and reads the modifier", () => {
    assert.deepEqual(parseClass("dark:hover:bg-surface/50"), { raw: "dark:hover:bg-surface/50", variants: ["dark", "hover"], base: "bg-surface", modifier: "50" });
    assert.equal(parseClass("[&:hover]:text-[color:var(--color-surface)]").base, "text-[color:var(--color-surface)]");
    assert.equal(parseClass("!-mt-2").base, "mt-2");
  });
});

describe("judgeClass", () => {
  it("accepts tokens, static keywords, layout utilities and token variables", () => {
    for (const raw of ["bg-surface", "text-on-surface", "text-body-md", "rounded-md", "shadow-raised", "text-center", "border-b", "ring-2", "bg-linear-to-b", "p-4", "grid-cols-3", "duration-(--motion-duration-short)", "bg-[var(--color-surface)]", "leading-(--text-body-md--line-height)"]) {
      assert.equal(verdict(raw), undefined, raw);
    }
  });

  it("refuses unknown tokens, Tailwind defaults and bare utilities", () => {
    assert.equal(verdict("bg-red-500"), "unknownToken");
    assert.equal(verdict("text-body-md--line-height"), "unknownToken");
    assert.equal(verdict("rounded"), "bareUtility");
    assert.equal(verdict("shadow"), "bareUtility");
  });

  it("refuses arbitrary values, modifiers and the palette", () => {
    assert.equal(verdict("text-[13px]"), "arbitraryValue");
    assert.equal(verdict("bg-[#ffffff]"), "arbitraryValue");
    assert.equal(verdict("bg-surface/60"), "modifier");
    assert.equal(verdict("text-(--palette-gray-9)"), "paletteReference");
    assert.equal(verdict("bg-[var(--palette-gray-9)]"), "paletteReference");
  });
});

describe("hasRawColor", () => {
  it("finds hex values and colour functions with literal channels", () => {
    for (const text of ["#fff", "color: #1a2b3c80", "rgb(1 2 3)", "oklch(0.5 0.1 200)", "color-mix(in srgb, red 50%, blue)"]) assert.ok(hasRawColor(text), text);
  });

  it("ignores ids, entities and colours built from variables", () => {
    for (const text of ["#main", "&#123;", "rgb(\u0000, \u0000, \u0000)", "var(--color-surface)"]) assert.ok(!hasRawColor(text), text);
  });
});

describe("named colours", () => {
  it("knows the 148 CSS Color 4 names, and not the keywords that state no colour", () => {
    assert.equal(NAMED_COLORS.size, 148);
    for (const name of ["red", "rebeccapurple", "grey", "lightgoldenrodyellow"]) assert.ok(NAMED_COLORS.has(name), name);
    for (const keyword of ["transparent", "currentcolor", "inherit", "none"]) assert.ok(!NAMED_COLORS.has(keyword), keyword);
  });

  it("knows which properties and attributes take a colour, in camel or kebab case", () => {
    for (const name of ["color", "backgroundColor", "background", "border-top", "borderInlineStartColor", "boxShadow", "fill", "stopColor", "WebkitTextFillColor"]) assert.ok(isColorProperty(name), name);
    for (const name of ["fontFamily", "variant", "colorScheme", "className", "tone"]) assert.ok(!isColorProperty(name), name);
  });

  it("finds a named colour in a value, but not in a URL or quoted text", () => {
    assert.equal(namedColorIn("1px solid Red"), "red");
    assert.equal(namedColorIn("linear-gradient(to right, white, var(--x))"), "white");
    assert.equal(namedColorIn("url(/img/red/bg.png) no-repeat"), undefined);
    assert.equal(namedColorIn("transparent"), undefined);
  });

  it("finds a declaration that gives a colour property a name, and leaves prose and classes alone", () => {
    assert.equal(namedColorInDeclarations("display: flex; color: rebeccapurple;"), "rebeccapurple");
    assert.equal(namedColorInDeclarations("a:hover { border: 1px solid navy }"), "navy");
    for (const text of ["The red team won", "variant: red", "hover:text-red-500 md:bg-surface", "color: var(--color-on-surface)"]) assert.equal(namedColorInDeclarations(text), undefined, text);
  });

  it("reads a string by where it stands: a colour property, an element's colour attribute, or a declaration", () => {
    const literal = (value, parent) => {
      const node = { type: "Literal", value, parent };
      if (parent?.type === "Property") parent.value = node;
      return node;
    };
    const property = (key, computed = false) => ({ type: "Property", key: { type: "Identifier", name: key }, computed });
    const attribute = (name, element) => ({ type: "JSXAttribute", name: { name }, parent: { name: { type: "JSXIdentifier", name: element } } });
    assert.equal(namedColorAt(literal("red", property("backgroundColor")), "red"), "red");
    assert.equal(namedColorAt(literal("red", property("variant")), "red"), undefined);
    assert.equal(namedColorAt(literal("red", property("color", true)), "red"), undefined);
    assert.equal(namedColorAt(literal("white", attribute("fill", "path")), "white"), "white");
    assert.equal(namedColorAt(literal("red", attribute("color", "Badge")), "red"), undefined);
    assert.equal(namedColorAt(literal("color: red", undefined), "color: red"), "red");
    assert.equal(namedColorAt(literal("red", undefined), "red"), undefined);
  });
});

describe("declaredVariables", () => {
  it("lists declared custom properties, not their uses", () => {
    assert.deepEqual([...declaredVariables(":root{--a:1;--b-c: var(--a);}")], ["a", "b-c"]);
  });
});

describe("exemptionConfigs", () => {
  it("turns every rule off for an exemption that names none, and the rules that hold the named ones otherwise", () => {
    const gates = { exempt: [{ paths: ["public/flags/**"], reason: "Flag artwork" }, { paths: ["emails/**"], rules: ["tiers/no-primitive-in-code"], reason: "Email HTML" }, { paths: ["docs/**"], rules: ["docs/current"], reason: "Not code" }] };
    assert.deepEqual(exemptionConfigs(gates), [
      { name: "design-system/exempt: Flag artwork", files: ["public/flags/**"], rules: { "design-system/token-classes": "off", "design-system/no-raw-color": "off" } },
      { name: "design-system/exempt: Email HTML", files: ["emails/**"], rules: { "design-system/token-classes": "off" } },
    ]);
    assert.deepEqual(exemptionConfigs({}), []);
  });
});

describe("cssDeclarationProblem", () => {
  it("reports what a stylesheet states that the tokens do not know", () => {
    assert.deepEqual(cssDeclarationProblem("border", "1px solid rgb(0 0 0 / 10%)"), { messageId: "rawColor" });
    assert.deepEqual(cssDeclarationProblem("--color-brand", " #d4a017"), { messageId: "rawColor" });
    assert.deepEqual(cssDeclarationProblem("--local", " oklch(0.5 0.1 200)"), { messageId: "rawColor" });
    assert.deepEqual(cssDeclarationProblem("color", "red"), { messageId: "namedColor", data: { name: "red" } });
    assert.deepEqual(cssDeclarationProblem("--accent", " RebeccaPurple"), { messageId: "namedColor", data: { name: "rebeccapurple" } });
  });

  it("passes what reads the tokens, the keywords, and a custom property whose words only contain a colour's name", () => {
    for (const [property, value] of [["background", "var(--color-surface)"], ["color", "currentColor"], ["fill", "transparent"], ["--color-*", " initial"], ["--font", " Red Hat Display"], ["font-family", "Red Hat Display"], ["border", "1px solid var(--color-outline)"]]) {
      assert.equal(cssDeclarationProblem(property, value), undefined, `${property}: ${value}`);
    }
  });
});
