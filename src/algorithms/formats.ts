export type FormatId = 'T10' | 'T20' | 'ODI' | 'TEST' | 'CUSTOM';
export type ResultType = 'win' | 'tie' | 'draw' | 'no_result';

export interface Powerplay { fromOver: number; toOver: number; maxOutsideCircle: number }

export interface FormatRules {
  id: FormatId;
  name: string;
  inningsPerSide: 1 | 2;
  /** null = unlimited overs (timed match, e.g. Test) */
  oversPerInnings: number | null;
  /** null = no limit per bowler */
  maxOversPerBowler: number | null;
  playersPerSide: number;
  ballsPerOver: number;
  powerplays: Powerplay[];
  freeHitOnNoBall: boolean;
  declarationsAllowed: boolean;
  followOnAllowed: boolean;
  /** Scheduled days, only for unlimited-overs matches */
  days: number | null;
  results: ResultType[];
}

const LIMITED_RESULTS: ResultType[] = ['win', 'tie', 'no_result'];

export const FORMATS: Record<Exclude<FormatId, 'CUSTOM'>, FormatRules> = {
  // T10 powerplay/fielding restrictions differ between leagues, so they are left empty
  // here and must be set per tournament (use a CUSTOM match or edit the tournament rules).
  T10: { id: 'T10', name: 'T10', inningsPerSide: 1, oversPerInnings: 10, maxOversPerBowler: 2, playersPerSide: 11, ballsPerOver: 6, powerplays: [], freeHitOnNoBall: true, declarationsAllowed: false, followOnAllowed: false, days: null, results: LIMITED_RESULTS },
  T20: { id: 'T20', name: 'T20', inningsPerSide: 1, oversPerInnings: 20, maxOversPerBowler: 4, playersPerSide: 11, ballsPerOver: 6, powerplays: [{ fromOver: 1, toOver: 6, maxOutsideCircle: 2 }, { fromOver: 7, toOver: 20, maxOutsideCircle: 5 }], freeHitOnNoBall: true, declarationsAllowed: false, followOnAllowed: false, days: null, results: LIMITED_RESULTS },
  ODI: { id: 'ODI', name: 'ODI', inningsPerSide: 1, oversPerInnings: 50, maxOversPerBowler: 10, playersPerSide: 11, ballsPerOver: 6, powerplays: [{ fromOver: 1, toOver: 10, maxOutsideCircle: 2 }, { fromOver: 11, toOver: 40, maxOutsideCircle: 4 }, { fromOver: 41, toOver: 50, maxOutsideCircle: 5 }], freeHitOnNoBall: true, declarationsAllowed: false, followOnAllowed: false, days: null, results: LIMITED_RESULTS },
  TEST: { id: 'TEST', name: 'Test', inningsPerSide: 2, oversPerInnings: null, maxOversPerBowler: null, playersPerSide: 11, ballsPerOver: 6, powerplays: [], freeHitOnNoBall: false, declarationsAllowed: true, followOnAllowed: true, days: 5, results: ['win', 'draw', 'tie', 'no_result'] },
};

export function getFormat(id: Exclude<FormatId, 'CUSTOM'>): FormatRules {
  return structuredClone(FORMATS[id]); // copy, so editing a match never edits the preset
}

/** Fewest different bowlers that can legally bowl a full innings. null when unlimited. */
export function minimumBowlers(r: FormatRules): number | null {
  if (r.oversPerInnings === null || r.maxOversPerBowler === null) return null;
  return Math.ceil(r.oversPerInnings / r.maxOversPerBowler);
}

/** Law 17.5's "no bowler may bowl more than 1/5 of the innings" rule, generalized to any
 *  overs count (not just the T10/T20/ODI presets it's normally quoted for). Verified against
 *  those presets: 10 overs -> 2, 20 overs -> 4, 50 overs -> 10 — all ceil(overs / 5). */
export function maxOversPerBowlerFor(totalOvers: number): number {
  return Math.max(1, Math.ceil(totalOvers / 5));
}

/** Builds real, playable rules for a custom overs count (used for CUSTOM-format matches),
 *  rather than silently falling back to T20's 20-overs/4-per-bowler limits. */
export function rulesForOvers(overs: number, name?: string): FormatRules {
  const { rules } = createCustomRules({ oversPerInnings: overs, maxOversPerBowler: maxOversPerBowlerFor(overs), name: name ?? `Custom (${overs} ov)` });
  return rules;
}

/** Lead (in runs) needed to enforce the follow-on, by scheduled match length (Law 14.1). */
export function followOnMargin(days: number): number {
  if (days >= 5) return 200;
  if (days >= 3) return 150;
  if (days === 2) return 100;
  return 75;
}

/** Returns a list of problems in plain language. Empty list = rules are usable. */
export function validateRules(r: FormatRules): string[] {
  const e: string[] = [];
  if (!Number.isInteger(r.playersPerSide) || r.playersPerSide < 2 || r.playersPerSide > 11) e.push('Players per side must be between 2 and 11.');
  if (r.ballsPerOver < 1) e.push('Balls per over must be at least 1.');
  const limited = r.oversPerInnings !== null;
  if (limited) {
    if (!Number.isInteger(r.oversPerInnings!) || r.oversPerInnings! < 1) e.push('Overs per innings must be a whole number of at least 1.');
    if (r.days !== null) e.push('A limited-overs match has no scheduled days.');
    if (r.declarationsAllowed) e.push('Declarations only make sense in unlimited-overs matches.');
    if (r.results.includes('draw')) e.push('A limited-overs match cannot end in a draw.');
    if (r.maxOversPerBowler === null) e.push('Set a maximum overs per bowler for a limited-overs match.');
    else {
      if (r.maxOversPerBowler < 1) e.push('Maximum overs per bowler must be at least 1.');
      if (r.maxOversPerBowler > r.oversPerInnings!) e.push('A bowler cannot bowl more overs than the innings has.');
      const need = minimumBowlers(r)!;
      if (need > r.playersPerSide) e.push(`This innings needs at least ${need} bowlers but the team has only ${r.playersPerSide} players.`);
    }
  } else {
    if (r.maxOversPerBowler !== null) e.push('Unlimited-overs matches cannot have a per-bowler limit.');
    if (r.days === null || r.days < 1) e.push('Set the number of scheduled days.');
  }
  if (r.followOnAllowed && r.inningsPerSide !== 2) e.push('Follow-on needs two innings per side.');
  if (r.inningsPerSide === 2 && limited) e.push('Two innings per side is only supported for unlimited-overs matches.');
  const sorted = [...r.powerplays].sort((a, b) => a.fromOver - b.fromOver);
  sorted.forEach((p, i) => {
    if (p.fromOver < 1 || p.toOver < p.fromOver) e.push(`Powerplay ${i + 1} has an invalid over range.`);
    if (limited && p.toOver > r.oversPerInnings!) e.push(`Powerplay ${i + 1} ends after the innings does.`);
    if (i > 0 && p.fromOver <= sorted[i - 1].toOver) e.push('Powerplays overlap.');
  });
  return e;
}

export function createCustomRules(overrides: Partial<FormatRules>): { rules: FormatRules; errors: string[] } {
  const rules: FormatRules = { ...getFormat('T20'), powerplays: [], ...overrides, id: 'CUSTOM', name: overrides.name ?? 'Custom' };
  return { rules, errors: validateRules(rules) };
}
