/**
 * Hungarian algorithm (Kuhn-Munkres), O(n^2 * m).
 * Given a cost matrix with n rows and m columns (n <= m), assigns every row to a
 * different column so that the total cost is as small as possible.
 * It does NOT choose a team by itself: SquadSync uses it to match ROLES (rows) to PLAYERS (columns).
 */
export function hungarianMin(cost: number[][]): { assignment: number[]; total: number } {
  const n = cost.length;
  if (n === 0) return { assignment: [], total: 0 };
  const m = cost[0].length;
  if (n > m) throw new RangeError('Need at least as many columns (players) as rows (roles).');
  if (cost.some((row) => row.length !== m)) throw new RangeError('Cost matrix rows must all have the same length.');

  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[j] = row matched to column j (1-based)
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) assignment[p[j] - 1] = j - 1;
  const total = assignment.reduce((s, col, row) => s + cost[row][col], 0);
  return { assignment, total };
}

/** Same thing but maximising a score matrix. */
export function hungarianMax(score: number[][]): { assignment: number[]; total: number } {
  const { assignment } = hungarianMin(score.map((row) => row.map((x) => -x)));
  return { assignment, total: assignment.reduce((s, col, row) => s + score[row][col], 0) };
}
