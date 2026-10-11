# Principles

> Reference material for the design-system plugin. These rules hold in every stack. Load before setting up, auditing or fixing a token architecture. Each principle names the rubric rules that check it (`rubric.md`).

## 1. One source per fact

Values live in token files, written as W3C Design Tokens (DTCG). Rules live in a rules document (`DESIGN.md`): what each token means, when it is used, which roles each component reads, and why. The rules document holds no values. Code holds only wiring: how the build reads the tokens and exposes them. Any other file that states a value is a second source, and two sources drift.

Checked by: `docs/rules-hold-no-values`, `tiers/no-literal-in-code`, `format/single-source-build`.

## 2. Three tiers

- **Palette** (primitives): literal values, never aliases. The palette names a value by its place in a scale (`gray-9`), not by its use.
- **Roles** (semantic tokens): each role aliases one palette entry, or is derived from other roles by a recorded rule. A role names a use (`surface`, `on-surface`, `primary`).
- **Component contract**: which roles each component reads, written in the rules document by token id.

Code reads roles. Code never reads the palette.

Checked by: `tiers/palette-literal`, `tiers/role-aliases-palette`, `tiers/no-primitive-in-code`, `tiers/components-read-roles`.

## 3. A role keeps its meaning in every theme

A theme changes which palette entry a role points to, never what the role means. Every theme defines the same roles. The dark value is chosen to keep the meaning, not by inverting the light one.

Checked by: `format/themes-complete`.

## 4. A missing value becomes a token

A colour, size or style the interface needs and the tokens lack becomes a new role, or a new palette entry from the palette's generator. Never a literal in code, an arbitrary utility value, or an opacity modifier on a role: each of those is a value no document knows, and the other themes cannot reach it.

Checked by: `tiers/no-literal-in-code`.

## 5. Derived values are computed once and stored

A state colour (hover, pressed), a blend or a translucent colour is computed at build time and stored as a static value in each theme. The rule that produced it is recorded on the token (`$extensions`, and in words in `$description`), and a check confirms the value still equals what the rule gives. DTCG has no colour functions, and the major systems ship these states as static tokens (`decisions.md`, Interaction states).

Checked by: `tiers/derived-rule-recorded`.

## 6. Composite styles travel together

A text style is one unit: family, size, line height, weight and letter spacing. Code applies the whole style. Borrowing one part of another style goes through that style's own variable, never through a literal.

Checked by: `tiers/no-literal-in-code`, `naming/one-name-everywhere`.

## 7. Generated outputs are never edited by hand

Whatever the build writes from the tokens (CSS variables, a framework theme) is rebuilt, not edited. A check fails when an output no longer matches its tokens, and an agent's edit to an output is refused.

Checked by: `format/single-source-build`.

## 8. Enforced, not described

Every rule a program can check is a gate. The same gate runs for people and for agents: a warning for a person mid-edit, an error for an agent, a commit and CI, where a warning is easy to ignore because the exit code stays zero.

Checked by: the audit's recommended gates (`report.md`).

## 9. Library first

Before writing a check, look for a tool of the standard that already does it: the token build tool's own linter, the rules document's linter, the framework's lint ecosystem. A custom check is written as a rule of an existing tool where the tool allows it, so it runs where the others run.

## 10. Verify against the installed version

Tools in this space change quickly. Every API, command and option is confirmed in the official documentation of the version the project has installed (for a new project, the latest stable version) before it is used. When the documentation and this plugin disagree, the documentation wins and the difference is reported.

## 11. Rules document first

A new visual element is written into the rules document first (which roles it reads, and why), then the tokens it needs, then the code.
