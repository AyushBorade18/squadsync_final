/**
 * Local data layer, kept behind the same shape a Supabase-backed service would have.
 * Storage: browser localStorage, namespaced under "squadsync:". No seed data — every
 * team starts empty, matching the "everything real, nothing invented" rule.
 * This is clearly a LOCAL DEMO store (see DataSourceBanner) until Phase 3 wires up Supabase.
 */
import type { Profile, Player, Team, Match, BattingPerformance, BowlingPerformance, PlayingXIEntry, Tournament } from '../types/domain';

const KEY = 'squadsync:v1';

export interface DB {
  profiles: Profile[]; players: Player[]; teams: Team[]; matches: Match[];
  battingPerformances: BattingPerformance[]; bowlingPerformances: BowlingPerformance[];
  playingXI: PlayingXIEntry[]; tournaments: Tournament[]; currentProfileId: string | null;
}

const empty = (): DB => ({ profiles: [], players: [], teams: [], matches: [], battingPerformances: [], bowlingPerformances: [], playingXI: [], tournaments: [], currentProfileId: null });

function read(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch { return empty(); }
}
function write(db: DB) { localStorage.setItem(KEY, JSON.stringify(db)); notify(); }

const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }
export function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }

export const uid = () => Math.random().toString(36).slice(2, 10);

export const db = {
  get: read,
  set: write,
  reset() { write(empty()); },
};
