/** Player network: nodes are players, an edge's weight is the number of matches two players played together. */
export interface PlayerGraph { nodes: string[]; weights: Map<string, Map<string, number>> }

export function buildPlayerGraph(matches: { playerIds: string[] }[]): PlayerGraph {
  const weights = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string) => {
    if (!weights.has(a)) weights.set(a, new Map());
    weights.get(a)!.set(b, (weights.get(a)!.get(b) ?? 0) + 1);
  };
  for (const m of matches) {
    const ids = [...new Set(m.playerIds)];
    for (const id of ids) if (!weights.has(id)) weights.set(id, new Map());
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { bump(ids[i], ids[j]); bump(ids[j], ids[i]); }
  }
  return { nodes: [...weights.keys()], weights };
}

export const neighbors = (g: PlayerGraph, id: string): string[] => [...(g.weights.get(id)?.keys() ?? [])];
export const degree = (g: PlayerGraph, id: string): number => neighbors(g, id).length;
export const edgeWeight = (g: PlayerGraph, a: string, b: string): number => g.weights.get(a)?.get(b) ?? 0;

export function strongestLinks(g: PlayerGraph, limit = 5): { a: string; b: string; matches: number }[] {
  const out: { a: string; b: string; matches: number }[] = [];
  for (const a of g.nodes) for (const [b, w] of g.weights.get(a)!) if (a < b) out.push({ a, b, matches: w });
  return out.sort((x, y) => y.matches - x.matches).slice(0, limit);
}

export function adjacencyMatrix(g: PlayerGraph): number[][] {
  return g.nodes.map((a) => g.nodes.map((b) => edgeWeight(g, a, b)));
}
