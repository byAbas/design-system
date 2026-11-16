// PreToolUse, Edit|Write: a file the token build generates is never edited by
// hand. The core names the generated files (`generated` in
// design-system/gates.json) and gives the reason; the edit is denied with it.

import { STAGES, readGates } from "../../../design-system/harness/gates.mjs";
import { caller, deny, editedPath, hookInput } from "./hook-io.mjs";

const input = hookInput();
const path = editedPath(input);
deny(path === undefined ? undefined : STAGES["check-generated"](readGates(), [path], caller(input)));
