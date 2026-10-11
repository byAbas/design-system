import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { schemaProblems, withInheritedTypes } from "../dtcg-schema.mjs";
import { compileSchema } from "../json-schema.mjs";

const messages = (schema, instance) => compileSchema(schema)(instance).map((error) => `${error.path || "/"} ${error.message}`);

describe("compileSchema: draft-07", () => {
  it("checks type, enum, const, numbers, strings and arrays", () => {
    const schema = { type: "object", properties: { n: { type: "integer", minimum: 0, exclusiveMaximum: 10 }, e: { enum: ["a", "b"] }, c: { const: 1 }, s: { type: "string", pattern: "^x" }, a: { type: "array", items: [{ type: "number" }], additionalItems: false, minItems: 1, maxItems: 2 } }, required: ["n"], additionalProperties: false };
    assert.deepEqual(messages(schema, { n: 3, e: "a", c: 1, s: "xy", a: [1] }), []);
    assert.deepEqual(messages(schema, { n: 10.5, e: "z", c: 2, s: "y", a: [1, 2, 3], extra: true }), [
      "/n is number, expected integer",
      "/n is 10.5, not below 10",
      '/e is "z", expected one of "a", "b"',
      "/c is 2, expected 1",
      '/s "y" does not match ^x',
      "/a has 3 items, more than 2",
      "/a/1 no value is allowed here",
      "/a/2 no value is allowed here",
      "/ has extra, which the schema does not allow",
    ]);
    assert.deepEqual(messages(schema, {}), ["/ lacks the required n"]);
  });

  it("holds oneOf to exactly one, and reads anyOf, allOf, not and if/then/else", () => {
    const oneOf = { oneOf: [{ type: "number" }, { type: "integer" }] };
    assert.deepEqual(messages(oneOf, 1.5), []);
    assert.deepEqual(messages(oneOf, 2), ["/ matches 2 of the alternatives, where oneOf allows exactly one"]);
    assert.match(messages(oneOf, "x")[0], /^\/ matches none of the 2 alternatives \(oneOf\)/);
    assert.deepEqual(messages({ not: { type: "string" } }, "x"), ["/ matches a schema it must not (not)"]);
    const branch = { if: { properties: { kind: { const: "a" } } }, then: { required: ["a"] }, else: { required: ["b"] } };
    assert.deepEqual(messages(branch, { kind: "a" }), ["/ lacks the required a"]);
    assert.deepEqual(messages(branch, { kind: "z" }), ["/ lacks the required b"]);
    assert.deepEqual(messages({ anyOf: [{ type: "string" }, { type: "number" }], allOf: [{ minimum: 2 }] }, 1), ["/ is 1, below the minimum 2"]);
  });

  it("resolves $ref to an embedded resource by its $id, and to a pointer in it", () => {
    const schema = { $id: "https://example.com/root.json", definitions: { "https://example.com/n.json": { $id: "https://example.com/n.json", type: "number" }, s: { type: "string" } }, properties: { a: { $ref: "https://example.com/n.json" }, b: { $ref: "#/definitions/s" } } };
    assert.deepEqual(messages(schema, { a: 1, b: "x" }), []);
    assert.deepEqual(messages(schema, { a: "1", b: 2 }), ["/a is string, expected number", "/b is integer, expected string"]);
  });

  it("refuses a keyword it does not implement, rather than passing it over", () => {
    assert.throws(() => compileSchema({ uniqueItems: true })([1, 1]), /keyword uniqueItems is not implemented/);
  });
});

describe("the DTCG 2025.10 schema", () => {
  it("is the copy recorded in schemas/README.md, byte for byte", () => {
    const hash = createHash("sha256").update(readFileSync(new URL("../schemas/dtcg-2025.10-format.json", import.meta.url))).digest("hex");
    assert.equal(hash, "32e93b780e4e4bca778d0780cb797a560deedc470c608af16576223f7e42915f");
    assert.match(readFileSync(new URL("../schemas/README.md", import.meta.url), "utf8"), new RegExp(hash));
  });

  it("checks a value against the type it inherits from its group, and leaves a reference to its target", () => {
    const file = { palette: { $type: "color", white: { $value: "#ffffff" }, ref: { $value: "{palette.black}" }, own: { $type: "number", $value: 1 } } };
    assert.deepEqual(withInheritedTypes(file).palette, { $type: "color", white: { $type: "color", $value: "#ffffff" }, ref: { $value: "{palette.black}" }, own: { $type: "number", $value: 1 } });
    assert.match(schemaProblems(file)[0], /^\/palette.*white\/\$value is string, expected object/);
  });

  it("accepts DTCG 2025.10 tokens and refuses what the format does not allow", () => {
    const color = (value) => ({ palette: { $type: "color", white: { $value: value } } });
    assert.deepEqual(schemaProblems(color({ colorSpace: "srgb", components: [1, 1, 1], alpha: 1, hex: "#FFFFFF" })), []);
    assert.deepEqual(schemaProblems({ spacing: { md: { $type: "dimension", $value: { value: 16, unit: "px" } } }, motion: { fast: { $type: "duration", $value: { value: 0.15, unit: "s" } } } }), []);
    assert.match(schemaProblems(color("#ffffff"))[0], /\$value is string, expected object/);
    assert.match(schemaProblems(color({ colorSpace: "srgb", components: [1, 1, 1], hex: "#FFF" }))[0], /does not match/);
    assert.match(schemaProblems({ d: { $type: "dimension", $value: { value: 1, unit: "em" } } })[0], /unit is "em", expected one of "px", "rem"/);
    assert.match(schemaProblems({ s: { $type: "string", $value: "DM Sans" } })[0], /\$type is "string", expected one of "color"/);
    assert.match(schemaProblems({ "a.b": { $type: "number", $value: 1 } })[0], /has a\.b, which the schema does not allow/);
  });
});
