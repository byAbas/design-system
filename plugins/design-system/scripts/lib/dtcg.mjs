// A read-only reader for W3C Design Tokens 2025.10: the Format module
// (https://www.designtokens.org/tr/2025.10/format/) and the Resolver module
// (https://www.designtokens.org/tr/2025.10/resolver/). It loads a resolver or
// plain token files, merges the sources for one input, resolves aliases, and
// returns each token with its resolved value. It never writes anything. Every
// problem it finds is collected with a message, so a check can report them
// all at once. No dependencies.
//
// Not supported: remote `$ref` URLs (a MAY in Resolver §4.2), which are
// reported as a problem.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isToken = (node) => isObject(node) && "$value" in node;
const ALIAS = /^\{([^{}]+)\}$/;

// ---------- JSON Pointer (RFC 6901) ----------

/** The value a JSON Pointer (`#/a/b` or `/a/b`) names in `document`, or undefined. */
export function pointer(document, path) {
  const parts = path.replace(/^#/, "").split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = document;
  for (const part of parts) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

// ---------- merging (Resolver §4.1.4, §6.2) ----------

/**
 * `source` merged into `target`, the later occurrence winning (Resolver §6.2). Groups merge key by key. A token
 * is replaced whole: "if a token is declared multiple times, the last occurrence … will be the final value".
 */
export function mergeTokens(target, source) {
  if (!isObject(target) || !isObject(source) || isToken(source) || isToken(target)) return structuredClone(source);
  const merged = { ...target };
  for (const [key, value] of Object.entries(source)) merged[key] = key in merged ? mergeTokens(merged[key], value) : structuredClone(value);
  return merged;
}

// ---------- loading ----------

/**
 * Reads a JSON file, and the value a reference object names (Resolver §4.2): same-document (`#/…`), a relative
 * file, or a file fragment (`file.json#/…`). Keys beside `$ref` override the target (§4.2.2).
 */
function makeLoader(problems) {
  const cache = new Map();
  const readJson = (path) => {
    if (!cache.has(path)) {
      try {
        cache.set(path, JSON.parse(readFileSync(path, "utf8")));
      } catch (error) {
        problems.push(`cannot read ${path}: ${error.message}`);
        cache.set(path, undefined);
      }
    }
    return cache.get(path);
  };
  const follow = (reference, file, document, stack = []) => {
    const { $ref, ...overrides } = reference;
    if (typeof $ref !== "string") return reference;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test($ref)) {
      problems.push(`${file}: remote reference ${$ref} is not supported; use a relative file`);
      return undefined;
    }
    const [target, fragment = ""] = $ref.split("#");
    const targetFile = target ? resolve(dirname(file), target) : file;
    const key = `${targetFile}#${fragment}`;
    if (stack.includes(key)) {
      problems.push(`circular reference: ${[...stack, key].join(" → ")} (Resolver §4.2)`);
      return undefined;
    }
    const targetDocument = target ? readJson(targetFile) : document;
    if (targetDocument === undefined) return undefined;
    let value = fragment ? pointer(targetDocument, `#${fragment}`) : targetDocument;
    if (value === undefined) {
      problems.push(`${file}: ${$ref} points to nothing`);
      return undefined;
    }
    if (isObject(value) && typeof value.$ref === "string") value = follow(value, targetFile, targetDocument, [...stack, key]);
    return Object.keys(overrides).length > 0 ? mergeTokens(value, overrides) : value;
  };
  /** Every file read so far that parsed, by absolute path: what a schema check validates. */
  const loaded = () => [...cache].filter(([, document]) => document !== undefined);
  return { readJson, follow, loaded };
}

/**
 * A resolver document, checked against the Resolver module, with its reference objects ready to follow.
 * @returns {{ kind: "resolver", path: string, document: object, problems: string[], follow: Function }}
 */
export function loadResolver(path) {
  const problems = [];
  const loader = makeLoader(problems);
  const file = resolve(path);
  const document = loader.readJson(file);
  if (!isObject(document)) return { kind: "resolver", path: file, document: {}, problems, follow: loader.follow, loaded: loader.loaded };
  if (document.version !== "2025.10") problems.push(`resolver version is ${JSON.stringify(document.version)}; this reader follows 2025.10 (Resolver §4.1.2)`);
  if (!Array.isArray(document.resolutionOrder) || document.resolutionOrder.length === 0) problems.push("resolver has no resolutionOrder (Resolver §4.1.6)");
  for (const [name, modifier] of Object.entries(document.modifiers ?? {})) problems.push(...modifierProblems(name, modifier));
  const inline = new Set();
  for (const item of document.resolutionOrder ?? []) {
    if (isObject(item) && !("$ref" in item)) {
      if (!["set", "modifier"].includes(item.type) || typeof item.name !== "string") problems.push("an inline resolutionOrder item needs type set or modifier, and a name (Resolver §4.1.6.1)");
      else if (inline.has(item.name)) problems.push(`inline ${item.type} ${item.name} is declared twice in resolutionOrder`);
      else inline.add(item.name);
      if (item.type === "modifier") problems.push(...modifierProblems(item.name, item));
    }
  }
  return { kind: "resolver", path: file, document, problems, follow: loader.follow, loaded: loader.loaded };
}

function modifierProblems(name, modifier) {
  const contexts = Object.keys(modifier?.contexts ?? {});
  const problems = [];
  if (contexts.length < 2) problems.push(`modifier ${name} declares ${contexts.length} context${contexts.length === 1 ? "" : "s"}; a modifier needs two or more (Resolver §4.1.5.1). A single context belongs in a set`);
  if (modifier?.default !== undefined && !contexts.includes(modifier.default)) problems.push(`modifier ${name}'s default ${JSON.stringify(modifier.default)} is not one of its contexts`);
  return problems;
}

/** Plain token files without a resolver, merged in the order given. */
export function loadTokenFiles(paths) {
  const problems = [];
  const loader = makeLoader(problems);
  return { kind: "files", paths: paths.map((path) => resolve(path)), problems, readJson: loader.readJson, loaded: loader.loaded };
}

// ---------- resolving one input (Resolver §6) ----------

/** The modifiers a resolver's resolutionOrder applies, by name. */
function orderedItems(source) {
  const { document, follow, path } = source;
  return (document.resolutionOrder ?? []).map((item) => {
    if (isObject(item) && typeof item.$ref === "string") {
      const match = /^#\/(sets|modifiers)\/(.+)$/.exec(item.$ref);
      const value = follow(item, path, document);
      return match ? { type: match[1] === "sets" ? "set" : "modifier", name: match[2], value } : { type: "set", name: item.$ref, value };
    }
    return { type: item?.type, name: item?.name, value: item };
  });
}

/** The modifiers in a resolver's order, with their contexts and defaults: what an input may set. */
export function modifiersOf(source) {
  if (source.kind !== "resolver") return {};
  return Object.fromEntries(orderedItems(source).filter((item) => item.type === "modifier" && isObject(item.value)).map((item) => [item.name, { contexts: Object.keys(item.value.contexts ?? {}), default: item.value.default }]));
}

/**
 * Every token for one input: sources merged in order (Resolver §6.2), then groups extended, then aliases resolved
 * (§6.3, Format §7).
 * @param {ReturnType<typeof loadResolver> | ReturnType<typeof loadTokenFiles>} source
 * @param {Record<string, string>} [input] modifier name → context
 * @returns {{ tokens: Record<string, object>, problems: string[] }}
 */
export function resolveTokens(source, input = {}) {
  // Reading a referenced file can fail while resolving, and adds to source.problems; those are gathered at the end.
  const problems = [];
  let tree = {};
  if (source.kind === "files") {
    for (const path of source.paths) {
      const document = source.readJson(path);
      if (document !== undefined) tree = mergeTokens(tree, document);
    }
  } else {
    const modifiers = modifiersOf(source);
    for (const [name, value] of Object.entries(input)) {
      if (!(name in modifiers)) problems.push(`input names modifier ${name}, which the resolver does not declare (Resolver §6.1)`);
      else if (typeof value !== "string" || !modifiers[name].contexts.includes(value)) problems.push(`input ${name}: ${JSON.stringify(value)} is not one of its contexts (${modifiers[name].contexts.join(", ")})`);
    }
    for (const item of orderedItems(source)) {
      if (!isObject(item.value)) continue;
      let sources = [];
      if (item.type === "set") sources = item.value.sources ?? [];
      else if (item.type === "modifier") {
        const context = input[item.name] ?? item.value.default;
        if (context === undefined) {
          problems.push(`modifier ${item.name} has no default, and the input does not choose a context (Resolver §6.1)`);
          continue;
        }
        sources = item.value.contexts?.[context] ?? [];
      }
      for (const entry of sources) {
        const value = isObject(entry) && typeof entry.$ref === "string" ? source.follow(entry, source.path, source.document) : entry;
        if (isObject(value)) tree = mergeTokens(tree, value);
      }
    }
  }
  tree = extendGroups(tree, problems);
  const flat = flatten(tree, problems);
  const tokens = resolveAliases(flat, tree, problems);
  return { tokens, problems: [...new Set([...source.problems, ...problems])] };
}

// ---------- groups (Format §6) ----------

/** The tree with every `$extends` applied: the target group deep-merged under the local one (Format §6.4). */
function extendGroups(tree, problems) {
  const groupAt = (reference) => {
    const path = typeof reference === "string" ? ALIAS.exec(reference)?.[1]?.split(".") : typeof reference?.$ref === "string" ? reference.$ref.replace(/^#\//, "").split("/") : undefined;
    if (!path) return undefined;
    let node = tree;
    for (const part of path) node = isObject(node) ? node[part] : undefined;
    return isObject(node) && !isToken(node) ? { node, id: path.join(".") } : undefined;
  };
  const visit = (node, id, stack) => {
    if (!isObject(node) || isToken(node)) return node;
    let result = node;
    if (node.$extends !== undefined) {
      const target = groupAt(node.$extends);
      if (!target) problems.push(`${id || "(root)"}.$extends names ${JSON.stringify(node.$extends)}, which is not a group (Format §6.4)`);
      else if (stack.includes(target.id)) problems.push(`circular $extends: ${[...stack, target.id].join(" → ")} (Format §6.4.4)`);
      else {
        const local = { ...node };
        delete local.$extends;
        result = mergeTokens(visit(target.node, target.id, [...stack, target.id]), local);
      }
    }
    const out = {};
    for (const [key, value] of Object.entries(result)) out[key] = key.startsWith("$") && key !== "$root" ? value : visit(value, id ? `${id}.${key}` : key, [...stack, id ? `${id}.${key}` : key]);
    return out;
  };
  return visit(tree, "", []);
}

/** Every token by id, with the type and deprecation it inherits from its groups (Format §5.2.2, §6.3.1). */
function flatten(tree, problems) {
  const tokens = {};
  const walk = (node, path, inheritedType, inheritedDeprecated) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$") && key !== "$root") continue;
      if (key !== "$root" && /[{}.]/.test(key)) problems.push(`${[...path, key].join(".")}: a name must not contain {, } or . (Format §5.1.1)`);
      if (!isObject(value)) continue;
      const id = [...path, key].join(".");
      if (isToken(value)) {
        const children = Object.keys(value).filter((child) => !child.startsWith("$"));
        if (children.length > 0) problems.push(`${id} has $value and child tokens or groups: an object is a token or a group, not both (Format §5)`);
        tokens[id] = {
          id,
          $type: value.$type ?? inheritedType,
          $value: value.$value,
          $description: value.$description,
          $extensions: value.$extensions,
          $deprecated: value.$deprecated ?? inheritedDeprecated,
          originalValue: { $value: value.$value },
        };
      } else walk(value, [...path, key], value.$type ?? inheritedType, value.$deprecated ?? inheritedDeprecated);
    }
  };
  walk(tree, [], tree.$type, tree.$deprecated);
  return tokens;
}

/** Every alias and `$ref` in the tokens' values resolved; chains followed, cycles reported (Format §7). */
function resolveAliases(flat, tree, problems) {
  const resolved = {};
  const resolving = [];
  const resolveToken = (id) => {
    if (resolved[id]) return resolved[id];
    const token = flat[id];
    if (!token) return undefined;
    if (resolving.includes(id)) {
      problems.push(`circular alias: ${[...resolving.slice(resolving.indexOf(id)), id].join(" → ")} (Format §7.2.3)`);
      return undefined;
    }
    resolving.push(id);
    let aliasChain;
    let $type = token.$type;
    let $value;
    const whole = typeof token.$value === "string" ? ALIAS.exec(token.$value) : null;
    if (whole) {
      const target = targetToken(whole[1], id);
      if (target) {
        aliasChain = [target.id, ...(target.aliasChain ?? [])];
        $value = target.$value;
        $type ??= target.$type;
      }
    } else $value = resolveValue(token.$value, id);
    resolving.pop();
    if ($type === undefined) problems.push(`${id} has no $type: set it on the token or a parent group (Format §5.2.2)`);
    const result = { ...token, $type, $value, aliasChain, aliasOf: aliasChain?.at(-1) };
    resolved[id] = result;
    return result;
  };
  const targetToken = (targetId, from) => {
    if (!flat[targetId]) {
      const isGroup = pointer(tree, `/${targetId.split(".").join("/")}`) !== undefined;
      problems.push(`${from} aliases {${targetId}}, ${isGroup ? "which is a group, not a token (Format §7.1.1)" : "which does not exist"}`);
      return undefined;
    }
    return resolveToken(targetId);
  };
  const resolveValue = (value, from) => {
    if (typeof value === "string") {
      const alias = ALIAS.exec(value);
      return alias ? targetToken(alias[1], from)?.$value : value;
    }
    if (Array.isArray(value)) return value.map((item) => resolveValue(item, from));
    if (isObject(value)) {
      if (typeof value.$ref === "string") {
        const target = pointer(tree, value.$ref);
        if (target === undefined) {
          problems.push(`${from}: $ref ${value.$ref} points to nothing (Format §7.4)`);
          return undefined;
        }
        return resolveValue(target, from);
      }
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, from)]));
    }
    return value;
  };
  for (const id of Object.keys(flat)) resolveToken(id);
  return resolved;
}
