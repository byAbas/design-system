// What the checks share: the token settings of a project, and loading a
// package from the project's own node_modules, so a check runs with the
// versions the project installed wherever the check file lives. Only the rules
// document's check needs one (`yaml`); the token checks need none. No
// dependencies, Node 20 or later.
//
// The defaults are the canonical layout (references/conventions.md). A project
// that differs states its own paths and group names in design-system/gates.json
// (`tokens`), and a check's command-line flags override both.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { matchesAny } from "./glob.mjs";

/** The config file, relative to the root; the second is where 0.3.x kept it, still read. */
export const CONFIG_FILES = ["design-system/gates.json", "design-tokens.gates.json"];

/** The token settings every check reads: the canonical layout, overridden by the config's `tokens` object and by flags. */
export const TOKEN_DEFAULTS = {
  /** The DTCG resolver, relative to the root. */
  resolver: "design-system/tokens/design.resolver.json",
  /** Plain token files, merged in this order, for a project without a resolver. */
  files: [],
  /** The resolver modifier whose contexts are the themes. */
  modifier: "theme",
  /** The group of literal values (the palette). */
  palette: "palette",
  /** The group of colour roles. */
  roles: "colors",
  /** The group of text styles, and the group their family and weight must alias. */
  typography: "typography",
  fonts: "font",
  /** The `$extensions` key a derived rule is recorded under (reverse domain name notation, DTCG Format 5.2.3). */
  extensionKey: "com.example.design",
  /** Where the build writes its outputs, relative to the root. */
  outDir: "src/styles/",
  /** The rules document. */
  rulesDocument: "DESIGN.md",
  /** The token groups a component in the rules document's contract may read. */
  readable: ["colors", "typography", "rounded"],
  /** The folders, relative to the root, whose component files each need a contract key when they read colour roles; a folder that does not exist is skipped, and [] turns the coverage check off. */
  code: ["src", "app", "components", "pages"],
};

/** The command-line flags a check accepts, each overriding one setting. */
export const SETTING_FLAGS = { "--resolver": "resolver", "--roles": "roles", "--palette": "palette", "--typography": "typography", "--fonts": "fonts", "--modifier": "modifier", "--extension-key": "extensionKey" };

/** The settings named by flags in `argv` (`--roles color`). */
export function flagSettings(argv = []) {
  const settings = {};
  for (let i = 0; i < argv.length; i++) {
    const key = SETTING_FLAGS[argv[i]];
    if (key && argv[i + 1] !== undefined) settings[key] = argv[++i];
  }
  return settings;
}

/**
 * The project's config file and its content. `notes` says when the config is in the 0.3.x place, or unreadable.
 * @returns {{ path: string | null, config: Record<string, any>, notes: string[] }}
 */
export function readConfig(root = process.cwd()) {
  for (const [index, file] of CONFIG_FILES.entries()) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const notes = index > 0 ? [`${file} is where 0.3.x kept the config; move it to ${CONFIG_FILES[0]}`] : [];
    try {
      return { path: file, config: JSON.parse(readFileSync(path, "utf8")), notes };
    } catch (error) {
      return { path: file, config: {}, notes: [...notes, `${file} is not valid JSON: ${error.message}`] };
    }
  }
  return { path: null, config: {}, notes: [] };
}

/**
 * The config's exemptions: paths whose content is artwork or non-UI output (a flag icon, a logo, email HTML), and the
 * rules they are exempt from, every rule when `rules` is left out. Each has a reason, so the decision is recorded and
 * the next audit does not ask again. `problems` names a malformed entry.
 * @returns {{ exemptions: { paths: string[], rules?: string[], reason: string }[], problems: string[] }}
 */
export function exemptionsOf(config) {
  const list = config?.exempt ?? [];
  if (!Array.isArray(list)) return { exemptions: [], problems: ["exempt must be a list of { paths, rules?, reason }"] };
  const problems = [];
  const exemptions = list.filter((entry, index) => {
    const ok =
      Array.isArray(entry?.paths) && entry.paths.length > 0 && entry.paths.every((path) => typeof path === "string" && path.trim()) &&
      (entry.rules === undefined || (Array.isArray(entry.rules) && entry.rules.every((rule) => /^[a-z]+\/[a-z0-9-]+$/.test(rule)))) &&
      typeof entry.reason === "string" && entry.reason.trim().length > 0;
    if (!ok) problems.push(`exempt[${index}] needs paths (globs), a reason, and rules as rubric rule ids when it names any`);
    return ok;
  });
  return { exemptions, problems };
}

/** True when an exemption covers `file` (relative, forward slashes) for `rule`. */
export function isExempt(file, rule, exemptions) {
  return exemptions.some((exemption) => (exemption.rules === undefined || exemption.rules.includes(rule)) && matchesAny(file, exemption.paths));
}

/** The project's token settings: TOKEN_DEFAULTS, then the config's `tokens`, then `flags`. */
export function tokenSettings(root = process.cwd(), flags = {}) {
  return { ...TOKEN_DEFAULTS, ...(readConfig(root).config.tokens ?? {}), ...flags };
}

/** Imports a package the way the project at `root` resolves it; throws with the install hint when it is missing. */
export async function importFromProject(name, root = process.cwd()) {
  const require = createRequire(join(root, "package.json"));
  let path;
  try {
    path = require.resolve(name);
  } catch {
    throw new Error(`${name} is not installed in ${root}. Add it as a devDependency (ask first), then run the check again.`);
  }
  return import(pathToFileURL(path).href);
}
