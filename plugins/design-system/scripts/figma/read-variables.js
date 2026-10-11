// design-system: every local variable of a Figma file, read only, for figma-read.mjs.
// Run through the Figma MCP server's use_figma; figma-read-guard.mjs lets only this exact
// script through, with its PAGE line set, so it is never edited.
const PAGE = 0;
const LIMIT = 16000;
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variables = await figma.variables.getLocalVariablesAsync();
const byId = new Map(variables.map((variable) => [variable.id, variable]));
const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
const channel = (value) => Math.round(value * 255).toString(16).padStart(2, "0");
const encode = async (value) => {
  if (value && typeof value === "object" && value.type === "VARIABLE_ALIAS") {
    const target = byId.get(value.id) ?? (await figma.variables.getVariableByIdAsync(value.id));
    if (!target) return { a: null, id: value.id };
    let collection = collectionNames.get(target.variableCollectionId);
    if (collection === undefined) collection = (await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId))?.name ?? null;
    return { a: [collection, target.name] };
  }
  if (value && typeof value === "object" && "r" in value) {
    const hex = `#${channel(value.r)}${channel(value.g)}${channel(value.b)}`;
    const alpha = "a" in value ? Math.round(value.a * 1000) / 1000 : 1;
    return alpha < 1 ? [hex, alpha] : hex;
  }
  return value;
};
const rows = [];
for (const collection of collections) {
  for (const id of collection.variableIds) {
    const variable = byId.get(id);
    if (!variable) continue;
    const values = [];
    for (const mode of collection.modes) values.push(await encode(variable.valuesByMode[mode.modeId]));
    rows.push(variable.description ? [collection.name, variable.name, variable.resolvedType, values, variable.description] : [collection.name, variable.name, variable.resolvedType, values]);
  }
}
const pages = [];
let current = [];
let size = 0;
for (const row of rows) {
  const length = JSON.stringify(row).length;
  if (current.length > 0 && size + length > LIMIT) {
    pages.push(current);
    current = [];
    size = 0;
  }
  current.push(row);
  size += length;
}
if (current.length > 0 || pages.length === 0) pages.push(current);
const data = { v: 1, page: PAGE, pages: pages.length, total: rows.length, collections: collections.map((collection) => [collection.name, collection.modes.map((mode) => mode.name)]), rows: pages[PAGE] ?? [] };
const text = JSON.stringify(data);
let hash = 0x811c9dc5;
for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
return { data, fnv1a: hash.toString(16).padStart(8, "0") };
