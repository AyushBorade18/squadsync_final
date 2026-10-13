/** Knockout bracket as a binary tree, generated recursively. Byes go to the top seeds. */
export interface BracketNode { round: number; team: string | null; left?: BracketNode; right?: BracketNode }

const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

/** Standard seeding order for a bracket of `size` (1 v 8, 4 v 5, ...), built recursively. */
export function seedOrder(size: number): number[] {
  if (size === 1) return [1];
  const prev = seedOrder(size / 2);
  return prev.flatMap((s) => [s, size + 1 - s]);
}

export function generateBracket(teams: string[]): BracketNode {
  if (teams.length < 2) throw new RangeError('A knockout needs at least 2 teams.');
  const size = nextPow2(teams.length);
  const slots = seedOrder(size).map((seed) => teams[seed - 1] ?? null); // null = bye
  const build = (lo: number, hi: number, round: number): BracketNode => {
    if (hi - lo === 1) return { round: 0, team: slots[lo] };
    const mid = (lo + hi) / 2;
    const left = build(lo, mid, round - 1);
    const right = build(mid, hi, round - 1);
    // A bye advances the other team automatically.
    const team = left.team && !right.team ? left.team : right.team && !left.team ? right.team : null;
    return { round, team, left, right };
  };
  return build(0, size, Math.log2(size));
}

/** Round robin fixtures using the circle method. Every team plays every other team once. */
export function roundRobin(teams: string[]): [string, string][][] {
  const list: (string | null)[] = teams.length % 2 ? [...teams, null] : [...teams];
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const games: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) games.push([a, b]);
    }
    rounds.push(games);
    list.splice(1, 0, list.pop()!); // rotate everyone except the first team
  }
  return rounds;
}

/** Number of ways to choose k from n, for "possible playing XIs". */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}
