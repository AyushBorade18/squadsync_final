import type { FormatRules } from './formats';

export interface BowlerInput { id: string; skill: number; style: 'pace' | 'spin' }
export type Phase = 'powerplay' | 'middle' | 'death';
export interface OverPlan { over: number; bowlerId: string; phase: Phase }

export const DEATH_FRACTION = 0.2; // last 20% of overs. Setting.
const PACE_IN_PHASE: Record<Phase, number> = { powerplay: 1.1, middle: 0.95, death: 1.1 };
const SPIN_IN_PHASE: Record<Phase, number> = { powerplay: 0.9, middle: 1.1, death: 0.9 };

export function phaseOf(over: number, rules: FormatRules): Phase {
  const total = rules.oversPerInnings!;
  const pp = rules.powerplays[0];
  const ppEnd = pp ? pp.toOver : Math.round(total * 0.3);
  if (over <= ppEnd) return 'powerplay';
  if (over > total - Math.ceil(total * DEATH_FRACTION)) return 'death';
  return 'middle';
}

/**
 * Plans who bowls each over. Rules: nobody exceeds the per-bowler limit, nobody bowls two overs
 * in a row, and every over is covered. Uses backtracking, so it finds a valid plan whenever one exists.
 * Returns null if no valid plan exists (for example, too few bowlers).
 */
export function planBowling(bowlers: BowlerInput[], rules: FormatRules): OverPlan[] | null {
  if (rules.oversPerInnings === null || rules.maxOversPerBowler === null) return null;
  const total = rules.oversPerInnings;
  const max = rules.maxOversPerBowler;
  // Quick impossibility check: not enough total capacity, or fewer than 2 bowlers (no gap between overs).
  if (bowlers.length < 2 || bowlers.length * max < total) return null;
  const used = new Map(bowlers.map((b) => [b.id, 0]));
  const plan: OverPlan[] = [];

  const solve = (over: number): boolean => {
    if (over > total) return true;
    const phase = phaseOf(over, rules);
    const prev = plan[plan.length - 1]?.bowlerId;
    const candidates = bowlers
      .filter((b) => b.id !== prev && (used.get(b.id) ?? 0) < max)
      .sort((a, b) => weighted(b, phase) - weighted(a, phase));
    for (const c of candidates) {
      used.set(c.id, (used.get(c.id) ?? 0) + 1);
      plan.push({ over, bowlerId: c.id, phase });
      if (solve(over + 1)) return true;
      plan.pop();
      used.set(c.id, (used.get(c.id) ?? 0) - 1);
    }
    return false;
  };
  return solve(1) ? plan : null;
}

const weighted = (b: BowlerInput, phase: Phase) => b.skill * (b.style === 'pace' ? PACE_IN_PHASE[phase] : SPIN_IN_PHASE[phase]);

/**
 * Who should bowl the next over, live — a constraint-satisfaction problem solved by graceful
 * relaxation rather than backtracking (there's no "undo" once an over has been bowled).
 *
 * ICC Law 17.2 ("no bowler may bowl two overs consecutively") has NO exception — unlike the
 * format's per-bowler overs cap, it can never be relaxed. With at least 2 players on a side
 * there is always at least one legal player to hand the ball to (anyone who isn't the one who
 * just bowled), so the tiers only ever relax the CAP, never the consecutive-over rule:
 *   Tier 1 (normal):    recognized bowler, not capped out, didn't bowl the over just finished.
 *   Tier 2 (emergency): every recognized bowler is capped out — open the whole squad (anyone
 *                        can legally bowl an over), still excluding the last-over bowler.
 */
export interface LiveBowlerInput { id: string; name: string; bowlingStyle: 'pace' | 'spin' | null; skill: number; oversBowledThisInnings: number }
export interface BowlerSuggestion { bowlerId: string; name: string; eligible: boolean; score: number; reason: string; tier: 'normal' | 'emergency' }

export function suggestNextBowler(
  squad: LiveBowlerInput[],
  maxOversPerBowler: number | null,
  lastOverBowlerId: string | null,
): BowlerSuggestion[] {
  const recognized = squad.filter((p) => p.bowlingStyle !== null);
  const underCap = (p: LiveBowlerInput) => maxOversPerBowler === null || p.oversBowledThisInnings < maxOversPerBowler;
  const useEmergencyPool = !recognized.some(underCap);
  const pool = useEmergencyPool ? squad : recognized;

  const suggestions: BowlerSuggestion[] = pool.map((p) => {
    const capped = maxOversPerBowler !== null && p.oversBowledThisInnings >= maxOversPerBowler && !useEmergencyPool;
    if (capped) {
      return { bowlerId: p.id, name: p.name, eligible: false, score: 0, reason: `Already bowled the maximum ${maxOversPerBowler} overs this innings.`, tier: 'normal' };
    }
    // Absolute, never relaxed: Law 17.2 — no bowler bowls two overs in a row.
    if (lastOverBowlerId !== null && p.id === lastOverBowlerId) {
      return { bowlerId: p.id, name: p.name, eligible: false, score: 0, reason: "Bowled the over just finished — can't bowl two in a row (Law 17.2).", tier: 'normal' };
    }
    const freshness = maxOversPerBowler === null ? 50 : Math.max(0, (maxOversPerBowler - p.oversBowledThisInnings) * 10);
    const tier: BowlerSuggestion['tier'] = useEmergencyPool ? 'emergency' : 'normal';
    const note = tier === 'emergency' ? ' — emergency: every recognized bowler is capped out' : '';
    const oversLabel = `${p.oversBowledThisInnings}${maxOversPerBowler === null ? '' : `/${maxOversPerBowler}`} overs bowled`;
    return { bowlerId: p.id, name: p.name, eligible: true, score: Math.round(p.skill + freshness), reason: `${oversLabel}${note}`, tier };
  });
  return suggestions.sort((a, b) => (a.eligible === b.eligible ? b.score - a.score : a.eligible ? -1 : 1));
}
