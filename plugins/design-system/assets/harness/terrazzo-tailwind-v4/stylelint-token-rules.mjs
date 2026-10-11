// The stylesheet half of `design-system/no-raw-color` (tiers/no-literal-in-code)
// as a Stylelint rule, for a project whose stylesheets Stylelint already lints.
// A project that lints with ESLint gets the same check from ESLint's CSS
// language instead (eslint-token-rules.mjs); one linter per file, never both.
//
// It reports what the tokens do not know: a hex value or a colour function with
// a literal channel in any declaration, a custom property's included; a named
// colour in a colour property; and a custom property whose value is a named
// colour on its own. The judgement is cssDeclarationProblem in
// eslint-token-rules.mjs, so the two linters agree; that file imports nothing
// from ESLint, and is copied beside this one.
//
// Not covered here: the classes of `@apply`, which the ESLint rule
// `token-classes` checks against the generated theme.
//
// Usage in stylelint.config.mjs, the generated outputs left out:
//   export default {
//     plugins: ["./design-system/lint/stylelint-token-rules.mjs"],
//     ignoreFiles: ["src/styles/*.generated.css"],
//     rules: { "design-system/no-raw-color": true },
//   };
// A known violation waits in Stylelint's own way: a disable comment with its
// reason, which `reportDescriptionlessDisables` keeps honest.

import stylelint from "stylelint";
import { RAW_COLOR_MESSAGES, cssDeclarationProblem } from "./eslint-token-rules.mjs";

const ruleName = "design-system/no-raw-color";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rawColor: () => RAW_COLOR_MESSAGES.rawColor,
  namedColor: (name) => RAW_COLOR_MESSAGES.namedColor.replace("{{name}}", name),
});

/** @type {import("stylelint").Rule} */
const rule = (primary) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, ruleName, { actual: primary, possible: [true] })) return;
  root.walkDecls((declaration) => {
    const problem = cssDeclarationProblem(declaration.prop, declaration.value);
    if (!problem) return;
    stylelint.utils.report({ ruleName, result, node: declaration, word: declaration.value, message: problem.messageId === "rawColor" ? messages.rawColor() : messages.namedColor(problem.data.name) });
  });
};
rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
