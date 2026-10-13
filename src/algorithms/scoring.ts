import type { FormatRules } from './formats';

export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';
export type DismissalKind = 'bowled' | 'caught' | 'lbw' | 'stumped' | 'hit_wicket' | 'run_out' | 'obstructing' | 'handled_ball' | 'hit_ball_twice' | 'timed_out' | 'retired_out';

export interface Delivery {
  runsOffBat: number;
  extra?: { type: ExtraType; runs: number };
  wicket?: { kind: DismissalKind };
}

export interface InningsState {
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: Record<ExtraType, number>;
  freeHit: boolean;
}

export const emptyInnings = (): InningsState => ({
  runs: 0, wickets: 0, legalBalls: 0, freeHit: false,
  extras: { wide: 0, no_ball: 0, bye: 0, leg_bye: 0, penalty: 0 },
});

const BOWLER_CREDITED: DismissalKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];
const OUT_ON_NO_BALL_OR_FREE_HIT: DismissalKind[] = ['run_out', 'obstructing', 'handled_ball', 'hit_ball_twice'];
// On a wide the batter cannot be bowled, caught or lbw; stumped and hit wicket ARE allowed.
const OUT_ON_WIDE: DismissalKind[] = ['stumped', 'hit_wicket', ...OUT_ON_NO_BALL_OR_FREE_HIT];

export const isLegalDelivery = (d: Delivery) => d.extra?.type !== 'wide' && d.extra?.type !== 'no_ball';
export const isBowlerWicket = (k: DismissalKind) => BOWLER_CREDITED.includes(k);

/** Returns a message if the delivery is not allowed by the Laws, otherwise null. */
export function validateDelivery(d: Delivery, state: InningsState): string | null {
  if (d.runsOffBat < 0 || d.extra && d.extra.runs < 0) return 'Runs cannot be negative.';
  if (d.extra?.type === 'wide' && d.runsOffBat > 0) return 'Runs cannot be scored off the bat on a wide.';
  if (d.extra?.type === 'wide' && d.extra.runs < 1) return 'A wide is at least 1 run.';
  if (d.extra?.type === 'no_ball' && d.extra.runs < 1) return 'A no-ball is at least 1 run.';
  if (d.wicket) {
    const k = d.wicket.kind;
    if (d.extra?.type === 'no_ball' && !OUT_ON_NO_BALL_OR_FREE_HIT.includes(k)) return 'On a no-ball the batter can only be run out or out by obstruction, handling or hitting the ball twice.';
    if (d.extra?.type === 'wide' && !OUT_ON_WIDE.includes(k)) return 'On a wide the batter can only be stumped, hit wicket, run out or out by obstruction, handling or hitting the ball twice.';
    if (state.freeHit && !OUT_ON_NO_BALL_OR_FREE_HIT.includes(k)) return 'On a free hit the batter can only be run out or out by obstruction, handling or hitting the ball twice.';
  }
  return null;
}

/** Pure function: returns a new state. Throws if the delivery is not legal under the Laws. */
export function applyDelivery(state: InningsState, d: Delivery, rules: Pick<FormatRules, 'freeHitOnNoBall'>): InningsState {
  const problem = validateDelivery(d, state);
  if (problem) throw new Error(problem);
  const extras = { ...state.extras };
  let runs = state.runs + d.runsOffBat;
  if (d.extra) { extras[d.extra.type] += d.extra.runs; runs += d.extra.runs; }
  const legal = isLegalDelivery(d);
  return {
    runs,
    wickets: state.wickets + (d.wicket ? 1 : 0),
    legalBalls: state.legalBalls + (legal ? 1 : 0),
    extras,
    freeHit: d.extra?.type === 'no_ball' && rules.freeHitOnNoBall ? true : legal ? false : state.freeHit,
  };
}

export type EndReason = 'all_out' | 'overs_complete' | 'target_reached' | 'declared';

export function inningsEndReason(
  state: InningsState,
  rules: Pick<FormatRules, 'playersPerSide' | 'oversPerInnings' | 'ballsPerOver'>,
  opts: { target?: number; declared?: boolean } = {},
): EndReason | null {
  if (opts.declared) return 'declared';
  if (opts.target !== undefined && state.runs >= opts.target) return 'target_reached';
  if (state.wickets >= rules.playersPerSide - 1) return 'all_out';
  if (rules.oversPerInnings !== null && state.legalBalls >= rules.oversPerInnings * rules.ballsPerOver) return 'overs_complete';
  return null;
}
