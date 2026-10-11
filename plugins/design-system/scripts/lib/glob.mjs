// Glob matching for the checks: the exemptions in design-system/gates.json
// name paths by glob. The harness core (assets/harness/core/gates.mjs) holds
// the same two functions, because the core and the checks are copied into a
// project separately and neither may import the other; a test holds the two
// copies to the same behaviour. No dependencies.

/**
 * A glob as a regular expression over a relative, forward-slash path:
 * `**` spans folders, `*` and `?` stay within one, `{a,b}` is either.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      // `**/` matches zero or more folders; a trailing `**` matches the rest.
      if (glob[i + 2] === "/") {
        pattern += "(?:.*/)?";
        i += 2;
      } else {
        pattern += ".*";
        i += 1;
      }
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else if (char === "{") {
      const close = glob.indexOf("}", i);
      if (close === -1) pattern += "\\{";
      else {
        pattern += `(?:${glob.slice(i + 1, close).split(",").map((option) => option.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`;
        i = close;
      }
    } else pattern += char.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

/** True when `file` (relative, forward slashes) matches any of the globs. */
export function matchesAny(file, globs = []) {
  return globs.some((glob) => globToRegExp(glob).test(file));
}
