/**
 * Live, ball-by-ball innings state. Layers strike rotation, over/bowler tracking and
 * wicket/new-batsman flow on top of the pure run/wicket math in scoring.ts.
 *
 * Discrete-math framing: Match -> Innings -> Over -> Ball is a rooted tree; this module is the
 * "ball" transition function, and a finalized over is a post-order aggregate of its balls.
 */
import type { FormatRules } from './formats';
import { applyDelivery, inningsEndReason, isLegalDelivery, type Delivery, type InningsState, type EndReason, emptyInnings } from './scoring';

export interface LiveInningsState extends InningsState {
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
  lastOverBowlerId: string | null;
  legalBallsInOver: number;
  overNumber: number;
  awaitingNewBatsman: boolean;
  awaitingNewBowler: boolean;
  completed: boolean;
  endReason: EndReason | null;
  dismissedPlayerId: string | null;
}

export function startInnings(strikerId: string | null, nonStrikerId: string | null, bowlerId: string | null, tracksBowler = true): LiveInningsState {
  return {
    ...emptyInnings(),
    strikerId, nonStrikerId, bowlerId, lastOverBowlerId: null,
    legalBallsInOver: 0, overNumber: 1,
    awaitingNewBatsman: false, awaitingNewBowler: tracksBowler && bowlerId === null, completed: false, endReason: null,
    dismissedPlayerId: null,
  };
}

function runsRunThisBall(d: Delivery): number {
  if (!d.extra) return d.runsOffBat;
  if (d.extra.type === 'bye' || d.extra.type === 'leg_bye') return d.extra.runs;
  return 0; // wides/no-balls/penalties are never "run between the wickets"
}

export interface FinalizedOver { overNumber: number; bowlerId: string; runsConceded: number; wicketsTaken: number }
export interface ProcessResult { state: LiveInningsState; finalizedOver: FinalizedOver | null }

/**
 * Advances the innings by one delivery. `opts.overBeingBowled` carries the runs/wickets
 * already recorded for the over in progress (from the live_overs row), since this function
 * is a pure reducer and doesn't read a database itself.
 *
 * Only players on your own roster exist as rows to attribute a delivery to, so each innings
 * tracks exactly one side's identities: `tracksBatsman` (true when your team is batting —
 * their bowler isn't tracked) or `tracksBowler` (true when your team is bowling — their
 * batters aren't tracked). Both default to true for a fully-tracked innings (e.g. in tests).
 * Runs/wickets/overs still advance normally either way — only the per-player bookkeeping for
 * the untracked side is skipped.
 */
export function processDelivery(
  prev: LiveInningsState,
  delivery: Delivery,
  rules: Pick<FormatRules, 'freeHitOnNoBall' | 'playersPerSide' | 'oversPerInnings' | 'ballsPerOver'>,
  opts: { target?: number; overBeingBowled: { runsSoFar: number; wicketsSoFar: number }; tracksBatsman?: boolean; tracksBowler?: boolean },
): ProcessResult {
  const tracksBatsman = opts.tracksBatsman ?? true;
  const tracksBowler = opts.tracksBowler ?? true;
  if (prev.completed) throw new Error('This innings has already ended.');
  if (tracksBatsman && prev.awaitingNewBatsman) throw new Error('Select the new batsman before recording the next ball.');
  if (tracksBowler && (prev.awaitingNewBowler || !prev.bowlerId)) throw new Error('Select a bowler before recording the next ball.');

  const next = applyDelivery(prev, delivery, rules);
  const legal = isLegalDelivery(delivery);
  const runsRun = runsRunThisBall(delivery);

  let strikerId = prev.strikerId;
  let nonStrikerId = prev.nonStrikerId;
  if (tracksBatsman && runsRun % 2 === 1) [strikerId, nonStrikerId] = [nonStrikerId, strikerId];

  let dismissedPlayerId: string | null = null;
  let awaitingNewBatsman: boolean = prev.awaitingNewBatsman;
  if (tracksBatsman && delivery.wicket) {
    // Run-out can dismiss either batter; callers that know which one can override dismissedPlayerId
    // before calling setNewBatsman. Defaulting to the striker covers every other dismissal kind.
    dismissedPlayerId = strikerId;
    awaitingNewBatsman = true;
  }

  let legalBallsInOver = prev.legalBallsInOver + (legal ? 1 : 0);
  let overNumber = prev.overNumber;
  let finalizedOver: FinalizedOver | null = null;
  let awaitingNewBowler: boolean = prev.awaitingNewBowler;
  let lastOverBowlerId = prev.lastOverBowlerId;
  let bowlerId: string | null = prev.bowlerId;

  const ballRuns = delivery.runsOffBat + (delivery.extra?.runs ?? 0);
  const overRunsSoFar = opts.overBeingBowled.runsSoFar + ballRuns;
  const overWicketsSoFar = opts.overBeingBowled.wicketsSoFar + (delivery.wicket ? 1 : 0);

  const overJustCompleted = legal && legalBallsInOver >= rules.ballsPerOver;
  if (overJustCompleted) {
    finalizedOver = tracksBowler && prev.bowlerId ? { overNumber, bowlerId: prev.bowlerId, runsConceded: overRunsSoFar, wicketsTaken: overWicketsSoFar } : null;
    lastOverBowlerId = tracksBowler ? prev.bowlerId : null;
    legalBallsInOver = 0;
    overNumber += 1;
    if (tracksBowler) { bowlerId = null; awaitingNewBowler = true; }
    if (tracksBatsman) [strikerId, nonStrikerId] = [nonStrikerId, strikerId]; // end-of-over swap, regardless of last ball's parity
  }

  const endReason = inningsEndReason(next, rules, { target: opts.target });
  const completed = endReason !== null;
  if (completed) { awaitingNewBatsman = awaitingNewBatsman && endReason !== 'all_out'; awaitingNewBowler = false; }
  if (endReason === 'all_out') awaitingNewBatsman = false;

  // Chase/overs ends mid-over: the partial over must still be recorded for bowler figures.
  if (completed && !overJustCompleted && bowlerId && tracksBowler) {
    finalizedOver = { overNumber, bowlerId, runsConceded: overRunsSoFar, wicketsTaken: overWicketsSoFar };
  }

  return {
    state: { ...next, strikerId, nonStrikerId, bowlerId, lastOverBowlerId, legalBallsInOver, overNumber, awaitingNewBatsman, awaitingNewBowler, completed, endReason, dismissedPlayerId },
    finalizedOver,
  };
}

export function setNewBatsman(state: LiveInningsState, newBatsmanId: string, dismissedWasStriker: boolean): LiveInningsState {
  return {
    ...state,
    strikerId: dismissedWasStriker ? newBatsmanId : state.strikerId,
    nonStrikerId: dismissedWasStriker ? state.nonStrikerId : newBatsmanId,
    awaitingNewBatsman: false,
    dismissedPlayerId: null,
  };
}

export function setNewBowler(state: LiveInningsState, bowlerId: string): LiveInningsState {
  return { ...state, bowlerId, awaitingNewBowler: false };
}

/** Swap which of the two current batters is marked as on strike — for a run-out where the
 *  non-striker was the one dismissed, or to correct an accidental swap. */
export function swapStrike(state: LiveInningsState): LiveInningsState {
  return { ...state, strikerId: state.nonStrikerId, nonStrikerId: state.strikerId };
}
