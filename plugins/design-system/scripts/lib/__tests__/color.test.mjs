import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { colorHex, compositeOver, contrastRatio, derivedHex, hexToRgb, oklabToOklch, readColor, relativeLuminance, rgbToHex, srgbToOklab } from "../color.mjs";

// color-reference.json holds 240 rules and the hex lightningcss 1.32.0 gives for each
// (transform() with targets { chrome: 80 << 16 }, which resolves oklch(from …) and color-mix to sRGB).
// It was generated once from 20,000 random seeds; 19,865 of them were compared, and all matched.
const reference = JSON.parse(readFileSync(new URL("./color-reference.json", import.meta.url), "utf8"));

describe("derivedHex", () => {
  it("gives the same hex as lightningcss for every reference rule", () => {
    const misses = reference.rows.filter((row) => {
      const rule = row.rule.kind === "mix" ? { kind: "mix", from: "a", weight: row.rule.weight, over: "b" } : { kind: "lightness", from: "a", lightness: row.rule.lightness };
      return derivedHex(rule, (role) => (role === "a" ? row.from : row.over)) !== row.hex;
    });
    assert.equal(reference.rows.length, 240);
    assert.deepEqual(misses, []);
  });

  it("covers out-of-gamut shifts in the reference table", () => {
    // A strong darkening of a saturated colour leaves sRGB before gamut mapping.
    assert.ok(reference.rows.some((row) => row.rule.kind === "lightness" && Math.abs(row.rule.lightness) >= 0.2));
  });
});

describe("conversions", () => {
  it("maps white and black to OKLab L 1 and 0 with no chroma", () => {
    const [l, c] = oklabToOklch(srgbToOklab([1, 1, 1]));
    assert.ok(Math.abs(l - 1) < 1e-4 && c < 1e-4);
    assert.ok(Math.abs(oklabToOklch(srgbToOklab([0, 0, 0]))[0]) < 1e-6);
  });

  it("round-trips hex", () => {
    for (const hex of ["#00f8c0", "#111111", "#fcfcfc", "#7f3a9c"]) assert.equal(rgbToHex(hexToRgb(hex)), hex);
  });
});

describe("readColor and colorHex", () => {
  it("reads DTCG srgb components, and falls back to hex", () => {
    assert.equal(colorHex({ colorSpace: "srgb", components: [0, 0.8549, 0.651] }), "#00daa6");
    assert.equal(colorHex({ colorSpace: "hsl", components: [0, 0, 0], hex: "#ABCDEF" }), "#abcdef");
    assert.equal(readColor({ colorSpace: "srgb", components: [1, 1, 1], alpha: 0.6 }).alpha, 0.6);
  });

  it("reads oklch and display-p3", () => {
    assert.equal(colorHex({ colorSpace: "oklch", components: [1, 0, 0] }), "#ffffff");
    assert.equal(colorHex({ colorSpace: "display-p3", components: [1, 1, 1] }), "#ffffff");
  });

  it("refuses a colour it cannot read", () => {
    assert.throws(() => readColor({ colorSpace: "hsl", components: [0, 0, 0] }), /cannot read colour/);
  });
});

describe("WCAG 2.x contrast", () => {
  it("gives the reference values: 21:1 for black on white, 1:1 for a colour on itself, the same either way round", () => {
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#3366cc", "#3366cc"), 1);
    assert.equal(contrastRatio("#ffffff", "#000000"), contrastRatio("#000000", "#ffffff"));
  });

  it("puts #767676 on white just above 4.5:1 and #777777 just below, the boundary WCAG's examples use", () => {
    assert.ok(contrastRatio("#767676", "#ffffff") >= 4.5);
    assert.ok(contrastRatio("#777777", "#ffffff") < 4.5);
  });

  it("weights the channels 0.2126, 0.7152 and 0.0722, and linearises from 0.04045", () => {
    assert.ok(Math.abs(relativeLuminance([1, 0, 0]) - 0.2126) < 1e-12);
    assert.ok(Math.abs(relativeLuminance([0, 1, 0]) - 0.7152) < 1e-12);
    assert.ok(Math.abs(relativeLuminance([0, 0, 1]) - 0.0722) < 1e-12);
    assert.ok(Math.abs(relativeLuminance([0.04045, 0.04045, 0.04045]) - 0.04045 / 12.92) < 1e-15);
  });

  it("composites a translucent foreground over the background before measuring it", () => {
    assert.deepEqual(compositeOver([0, 0, 0], 0.5, [1, 1, 1]), [0.5, 0.5, 0.5]);
    assert.ok(Math.abs(contrastRatio("#000000", "#ffffff", 0.5) - 3.98) < 0.01);
    assert.equal(contrastRatio("#000000", "#ffffff", 0), 1);
  });
});
