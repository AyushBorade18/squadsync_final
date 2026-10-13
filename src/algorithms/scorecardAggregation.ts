/** Turns the ball-by-ball log of one innings into the same batting/bowling scorecard rows
 *  the UI has always shown. This is a post-order aggregation over the Match -> Innings ->
 *  Over -> Ball tree: every ball is a leaf, and this function folds all of an innings' leaves
 *  into per-player totals (one aggregation per batter, one per bowler). */
import { isBowlerWicket, type DismissalKind, type ExtraType } from './scoring';

export interface BallRecord {
  overNumber: number; ballInOver: number; runsOffBat: number; extraType: ExtraType | 'none'; extraRuns: number;
  isWicket: boolean; wicketKind: DismissalKind | null; strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null; dismissedPlayerId: string | null;
}

export interface AggregatedBatting { playerId: string; position: number; runs: number; balls: number; fours: number; sixes: number; status: 'not_out' | 'out' | 'did_not_bat'; dismissal: string | null }
export interface AggregatedBowling { playerId: string; legalBalls: number; maidens: number; runs: number; wickets: number; wides: number; noBalls: number }

const isLegal = (b: BallRecord) => b.extraType !== 'wide' && b.extraType !== 'no_ball';
const DISMISSAL_LABEL: Record<DismissalKind, string> = {
  bowled: 'b.', caught: 'c.', lbw: 'lbw', stumped: 'st.', hit_wicket: 'hit wicket', run_out: 'run out',
  obstructing: 'obstructing the field', handled_ball: 'handled the ball', hit_ball_twice: 'hit the ball twice',
  timed_out: 'timed out', retired_out: 'retired out',
};

export function aggregateBatting(balls: BallRecord[], squadOrder: string[]): AggregatedBatting[] {
  const firstAppearance = new Map<string, number>();
  balls.forEach((b, i) => {
    if (b.strikerId && !firstAppearance.has(b.strikerId)) firstAppearance.set(b.strikerId, i);
    if (b.nonStrikerId && !firstAppearance.has(b.nonStrikerId)) firstAppearance.set(b.nonStrikerId, i);
  });
  const appeared = [...firstAppearance.keys()].sort((a, b) => firstAppearance.get(a)! - firstAppearance.get(b)!);
  const order = appeared.length ? appeared : squadOrder;

  return order.map((playerId, idx) => {
    let runs = 0, faced = 0, fours = 0, sixes = 0, out = false, dismissal: string | null = null;
    for (const b of balls) {
      if (b.strikerId === playerId) {
        if (b.extraType !== 'wide') faced += 1; // no-balls are faced, wides are not
        runs += b.runsOffBat;
        if (b.runsOffBat === 4) fours += 1;
        if (b.runsOffBat === 6) sixes += 1;
      }
      if (b.isWicket && b.dismissedPlayerId === playerId) {
        out = true;
        dismissal = b.wicketKind ? DISMISSAL_LABEL[b.wicketKind] : 'out';
      }
    }
    const didBat = faced > 0 || out;
    return { playerId, position: idx + 1, runs, balls: faced, fours, sixes, status: !didBat ? 'did_not_bat' : out ? 'out' : 'not_out', dismissal };
  });
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
