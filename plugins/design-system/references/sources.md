# Sources

> Reference material for the design-system plugin. The official documents behind every decision, and what to confirm in each before relying on it. The plugin records procedures, not version facts: before using a tool, read its documentation for the version the project has installed (for a new project, the latest stable version). When a document and this plugin disagree, follow the document and report the difference.

## Standards

**W3C Design Tokens Community Group, 2025.10**

| Module | URL | Confirm there |
|---|---|---|
| Format | https://www.designtokens.org/tr/2025.10/format/ | Type resolution (5.2.2), name rules (5.1.1), `$extensions` (5.2.3), `$deprecated` (5.2.4), references and `$ref` (7.1), dimension units (8.2), file extension (4.2) |
| Resolver | https://www.designtokens.org/tr/2025.10/resolver/ | `sets`, `modifiers` and `contexts`, `resolutionOrder`, the `version` value the schema expects |
| Color | https://www.designtokens.org/tr/2025.10/color/ | `colorSpace`, `components`, `alpha`, `hex` fallback |
| FAQ | https://www.designtokens.org/faq/ | The spec's scope: it leaves organizational strategy to teams |

Also check whether a newer version than 2025.10 exists (https://www.designtokens.org/), and whether the project's tools support it yet.

**WCAG 2.1**

- 1.4.3 Contrast (Minimum): https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- 1.4.11 Non-text Contrast: https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- G18, the relative luminance and contrast formula: https://www.w3.org/WAI/WCAG22/Techniques/general/G18

## Tools

| Tool | URL | Confirm there |
|---|---|---|
| Terrazzo | https://terrazzo.app/docs/ | CLI commands (`tz build`, `tz check`), config shape (`tokens`, `outDir`, `plugins`, `lint.rules`) |
| Terrazzo resolvers | https://terrazzo.app/docs/guides/resolvers/ | How a resolver is passed in and how each context is built |
| Terrazzo Tailwind | https://terrazzo.app/docs/integrations/tailwind/ | `template`, `@tz (…)` syntax, `theme` mapping, typography sub-properties |
| Claude Code hooks | https://code.claude.com/docs/en/hooks | Hook input, exit code 2 per event (PreToolUse blocks, PostToolUse reports after the tool ran), and the Bash `tool_response.bashEditDiff` changed-file list |
| Claude Code settings | https://code.claude.com/docs/en/settings-reference | `bashEditDiffEnabled`: its scope (user or managed only) and version |
| Terrazzo JS | https://terrazzo.app/docs/integrations/js | `@terrazzo/plugin-js`: `filename`, `contexts`, `properties`, the `resolver.apply()` output, and its advice to keep it server-side |
| Terrazzo lint | https://terrazzo.app/docs/linting/ | Built-in rules and options (`core/consistent-naming`, `core/descriptions`, `a11y/min-contrast`), the custom rule API |
| Terrazzo parser types | `node_modules/@terrazzo/parser/dist/types.d.ts` | `RECOMMENDED_CONFIG`, `LintRule`, and anything a custom Terrazzo lint rule needs. The plugin's own checks read DTCG with `scripts/lib/dtcg.mjs` |
| Tailwind CSS v4 | https://tailwindcss.com/docs/theme | `@theme` namespaces, `--*: initial` resets, `@theme inline`, `--text-*--line-height` sub-properties |
| Tailwind dark mode | https://tailwindcss.com/docs/dark-mode | `@custom-variant` for a data attribute and the system preference |
| @google/design.md | https://github.com/google-labs-code/design.md | Front matter keys, CLI commands (`lint`, `diff`, `export`, `spec`), the linter's rules, whether `imports:` is supported yet (issue #28), and whether `export --format dtcg` still has the defects below |
| Style Dictionary | https://styledictionary.com/info/dtcg/ | DTCG support in the installed version, the converter for older tokens |
| Radix custom palette | https://www.radix-ui.com/colors/custom | The generator a palette may come from; record its version |
| npm lock file | https://docs.npmjs.com/cli/configuring-npm/package-lock-json | Which npm majors write each `lockfileVersion` |
| Corepack | https://nodejs.org/api/corepack.html | How `packageManager` selects the version, and that Node.js 25 and later no longer ship it (it is installed on its own) |
| Radix scale | https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale | What each of the 12 steps is for |

## Migrating from design.md front matter

Write the DTCG files directly from the front matter. Do not use `designmd export --format dtcg` as the source: in 0.4.0 its output has three defects.
- **Alpha is lost.** A colour with alpha keeps its 8-digit hex in `hex`, which DTCG does not allow, and no `alpha` is written.
- **Line height is wrong.** A px line height becomes a bare number (`36px` becomes `36`), which DTCG reads as 36 times the font size.
- **The group is renamed.** `colors` becomes `color`, so every id the rules document cites changes.

Re-check these in the installed version before relying on the export.

## Industry practice (for the "why")

- Material 3 design tokens: https://m3.material.io/foundations/design-tokens/overview
- Material 3 state layers: https://m3.material.io/foundations/interaction/states/state-layers
- Primer button tokens: https://github.com/primer/primitives/blob/main/src/tokens/component/button.json5
- Spectrum colour aliases: https://github.com/adobe/spectrum-design-data/blob/main/packages/tokens/src/color-aliases.json
- Tokens Studio colour modifiers: https://docs.tokens.studio/manage-tokens/token-types/color/modified
- Nathan Curtis, Naming Tokens in Design Systems: https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676

## How to read a version

For each tool the project uses:
1. **Installed version:** read it from the lockfile or `node_modules/<package>/package.json`. The range in `package.json` is not the version.
2. **Latest stable version:** the tool's release page or `npm view <package> version`, which reads the registry.
3. **Documentation:** a doc site usually documents the latest version. When the installed version is older, read the changelog between the two before trusting an example.
4. **The gap:** record both versions in the report's `stack.versions`. A gap that changes a rule is an `info` finding under `docs/current`.

## Before an install

An install with another major of the package manager can rewrite the lock file's format and the project's settings, and leave placeholders the project never asked for (pnpm 12 on a pnpm 10 project wrote unfilled `allowBuilds` entries into `pnpm-workspace.yaml`). Before any install, add or upgrade:
1. **The project's version.** The scan's `packageJson.packageManager` (`pnpm@10.18.0`) is the version, when it is set. Otherwise infer the major from `packageJson.lockfile` and `lockfileVersion`, confirmed in the manager's own documentation or changelog: npm writes `lockfileVersion` 1 in v5 and v6, 2 in v7 and v8, 3 from v9 (npm lock file, above); for pnpm and yarn, read which majors write the recorded format. A setting only some majors know (in `pnpm-workspace.yaml`, the `pnpm` key of `package.json`, `.yarnrc.yml`) narrows the range. When the evidence does not fix a major, ask.
2. **The machine's version.** `<manager> --version`. The same major runs as it is.
3. **Another major runs the project's.** With `packageManager` set and Corepack enabled, the manager's command already resolves to that version. Otherwise run it explicitly: `npx <manager>@<major> install`. Never install with the machine's major and repair what it changed.
4. **Pin it.** When `packageManager` is missing, propose adding it with the version found in 1. It is a change to `package.json`, so it is asked for first.
5. **Check what the install changed.** `git diff --stat` after it: a change to the lock file's format line or to a settings file the plan did not name is a version mismatch. Revert it and run the install again with the project's version.
