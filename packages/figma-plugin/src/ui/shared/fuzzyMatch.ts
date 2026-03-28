/**
 * Fuzzy match: checks if all characters of `query` appear in order in `target`.
 * Returns a score (higher = better match) or -1 if no match.
 *
 * Scoring bonuses:
 *  - Consecutive character matches
 *  - Match at start of a segment (after '.', '/', '-', '_', or start of string)
 *  - Match at start of target
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return -1;

  // Fast path: exact substring match gets a big bonus
  const substringIdx = t.indexOf(q);
  if (substringIdx !== -1) {
    let score = 100 + q.length * 10;
    if (substringIdx === 0) score += 50; // starts with query
    // Check if substring starts at a segment boundary
    if (substringIdx > 0 && isSegmentBoundary(t[substringIdx - 1])) score += 30;
    return score;
  }

  let score = 0;
  let qi = 0;
  let prevMatchIdx = -2; // track consecutive matches

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;

      // Consecutive match bonus
      if (ti === prevMatchIdx + 1) {
        score += 5;
      }

      // Segment start bonus (after delimiter or at position 0)
      if (ti === 0 || isSegmentBoundary(t[ti - 1])) {
        score += 10;
      }

      // camelCase boundary bonus
      if (ti > 0 && isUpperCase(target[ti]) && isLowerCase(target[ti - 1])) {
        score += 8;
      }

      prevMatchIdx = ti;
      qi++;
    }
  }

  // All query chars must be matched
  if (qi < q.length) return -1;

  return score;
}

function isSegmentBoundary(ch: string): boolean {
  return ch === '.' || ch === '/' || ch === '-' || ch === '_' || ch === ' ';
}

function isUpperCase(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

function isLowerCase(ch: string): boolean {
  return ch >= 'a' && ch <= 'z';
}
