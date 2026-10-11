# Conventions: the canonical layout

> Reference material for the design-system plugin. Where a project's design-system files live and what its token groups are called. `setup` creates exactly this, and the checks default to it, so a project that follows it needs no configuration. Load before creating, moving or reading token files.

DTCG does not prescribe file names or group names: the spec "defines the format for token exchange while leaving organizational strategy to design system teams" (https://www.designtokens.org/faq/). This layout is the plugin's convention. It exists so that every skill reads and writes the same places.

## Layout

```
<project root>/
  DESIGN.md                                  the rules document; at the root, where agents look for it
  design-system/
    tokens/
      design.resolver.json                   the one entry point (DTCG Resolver 2025.10)
      foundation/
        palette.tokens.json                  palette.<scale>-<step>: literal colours only; the generator and seeds in $extensions
        font.tokens.json                     font.family.<name>, font.weight.<name>
      semantic/
        typography.tokens.json               typography.<style>: family and weight alias font.*
        spacing.tokens.json                  spacing.<step>
        rounded.tokens.json                  rounded.<step>
        colors.tokens.json                   colors.<role>: only when the interface has one context
      themes/                                only when there are two or more contexts
        <context>.tokens.json                colors.<role> and shadow.<name> for that context
    checks/                                  the checks harness copies from the plugin (check-tokens.mjs, lib/, …)
    harness/                                 how the gates run, agent-agnostic: run-gates.mjs, gates.mjs, with-node.sh
    audits/                                  the audit reports, named by UTC stamp
    gates.json                               the gates, the token settings, the exemptions and the baseline
    suppressions.json                        the known problems the token checks do not fail on yet, each with its reason
    figma/                                   the tokens as Figma variable files, generated and committed: Figma's import and the baseline
  <framework path>/theme.css                 the generated output, where the framework reads it (app/, src/styles/)
  .claude/hooks/design-system/               the Claude Code adapters; .claude/settings.json points here
```

## The harness

`design-system/` names no agent. The core in `design-system/harness/` makes every decision: which files are generated, which checks a changed file gets, what a commit runs. `gates.mjs` holds them as stages, and `run-gates.mjs` runs a stage from the command line (`before-commit`, `on-source-edit`, `check-files <file…>`, `check-generated <file…>`). The git hook and CI call it, and so can an agent whose hooks run a shell command. `with-node.sh` finds Node when a desktop app started the hook.

Each agent's adapters live in that agent's own folder, for Claude Code `.claude/hooks/design-system/`. An adapter only translates: it reads the agent's hook input, calls one stage, and answers in the agent's protocol. A decision an adapter would make belongs in the core or in `design-system/gates.json`. So a new agent needs only its adapters, and `design-system/` does not change.

## Contexts

- **One context** (for example, dark only): the roles go in `semantic/colors.tokens.json`, and the resolver has sets and no modifier. A modifier needs two or more contexts (Resolver §4.1.5.1).
- **Two or more contexts:** the roles and shadows that change go in `themes/<context>.tokens.json`, and the resolver has one modifier, `theme`, with a context per file and a `default`.

`assets/setup/design-system/tokens/` holds both resolver forms.

## Group names

| Group | Tier | Holds | Tailwind v4 namespace |
|---|---|---|---|
| `palette` | Palette | Literal colours | None: the palette is never a utility |
| `font` | Palette | Families and weights | None: wired separately (profile, Pitfalls) |
| `colors` | Role | Colour roles, aliases into `palette` or derived | `color` |
| `typography` | Role | Text styles | `text` |
| `spacing` | Role | Spacing steps | `spacing` |
| `rounded` | Role | Radii | `radius` |
| `shadow` | Role | Elevation, per context | `shadow` |

The role groups take the names of the rules document's sections. `DESIGN.md` is written in the design.md format, whose front matter has fixed sections: `colors`, `typography`, `rounded`, `spacing` and `components` (https://github.com/google-labs-code/design.md, spec: Schema and Token References). Its `components:` contract cites ids in those sections (`{colors.primary}`, `{typography.label-md}`, `{rounded.full}`), and the contract check requires each to be a token id. So the token groups carry the same names, and an id reads the same in the tokens, the contract and the design.md linter. `palette`, `font` and `shadow` have no design.md section, and keep plain names.

Before 0.5.0 the roles group was `color`. A project that has it sets `tokens.roles` (and `readable`) in `design-system/gates.json`, or moves (below).

## Figma

`figma-export.mjs` writes the tokens as one file per Figma collection and mode, in the DTCG 2025.10 dialect Figma's "Import mode" reads (decisions, Figma):

| Collection | From | Modes | Variables |
|---|---|---|---|
| `Palette` | `palette` | one, `default` | colours, never published |
| `Colors` | `colors` | one per context of the resolver's `theme` modifier | colours; a role that points to the palette stays an alias of it (`com.figma.aliasData`) |
| `Font` | `font` | one | a family as its first name, a weight as a number |
| `Spacing`, `Radius` | `spacing`, `rounded` | one | px numbers, a rem as 16px |
| each other group with numbers (`Containers`, `Motion` …) | that group | one | px dimensions, durations in seconds, numbers |

- A variable's name is its token id without the group, and Figma shows a nested group as `group/name`: `colors.brand.accent` is `brand/accent` in `Colors`.
- A colour is an sRGB object with its `hex`, an OKLCH or P3 value written as its gamut-mapped sRGB. A token's `$description` is the variable's description.
- Text styles, shadows, gradients and easing curves are Figma styles, not variables, and dimensions in units other than px and rem have none; the export names them.
- The files are `design-system/figma/<Collection>/<mode>.tokens.json` (`tokens.figma` moves the folder): Figma names an imported mode after its file, so the mode is `default`, `light` or `dark`. They are generated outputs, gated like the CSS, and committed: they are the baseline `figma-propose.mjs` compares a designer's export against.
- Every file is checked against the DTCG 2025.10 JSON Schema before it is written (Schema, below); a file the schema refuses is never written.

**What Figma does**, from round trips of ispanviza-web's and cv-screener's tokens (2026-10-11), where its documentation says nothing:
- **Plans:** Starter holds one mode per collection, Professional ten. A project with light and dark needs Professional or above to keep them as modes of one collection; `figma-export` says so when a collection has more than one mode.
- each collection exports as a zip holding one file per mode, named after the mode alone (`default.tokens.json`), with the mode's name in the file's `$extensions` as `com.figma.modeName`. Unzip each into its own folder, named after the collection (Finder does): several zips hold a file of the same name;
- a role that aliases the palette keeps its resolved value, with `com.figma.aliasData` naming the target by name and by Figma's own ids;
- a dimension comes back as `$type: "number"`, a plain float32 (47.776 is 47.7760009765625), so values are compared to float32's precision and without a unit;
- a duration imported in seconds comes back in milliseconds (0.15 s is 150 ms), so durations are compared in seconds;
- a font family comes back as `$type: "string"`, which DTCG does not have; `figma-propose` names such variables and compares them as text;
- collections share variable names (`sm`, `md` are a radius and a breakpoint), so a file is matched to its collection by its folder first, and by its names only where no folder says;
- a description comes back as it went, but an apostrophe is held HTML-escaped (`recruiter's` is read through the Plugin API as `recruiter&#39;s`); descriptions are not compared.

### Reading Figma through its MCP server

With Figma's official MCP server connected, `figma-propose` reads the designer's file itself (decisions, Figma), read only:

- **One fixed script.** `scripts/figma/read-variables.js` reads every local collection, mode and variable through the Plugin API (`getLocalVariableCollectionsAsync`, `getLocalVariablesAsync`), and returns them in pages of about 16,000 characters: `use_figma` returns at most 20 kB. `figma-read.mjs script --page N` prints it with its page set. `figma-propose`'s hook lets `use_figma` run that script and nothing else, character for character, and refuses input it cannot read.
- **Checked on the way back.** The script hashes each page in Figma (FNV-1a over its JSON). `figma-read.mjs assemble` refuses a page whose hash differs, a page missing or saved twice, pages of two reads, and a count of variables that differs from the one Figma made.
- **The same files as Figma's export.** `assemble` writes each collection and mode as `<Collection>/<mode>.tokens.json` in the dialect of Figma's own export, held to the DTCG 2025.10 schema, so `figma-propose.mjs` compares them unchanged: a colour as an srgb object, a number as a number, a string as `$type: "string"`, an alias as its resolved value with `com.figma.aliasData`.
- **Types:** Figma holds a duration as a `TIMING` variable, in seconds as a float32 (0.15 is 0.15000000596046448); `assemble` writes it as a duration in milliseconds (150 ms), as Figma's export does. A boolean, an `EASING` variable (`figma-export` writes none) and an alias of a library variable are named and not written.
- **Plans:** reading works on Starter (2026-10-11, cv-screener's file, 118 variables in one call of 7,475 bytes). Starter allows 20 MCP calls a month; `whoami` is exempt.

## Schema

Every token file the checks read is held to the DTCG 2025.10 JSON Schema the Design Tokens Community Group publishes, copied byte for byte into `scripts/lib/schemas/` with its source and SHA-256, and run by a small draft-07 validator (`scripts/lib/json-schema.mjs`, no dependency). The validator implements exactly the keywords the schema uses and throws on any other, so no rule of the schema is passed over. A value is checked against the type it inherits from its group too (Format §5.2.2): the schema alone checks a value only when its token states a type. `check-tokens.mjs` reports what the schema refuses as `format/dtcg-valid`, with the file and the JSON Pointer.

## The contract

The rules document's `components:` contract names, by token id, the roles each component reads. Its keys follow one rule, so a check can tell which component file a key belongs to, and which files have none:

- **A key starts with its component's file name in kebab-case.** `Button.tsx` → `button` or `button-*`; `CtaBannerSection.tsx` → `cta-banner-section-*`; `FAQSection.tsx` → `faq-section-*`. A key covers a file when it is that prefix, or starts with it and a hyphen.
- **An `index` file takes its folder's name:** `Button/index.tsx` → `button`.
- **A route file takes its folder's name and its own**, because every route has the same file name: `app/[locale]/layout.tsx` → `locale-layout`, `app/about/page.tsx` → `about-page`, `routes/about/+page.svelte` → `about-page`. A dynamic segment loses its brackets (`[slug]` → `slug`), and a route group's folder (`(marketing)`) is skipped. The route files are `page`, `layout`, `template`, `loading`, `error`, `global-error`, `not-found`, `default`, `route` and `root`.
- **Pages are components.** A page file that reads roles needs its key, as any other file.
- **Parts, variants and states** add to the key: `button-primary`, `button-primary-hover`, `contact-form-input-placeholder`. A variant states only what changes; the contrast check gives it what it does not state from the key it extends. A key ending in `-disabled` is exempt from contrast (SC 1.4.3), and a key ending in `-icon` is a graphic, held to 3:1 (SC 1.4.11).

**Coverage.** `scripts/check-rules-contract.mjs` lists the component files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.astro`, without tests and stories) under the code folders, `tokens.code` in `design-system/gates.json` (`["src", "app", "components", "pages"]` by default; a folder that does not exist is skipped, and `[]` turns coverage off). A file reads roles when it names a colour role in a colour utility (`bg-surface`, `hover:text-on-surface/80`) or in a variable (`var(--color-surface)`, `bg-(--color-surface)`). Each such file without a key is a `tiers/components-read-roles` finding. A helper in `.ts` or `.js` (a `cva` variants file) is its component's, not a component of its own.

The rule comes from ispanviza-web, whose next audit computed coverage mechanically from it and named the 15 files with no key, page files included.

## Exemptions

Some files hold colours that are not interface: flag icons, a logo, email HTML, a script that writes a CRM's settings. The rubric does not apply to them, and the decision is recorded once, in `design-system/gates.json`, so no audit asks again:

```json
"exempt": [
  { "paths": ["public/flags/**", "components/icons/Logo.tsx"], "reason": "Artwork, drawn in its own colours" },
  { "paths": ["emails/**"], "rules": ["tiers/no-literal-in-code"], "reason": "Email HTML, which cannot read CSS variables" }
]
```

- `paths` are globs from the root; `rules` are rubric rule ids, and an exemption without them covers every rule. Each one has a `reason`.
- **Who reads them:** the scan leaves exempt files out of the raw colours and lists them; the audit records what it finds there as `out-of-scope`, with the reason (`report.md`, Status); the rules-contract check leaves them out of coverage; the code lint turns its rules off there through `exemptionConfigs(gates)` from the profile's ESLint rules, so ESLint matches the same globs.
- An exemption is for content that is not interface. A component that is interface and breaks a rule is a finding, or a suppression while it waits for its fix.

## Suppressions

A project with many findings cannot make its gates block on all of them at once, and a gate that does not block teaches people to ignore it. Suppressions let a gate block every new problem while the known ones are worked off: the ratchet. They follow ESLint's bulk suppressions (https://eslint.org/docs/latest/use/suppressions), so the lint and the token checks work the same way:

- `--suppress-all` on `check-tokens.mjs` or `check-rules-contract.mjs` records every current problem of that check in `design-system/suppressions.json`. Each gets an empty reason, which a person fills in; the check names the ones still without one.
- A suppressed problem does not fail the check. A new one does.
- A suppressed problem that no longer occurs fails the check until `--prune-suppressions` removes it, so the file only shrinks.
- A problem is recorded by a key with its rule, its context and its subject, and no value: `tiers/contrast-pairs@light:components.button-whatsapp`. The key stays the same while the ratio moves, so a partial fix does not need a new suppression.
- The code lint keeps its own: ESLint's `eslint-suppressions.json` (`eslint --suppress-rule design-system/no-raw-color`, `--prune-suppressions`), for scripts and the stylesheets ESLint's CSS language lints; Stylelint's `stylelint-suppressions.json` (`stylelint --suppress=design-system/no-raw-color`) where Stylelint lints them. Stylelint's are experimental in 17.15 and do not fail on a stale one, so run `--suppress` again after a fix.
- The audit records a suppressed problem as `accepted`, with its reason (`report.md`, Status). Accepted findings still count: a part with one is `partial`.

Atlassian's token contrast test works the same way: it asserts that the failures equal a checked-in registry of known violations.

## A project that differs

An existing project may already use other names (`color`, `radius`) or paths (`tokens/` at the root). Since DTCG does not prescribe them, **the audit does not report this as a finding**. Instead:
1. The auditor reads the files, and passes the project's names to the checks explicitly (`--roles color`). The report records them in `stack.tokenSettings`.
2. `harness` writes them into `design-system/gates.json` (`tokens.resolver`, `tokens.roles`, `tokens.palette` …), so every later check reads the same names.
3. Moving to the canonical names and paths is an optional `fix` batch, with its own commit (below). `harness` says when a project differs, and never moves files itself.

Before 0.4.0 the config was `design-tokens.gates.json` at the root and reports went to `design-tokens-audit/`. Both are still read.

## Moving to the canonical layout

The procedure a `fix` batch follows, first run on a real project (a DTCG token set with a sets-only resolver, moved from `tokens/` at the root). It moves and renames; it never changes a value, and never adds a missing tier (a palette or font group is a tier finding, fixed in its own batch).

1. **Token files.** `git mv` each file into `design-system/tokens/`: `foundation/` for the palette and fonts, `semantic/` for roles and styles with one context, `themes/<context>.tokens.json` for what changes per context. The resolver goes to the tokens root, where the checks look by default, and only its `$ref`s change. Every token file stays byte-identical.
2. **The rest.** `git mv` the build template to `design-system/`, and the audit reports to `design-system/audits/`.
3. **Paths.** Update every file that names a moved one: the build config, the rules document's `imports:` and prose, the agent instructions, lint plugins and scripts that read the tokens, the generated output's own comment in the template, and `design-system/gates.json` (`sources`; remove each `tokens` setting that now equals the default).
4. **Names.** Rename a group only when it differs from the table above. A rename changes the token ids, the rules document's contract and the build's group selectors; the utilities stay, since the build maps groups to namespaces.
5. **Edit tools.** Make content changes with the agent's Edit and Write tools, not `sed` or a heredoc, so the hooks check each one.
6. **Proof.**
   - The rebuilt output differs in comment lines only (the build writes the template's path into its header). Compare it with comments stripped: every declaration is identical.
   - `check-tokens` reports the same problems as before the move, under the new names and paths. A different count means the move lost or added something.
   - The gates and the project's own checks pass.
