import { describe, it, expect } from 'vitest';
import { ballsToOvers, formatOvers, parseOvers, runRate, requiredRunRate } from '../overs';
import { getFormat, validateRules, minimumBowlers, followOnMargin, createCustomRules, maxOversPerBowlerFor, rulesForOvers } from '../formats';
import { emptyInnings, applyDelivery, inningsEndReason, validateDelivery } from '../scoring';
import { hungarianMin, hungarianMax } from '../hungarian';
import { recommendXI, buildRoleSlots, DEFAULT_BASELINES, type SquadPlayer } from '../selection';
import { recommendBattingOrder, moveInOrder, orderScore } from '../battingOrder';
import { planBowling, suggestNextBowler } from '../bowlingPlanner';
import { buildPlayerGraph, edgeWeight, degree, strongestLinks } from '../graph';
import { generateBracket, roundRobin, seedOrder, choose } from '../tournament';
import { aggregateBatting, aggregateBowling } from '../scorecardAggregation';
import { shotToPoint, zoneBreakdown } from '../wagonWheel';
import { suitabilityScore, skillsOf } from '../selection';

describe('overs (modular arithmetic)', () => {
  it('43 balls = 7.1', () => { expect(ballsToOvers(43)).toEqual({ overs: 7, balls: 1 }); expect(formatOvers(43)).toBe('7.1'); });
  it('parses 7.1 back to 43', () => expect(parseOvers('7.1')).toBe(43));
  it('rejects 7.6', () => expect(() => parseOvers('7.6')).toThrow());
  it('round trips every ball 0..300', () => { for (let b = 0; b <= 300; b++) expect(parseOvers(formatOvers(b))).toBe(b); });
  it('run rate and required rate', () => { expect(runRate(60, 36)).toBe(10); expect(requiredRunRate(150, 60, 84)).toBeCloseTo(90 / 14); expect(requiredRunRate(150, 60, 0)).toBeNull(); });
});

describe('format rules', () => {
  it.each(['T10', 'T20', 'ODI', 'TEST'] as const)('%s preset is valid', (id) => expect(validateRules(getFormat(id))).toEqual([]));
  it('minimum bowlers: T10 5, T20 5, ODI 5', () => { expect(minimumBowlers(getFormat('T10'))).toBe(5); expect(minimumBowlers(getFormat('T20'))).toBe(5); expect(minimumBowlers(getFormat('ODI'))).toBe(5); expect(minimumBowlers(getFormat('TEST'))).toBeNull(); });
  it('follow-on margins', () => { expect(followOnMargin(5)).toBe(200); expect(followOnMargin(4)).toBe(150); expect(followOnMargin(2)).toBe(100); expect(followOnMargin(1)).toBe(75); });
  it('custom 20 overs, max 2 per bowler, 8 players is impossible', () => {
    const { errors } = createCustomRules({ oversPerInnings: 20, maxOversPerBowler: 2, playersPerSide: 8 });
    expect(errors.join(' ')).toMatch(/needs at least 10 bowlers/);
  });
  it('custom 15 overs, max 3, 8 players is valid', () => expect(createCustomRules({ oversPerInnings: 15, maxOversPerBowler: 3, playersPerSide: 8 }).errors).toEqual([]));
  it('rejects overlapping powerplays, draws in limited overs, declarations in limited overs', () => {
    const r = { ...getFormat('T20'), powerplays: [{ fromOver: 1, toOver: 6, maxOutsideCircle: 2 }, { fromOver: 5, toOver: 8, maxOutsideCircle: 5 }] };
    expect(validateRules(r).join()).toMatch(/overlap/);
    expect(validateRules({ ...getFormat('T20'), results: ['win', 'draw'] }).join()).toMatch(/draw/);
    expect(validateRules({ ...getFormat('T20'), declarationsAllowed: true }).join()).toMatch(/Declarations/);
  });
  it('presets are copies, not shared', () => { const a = getFormat('T20'); a.maxOversPerBowler = 9; expect(getFormat('T20').maxOversPerBowler).toBe(4); });

  it('max overs per bowler matches the presets (1/5 of the innings, Law 17.5)', () => {
    expect(maxOversPerBowlerFor(10)).toBe(getFormat('T10').maxOversPerBowler); // 2
    expect(maxOversPerBowlerFor(20)).toBe(getFormat('T20').maxOversPerBowler); // 4
    expect(maxOversPerBowlerFor(50)).toBe(getFormat('ODI').maxOversPerBowler); // 10
  });
  it('max overs per bowler for arbitrary custom overs counts', () => {
    expect(maxOversPerBowlerFor(5)).toBe(1);
    expect(maxOversPerBowlerFor(25)).toBe(5);
    expect(maxOversPerBowlerFor(1)).toBe(1); // never rounds down to 0
  });
  it('rulesForOvers builds valid, playable rules for any custom overs count', () => {
    for (const overs of [1, 5, 10, 15, 20, 25, 50, 100]) {
      const rules = rulesForOvers(overs);
      expect(rules.oversPerInnings).toBe(overs);
      expect(rules.maxOversPerBowler).toBe(maxOversPerBowlerFor(overs));
      expect(validateRules(rules)).toEqual([]);
    }
  });
});

describe('scoring engine', () => {
  const r = getFormat('T20');
  it('wide is not a legal ball and adds a run', () => { const s = applyDelivery(emptyInnings(), { runsOffBat: 0, extra: { type: 'wide', runs: 1 } }, r); expect(s.runs).toBe(1); expect(s.legalBalls).toBe(0); });
  it('no-ball gives a free hit that clears after a legal ball', () => {
    let s = applyDelivery(emptyInnings(), { runsOffBat: 4, extra: { type: 'no_ball', runs: 1 } }, r);
    expect(s.runs).toBe(5); expect(s.freeHit).toBe(true);
    s = applyDelivery(s, { runsOffBat: 1 }, r); expect(s.freeHit).toBe(false);
  });
  it('no free hit in Tests', () => expect(applyDelivery(emptyInnings(), { runsOffBat: 0, extra: { type: 'no_ball', runs: 1 } }, getFormat('TEST')).freeHit).toBe(false));
  it('cannot be bowled on a free hit or off a no-ball, but can be run out', () => {
    const fh = { ...emptyInnings(), freeHit: true };
    expect(validateDelivery({ runsOffBat: 0, wicket: { kind: 'bowled' } }, fh)).not.toBeNull();
    expect(validateDelivery({ runsOffBat: 1, wicket: { kind: 'run_out' } }, fh)).toBeNull();
    expect(validateDelivery({ runsOffBat: 0, extra: { type: 'no_ball', runs: 1 }, wicket: { kind: 'caught' } }, emptyInnings())).not.toBeNull();
  });
  it('stumped is allowed on a wide, bowled is not', () => {
    expect(validateDelivery({ runsOffBat: 0, extra: { type: 'wide', runs: 1 }, wicket: { kind: 'stumped' } }, emptyInnings())).toBeNull();
    expect(validateDelivery({ runsOffBat: 0, extra: { type: 'wide', runs: 1 }, wicket: { kind: 'bowled' } }, emptyInnings())).not.toBeNull();
  });
  it('byes are legal balls and count as extras', () => { const s = applyDelivery(emptyInnings(), { runsOffBat: 0, extra: { type: 'bye', runs: 2 } }, r); expect(s.legalBalls).toBe(1); expect(s.extras.bye).toBe(2); expect(s.runs).toBe(2); });
  it('innings end: 10 wickets, 120 balls, target, declaration; 8-a-side ends at 7 wickets', () => {
    expect(inningsEndReason({ ...emptyInnings(), wickets: 10 }, r)).toBe('all_out');
    expect(inningsEndReason({ ...emptyInnings(), legalBalls: 120 }, r)).toBe('overs_complete');
    expect(inningsEndReason({ ...emptyInnings(), runs: 151 }, r, { target: 151 })).toBe('target_reached');
    expect(inningsEndReason(emptyInnings(), getFormat('TEST'), { declared: true })).toBe('declared');
    expect(inningsEndReason({ ...emptyInnings(), wickets: 7 }, { ...r, playersPerSide: 8 })).toBe('all_out');
    expect(inningsEndReason({ ...emptyInnings(), wickets: 9 }, r)).toBeNull();
  });
  it('a Test innings never ends on overs', () => expect(inningsEndReason({ ...emptyInnings(), legalBalls: 9999 }, getFormat('TEST'))).toBeNull());
});

describe('Hungarian assignment', () => {
  it('finds the known optimum', () => {
    const cost = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
    expect(hungarianMin(cost).total).toBe(5);
  });
  it('greedy would fail here, Hungarian does not (max)', () => {
    const score = [[10, 9], [10, 1]]; // greedy gives row0->col0 (10) then row1->col1 (1) = 11; optimum is 9 + 10 = 19
    expect(hungarianMax(score).total).toBe(19);
  });
  it('rectangular: 2 roles, 4 players', () => { const { assignment } = hungarianMax([[1, 9, 2, 3], [8, 7, 1, 1]]); expect(assignment).toEqual([1, 0]); });
  it('matches brute force on random matrices', () => {
    const perms = (a: number[]): number[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 40; t++) {
      const n = 5; const m = hungarianMin([[0]]) && Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * 100)));
      const best = Math.min(...perms([0, 1, 2, 3, 4]).map((p) => p.reduce((s, c, r) => s + m[r][c], 0)));
      expect(hungarianMin(m).total).toBe(best);
    }
  });
  it('throws when there are fewer players than roles', () => expect(() => hungarianMin([[1], [2]])).toThrow());
});

const mk = (id: string, o: Partial<SquadPlayer> & { runs?: number; balls?: number; inns?: number; outs?: number; bb?: number; rc?: number; w?: number } = {}): SquadPlayer => ({
  id, name: id, isKeeper: o.isKeeper ?? false, bowlingStyle: o.bowlingStyle ?? null, available: o.available ?? true,
  stats: { matches: 10, battingInnings: o.inns ?? 10, dismissals: o.outs ?? 8, runs: o.runs ?? 200, ballsFaced: o.balls ?? 180, ballsBowled: o.bb ?? 0, runsConceded: o.rc ?? 0, wickets: o.w ?? 0 },
});
const squad15: SquadPlayer[] = [
  mk('A', { runs: 400, balls: 300 }), mk('B', { runs: 350, balls: 280 }), mk('C', { runs: 300, balls: 240 }), mk('D', { runs: 250, balls: 220 }),
  mk('K', { isKeeper: true, runs: 220, balls: 180 }), mk('E', { runs: 260, balls: 200 }),
  mk('P1', { bowlingStyle: 'pace', bb: 240, rc: 300, w: 15, runs: 50, balls: 60 }), mk('P2', { bowlingStyle: 'pace', bb: 240, rc: 330, w: 12, runs: 40, balls: 50 }),
  mk('S1', { bowlingStyle: 'spin', bb: 240, rc: 280, w: 14, runs: 30, balls: 40 }), mk('AR', { bowlingStyle: 'pace', bb: 180, rc: 240, w: 8, runs: 240, balls: 190 }),
  mk('B5', { bowlingStyle: 'spin', bb: 120, rc: 160, w: 6, runs: 20, balls: 30 }),
  mk('X1', { runs: 100, balls: 120 }), mk('X2', { runs: 90, balls: 100 }), mk('X3', { runs: 80, balls: 100 }), mk('X4', { bowlingStyle: 'pace', bb: 60, rc: 90, w: 2, runs: 20, balls: 30 }),
];

describe('team selection', () => {
  const t20 = getFormat('T20');
  it('T20 roles: 11 slots, 5 bowling', () => { const s = buildRoleSlots(t20); expect(s).toHaveLength(11); expect(s.filter((x) => x.bowl > 0).length).toBe(5); });
  it('T10 also needs 5 bowlers; 8-a-side custom needs 4 (15 overs, max 4)', () => {
    expect(buildRoleSlots(getFormat('T10')).filter((x) => x.bowl > 0).length).toBe(5);
    const c = createCustomRules({ oversPerInnings: 15, maxOversPerBowler: 4, playersPerSide: 8 }).rules;
    expect(buildRoleSlots(c)).toHaveLength(8);
  });
  it('recommends 11 different players with a keeper and enough bowlers', () => {
    const rec = recommendXI(squad15, t20, DEFAULT_BASELINES.T20);
    expect(rec.picks).toHaveLength(11);
    expect(new Set(rec.picks.map((p) => p.player.id)).size).toBe(11);
    expect(rec.picks.some((p) => p.player.isKeeper)).toBe(true);
    expect(rec.picks.filter((p) => p.player.bowlingStyle).length).toBeGreaterThanOrEqual(5);
    expect(rec.violations.filter((v) => /keeper|bowling options/.test(v))).toEqual([]);
  });
  it('skips unavailable players', () => {
    const s = squad15.map((p) => (p.id === 'A' ? { ...p, available: false } : p));
    expect(recommendXI(s, t20, DEFAULT_BASELINES.T20).picks.map((p) => p.player.id)).not.toContain('A');
  });
  it('warns when there is no wicketkeeper', () => {
    const s = squad15.map((p) => ({ ...p, isKeeper: false }));
    expect(recommendXI(s, t20, DEFAULT_BASELINES.T20).violations.join()).toMatch(/wicketkeeper/);
  });
  it('warns when fewer than 11 are available', () => expect(recommendXI(squad15.slice(0, 9), t20, DEFAULT_BASELINES.T20).violations[0]).toMatch(/Only 9/));
  it('players with no history get a neutral score and a data warning', () => {
    const blank = squad15.map((p) => ({ ...p, stats: { ...p.stats, battingInnings: 0, dismissals: 0, runs: 0, ballsFaced: 0 } }));
    expect(recommendXI(blank, t20, DEFAULT_BASELINES.T20).violations.join()).toMatch(/little match history/);
  });
  it('batting order: openers first, all 11 present; moving keeps a permutation', () => {
    const rec = recommendXI(squad15, t20, DEFAULT_BASELINES.T20);
    const order = recommendBattingOrder(rec.picks);
    expect(new Set(order).size).toBe(11);
    expect(['opener1', 'opener2']).toContain(rec.picks.find((p) => p.player.id === order[0])!.slot.id);
    const moved = moveInOrder(order, 0, 5);
    expect([...moved].sort()).toEqual([...order].sort());
    const bat = Object.fromEntries(rec.picks.map((p) => [p.player.id, p.skills.bat]));
    expect(orderScore(order, bat)).toBeGreaterThanOrEqual(orderScore([...order].reverse(), bat));
  });
});

describe('bowling planner', () => {
  const bowlers = [{ id: 'a', skill: 80, style: 'pace' as const }, { id: 'b', skill: 75, style: 'pace' as const }, { id: 'c', skill: 70, style: 'spin' as const }, { id: 'd', skill: 65, style: 'spin' as const }, { id: 'e', skill: 60, style: 'pace' as const }];
  it('T20: 20 overs, max 4 each, never back to back', () => {
    const plan = planBowling(bowlers, getFormat('T20'))!;
    expect(plan).toHaveLength(20);
    const counts: Record<string, number> = {}; plan.forEach((p) => (counts[p.bowlerId] = (counts[p.bowlerId] ?? 0) + 1));
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(4);
    for (let i = 1; i < plan.length; i++) expect(plan[i].bowlerId).not.toBe(plan[i - 1].bowlerId);
    expect(plan[0].phase).toBe('powerplay'); expect(plan[19].phase).toBe('death');
  });
  it('returns null with 4 bowlers (4x4=16 < 20)', () => expect(planBowling(bowlers.slice(0, 4), getFormat('T20'))).toBeNull());
  it('returns null for Tests', () => expect(planBowling(bowlers, getFormat('TEST'))).toBeNull());
  it('ODI: 50 overs, max 10 each with 5 bowlers', () => { const p = planBowling(bowlers, getFormat('ODI'))!; expect(p).toHaveLength(50); });
});

describe('player network (graph)', () => {
  const g = buildPlayerGraph([{ playerIds: ['a', 'b', 'c'] }, { playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }]);
  it('edge weight = matches together', () => { expect(edgeWeight(g, 'a', 'b')).toBe(2); expect(edgeWeight(g, 'b', 'a')).toBe(2); expect(edgeWeight(g, 'a', 'd')).toBe(0); });
  it('degree and strongest link', () => { expect(degree(g, 'c')).toBe(3); expect(strongestLinks(g, 1)[0]).toEqual({ a: 'a', b: 'b', matches: 2 }); });
  it('duplicates in one match count once', () => expect(edgeWeight(buildPlayerGraph([{ playerIds: ['a', 'b', 'a'] }]), 'a', 'b')).toBe(1));
});

describe('tournaments', () => {
  it('seed order for 8', () => expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]));
  it('bracket of 6 gives byes to seeds 1 and 2', () => { const b = generateBracket(['1', '2', '3', '4', '5', '6']); expect(b.round).toBe(3); expect(b.left!.left!.team).toBe('1'); });
  it('round robin: 5 teams, every pair once', () => {
    const rounds = roundRobin(['a', 'b', 'c', 'd', 'e']); const pairs = rounds.flat().map(([x, y]) => [x, y].sort().join('-'));
    expect(pairs).toHaveLength(10); expect(new Set(pairs).size).toBe(10);
  });
  it('choose(15,11) = 1365', () => expect(choose(15, 11)).toBe(1365));
});

describe('next-bowler suggestion (constraint relaxation)', () => {
  const squad = [
    { id: 'a', name: 'Asha', bowlingStyle: 'pace' as const, skill: 80, oversBowledThisInnings: 2 },
    { id: 'b', name: 'Bina', bowlingStyle: 'spin' as const, skill: 70, oversBowledThisInnings: 4 },
    { id: 'c', name: 'Chetan', bowlingStyle: null, skill: 50, oversBowledThisInnings: 0 },
  ];
  it('tier 1 (normal): a third under-cap bowler who did not just bowl is preferred', () => {
    const threeBowlers = [...squad, { id: 'd', name: 'Divya', bowlingStyle: 'pace' as const, skill: 75, oversBowledThisInnings: 1 }];
    const s = suggestNextBowler(threeBowlers, 4, 'a');
    const asha = s.find((x) => x.bowlerId === 'a')!;
    const bina = s.find((x) => x.bowlerId === 'b')!;
    const divya = s.find((x) => x.bowlerId === 'd')!;
    expect(asha.eligible).toBe(false); // just bowled the last over
    expect(bina.eligible).toBe(false); // capped out at 4/4
    expect(divya.eligible).toBe(true);
    expect(divya.tier).toBe('normal');
  });
  it('ICC Law 17.2 has no exception: the last-over bowler is never eligible, even as the only one left under the cap', () => {
    const squad2 = [
      { id: 'a', name: 'Asha', bowlingStyle: 'pace' as const, skill: 80, oversBowledThisInnings: 2 },
      { id: 'b', name: 'Bina', bowlingStyle: 'spin' as const, skill: 70, oversBowledThisInnings: 4 },
    ];
    const s = suggestNextBowler(squad2, 4, 'a');
    const asha = s.find((x) => x.bowlerId === 'a')!;
    expect(asha.eligible).toBe(false);
    // Bina is capped out too — the panel can have zero eligible recognized bowlers; the
    // emergency pool (opening the whole squad) is what the caller falls back on, never a
    // relaxation of the consecutive-over rule itself.
    const bina = s.find((x) => x.bowlerId === 'b')!;
    expect(bina.eligible).toBe(false);
  });
  it('tier 3 (emergency): opens the whole squad when every recognized bowler is capped', () => {
    const squad3 = [
      { id: 'a', name: 'Asha', bowlingStyle: 'pace' as const, skill: 80, oversBowledThisInnings: 4 },
      { id: 'c', name: 'Chetan', bowlingStyle: null, skill: 50, oversBowledThisInnings: 0 },
    ];
    const s = suggestNextBowler(squad3, 4, 'a');
    const chetan = s.find((x) => x.bowlerId === 'c')!;
    expect(chetan.eligible).toBe(true);
    expect(chetan.tier).toBe('emergency');
  });
  it('no per-bowler cap (Test match): nobody is capped, only consecutive-over rule applies', () => {
    const s = suggestNextBowler(squad, null, 'a');
    expect(s.find((x) => x.bowlerId === 'a')!.eligible).toBe(false); // just bowled
    expect(s.find((x) => x.bowlerId === 'b')!.eligible).toBe(true);
  });
});

describe('context-aware suitability scoring', () => {
  const baselines = DEFAULT_BASELINES.T20;
  const slot = { id: 'pace1', label: 'Pace bowler', bat: 0.1, bowl: 1, orderHint: 9 } as const;
  const paceBowler: SquadPlayer = { id: 'p', name: 'Pace', isKeeper: false, bowlingStyle: 'pace', available: true, stats: { matches: 10, battingInnings: 5, dismissals: 3, runs: 50, ballsFaced: 60, ballsBowled: 240, runsConceded: 160, wickets: 12 } };
  const sk = skillsOf(paceBowler, baselines);
  it('bowling-friendly pitch favors a pace bowler over the same player scored on a batting-friendly pitch', () => {
    const onBowlingPitch = suitabilityScore(paceBowler, slot, sk, { pitchType: 'bowling_friendly' });
    const onBattingPitch = suitabilityScore(paceBowler, slot, sk, { pitchType: 'batting_friendly' });
    expect(onBowlingPitch).toBeGreaterThan(onBattingPitch);
  });
  it('a batter strong against pace scores higher vs a pace-heavy opponent', () => {
    const batSlot = { id: 'top', label: 'Top order', bat: 1, bowl: 0, orderHint: 3 } as const;
    const strongVsPace: SquadPlayer = { id: 'b1', name: 'Bat', isKeeper: false, bowlingStyle: null, available: true, stats: { matches: 5, battingInnings: 5, dismissals: 4, runs: 200, ballsFaced: 150, ballsBowled: 0, runsConceded: 0, wickets: 0 }, battingVsPace: 'strong', battingVsSpin: 'weak' };
    const batSk = skillsOf(strongVsPace, baselines);
    const vsPaceHeavy = suitabilityScore(strongVsPace, batSlot, batSk, { opponentBowlingTendency: 'pace_heavy' });
    const vsSpinHeavy = suitabilityScore(strongVsPace, batSlot, batSk, { opponentBowlingTendency: 'spin_heavy' });
    expect(vsPaceHeavy).toBeGreaterThan(vsSpinHeavy);
  });
  it('fielding tier adds a small tiebreak bonus', () => {
    const withExcellentFielding = { ...paceBowler, fieldingTier: 'excellent' as const };
    const a = suitabilityScore(paceBowler, slot, sk);
    const b = suitabilityScore(withExcellentFielding, slot, skillsOf(withExcellentFielding, baselines));
    expect(b).toBeGreaterThan(a);
  });
  it('injured/unavailable players are excluded from recommendXI', () => {
    const squad: SquadPlayer[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, isKeeper: i === 0, bowlingStyle: i % 2 === 0 ? 'pace' : null, available: true,
      stats: { matches: 10, battingInnings: 10, dismissals: 8, runs: 300, ballsFaced: 250, ballsBowled: i % 2 === 0 ? 200 : 0, runsConceded: 150, wickets: 8 },
      injuryStatus: i === 1 ? 'injured' : 'available',
    }));
    const rec = recommendXI(squad, getFormat('T20'), baselines);
    expect(rec.picks.some((p) => p.player.id === 'p1')).toBe(false);
    expect(rec.violations.join(' ')).toMatch(/injured/);
  });
  it('recommendXI exposes the full bipartite graph (every eligible pairing, not just picks)', () => {
    const squad: SquadPlayer[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, isKeeper: i === 0, bowlingStyle: i % 2 === 0 ? 'pace' : null, available: true,
      stats: { matches: 10, battingInnings: 10, dismissals: 8, runs: 300, ballsFaced: 250, ballsBowled: i % 2 === 0 ? 200 : 0, runsConceded: 150, wickets: 8 },
    }));
    const rec = recommendXI(squad, getFormat('T20'), baselines);
    expect(rec.graph.length).toBe(rec.slots.length * rec.pool.length);
    expect(rec.graph.filter((e) => e.selected).length).toBe(rec.picks.length);
  });
});

describe('wagon wheel', () => {
  it('a six plots further from center than a single', () => {
    const six = shotToPoint({ zone: 'cover', runs: 6, isBoundary: true });
    const single = shotToPoint({ zone: 'cover', runs: 1, isBoundary: false });
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
    expect(dist(six)).toBeGreaterThan(dist(single));
  });
  it('zone breakdown totals runs per zone', () => {
    const b = zoneBreakdown([{ zone: 'cover', runs: 4, isBoundary: true }, { zone: 'cover', runs: 1, isBoundary: false }, { zone: 'long_on', runs: 6, isBoundary: true }]);
    expect(b.find((z) => z.zone === 'cover')!.runs).toBe(5);
    expect(b.find((z) => z.zone === 'long_on')!.runs).toBe(6);
  });
});

describe('scorecard aggregation (post-order over the ball tree)', () => {
  const balls = [
    { overNumber: 1, ballInOver: 1, runsOffBat: 4, extraType: 'none' as const, extraRuns: 0, isWicket: false, wicketKind: null, strikerId: 'A', nonStrikerId: 'B', bowlerId: 'X', dismissedPlayerId: null },
    { overNumber: 1, ballInOver: 2, runsOffBat: 1, extraType: 'none' as const, extraRuns: 0, isWicket: false, wicketKind: null, strikerId: 'A', nonStrikerId: 'B', bowlerId: 'X', dismissedPlayerId: null },
    { overNumber: 1, ballInOver: 3, runsOffBat: 0, extraType: 'wide' as const, extraRuns: 1, isWicket: false, wicketKind: null, strikerId: 'B', nonStrikerId: 'A', bowlerId: 'X', dismissedPlayerId: null },
    { overNumber: 1, ballInOver: 4, runsOffBat: 0, extraType: 'none' as const, extraRuns: 0, isWicket: true, wicketKind: 'bowled' as const, strikerId: 'B', nonStrikerId: 'A', bowlerId: 'X', dismissedPlayerId: 'B' },
    { overNumber: 1, ballInOver: 5, runsOffBat: 6, extraType: 'none' as const, extraRuns: 0, isWicket: false, wicketKind: null, strikerId: 'C', nonStrikerId: 'A', bowlerId: 'X', dismissedPlayerId: null },
    { overNumber: 1, ballInOver: 6, runsOffBat: 0, extraType: 'none' as const, extraRuns: 0, isWicket: false, wicketKind: null, strikerId: 'C', nonStrikerId: 'A', bowlerId: 'X', dismissedPlayerId: null },
  ];
  it('batting: runs/balls/fours/sixes/status per player, in order of first appearance', () => {
    const bat = aggregateBatting(balls, ['A', 'B', 'C']);
    const a = bat.find((b) => b.playerId === 'A')!;
    expect(a.runs).toBe(5); expect(a.balls).toBe(2); expect(a.fours).toBe(1); expect(a.status).toBe('not_out');
    const b = bat.find((b) => b.playerId === 'B')!;
    expect(b.status).toBe('out'); expect(b.dismissal).toBe('b.');
    const c = bat.find((b) => b.playerId === 'C')!;
    expect(c.runs).toBe(6); expect(c.sixes).toBe(1);
  });
  it('bowling: legal balls exclude the wide, wicket is credited, runs include the wide', () => {
    const bowl = aggregateBowling(balls);
    const x = bowl.find((b) => b.playerId === 'X')!;
    expect(x.legalBalls).toBe(5);
    expect(x.wickets).toBe(1);
    expect(x.wides).toBe(1);
    expect(x.runs).toBe(4 + 1 + 1 + 0 + 6 + 0);
  });
});
