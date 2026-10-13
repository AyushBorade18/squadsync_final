import { describe, it, expect } from 'vitest';
import { getFormat } from '../formats';
import { startInnings, processDelivery, setNewBatsman, setNewBowler, swapStrike } from '../liveInnings';
import type { Delivery } from '../scoring';

const rules = getFormat('T20');
const over0 = { runsSoFar: 0, wicketsSoFar: 0 };
const dot: Delivery = { runsOffBat: 0 };
const one: Delivery = { runsOffBat: 1 };
const four: Delivery = { runsOffBat: 4 };
const wide: Delivery = { runsOffBat: 0, extra: { type: 'wide', runs: 1 } };
const byeOne: Delivery = { runsOffBat: 0, extra: { type: 'bye', runs: 1 } };
const wicketBowled: Delivery = { runsOffBat: 0, wicket: { kind: 'bowled' } };

describe('live innings reducer', () => {
  it('starts with strikers and bowler set, no bowler => awaiting new bowler', () => {
    const s1 = startInnings('A', 'B', 'C');
    expect(s1.awaitingNewBowler).toBe(false);
    const s2 = startInnings('A', 'B', null);
    expect(s2.awaitingNewBowler).toBe(true);
  });

  it('throws if no bowler is selected yet', () => {
    const s = startInnings('A', 'B', null);
    expect(() => processDelivery(s, dot, rules, { overBeingBowled: over0 })).toThrow(/bowler/i);
  });

  it('odd runs off the bat rotate strike, even runs do not', () => {
    const s = startInnings('A', 'B', 'C');
    const r1 = processDelivery(s, one, rules, { overBeingBowled: over0 });
    expect(r1.state.strikerId).toBe('B');
    const r2 = processDelivery(r1.state, four, rules, { overBeingBowled: over0 });
    expect(r2.state.strikerId).toBe('B');
  });

  it('byes/leg-byes rotate strike on odd runs; wides never rotate strike', () => {
    const s = startInnings('A', 'B', 'C');
    const r1 = processDelivery(s, byeOne, rules, { overBeingBowled: over0 });
    expect(r1.state.strikerId).toBe('B');
    const r2 = processDelivery(r1.state, wide, rules, { overBeingBowled: over0 });
    expect(r2.state.strikerId).toBe('B'); // unchanged by the wide
  });

  it('over completes after 6 legal balls: pauses for new bowler and swaps strike regardless of parity', () => {
    let state = startInnings('A', 'B', 'C');
    let over = over0;
    for (let i = 0; i < 6; i++) {
      const r = processDelivery(state, dot, rules, { overBeingBowled: over });
      state = r.state;
      over = { runsSoFar: over.runsSoFar, wicketsSoFar: over.wicketsSoFar };
    }
    expect(state.legalBallsInOver).toBe(0);
    expect(state.overNumber).toBe(2);
    expect(state.awaitingNewBowler).toBe(true);
    expect(state.strikerId).toBe('B'); // swapped at end of over even though all dots (even runs)
  });

  it('a wide does not count toward the 6 balls of the over', () => {
    const s = startInnings('A', 'B', 'C');
    const r = processDelivery(s, wide, rules, { overBeingBowled: over0 });
    expect(r.state.legalBallsInOver).toBe(0);
  });

  it('a wicket pauses for a new batsman and records who was dismissed', () => {
    const s = startInnings('A', 'B', 'C');
    const r = processDelivery(s, wicketBowled, rules, { overBeingBowled: over0 });
    expect(r.state.awaitingNewBatsman).toBe(true);
    expect(r.state.dismissedPlayerId).toBe('A');
    expect(() => processDelivery(r.state, dot, rules, { overBeingBowled: over0 })).toThrow(/new batsman/i);
  });

  it('setNewBatsman resumes play, setNewBowler clears the awaiting-bowler flag', () => {
    const s = startInnings('A', 'B', 'C');
    const afterWicket = processDelivery(s, wicketBowled, rules, { overBeingBowled: over0 }).state;
    const resumed = setNewBatsman(afterWicket, 'D', true);
    expect(resumed.strikerId).toBe('D');
    expect(resumed.awaitingNewBatsman).toBe(false);
    const noBowler = startInnings('A', 'B', null);
    expect(setNewBowler(noBowler, 'E').awaitingNewBowler).toBe(false);
  });

  it('swapStrike flips striker/non-striker', () => {
    const s = startInnings('A', 'B', 'C');
    expect(swapStrike(s).strikerId).toBe('B');
  });

  it('innings ends all-out', () => {
    let state = startInnings('A', 'B', 'C');
    for (let i = 0; i < 10; i++) {
      state = processDelivery(state, { runsOffBat: 0, wicket: { kind: 'bowled' } }, rules, { overBeingBowled: over0 }).state;
      state = setNewBatsman(state, `P${i}`, true);
      if (!state.completed) state = setNewBowler({ ...state, awaitingNewBowler: false }, 'C');
    }
    expect(state.completed).toBe(true);
    expect(state.endReason).toBe('all_out');
  });

  it('chase ends mid-over: finalizes the partial over for bowler figures', () => {
    let state = startInnings('A', 'B', 'C');
    const r = processDelivery(state, { runsOffBat: 4 }, rules, { overBeingBowled: over0, target: 4 });
    expect(r.state.completed).toBe(true);
    expect(r.state.endReason).toBe('target_reached');
    expect(r.finalizedOver).toEqual({ overNumber: 1, bowlerId: 'C', runsConceded: 4, wicketsTaken: 0 });
  });

  it('overs-complete ends the innings at the format limit', () => {
    const shortRules = { ...rules, oversPerInnings: 1 };
    let state = startInnings('A', 'B', 'C');
    let over = over0;
    let finalized;
    for (let i = 0; i < 6; i++) {
      const r = processDelivery(state, dot, shortRules, { overBeingBowled: over });
      state = r.state;
      finalized = r.finalizedOver;
    }
    expect(state.completed).toBe(true);
    expect(state.endReason).toBe('overs_complete');
    expect(finalized).toEqual({ overNumber: 1, bowlerId: 'C', runsConceded: 0, wicketsTaken: 0 });
  });
});

describe('live innings reducer — single-side tracking (opponent not on the roster)', () => {
  it('tracksBowler=false: our batting innings needs no bowler selection and never asks for one', () => {
    const s = startInnings('A', 'B', null, false);
    const r = processDelivery(s, one, rules, { overBeingBowled: over0, tracksBowler: false });
    expect(r.state.strikerId).toBe('B'); // strike still rotates
    expect(r.state.awaitingNewBowler).toBe(false);
    expect(r.finalizedOver).toBeNull();
  });

  it('tracksBatsman=false: our bowling innings needs no batsman tracking but still prompts for the next bowler', () => {
    let state = startInnings(null, null, 'C');
    let over = over0;
    let last;
    for (let i = 0; i < 6; i++) {
      last = processDelivery(state, dot, rules, { overBeingBowled: over, tracksBatsman: false });
      state = last.state;
    }
    expect(state.strikerId).toBeNull();
    expect(state.awaitingNewBowler).toBe(true);
    expect(last!.finalizedOver).toEqual({ overNumber: 1, bowlerId: 'C', runsConceded: 0, wicketsTaken: 0 });
  });
});
