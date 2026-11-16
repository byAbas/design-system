// Stop: when the agent finishes a turn, the person is told what the gates
// caught in it: how many times, how many files were fixed, and which are
// still open. The core reads the gate log (design-system/gate-log.jsonl),
// checks the open files again, and writes the sentence; with nothing caught
// the hook says nothing.
//
// It only tells: it never keeps the agent from stopping. A file that is still
// open is the person's to decide, and the commit gate holds it meanwhile.

import { readGates, summarize } from "../../../design-system/harness/gates.mjs";
import { caller, hookInput, note } from "./hook-io.mjs";

note(summarize(readGates(), caller(hookInput())));
