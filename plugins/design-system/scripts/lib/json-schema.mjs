// A JSON Schema draft-07 validator for the keywords the DTCG 2025.10 schema
// uses (assets/schemas/dtcg-2025.10-format.json), so a file is checked
// against the published schema itself, with no dependency. It is strict: a
// schema keyword it does not implement throws, rather than being skipped, so
// no rule of the schema is ever passed over silently. `format` is an
// annotation, as draft-07 makes it by default.
// https://json-schema.org/draft-07/json-schema-validation

/** Keywords that assert, each implemented below. */
const ASSERTING = new Set(["$ref", "type", "enum", "const", "properties", "patternProperties", "additionalProperties", "required", "items", "additionalItems", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "allOf", "anyOf", "oneOf", "not", "if", "then", "else"]);
/** Keywords that annotate or hold subschemas, and assert nothing themselves. */
const ANNOTATING = new Set(["$schema", "$id", "$comment", "title", "description", "definitions", "format", "default", "examples"]);

const typeOf = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value);
const hasType = (value, type) => type === typeOf(value) || (type === "number" && typeof value === "number");
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pointer = (path) => (path.length === 0 ? "" : `/${path.map((part) => String(part).replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`);

/**
 * A validator for one schema document and the schema resources it embeds (every `$id`).
 * @param {object} root the schema
 * @returns {(instance: unknown) => { path: string, message: string }[]} the errors, empty when the instance is valid
 */
export function compileSchema(root) {
  const resources = new Map();
  const index = (node, base) => {
    if (Array.isArray(node)) return node.forEach((child) => index(child, base));
    if (!node || typeof node !== "object") return;
    const id = typeof node.$id === "string" ? new URL(node.$id, base).href.replace(/#$/, "") : undefined;
    if (id) resources.set(id, node);
    for (const child of Object.values(node)) index(child, id ?? base);
  };
  const rootId = new URL(root.$id ?? "urn:root").href.replace(/#$/, "");
  index(root, rootId);
  resources.set(rootId, root);

  const resolve = (ref, base) => {
    const url = new URL(ref, base);
    const fragment = decodeURIComponent(url.hash.slice(1));
    url.hash = "";
    let node = resources.get(url.href);
    if (node === undefined) throw new Error(`schema: $ref ${ref} names no resource of this schema`);
    for (const part of fragment.split("/").slice(1)) {
      node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      if (node === undefined) throw new Error(`schema: $ref ${ref} points to nothing`);
    }
    return { node, base: url.href };
  };

  /** The errors of `instance` against `schema`, at `path`; `base` is the URI refs resolve against. */
  const check = (schema, instance, path, base) => {
    if (schema === true) return [];
    if (schema === false) return [{ path: pointer(path), message: "no value is allowed here" }];
    if (typeof schema.$id === "string") base = new URL(schema.$id, base).href.replace(/#$/, "");
    for (const keyword of Object.keys(schema)) {
      if (!ASSERTING.has(keyword) && !ANNOTATING.has(keyword)) throw new Error(`schema: keyword ${keyword} is not implemented, so it cannot be checked`);
    }
    // In draft-07 a $ref replaces its siblings.
    if (schema.$ref !== undefined) {
      const target = resolve(schema.$ref, base);
      return check(target.node, instance, path, target.base);
    }
    const errors = [];
    const fail = (message) => errors.push({ path: pointer(path), message });
    const sub = (subschema, value, at = path) => check(subschema, value, at, base);

    if (schema.type !== undefined) {
      const types = [schema.type].flat();
      if (!types.some((type) => hasType(instance, type))) fail(`is ${typeOf(instance)}, expected ${types.join(" or ")}`);
    }
    if (schema.enum !== undefined && !schema.enum.some((option) => equal(option, instance))) fail(`is ${JSON.stringify(instance)}, expected one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}`);
    if (schema.const !== undefined && !equal(schema.const, instance)) fail(`is ${JSON.stringify(instance)}, expected ${JSON.stringify(schema.const)}`);

    if (typeof instance === "number") {
      if (schema.minimum !== undefined && instance < schema.minimum) fail(`is ${instance}, below the minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && instance > schema.maximum) fail(`is ${instance}, above the maximum ${schema.maximum}`);
      if (schema.exclusiveMinimum !== undefined && instance <= schema.exclusiveMinimum) fail(`is ${instance}, not above ${schema.exclusiveMinimum}`);
      if (schema.exclusiveMaximum !== undefined && instance >= schema.exclusiveMaximum) fail(`is ${instance}, not below ${schema.exclusiveMaximum}`);
    }
    if (typeof instance === "string" && schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(instance)) fail(`${JSON.stringify(instance)} does not match ${schema.pattern}`);

    if (Array.isArray(instance)) {
      if (schema.minItems !== undefined && instance.length < schema.minItems) fail(`has ${instance.length} items, fewer than ${schema.minItems}`);
      if (schema.maxItems !== undefined && instance.length > schema.maxItems) fail(`has ${instance.length} items, more than ${schema.maxItems}`);
      if (Array.isArray(schema.items)) {
        schema.items.forEach((item, i) => i < instance.length && errors.push(...sub(item, instance[i], [...path, i])));
        if (schema.additionalItems !== undefined) instance.slice(schema.items.length).forEach((value, i) => errors.push(...sub(schema.additionalItems, value, [...path, schema.items.length + i])));
      } else if (schema.items !== undefined) instance.forEach((value, i) => errors.push(...sub(schema.items, value, [...path, i])));
    }

    if (instance && typeof instance === "object" && !Array.isArray(instance)) {
      for (const key of schema.required ?? []) if (!Object.hasOwn(instance, key)) fail(`lacks the required ${key}`);
      for (const [key, value] of Object.entries(instance)) {
        let matched = false;
        if (schema.properties && Object.hasOwn(schema.properties, key)) {
          matched = true;
          errors.push(...sub(schema.properties[key], value, [...path, key]));
        }
        for (const [pattern, subschema] of Object.entries(schema.patternProperties ?? {})) {
          if (new RegExp(pattern, "u").test(key)) {
            matched = true;
            errors.push(...sub(subschema, value, [...path, key]));
          }
        }
        if (!matched && schema.additionalProperties !== undefined) {
          const extra = sub(schema.additionalProperties, value, [...path, key]);
          if (schema.additionalProperties === false) fail(`has ${key}, which the schema does not allow`);
          else errors.push(...extra);
        }
      }
    }

    for (const subschema of schema.allOf ?? []) errors.push(...sub(subschema, instance));
    if (schema.anyOf !== undefined) {
      const results = schema.anyOf.map((subschema) => sub(subschema, instance));
      if (!results.some((result) => result.length === 0)) fail(`matches none of the ${schema.anyOf.length} alternatives (anyOf): ${closest(results)}`);
    }
    if (schema.oneOf !== undefined) {
      const results = schema.oneOf.map((subschema) => sub(subschema, instance));
      const passing = results.filter((result) => result.length === 0).length;
      if (passing === 0) fail(`matches none of the ${schema.oneOf.length} alternatives (oneOf): ${closest(results)}`);
      else if (passing > 1) fail(`matches ${passing} of the alternatives, where oneOf allows exactly one`);
    }
    if (schema.not !== undefined && sub(schema.not, instance).length === 0) fail("matches a schema it must not (not)");
    if (schema.if !== undefined) {
      const branch = sub(schema.if, instance).length === 0 ? schema.then : schema.else;
      if (branch !== undefined) errors.push(...sub(branch, instance));
    }
    return errors;
  };

  return (instance) => check(root, instance, [], rootId);
}

/**
 * The errors of the alternative that came closest, as one line: the one whose errors reach deepest into the value,
 * since an alternative that fails at once (a group, for a token) says least about what to fix.
 */
function closest(results) {
  const depth = (result) => Math.max(...result.map((error) => error.path.split("/").length));
  const best = [...results].sort((a, b) => depth(b) - depth(a) || a.length - b.length)[0] ?? [];
  return best.slice(0, 3).map((error) => `${error.path || "/"} ${error.message}`).join("; ");
}
