import type { Pick } from './selection';

/** Weight of each batting position: openers face more balls than number 11. Setting, not a statistic. */
export function positionWeight(position: number, total: number): number {
  return 1 - (position - 1) / (2 * total);
}

/** Recommended order: role hint first, then better batters earlier. Returns player ids. */
export function recommendBattingOrder(picks: Pick[]): string[] {
  return [...picks]
    .sort((a, b) => a.slot.orderHint - b.slot.orderHint || b.skills.bat - a.skills.bat)
    .map((p) => p.player.id);
}

/** How much batting strength the order puts where it matters. Used to compare alternatives. */
export function orderScore(order: string[], batSkill: Record<string, number>): number {
  return order.reduce((s, id, i) => s + (batSkill[id] ?? 0) * positionWeight(i + 1, order.length), 0);
}

/** Moving one player to a new spot is a permutation of the order. */
export function moveInOrder(order: string[], from: number, to: number): string[] {
  const next = [...order];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
