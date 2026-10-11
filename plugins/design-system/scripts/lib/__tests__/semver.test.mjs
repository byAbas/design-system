import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { satisfies } from "../semver.mjs";

describe("satisfies", () => {
  it("reads the ranges that blocked ESLint 10 on real projects", () => {
    assert.equal(satisfies("10.12.0", "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"), false);
    assert.equal(satisfies("9.39.1", "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"), true);
    assert.equal(satisfies("9.6.0", "^9.7"), false);
    assert.equal(satisfies("10.12.0", ">=9.0.0"), true);
    assert.equal(satisfies("8.57.0", "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9"), true);
  });

  it("follows npm's caret and tilde rules, zero majors included", () => {
    const cases = [
      ["1.2.3", "^1.2.3", true], ["2.0.0", "^1.2.3", false], ["1.2.2", "^1.2.3", false],
      ["0.2.9", "^0.2.3", true], ["0.3.0", "^0.2.3", false], ["0.0.4", "^0.0.3", false], ["0.0.3", "^0.0.3", true],
      ["0.9.0", "^0", true], ["1.0.0", "^0", false], ["0.0.9", "^0.0", true], ["0.1.0", "^0.0", false],
      ["1.2.9", "~1.2.3", true], ["1.3.0", "~1.2.3", false], ["1.9.0", "~1", true], ["2.0.0", "~1", false],
    ];
    for (const [version, range, expected] of cases) assert.equal(satisfies(version, range), expected, `${version} ${range}`);
  });

  it("reads comparators, x-ranges, exact versions and hyphen ranges", () => {
    const cases = [
      ["2.0.0", ">1", true], ["1.9.9", ">1", false], ["1.9.9", "<=1", true], ["2.0.0", "<=1", false],
      ["1.5.0", ">=1.2 <2", true], ["2.0.0", ">=1.2 <2", false],
      ["1.4.0", "1.x", true], ["2.0.0", "1.x", false], ["7.0.0", "*", true], ["7.0.0", "", true],
      ["1.2.3", "1.2.3", true], ["1.2.4", "1.2.3", false], ["1.2.3", "=1.2.3", true],
      ["2.9.0", "1 - 2", true], ["3.0.0", "1 - 2", false], ["2.3.4", "1.2 - 2.3.4", true], ["2.3.5", "1.2 - 2.3.4", false],
    ];
    for (const [version, range, expected] of cases) assert.equal(satisfies(version, range), expected, `${version} ${range}`);
  });
});
