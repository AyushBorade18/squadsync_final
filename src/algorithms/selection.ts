import { hungarianMax } from './hungarian';
import { minimumBowlers, type FormatId, type FormatRules } from './formats';

export type BowlingStyle = 'pace' | 'spin' | null;

export interface PlayerStats {
  matches: number;
  battingInnings: number;
  dismissals: number;
  runs: number;
  ballsFaced: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
}
export type InjuryStatus = 'available' | 'injured' | 'unavailable';
export type MatchupTier = 'weak' | 'average' | 'strong';
export type FieldingTier = 'average' | 'good' | 'excellent';
export type PitchType = 'batting_friendly' | 'bowling_friendly' | 'balanced';
export type OpponentBowlingTendency = 'pace_heavy' | 'spin_heavy' | 'balanced';
export type OpponentBattingTendency = 'pace_heavy' | 'spin_heavy' | 'balanced';

export interface SquadPlayer {
  id: string; name: string; isKeeper: boolean; bowlingStyle: BowlingStyle; available: boolean; stats: PlayerStats;
  /** Persisted roster attributes (Players management). All optional — missing data falls back to neutral. */
  injuryStatus?: InjuryStatus;
  battingVsPace?: MatchupTier;
  battingVsSpin?: MatchupTier;
  fieldingTier?: FieldingTier;
  oversBowledRecentMatches?: number;
}

/** Match-specific context the coach sets before asking for a Recommended XI. */
export interface MatchContext { pitchType?: PitchType; opponentBowlingTendency?: OpponentBowlingTendency }

/** Tunable "what a good performance looks like" markers per format. These are settings, not statistics. */
export interface Baselines { battingAverage: number; strikeRate: number; bowlingAverage: number; economy: number }
export const DEFAULT_BASELINES: Record<FormatId, Baselines> = {
  T10: { battingAverage: 20, strikeRate: 140, bowlingAverage: 20, economy: 9 },
  T20: { battingAverage: 30, strikeRate: 130, bowlingAverage: 25, economy: 8 },
  ODI: { battingAverage: 40, strikeRate: 90, bowlingAverage: 35, economy: 5.5 },
  TEST: { battingAverage: 40, strikeRate: 50, bowlingAverage: 35, economy: 3.2 },
  CUSTOM: { battingAverage: 30, strikeRate: 130, bowlingAverage: 25, economy: 8 },
};
export const NEUTRAL_SCORE = 50;
export const MIN_BATTING_INNINGS = 5;
export const MIN_BALLS_BOWLED = 60; // 10 overs

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface Skills { bat: number; bowl: number; batConfidence: number; bowlConfidence: number }

/** Turns real match stats into 0-100 batting and bowling scores. Little data pulls the score toward neutral. */
export function skillsOf(p: SquadPlayer, b: Baselines): Skills {
  const s = p.stats;
  const avg = s.dismissals > 0 ? s.runs / s.dismissals : s.battingInnings > 0 ? s.runs : 0;
  const sr = s.ballsFaced > 0 ? (s.runs / s.ballsFaced) * 100 : 0;
  const batRaw = 100 * (0.5 * clamp01(avg / b.battingAverage) + 0.5 * clamp01(sr / b.strikeRate));
  const bowlAvg = s.wickets > 0 ? s.runsConceded / s.wickets : Infinity;
  const econ = s.ballsBowled > 0 ? s.runsConceded / (s.ballsBowled / 6) : Infinity;
  const bowlRaw = 100 * (0.5 * (Number.isFinite(bowlAvg) ? clamp01(b.bowlingAverage / bowlAvg) : 0) + 0.5 * (Number.isFinite(econ) ? clamp01(b.economy / econ) : 0));
  const batConfidence = clamp01(s.battingInnings / MIN_BATTING_INNINGS);
  const bowlConfidence = clamp01(s.ballsBowled / MIN_BALLS_BOWLED);
  return {
    bat: batConfidence * batRaw + (1 - batConfidence) * NEUTRAL_SCORE,
    bowl: p.bowlingStyle ? bowlConfidence * bowlRaw + (1 - bowlConfidence) * NEUTRAL_SCORE : 0,
    batConfidence, bowlConfidence,
  };
}

export type SlotNeed = 'keeper' | 'pace' | 'spin' | 'bowls';
export interface RoleSlot { id: string; label: string; bat: number; bowl: number; needs?: SlotNeed; orderHint: number }

const BATTER_SLOTS: RoleSlot[] = [
  { id: 'opener1', label: 'Opener', bat: 1, bowl: 0, orderHint: 1 },
  { id: 'opener2', label: 'Opener', bat: 1, bowl: 0, orderHint: 2 },
  { id: 'keeper', label: 'Wicketkeeper', bat: 0.8, bowl: 0, needs: 'keeper', orderHint: 6.5 },
  { id: 'top', label: 'Top order', bat: 1, bowl: 0, orderHint: 3 },
  { id: 'finisher', label: 'Finisher', bat: 1, bowl: 0, orderHint: 6 },
  { id: 'middle1', label: 'Middle order', bat: 1, bowl: 0, orderHint: 4 },
  { id: 'middle2', label: 'Middle order', bat: 1, bowl: 0, orderHint: 5 },
  { id: 'middle3', label: 'Middle order', bat: 1, bowl: 0, orderHint: 5.5 },
];
const BOWLER_SLOTS: RoleSlot[] = [
  { id: 'pace1', label: 'Pace bowler', bat: 0.1, bowl: 1, needs: 'pace', orderHint: 9 },
  { id: 'spin1', label: 'Spin bowler', bat: 0.1, bowl: 1, needs: 'spin', orderHint: 8 },
  { id: 'pace2', label: 'Pace bowler', bat: 0.1, bowl: 1, needs: 'pace', orderHint: 10 },
  { id: 'allrounder', label: 'All-rounder', bat: 0.5, bowl: 0.5, needs: 'bowls', orderHint: 7 },
  { id: 'bowler5', label: 'Bowler', bat: 0.1, bowl: 1, needs: 'bowls', orderHint: 11 },
  { id: 'bowler6', label: 'Bowler', bat: 0.1, bowl: 1, needs: 'bowls', orderHint: 11.5 },
];
const UNLIMITED_OVERS_MIN_BOWLERS = 4; // setting: Tests have no per-bowler cap, so we ask for a sensible attack

/** Builds the roles the XI must fill. The number of bowling roles comes from the format's bowling limits. */
export function buildRoleSlots(rules: FormatRules): RoleSlot[] {
  const n = rules.playersPerSide;
  const bowlers = Math.min(minimumBowlers(rules) ?? UNLIMITED_OVERS_MIN_BOWLERS, n, BOWLER_SLOTS.length);
  return [...BATTER_SLOTS.slice(0, Math.max(0, n - bowlers)), ...BOWLER_SLOTS.slice(0, bowlers)];
}

const FORBIDDEN = 1e6;
function eligible(p: SquadPlayer, slot: RoleSlot): boolean {
  switch (slot.needs) {
    case 'keeper': return p.isKeeper;
    case 'pace': return p.bowlingStyle === 'pace';
    case 'spin': return p.bowlingStyle === 'spin';
    case 'bowls': return p.bowlingStyle !== null;
    default: return true;
  }
}
/** 0-100 "Role Fit" of a player (via their skills) in one role. This is the base term — the
 *  weighted 70% of suitabilityScore() below — kept standalone since it's also the fallback
 *  when a player has no match history at all. */
export function roleFit(_p: SquadPlayer, slot: RoleSlot, sk: Skills): number {
  const w = slot.bat + slot.bowl;
  return (slot.bat * sk.bat + slot.bowl * sk.bowl) / w;
}

const matchupScore = (tier: MatchupTier | undefined): number => (tier === 'strong' ? 100 : tier === 'weak' ? 0 : 50);
const FIELDING_BONUS: Record<FieldingTier, number> = { average: 0, good: 0.5, excellent: 1 };

/** How well this player's attributes line up with today's pitch (for a bowling-heavy slot) or
 *  the opponent's attack (for a batting-heavy slot). 50 = no signal either way. */
function contextFit(p: SquadPlayer, slot: RoleSlot, ctx: MatchContext): number {
  if (slot.bowl > slot.bat) {
    if (!ctx.pitchType || ctx.pitchType === 'balanced') return 50;
    const paceFavored = ctx.pitchType === 'bowling_friendly';
    // A bowling-friendly pitch rewards pace; a batting-friendly one still wants spin to break
    // things up, so we treat "batting_friendly" as spin-favored rather than neutral.
    return p.bowlingStyle === (paceFavored ? 'pace' : 'spin') ? 100 : 40;
  }
  if (!ctx.opponentBowlingTendency || ctx.opponentBowlingTendency === 'balanced') {
    return (matchupScore(p.battingVsPace) + matchupScore(p.battingVsSpin)) / 2;
  }
  return ctx.opponentBowlingTendency === 'pace_heavy' ? matchupScore(p.battingVsPace) : matchupScore(p.battingVsSpin);
}

/** Penalizes a bowler who has been overworked in recent matches, for a bowling-heavy slot. */
function fatigueFit(p: SquadPlayer, slot: RoleSlot): number {
  if (slot.bowl <= slot.bat) return 100;
  return Math.max(0, 100 - (p.oversBowledRecentMatches ?? 0) * 10);
}

export interface SuitabilityBreakdown { base: number; context: number; fatigue: number; fielding: number; total: number }

/** The full weighted suitability score shown to the coach: 70% base role fit (from real
 *  stats), 20% match context (pitch / opponent tendency), 10% fatigue, plus a small fielding
 *  tiebreak. Mirrors the old project's SuitabilityScoringService, extended with the breakdown
 *  so the coach can see exactly why a player scored the way they did. */
export function suitabilityBreakdown(p: SquadPlayer, slot: RoleSlot, sk: Skills, ctx: MatchContext = {}): SuitabilityBreakdown {
  const base = roleFit(p, slot, sk);
  const context = contextFit(p, slot, ctx);
  const fatigue = fatigueFit(p, slot);
  const fielding = FIELDING_BONUS[p.fieldingTier ?? 'average'];
  return { base, context, fatigue, fielding, total: 0.7 * base + 0.2 * context + 0.1 * fatigue + fielding };
}

export function suitabilityScore(p: SquadPlayer, slot: RoleSlot, sk: Skills, ctx: MatchContext = {}): number {
  return suitabilityBreakdown(p, slot, sk, ctx).total;
}

export interface Pick { slot: RoleSlot; player: SquadPlayer; fit: number; confidence: number; skills: Skills; breakdown: SuitabilityBreakdown }
export interface Alternative { slotId: string; out: string; in: string; fitChange: number }
/** One edge of the full player x slot bipartite graph, for the Decision Engine's graph view. */
export interface GraphEdge { slotId: string; playerId: string; score: number; eligible: boolean; selected: boolean }
export interface Recommendation {
  picks: Pick[];
  selectionScore: number;
  coverage: number;
  balance: number;
  violations: string[];
  alternatives: Alternative[];
  /** Every player x slot pairing considered, not just the chosen ones — the full bipartite graph. */
  graph: GraphEdge[];
  slots: RoleSlot[];
  pool: SquadPlayer[];
}

export function recommendXI(squad: SquadPlayer[], rules: FormatRules, baselines: Baselines, context: MatchContext = {}): Recommendation {
  const pool = squad.filter((p) => p.available && p.injuryStatus !== 'injured' && p.injuryStatus !== 'unavailable');
  const slots = buildRoleSlots(rules);
  const violations: string[] = [];
  const sidelinedCount = squad.filter((p) => p.available && (p.injuryStatus === 'injured' || p.injuryStatus === 'unavailable')).length;
  if (sidelinedCount > 0) violations.push(`${sidelinedCount} available player${sidelinedCount > 1 ? 's are' : ' is'} marked injured/unavailable and excluded from selection.`);
  if (pool.length < slots.length) {
    violations.push(`Only ${pool.length} players are eligible but ${slots.length} are needed.`);
    return { picks: [], selectionScore: 0, coverage: 0, balance: 0, violations, alternatives: [], graph: [], slots, pool };
  }
  const skills = new Map(pool.map((p) => [p.id, skillsOf(p, baselines)]));
  const fitOf = (p: SquadPlayer, s: RoleSlot) => suitabilityScore(p, s, skills.get(p.id)!, context);
  // Score matrix: rows = roles, columns = players. Impossible pairs get a huge negative score.
  const matrix = slots.map((s) => pool.map((p) => (eligible(p, s) ? fitOf(p, s) : -FORBIDDEN)));
  const { assignment } = hungarianMax(matrix);

  const picks: Pick[] = slots.map((slot, i) => {
    const player = pool[assignment[i]];
    const sk = skills.get(player.id)!;
    const ok = eligible(player, slot);
    if (!ok) violations.push(`No available ${slot.label.toLowerCase()} in the squad. ${player.name} fills the spot but is not a natural fit.`);
    const breakdown = ok ? suitabilityBreakdown(player, slot, sk, context) : { base: 0, context: 0, fatigue: 0, fielding: 0, total: 0 };
    return { slot, player, fit: breakdown.total, confidence: slot.bowl > slot.bat ? sk.bowlConfidence : sk.batConfidence, skills: sk, breakdown };
  });

  // Team-level constraints
  if (!picks.some((x) => x.player.isKeeper)) violations.push('The team has no wicketkeeper.');
  const bowlers = picks.filter((x) => x.player.bowlingStyle !== null).length;
  const need = minimumBowlers(rules);
  if (need !== null && bowlers < need) violations.push(`Only ${bowlers} bowling options but ${need} are needed to cover ${rules.oversPerInnings} overs.`);
  const lowData = picks.filter((x) => x.confidence < 1).length;
  if (lowData > 0) violations.push(`${lowData} of the picks have little match history, so their scores lean on a neutral estimate.`);

  const selectionScore = picks.reduce((s, x) => s + x.fit, 0) / picks.length;
  const coverage = picks.filter((x) => x.fit >= NEUTRAL_SCORE).length / picks.length;
  const batMean = mean(picks.map((x) => x.skills.bat));
  const bowlMean = mean(picks.filter((x) => x.player.bowlingStyle).map((x) => x.skills.bowl));
  const balance = Math.max(batMean, bowlMean) === 0 ? 0 : Math.min(batMean, bowlMean) / Math.max(batMean, bowlMean);

  // Alternatives: best bench player for each role and how much fit changes.
  const chosen = new Set(picks.map((x) => x.player.id));
  const bench = pool.filter((p) => !chosen.has(p.id));
  const alternatives: Alternative[] = [];
  picks.forEach((pk) => {
    let best: { p: SquadPlayer; f: number } | null = null;
    for (const p of bench) if (eligible(p, pk.slot)) { const f = fitOf(p, pk.slot); if (!best || f > best.f) best = { p, f }; }
    if (best) alternatives.push({ slotId: pk.slot.id, out: pk.player.name, in: best.p.name, fitChange: best.f - pk.fit });
  });
  alternatives.sort((a, b) => b.fitChange - a.fitChange);

  // Full bipartite graph: every player x slot edge, for the Decision Engine's graph view.
  const selectedPairs = new Set(picks.map((pk) => `${pk.slot.id}:${pk.player.id}`));
  const graph: GraphEdge[] = [];
  for (const slot of slots) {
    for (const p of pool) {
      const ok = eligible(p, slot);
      graph.push({ slotId: slot.id, playerId: p.id, score: ok ? fitOf(p, slot) : 0, eligible: ok, selected: selectedPairs.has(`${slot.id}:${p.id}`) });
    }
  }

  return { picks, selectionScore, coverage, balance, violations, alternatives: alternatives.slice(0, 3), graph, slots, pool };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
