// Whether a version satisfies an npm semver range, for the versions table: a
// latest release that a peer range of an installed package does not allow
// cannot be installed yet (references/report.md, A version). The range
// grammar is npm's (https://github.com/npm/node-semver#ranges): `||`, comparator
// sets, `^`, `~`, x-ranges, hyphen ranges and partial versions. Prereleases are
// not compared: the table lists stable releases. No dependencies.

/** A version or partial version as [major, minor, patch], null for a part left out or an `x`. */
function parts(text) {
  const [major, minor, patch] = text.replace(/^[=v]+/, "").split("-")[0].split(".").map((part) => (part === undefined || /^[x*]$/i.test(part) ? null : Number(part)));
  return [major ?? null, minor ?? null, patch ?? null];
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const floor = ([major, minor, patch]) => [major ?? 0, minor ?? 0, patch ?? 0];

/** The [lower, upper) bounds of one comparator; null for no bound; upper inclusive when `inclusive`. */
function bounds(comparator) {
  const match = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(comparator.trim());
  const [, operator = "", rest] = match;
  const [major, minor, patch] = parts(rest || "*");
  if (major === null) return { lower: null, upper: null };
  const low = floor([major, minor, patch]);
  const next = (level) => (level === 0 ? [major + 1, 0, 0] : level === 1 ? [major, minor + 1, 0] : [major, minor, patch + 1]);
  const precision = patch !== null ? 2 : minor !== null ? 1 : 0;
  switch (operator) {
    case "^": {
      const level = major > 0 || minor === null ? 0 : minor > 0 || patch === null ? 1 : 2;
      return { lower: low, upper: next(level) };
    }
    case "~":
      return { lower: low, upper: next(minor === null ? 0 : 1) };
    case ">=":
      return { lower: low, upper: null };
    case ">":
      return { lower: next(precision), upper: null };
    case "<":
      return { lower: null, upper: low };
    case "<=":
      return { lower: null, upper: next(precision) };
    default:
      return { lower: low, upper: precision === 2 ? null : next(precision), exact: precision === 2 ? low : undefined };
  }
}

/** True when `version` (x.y.z) satisfies the npm range. */
export function satisfies(version, range) {
  const target = floor(parts(version));
  return String(range)
    .split("||")
    .some((set) => {
      const hyphen = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(set);
      let comparators = set.trim().split(/\s+/).filter(Boolean);
      if (hyphen) {
        // A partial upper bound includes the whole of what it names: `1 - 2` allows every 2.x.
        const [major, minor, patch] = parts(hyphen[2]);
        comparators = [`>=${hyphen[1]}`, patch !== null ? `<=${hyphen[2]}` : minor !== null ? `<${major}.${minor + 1}` : `<${major + 1}`];
      }
      return (comparators.length === 0 ? ["*"] : comparators).every((comparator) => {
        const { lower, upper, exact } = bounds(comparator);
        if (exact) return compare(target, exact) === 0;
        return (lower === null || compare(target, lower) >= 0) && (upper === null || compare(target, upper) < 0);
      });
    });
}
