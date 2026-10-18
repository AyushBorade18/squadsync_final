/** Turns the ball-by-ball log of one innings into the same batting/bowling scorecard rows
 *  the UI has always shown. This is a post-order aggregation over the Match -> Innings ->
 *  Over -> Ball tree: every ball is a leaf, and this function folds all of an innings' leaves
 *  into per-player totals (one aggregation per batter, one per bowler). */
import { isBowlerWicket, type DismissalKind, type ExtraType } from './scoring';

export interface BallRecord {
  overNumber: number; ballInOver: number; runsOffBat: number; extraType: ExtraType | 'none'; extraRuns: number;
  isWicket: boolean; wicketKind: DismissalKind | null; strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null; dismissedPlayerId: string | null;
  /** Fielding credit for this ball's dismissal (catch/run-out/stumping) — null for every other
   *  dismissal kind and every non-wicket ball. */
  fielderId?: string | null;
}

export interface AggregatedBatting {
  playerId: string; position: number; runs: number; balls: number; fours: number; sixes: number; status: 'not_out' | 'out' | 'did_not_bat'; dismissal: string | null;
  /** Raw dismissal facts, kept alongside the formatted `dismissal` text so a caller with
   *  access to a name resolver (finalizeLiveScorecard, the live scoreboard) can render a full
   *  "c Rohan b Arjun" / "run out (Rohan)" line instead of the short fallback label. */
  dismissalKind: DismissalKind | null; dismissedByBowlerId: string | null; fielderId: string | null;
}
export interface AggregatedBowling { playerId: string; legalBalls: number; maidens: number; runs: number; wickets: number; wides: number; noBalls: number }

const isLegal = (b: BallRecord) => b.extraType !== 'wide' && b.extraType !== 'no_ball';
const DISMISSAL_LABEL: Record<DismissalKind, string> = {
  bowled: 'b.', caught: 'c.', lbw: 'lbw', stumped: 'st.', hit_wicket: 'hit wicket', run_out: 'run out',
  obstructing: 'obstructing the field', handled_ball: 'handled the ball', hit_ball_twice: 'hit the ball twice',
  timed_out: 'timed out', retired_out: 'retired out',
};
/** Dismissal kinds where a fielder (catcher / run-out effecter / stumping keeper) gets credit. */
const FIELDER_CREDITED: DismissalKind[] = ['caught', 'run_out', 'stumped'];

/** Turns the raw dismissal facts for one batter into the traditional cricket scorecard line —
 *  "c Rohan b Arjun", "b Arjun", "lbw b Arjun", "st Rohan b Arjun", "run out (Rohan)" — when a
 *  name resolver is supplied. Without one, falls back to the short legacy label (used by code
 *  that only has ids, e.g. unit tests). */
export function formatDismissal(row: Pick<AggregatedBatting, 'dismissalKind' | 'dismissedByBowlerId' | 'fielderId'>, nameOf?: (id: string) => string): string | null {
  if (!row.dismissalKind) return null;
  if (!nameOf) return DISMISSAL_LABEL[row.dismissalKind];
  const bowler = row.dismissedByBowlerId ? nameOf(row.dismissedByBowlerId) : null;
  const fielder = row.fielderId ? nameOf(row.fielderId) : null;
  switch (row.dismissalKind) {
    case 'caught': return fielder ? `c ${fielder} b ${bowler ?? '—'}` : `c & b ${bowler ?? '—'}`;
    case 'stumped': return `st ${fielder ?? '—'} b ${bowler ?? '—'}`;
    case 'run_out': return fielder ? `run out (${fielder})` : 'run out';
    case 'bowled': return `b ${bowler ?? '—'}`;
    case 'lbw': return `lbw b ${bowler ?? '—'}`;
    case 'hit_wicket': return `hit wicket b ${bowler ?? '—'}`;
    default: return DISMISSAL_LABEL[row.dismissalKind];
  }
}

export function aggregateBatting(balls: BallRecord[], squadOrder: string[], nameOf?: (id: string) => string): AggregatedBatting[] {
  const firstAppearance = new Map<string, number>();
  balls.forEach((b, i) => {
    if (b.strikerId && !firstAppearance.has(b.strikerId)) firstAppearance.set(b.strikerId, i);
    if (b.nonStrikerId && !firstAppearance.has(b.nonStrikerId)) firstAppearance.set(b.nonStrikerId, i);
  });
  const appeared = [...firstAppearance.keys()].sort((a, b) => firstAppearance.get(a)! - firstAppearance.get(b)!);
  const order = appeared.length ? appeared : squadOrder;

  return order.map((playerId, idx) => {
    let runs = 0, faced = 0, fours = 0, sixes = 0, out = false;
    let dismissalKind: DismissalKind | null = null, dismissedByBowlerId: string | null = null, fielderId: string | null = null;
    for (const b of balls) {
      if (b.strikerId === playerId) {
        if (b.extraType !== 'wide') faced += 1; // no-balls are faced, wides are not
        runs += b.runsOffBat;
        if (b.runsOffBat === 4) fours += 1;
        if (b.runsOffBat === 6) sixes += 1;
      }
      if (b.isWicket && b.dismissedPlayerId === playerId) {
        out = true;
        dismissalKind = b.wicketKind;
        dismissedByBowlerId = b.bowlerId;
        fielderId = b.wicketKind && FIELDER_CREDITED.includes(b.wicketKind) ? (b.fielderId ?? null) : null;
      }
    }
    const didBat = faced > 0 || out;
    const dismissal = dismissalKind ? formatDismissal({ dismissalKind, dismissedByBowlerId, fielderId }, nameOf) : null;
    return { playerId, position: idx + 1, runs, balls: faced, fours, sixes, status: !didBat ? 'did_not_bat' : out ? 'out' : 'not_out', dismissal, dismissalKind, dismissedByBowlerId, fielderId };
  });
}

/** Catches / run-outs / stumpings taken by each fielder across a set of balls — the data
 *  behind fielding credit on the Leaderboard. */
export function aggregateFielding(balls: BallRecord[]): Record<string, { catches: number; runOuts: number; stumpings: number }> {
  const out: Record<string, { catches: number; runOuts: number; stumpings: number }> = {};
  for (const b of balls) {
    if (!b.isWicket || !b.fielderId || !b.wicketKind || !FIELDER_CREDITED.includes(b.wicketKind)) continue;
    const row = out[b.fielderId] ?? (out[b.fielderId] = { catches: 0, runOuts: 0, stumpings: 0 });
    if (b.wicketKind === 'caught') row.catches += 1;
    else if (b.wicketKind === 'run_out') row.runOuts += 1;
    else if (b.wicketKind === 'stumped') row.stumpings += 1;
  }
  return out;
}

export function aggregateBowling(balls: BallRecord[]): AggregatedBowling[] {
  const bowlerIds = [...new Set(balls.map((b) => b.bowlerId).filter((x): x is string => !!x))];
  return bowlerIds.map((playerId) => {
    const theirs = balls.filter((b) => b.bowlerId === playerId);
    const legalBalls = theirs.filter(isLegal).length;
    const wides = theirs.filter((b) => b.extraType === 'wide').length;
    const noBalls = theirs.filter((b) => b.extraType === 'no_ball').length;
    // Byes/leg-byes are not charged to the bowler; wides/no-balls and bat runs are.
    const runs = theirs.reduce((s, b) => s + b.runsOffBat + (b.extraType === 'wide' || b.extraType === 'no_ball' ? b.extraRuns : 0), 0);
    const wickets = theirs.filter((b) => b.isWicket && b.wicketKind && isBowlerWicket(b.wicketKind)).length;
    // A maiden over: every legal over bowled entirely by this bowler with zero runs off it.
    const oversBowled = new Map<number, BallRecord[]>();
    for (const b of theirs) oversBowled.set(b.overNumber, [...(oversBowled.get(b.overNumber) ?? []), b]);
    let maidens = 0;
    for (const [, overBalls] of oversBowled) {
      const legalInOver = overBalls.filter(isLegal).length;
      const runsInOver = overBalls.reduce((s, b) => s + b.runsOffBat + b.extraRuns, 0);
      if (legalInOver === 6 && runsInOver === 0) maidens += 1;
    }
    return { playerId, legalBalls, maidens, runs, wickets, wides, noBalls };
  });
}
