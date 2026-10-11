// Colour maths for derived roles (references/decisions.md, Interaction
// states) and for contrast (decisions, Contrast): read a DTCG colour, compute
// the hex a derived rule gives, and the WCAG contrast of a pair. No
// dependencies.
//
// A derived value is stored in the tokens, and a check recomputes it, so the
// maths must give the same bytes as the build that computed it. It follows the
// path lightningcss 1.x takes for `oklch(from <hex> calc(l ± x) c h)` and
// `color-mix(in srgb, …)` with an sRGB target (src/values/color.rs):
// - the CSS Color 4 conversion matrices, as lightningcss writes them;
// - single-precision arithmetic, emulated here with Math.fround;
// - the CSS Color 4 draft binary search on chroma for out-of-gamut colours,
//   with JND 0.02 and epsilon 1e-5.
//
// Checked against lightningcss 1.32 on 19,750 random lightness shifts, with
// identical hex in every case, and the committed reference table in
// __tests__/color-reference.json.

const f = Math.fround;
const f32 = (values) => values.map(f);

const LINEAR_SRGB_TO_XYZ = f32([0.41239079926595934, 0.357584339383878, 0.1804807884018343, 0.21263900587151027, 0.715168678767756, 0.07219231536073371, 0.01933081871559182, 0.11919477979462598, 0.9505321522496607]);
const XYZ_TO_LINEAR_SRGB = f32([3.2409699419045226, -1.537383177570094, -0.4986107602930034, -0.9692436362808796, 1.8759675015077202, 0.04155505740717559, 0.05563007969699366, -0.20397695888897652, 1.0569715142428786]);
const XYZ_TO_LMS = f32([0.8190224432164319, 0.3619062562801221, -0.12887378261216414, 0.0329836671980271, 0.9292868468965546, 0.03614466816999844, 0.048177199566046255, 0.26423952494422764, 0.6335478258136937]);
const LMS_TO_OKLAB = f32([0.2104542553, 0.793617785, -0.0040720468, 1.9779984951, -2.428592205, 0.4505937099, 0.0259040371, 0.7827717662, -0.808675766]);
const LMS_TO_XYZ = f32([1.2268798733741557, -0.5578149965554813, 0.28139105017721583, -0.04057576262431372, 1.1122868293970594, -0.07171106666151701, -0.07637294974672142, -0.4214933239627914, 1.5869240244272418]);
const OKLAB_TO_LMS = f32([0.9999999984505198, 0.39633779217376786, 0.2158037580607588, 1.0000000088817607, -0.10556134232365635, -0.0638541747717059, 1.0000000546724109, -0.08948418209496576, -1.2914855378640917]);
const LINEAR_P3_TO_XYZ = f32([0.4865709486482162, 0.26566769316909306, 0.1982172852343625, 0.2289745640697488, 0.6917385218365064, 0.079286914093745, 0, 0.04511338185890264, 1.043944368900976]);
const PI = f(Math.PI);

/** A 3×3 matrix times a vector, in single precision and in the order lightningcss adds. */
const multiply = (m, [x, y, z]) => [0, 3, 6].map((row) => f(f(f(m[row] * x) + f(m[row + 1] * y)) + f(m[row + 2] * z)));

const toLinear = (c) => {
  const abs = Math.abs(c);
  if (abs < f(0.04045)) return f(c / f(12.92));
  return f((c < 0 ? -1 : 1) * f(Math.pow(f(f(abs + f(0.055)) / f(1.055)), f(2.4))));
};
const fromLinear = (c) => {
  const abs = Math.abs(c);
  if (abs > f(0.0031308)) return f((c < 0 ? -1 : 1) * f(f(f(1.055) * f(Math.pow(abs, f(f(1) / f(2.4))))) - f(0.055)));
  return f(f(12.92) * c);
};
const cube = (v) => f(f(v * v) * v);

/** Gamma-encoded sRGB components (0–1) to OKLab. */
export function srgbToOklab(rgb) {
  const lms = multiply(XYZ_TO_LMS, multiply(LINEAR_SRGB_TO_XYZ, rgb.map((c) => toLinear(f(c)))));
  return multiply(LMS_TO_OKLAB, lms.map((c) => f(Math.cbrt(c))));
}

/** OKLab to gamma-encoded sRGB components, unclipped. */
export function oklabToSrgb(lab) {
  const lms = multiply(OKLAB_TO_LMS, lab.map(f)).map(cube);
  return multiply(XYZ_TO_LINEAR_SRGB, multiply(LMS_TO_XYZ, lms)).map(fromLinear);
}

export function oklabToOklch([l, a, b]) {
  let h = f(f(f(Math.atan2(b, a)) * f(180)) / PI);
  if (h < 0) h = f(h + 360);
  return [l, f(Math.sqrt(f(f(a * a) + f(b * b)))), f(h % 360)];
}

export function oklchToOklab([l, c, h]) {
  const t = f(f(h * PI) / f(180));
  return [l, f(c * f(Math.cos(t))), f(c * f(Math.sin(t)))];
}

const inGamut = (rgb) => rgb.every((c) => c >= 0 && c <= 1);
const clip = (rgb) => rgb.map((c) => Math.min(1, Math.max(0, c)));
const deltaEOK = (rgb, lch) => {
  const [l1, a1, b1] = srgbToOklab(rgb);
  const [l2, a2, b2] = oklchToOklab(lch);
  const [dl, da, db] = [f(l1 - l2), f(a1 - a2), f(b1 - b2)];
  return f(Math.sqrt(f(f(f(dl * dl) + f(da * da)) + f(db * db))));
};

/** An sRGB colour brought into the sRGB gamut: the CSS Color 4 draft binary search on OKLCH chroma. */
export function mapIntoGamut(rgb) {
  if (inGamut(rgb)) return rgb;
  const JND = f(0.02);
  const EPSILON = f(0.00001);
  let current = oklabToOklch(srgbToOklab(rgb));
  if (Math.abs(f(current[0] - 1)) < EPSILON || current[0] > 1) return [1, 1, 1];
  if (current[0] < EPSILON) return [0, 0, 0];
  let min = 0;
  let max = current[1];
  while (f(max - min) > EPSILON) {
    const chroma = f(f(min + max) / f(2));
    current = [current[0], chroma, current[2]];
    const converted = oklabToSrgb(oklchToOklab(current));
    if (inGamut(converted)) {
      min = chroma;
      continue;
    }
    const clipped = clip(converted);
    if (deltaEOK(clipped, current) < JND) return clipped;
    max = chroma;
  }
  return oklabToSrgb(oklchToOklab(current));
}

// ---------- hex ----------

export function hexToRgb(hex) {
  const digits = hex.replace(/^#/, "");
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join("") : digits;
  return [0, 2, 4].map((i) => f(parseInt(full.slice(i, i + 2), 16) / 255));
}

/** Gamma-encoded sRGB components as lower-case 6-digit hex, each channel rounded to 8 bits. */
export function rgbToHex(rgb) {
  const channel = (c) => Math.min(255, Math.max(0, Math.round(f(c * 255))));
  return `#${rgb.map((c) => channel(c).toString(16).padStart(2, "0")).join("")}`;
}

// ---------- DTCG colour values ----------

/**
 * A DTCG colour `$value` (Color module) as gamma-encoded sRGB components and alpha. Reads `srgb`, `srgb-linear`,
 * `display-p3`, `oklab` and `oklch`; any other colour space falls back to `hex`.
 * @returns {{ rgb: number[], alpha: number }}
 */
export function readColor(value) {
  const alpha = typeof value?.alpha === "number" ? value.alpha : 1;
  const components = Array.isArray(value?.components) ? value.components.map((c) => (c === "none" ? 0 : c)) : null;
  switch (components && value.colorSpace) {
    case "srgb":
      return { rgb: components.map(f), alpha };
    case "srgb-linear":
      return { rgb: components.map((c) => fromLinear(f(c))), alpha };
    case "display-p3":
      return { rgb: multiply(XYZ_TO_LINEAR_SRGB, multiply(LINEAR_P3_TO_XYZ, components.map((c) => toLinear(f(c))))).map(fromLinear), alpha };
    case "oklab":
      return { rgb: oklabToSrgb(components), alpha };
    case "oklch":
      return { rgb: oklabToSrgb(oklchToOklab(components.map(f))), alpha };
    default:
      if (typeof value?.hex === "string") return { rgb: hexToRgb(value.hex), alpha };
      throw new Error(`cannot read colour ${JSON.stringify(value)}: give srgb, srgb-linear, display-p3, oklab or oklch components, or a hex fallback`);
  }
}

/** A DTCG colour `$value` as the 6-digit hex of its sRGB colour, mapped into gamut. */
export function colorHex(value) {
  return rgbToHex(mapIntoGamut(readColor(value).rgb));
}

// ---------- derived rules ----------

/** `from` with its OKLCH lightness moved by `lightness`, chroma and hue kept, mapped into sRGB. */
export function shiftLightness(rgb, lightness) {
  const [l, c, h] = oklabToOklch(srgbToOklab(rgb));
  return mapIntoGamut(oklabToSrgb(oklchToOklab([f(l + f(lightness)), c, h])));
}

/** `color-mix(in srgb, from weight, over)` for opaque colours: interpolation of the gamma-encoded channels. */
export function mixSrgb(from, over, weight) {
  const w = f(weight);
  const rest = f(f(1) - w);
  return from.map((c, i) => f(f(c * w) + f(over[i] * rest)));
}

/**
 * The hex a derived rule gives. `roleHex` resolves the roles the rule reads, in one context, to hex.
 * @param {{ kind: "lightness", from: string, lightness: number } | { kind: "mix", from: string, weight: number, over: string }} rule
 * @param {(role: string) => string} roleHex
 */
export function derivedHex(rule, roleHex) {
  const from = hexToRgb(roleHex(rule.from));
  if (rule.kind === "lightness") return rgbToHex(shiftLightness(from, rule.lightness));
  return rgbToHex(mixSrgb(from, hexToRgb(roleHex(rule.over)), rule.weight));
}

// ---------- contrast (WCAG 2.x) ----------
//
// Plain double precision, unlike the derived rules above: a ratio is compared
// with a threshold, never stored, so it has no build to match byte for byte.

/** A 6-digit hex as gamma-encoded sRGB channels from 0 to 1. */
const channels = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace(/^#/, "").slice(i, i + 2), 16) / 255);

/**
 * The WCAG 2.x relative luminance of gamma-encoded sRGB channels (0 to 1): 0 for black, 1 for white. The threshold
 * is 0.04045, as WCAG 2.2 and technique G18 write it; WCAG 2.0's 0.03928 gives the same result for 8-bit channels.
 * https://www.w3.org/WAI/WCAG22/Techniques/general/G18
 */
export function relativeLuminance(rgb) {
  const linear = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** A colour at `alpha` painted over an opaque backdrop: CSS source-over compositing, in gamma-encoded sRGB. */
export function compositeOver(rgb, alpha, backdrop) {
  return rgb.map((c, i) => c * alpha + backdrop[i] * (1 - alpha));
}

/**
 * The WCAG 2.x contrast ratio of a foreground over an opaque background, from 1 to 21. A translucent foreground is
 * composited over the background first: it has no contrast of its own, only against what it is painted on.
 * @param {string} foreground 6-digit hex
 * @param {string} background 6-digit hex, opaque
 * @param {number} [alpha] the foreground's alpha
 */
export function contrastRatio(foreground, background, alpha = 1) {
  const back = channels(background);
  const front = alpha < 1 ? compositeOver(channels(foreground), alpha, back) : channels(foreground);
  const [lighter, darker] = [relativeLuminance(front), relativeLuminance(back)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
