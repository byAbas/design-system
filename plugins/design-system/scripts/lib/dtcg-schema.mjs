// Token files checked against the DTCG 2025.10 JSON Schema the Design Tokens
// Community Group publishes, copied byte for byte into schemas/ (its README
// records the source and hash), and run by json-schema.mjs. A file the schema
// refuses is not DTCG, whatever a tool reading it forgives. No dependencies.

import { readFileSync } from "node:fs";
import { compileSchema } from "./json-schema.mjs";

let validate;

/**
 * A copy of a token file with each token's type written on it: the type a token inherits from its groups (Format
 * §5.2.2) made its own. The schema checks a value against its type only when the token states one, so without this
 * a palette group's `"$type": "color"` would let any value through. A token whose value is a reference keeps no type
 * of its own: its type is its target's.
 */
export function withInheritedTypes(node, inherited) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const type = typeof node.$type === "string" ? node.$type : inherited;
  if ("$value" in node) {
    const reference = typeof node.$value === "string" && /^\{[^{}]+\}$/.test(node.$value);
    return node.$type === undefined && type !== undefined && !reference ? { $type: type, ...node } : node;
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, key.startsWith("$") ? value : withInheritedTypes(value, type)]));
}

/**
 * Where a token file breaks the DTCG 2025.10 schema, one sentence each, by JSON Pointer into the file; empty when it
 * holds. Each value is checked against its type, inherited or its own (withInheritedTypes). The schema is read once.
 * @param {unknown} document a parsed token file
 * @returns {string[]}
 */
export function schemaProblems(document) {
  validate ??= compileSchema(JSON.parse(readFileSync(new URL("./schemas/dtcg-2025.10-format.json", import.meta.url), "utf8")));
  return validate(withInheritedTypes(document)).map((error) => `${error.path || "/"} ${error.message}`);
}
