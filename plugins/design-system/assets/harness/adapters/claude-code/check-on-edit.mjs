// PostToolUse, Edit|Write: the file an agent just wrote gets the core's
// checks at once (`check-files`: the design lint, and for a token source the
// token checks and the staleness check), so a value outside the tokens comes
// back as the next thing the agent reads instead of at commit time.
//
// The edit has already been written: the hook reports it, and the commit gate
// is what enforces. A file changed through the shell gets the same checks
// from check-after-bash.mjs.

import { STAGES, readGates } from "../../../design-system/harness/gates.mjs";
import { caller, editedPath, hookInput, report } from "./hook-io.mjs";

const input = hookInput();
const path = editedPath(input);
report(path === undefined ? undefined : STAGES["check-files"](readGates(), [path], caller(input)));
