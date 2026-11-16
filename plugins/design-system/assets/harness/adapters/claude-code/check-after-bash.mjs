// PostToolUse, Bash: the files a shell command changed (`sed -i`, a heredoc, a
// `node -e` script) get the checks an Edit or Write gets in check-on-edit.mjs,
// so an agent that edits through the shell is told at once, not at the commit.
//
// Claude Code records the list (hook-io.mjs, changedPaths) in auto and
// bypassPermissions mode when it has the agent edit through Bash, and in every
// mode when the person's own settings set `bashEditDiffEnabled: true` (a
// project's settings cannot). In real auto-mode sessions it recorded every
// shell edit to token files and generated CSS. The docs call the list best
// effort and a public beta, for finding what to review: this hook reports, and
// the commit gate enforces. With no list, it passes.
//
// The PreToolUse hook only sees the Edit and Write tools, so a shell write to
// a generated output is caught here: the core runs the staleness check for it.

import { STAGES, readGates } from "../../../design-system/harness/gates.mjs";
import { caller, changedPaths, hookInput, report } from "./hook-io.mjs";

const input = hookInput();
const paths = changedPaths(input);
report(paths.length === 0 ? undefined : STAGES["check-files"](readGates(), paths, caller(input)));
