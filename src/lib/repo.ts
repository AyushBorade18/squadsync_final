/** Async data layer over Supabase. Field names are mapped snake_case <-> camelCase here so
 *  every page can keep using the same camelCase domain types from Phase 1-2. */
import { supabase } from './supabase';
import type { Player, Team, Match, BattingPerformance, BowlingPerformance, Tournament, OpponentProfile, MatchRequest, LiveInningsRow, LiveBallRow, LiveOverRow, PlayingXIEntry } from '../types/domain';
import type { PlayerStats, SquadPlayer, InjuryStatus, MatchupTier, FieldingTier, OpponentBowlingTendency, OpponentBattingTendency } from '../algorithms/selection';
import type { Delivery } from '../algorithms/scoring';
import type { FormatId } from '../algorithms/formats';

const emptyStats = (): PlayerStats => ({ matches: 0, battingInnings: 0, dismissals: 0, runs: 0, ballsFaced: 0, ballsBowled: 0, runsConceded: 0, wickets: 0 });

const mapPlayer = (p: any): Player => ({
  id: p.id, profileId: p.profile_id, name: p.name, teamId: p.team_id, playerRole: p.player_role, battingStyle: p.batting_style, bowlingStyle: p.bowling_style, isKeeper: p.is_keeper, jerseyNumber: p.jersey_number, photoSeed: p.id,
  injuryStatus: p.injury_status ?? 'available', battingVsPace: p.batting_vs_pace ?? 'average', battingVsSpin: p.batting_vs_spin ?? 'average', fieldingTier: p.fielding_tier ?? 'average', oversBowledRecentMatches: p.overs_bowled_recent_matches ?? 0,
});
const mapTeam = (t: any): Team => ({ id: t.id, name: t.name, shortName: t.short_name, ownerProfileId: t.owner_profile_id, isOwnTeam: t.is_own_team });
/** A `matches` row has one fixed direction (team_id = whoever scheduled/accepted it,
 *  opponent_team_id/opponent_name = the other side, from that team's perspective). Since the
 *  row is now visible to both sides, viewing from the OTHER team's perspective needs the
 *  "opponent" flipped to point back at the host. `hostTeamName` comes from the embedded
 *  `host_team` join added in fetchTeamMatches — pass viewerTeamId to get it right. */
const mapMatch = (m: any, viewerTeamId?: string): Match => {
  const iAmHost = !viewerTeamId || m.team_id === viewerTeamId;
  return {
    id: m.id, teamId: viewerTeamId ?? m.team_id,
    opponentTeamId: iAmHost ? m.opponent_team_id : m.team_id,
    opponentName: iAmHost ? m.opponent_name : (m.host_team?.name ?? 'Opponent'),
    format: m.format, venue: m.venue, date: m.date, status: m.status,
    tossWonByTeamId: m.toss_won_by_team_id ?? null, tossDecision: m.toss_decision ?? null,
    result: m.result, tournamentId: m.tournament_id, customOvers: m.custom_overs ?? null,
    scoringTeamId: m.scoring_team_id ?? m.team_id,
    // The host side's opponent is a real coached team only if that placeholder/real team row
    // has is_own_team = true (a direct-scheduled match's opponent comes from ensureOpponent,
    // which always creates is_own_team = false). Viewed from the OTHER side (accepted a
    // request), the "opponent" is the host, who scheduled this app in the first place and is
    // therefore always a real tracked team.
    opponentIsTracked: iAmHost ? !!m.opp_team?.is_own_team : true,
    opponentCaptainName: m.opponent_captain_name ?? null,
    opponentBowlerName: m.opponent_bowler_name ?? null,
    opponentBowlerType: m.opponent_bowler_type ?? null,
  };
};
const mapBat = (b: any): BattingPerformance => ({ id: b.id, matchId: b.match_id, playerId: b.player_id, innings: b.innings, position: b.position, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, status: b.status, dismissal: b.dismissal, playerName: b.player?.name });
const mapBowl = (b: any): BowlingPerformance => ({ id: b.id, matchId: b.match_id, playerId: b.player_id, innings: b.innings, legalBalls: b.legal_balls, maidens: b.maidens, runs: b.runs, wickets: b.wickets, wides: b.wides, noBalls: b.no_balls, playerName: b.player?.name });
const mapTournament = (t: any): Tournament => ({ id: t.id, name: t.name, format: t.format, teamIds: [], teamNames: {}, ownerProfileId: t.owner_profile_id, startDate: t.start_date });
const mapOpponentProfile = (o: any, opponentName: string): OpponentProfile => ({ id: o.id, ownerTeamId: o.owner_team_id, opponentTeamId: o.opponent_team_id, opponentName, bowlingTendency: o.bowling_tendency, battingTendency: o.batting_tendency, notes: o.notes ?? '', updatedAt: o.updated_at });
const mapMatchRequest = (r: any, fromName: string, toName: string): MatchRequest => ({ id: r.id, fromTeamId: r.from_team_id, fromTeamName: fromName, toTeamId: r.to_team_id, toTeamName: toName, proposedDate: r.proposed_date, proposedVenue: r.proposed_venue, format: r.format, customOvers: r.custom_overs ?? null, message: r.message ?? '', status: r.status, resultingMatchId: r.resulting_match_id, createdAt: r.created_at });
const mapLiveInnings = (i: any): LiveInningsRow => ({
  id: i.id, matchId: i.match_id, inningsNumber: i.innings_number, battingTeamId: i.batting_team_id, bowlingTeamId: i.bowling_team_id,
  strikerId: i.striker_id, nonStrikerId: i.non_striker_id, currentBowlerId: i.current_bowler_id, lastOverBowlerId: i.last_over_bowler_id,
  legalBallsInOver: i.legal_balls_in_over ?? 0, currentOverNumber: i.current_over_number ?? 1,
  runs: i.runs ?? 0, wickets: i.wickets ?? 0, legalBalls: i.legal_balls ?? 0, freeHit: i.free_hit ?? false,
  awaitingNewBatsman: i.awaiting_new_batsman ?? false, awaitingNewBowler: i.awaiting_new_bowler ?? false, completed: i.completed ?? false, endReason: i.end_reason, target: i.target,
});
const mapPlayingXI = (x: any): PlayingXIEntry => ({ id: x.id, matchId: x.match_id, teamId: x.team_id, playerId: x.player_id, battingOrder: x.batting_order, isCaptain: x.is_captain, isKeeper: x.is_keeper });
const mapLiveBall = (b: any): LiveBallRow => ({ id: b.id, inningsId: b.innings_id, overNumber: b.over_number, ballInOver: b.ball_in_over, runsOffBat: b.runs_off_bat, extraType: b.extra_type, extraRuns: b.extra_runs, shotZone: b.shot_zone, isWicket: b.is_wicket, wicketKind: b.wicket_kind, strikerId: b.striker_id, nonStrikerId: b.non_striker_id, bowlerId: b.bowler_id, dismissedPlayerId: b.dismissed_player_id, fielderId: b.fielder_id ?? null });
const mapLiveOver = (o: any): LiveOverRow => ({ id: o.id, inningsId: o.innings_id, overNumber: o.over_number, bowlerId: o.bowler_id, runsConceded: o.runs_conceded, wicketsTaken: o.wickets_taken });

function raise(context: string, error: { message: string } | null) { if (error) throw new Error(`${context}: ${error.message}`); }

export async function fetchTeamPlayers(teamId: string): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select('*').eq('team_id', teamId).order('name');
  raise('Loading players', error);
  return (data ?? []).map(mapPlayer);
}

/** A match is visible to both the team that scheduled/accepted it and its opponent — see
 *  mapMatch for why the opponent fields get flipped for the non-host viewer. */
export async function fetchTeamMatches(teamId: string): Promise<Match[]> {
  const { data, error } = await supabase.from('matches').select('*, host_team:team_id(name), opp_team:opponent_team_id(is_own_team)').or(`team_id.eq.${teamId},opponent_team_id.eq.${teamId}`).order('date', { ascending: false });
  raise('Loading matches', error);
  return (data ?? []).map((m) => mapMatch(m, teamId));
}

/** One round trip: every batting/bowling performance for this team's players, folded into
 *  a per-player stats map (matches the shape the algorithms expect). */
export async function fetchTeamStats(teamId: string): Promise<Record<string, PlayerStats>> {
  const players = await fetchTeamPlayers(teamId);
  const ids = players.map((p) => p.id);
  const stats: Record<string, PlayerStats> = Object.fromEntries(ids.map((id) => [id, emptyStats()]));
  if (ids.length === 0) return stats;
  const [{ data: bat, error: e1 }, { data: bowl, error: e2 }] = await Promise.all([
    supabase.from('batting_performances').select('*').in('player_id', ids),
    supabase.from('bowling_performances').select('*').in('player_id', ids),
  ]);
  raise('Loading batting stats', e1); raise('Loading bowling stats', e2);
  const matchesByPlayer = new Map<string, Set<string>>();
  for (const b of bat ?? []) {
    const s = stats[b.player_id]; if (!s) continue;
    if (b.status !== 'did_not_bat') s.battingInnings++;
    if (b.status === 'out') s.dismissals++;
    s.runs += b.runs; s.ballsFaced += b.balls;
    (matchesByPlayer.get(b.player_id) ?? matchesByPlayer.set(b.player_id, new Set()).get(b.player_id)!).add(b.match_id);
  }
  for (const b of bowl ?? []) {
    const s = stats[b.player_id]; if (!s) continue;
    s.ballsBowled += b.legal_balls; s.runsConceded += b.runs; s.wickets += b.wickets;
    (matchesByPlayer.get(b.player_id) ?? matchesByPlayer.set(b.player_id, new Set()).get(b.player_id)!).add(b.match_id);
  }
  for (const id of ids) stats[id].matches = matchesByPlayer.get(id)?.size ?? 0;
  return stats;
}

export function toSquadPlayer(p: Player, stats: PlayerStats, available = true): SquadPlayer {
  return {
    id: p.id, name: p.name, isKeeper: p.isKeeper, bowlingStyle: p.bowlingStyle, available: available && p.injuryStatus === 'available', stats,
    injuryStatus: p.injuryStatus, battingVsPace: p.battingVsPace, battingVsSpin: p.battingVsSpin, fieldingTier: p.fieldingTier, oversBowledRecentMatches: p.oversBowledRecentMatches,
  };
}

export async function addPlayer(input: Omit<Player, 'id' | 'photoSeed' | 'injuryStatus' | 'battingVsPace' | 'battingVsSpin' | 'fieldingTier' | 'oversBowledRecentMatches'>) {
  const { error } = await supabase.from('players').insert({ profile_id: input.profileId, team_id: input.teamId, name: input.name, player_role: input.playerRole, batting_style: input.battingStyle, bowling_style: input.bowlingStyle, is_keeper: input.isKeeper, jersey_number: input.jerseyNumber });
  raise('Adding player', error);
}

/** Task 6 & 7: editable roster attributes feeding the Decision Engine. */
export interface PlayerAttributesInput { injuryStatus: InjuryStatus; battingVsPace: MatchupTier; battingVsSpin: MatchupTier; fieldingTier: FieldingTier; oversBowledRecentMatches: number }
export async function updatePlayerAttributes(playerId: string, attrs: PlayerAttributesInput) {
  const { error } = await supabase.from('players').update({
    injury_status: attrs.injuryStatus, batting_vs_pace: attrs.battingVsPace, batting_vs_spin: attrs.battingVsSpin, fielding_tier: attrs.fieldingTier, overs_bowled_recent_matches: attrs.oversBowledRecentMatches,
  }).eq('id', playerId);
  raise('Updating player attributes', error);
}

export async function ensureOpponent(name: string): Promise<Team> {
  const { data: existing } = await supabase.from('teams').select('*').eq('is_own_team', false).ilike('name', name).maybeSingle();
  if (existing) return mapTeam(existing);
  const short = name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'OPP';
  const { data, error } = await supabase.from('teams').insert({ name, short_name: short, is_own_team: false }).select().single();
  raise('Adding opponent team', error);
  return mapTeam(data);
}

export async function addMatch(input: Omit<Match, 'id' | 'status' | 'result' | 'tossWonByTeamId' | 'tossDecision' | 'scoringTeamId' | 'opponentIsTracked' | 'opponentCaptainName' | 'opponentBowlerName' | 'opponentBowlerType'>) {
  // The team that schedules a match is its "host" by default, and starts out with scoring
  // authority — they can delegate it to the opponent coach later (see delegateScoring).
  const { error } = await supabase.from('matches').insert({ team_id: input.teamId, opponent_team_id: input.opponentTeamId, opponent_name: input.opponentName, format: input.format, venue: input.venue, date: input.date, tournament_id: input.tournamentId, custom_overs: input.customOvers ?? null, scoring_team_id: input.teamId });
  raise('Scheduling match', error);
}

/** Records who won the toss and what they chose — stored absolutely (team id, not "us/them")
 *  so it reads correctly from either coach's screen. `opponentCaptainName` is only passed for
 *  a directly-scheduled match against an untracked opponent (no coach account on their side to
 *  submit a playing XI / captain themselves), captured as free text at the toss step. */
export async function setToss(matchId: string, tossWonByTeamId: string, tossDecision: 'bat' | 'bowl', opponentCaptainName?: string | null) {
  const update: Record<string, unknown> = { toss_won_by_team_id: tossWonByTeamId, toss_decision: tossDecision };
  if (opponentCaptainName !== undefined) update.opponent_captain_name = opponentCaptainName || null;
  const { error } = await supabase.from('matches').update(update).eq('id', matchId);
  raise('Recording the toss', error);
}

/** Only meaningful for a directly-scheduled match against an untracked opponent: captures the
 *  opposing opening bowler's name + type as free text, since there's no real roster to pick
 *  from. Called when we start an innings while batting against them. */
export async function setOpponentBowler(matchId: string, name: string, type: 'pace' | 'spin') {
  const { error } = await supabase.from('matches').update({ opponent_bowler_name: name, opponent_bowler_type: type }).eq('id', matchId);
  raise('Recording the opposing bowler', error);
}

/** For an untracked opponent (no SquadSync coach account on their side): the host enters their
 *  full Playing XI — name + category — which creates REAL player rows under that placeholder
 *  team and immediately submits them as that team's XI. From this point on an untracked
 *  opponent is selectable in every picker exactly like a tracked one (same players table,
 *  same playing_xi rows) — no separate "type the bowler's name" fallback needed. */
export async function submitUntrackedOpponentXI(matchId: string, opponentTeamId: string, entries: { name: string; category: 'batter' | 'bowler' | 'all_rounder'; isKeeper: boolean }[]) {
  // bowling_style_type is a Postgres enum that only accepts 'pace' | 'spin' (see BowlingStyle
  // in algorithms/selection.ts) — it has no 'none' value. A pure batter has NO bowling style at
  // all, which the column models as NULL, not the string "none" (that previously crashed every
  // untracked-opponent XI submission with "invalid input value for enum bowling_style_type").
  const { data: inserted, error } = await supabase.from('players').insert(
    entries.map((e) => ({ team_id: opponentTeamId, name: e.name, player_role: e.category, batting_style: 'right_hand', bowling_style: e.category === 'batter' ? null : 'pace', is_keeper: e.isKeeper })),
  ).select();
  raise('Adding the opposing Playing XI', error);
  await submitPlayingXI(matchId, opponentTeamId, (inserted ?? []).map((p: any, i: number) => ({ playerId: p.id as string, battingOrder: i + 1, isCaptain: false, isKeeper: !!p.is_keeper })));
}

/** The host has scoring rights by default and can hand them to the opponent coach (or take
 *  them back) — only one side may enter balls for a match at a time. */
export async function delegateScoring(matchId: string, scoringTeamId: string) {
  const { error } = await supabase.from('matches').update({ scoring_team_id: scoringTeamId }).eq('id', matchId);
  raise('Changing scoring access', error);
}

// ============================================================================
// Playing XI: each coach picks and submits their own XI before a match starts.
// ============================================================================
export async function fetchPlayingXI(matchId: string): Promise<PlayingXIEntry[]> {
  const { data, error } = await supabase.from('playing_xi').select('*').eq('match_id', matchId).order('batting_order');
  raise('Loading playing XI', error);
  return (data ?? []).map(mapPlayingXI);
}

export async function fetchPlayingXISubmissions(matchId: string): Promise<string[]> {
  const { data, error } = await supabase.from('playing_xi_submissions').select('team_id').eq('match_id', matchId);
  raise('Loading playing XI submissions', error);
  return (data ?? []).map((r) => r.team_id);
}

/** Replaces this team's XI for this match and marks it submitted — the match can't start
 *  live scoring (enforced client-side) until the scoring team's own XI is submitted. */
export async function submitPlayingXI(matchId: string, teamId: string, entries: { playerId: string; battingOrder: number | null; isCaptain: boolean; isKeeper: boolean }[]) {
  const { error: delErr } = await supabase.from('playing_xi').delete().eq('match_id', matchId).eq('team_id', teamId);
  raise('Clearing previous XI', delErr);
  if (entries.length) {
    const { error } = await supabase.from('playing_xi').insert(entries.map((e) => ({ match_id: matchId, team_id: teamId, player_id: e.playerId, batting_order: e.battingOrder, is_captain: e.isCaptain, is_keeper: e.isKeeper })));
    raise('Submitting playing XI', error);
  }
  const { error: subErr } = await supabase.from('playing_xi_submissions').upsert({ match_id: matchId, team_id: teamId, submitted_at: new Date().toISOString() }, { onConflict: 'match_id,team_id' });
  raise('Submitting playing XI', subErr);
}

export async function fetchScorecard(matchId: string): Promise<{ batting: BattingPerformance[]; bowling: BowlingPerformance[] }> {
  // Embeds the player's name (so a scorecard doesn't depend on a separate roster lookup), but
  // falls back to the plain query if that embed isn't available in this database.
  const run = (cols: string) => Promise.all([
    supabase.from('batting_performances').select(cols).eq('match_id', matchId).order('position'),
    supabase.from('bowling_performances').select(cols).eq('match_id', matchId),
  ]);
  let [{ data: bat, error: e1 }, { data: bowl, error: e2 }] = await run('*, player:player_id(name)');
  if (e1 || e2) [{ data: bat, error: e1 }, { data: bowl, error: e2 }] = await run('*');
  raise('Loading scorecard (batting)', e1); raise('Loading scorecard (bowling)', e2);
  return { batting: ((bat ?? []) as any[]).map(mapBat), bowling: ((bowl ?? []) as any[]).map(mapBowl) };
}

export async function saveScorecard(
  matchId: string,
  bat: Omit<BattingPerformance, 'id' | 'matchId'>[],
  bowl: Omit<BowlingPerformance, 'id' | 'matchId'>[],
  result: string,
) {
  await supabase.from('batting_performances').delete().eq('match_id', matchId);
  await supabase.from('bowling_performances').delete().eq('match_id', matchId);
  if (bat.length) { const { error } = await supabase.from('batting_performances').insert(bat.map((b) => ({ match_id: matchId, player_id: b.playerId, innings: b.innings, position: b.position, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, status: b.status, dismissal: b.dismissal }))); raise('Saving batting scorecard', error); }
  if (bowl.length) { const { error } = await supabase.from('bowling_performances').insert(bowl.map((b) => ({ match_id: matchId, player_id: b.playerId, innings: b.innings, legal_balls: b.legalBalls, maidens: b.maidens, runs: b.runs, wickets: b.wickets, wides: b.wides, no_balls: b.noBalls }))); raise('Saving bowling scorecard', error); }
  const { error: mErr } = await supabase.from('matches').update({ status: 'completed', result }).eq('id', matchId);
  raise('Updating match result', mErr);
}

export async function fetchTournaments(profileId: string): Promise<Tournament[]> {
  const { data, error } = await supabase.from('tournaments').select('*').eq('owner_profile_id', profileId).order('start_date', { ascending: false });
  raise('Loading tournaments', error);
  const tournaments = (data ?? []).map(mapTournament);
  for (const t of tournaments) {
    // Embeds the team name through the FK so a tournament started by someone else is shown
    // by its real name, not a truncated id — the bracket used to just print "Team xxxx".
    const { data: tt } = await supabase.from('tournament_teams').select('team_id, team:team_id(name)').eq('tournament_id', t.id);
    t.teamIds = (tt ?? []).map((r: any) => r.team_id);
    t.teamNames = Object.fromEntries((tt ?? []).map((r: any) => [r.team_id, r.team?.name ?? 'Team']));
  }
  return tournaments;
}

export async function addTournament(input: Omit<Tournament, 'id' | 'teamNames'>) {
  const { data, error } = await supabase.from('tournaments').insert({ name: input.name, format: input.format, owner_profile_id: input.ownerProfileId, start_date: input.startDate }).select().single();
  raise('Creating tournament', error);
  if (input.teamIds.length) {
    const { error: ttErr } = await supabase.from('tournament_teams').insert(input.teamIds.map((teamId) => ({ tournament_id: data.id, team_id: teamId })));
    raise('Adding teams to tournament', ttErr);
  }
  return data.id as string;
}

/** Adds one more team to an existing tournament — the "no option to add" gap: previously the
 *  only teams a tournament ever got were whichever were passed in at creation time. */
export async function addTeamToTournament(tournamentId: string, teamId: string) {
  const { error } = await supabase.from('tournament_teams').insert({ tournament_id: tournamentId, team_id: teamId });
  raise('Adding team to tournament', error);
}

export async function removeTeamFromTournament(tournamentId: string, teamId: string) {
  const { error } = await supabase.from('tournament_teams').delete().eq('tournament_id', tournamentId).eq('team_id', teamId);
  raise('Removing team from tournament', error);
}

export async function deleteTournament(tournamentId: string) {
  await supabase.from('tournament_teams').delete().eq('tournament_id', tournamentId);
  const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);
  raise('Deleting tournament', error);
}

export async function joinTeam(teamId: string, profileId: string, profileName: string) {
  const { data: unclaimed } = await supabase.from('players').select('id').eq('team_id', teamId).is('profile_id', null).ilike('name', profileName).maybeSingle();
  if (unclaimed) {
    const { error } = await supabase.from('players').update({ profile_id: profileId }).eq('id', unclaimed.id);
    raise('Joining team', error);
  } else {
    const { error } = await supabase.from('players').insert({ profile_id: profileId, team_id: teamId, name: profileName, player_role: 'batter', batting_style: 'right_hand', is_keeper: false });
    raise('Joining team', error);
  }
}

/** All batting/bowling performances across a set of matches, in two calls regardless of
 *  how many matches there are — used by Opponent Analysis and Player Network. */
export async function fetchPerformancesForMatches(matchIds: string[]): Promise<{ batting: BattingPerformance[]; bowling: BowlingPerformance[] }> {
  if (matchIds.length === 0) return { batting: [], bowling: [] };
  const [{ data: bat, error: e1 }, { data: bowl, error: e2 }] = await Promise.all([
    supabase.from('batting_performances').select('*').in('match_id', matchIds),
    supabase.from('bowling_performances').select('*').in('match_id', matchIds),
  ]);
  raise('Loading performances', e1); raise('Loading performances', e2);
  return { batting: (bat ?? []).map(mapBat), bowling: (bowl ?? []).map(mapBowl) };
}

export async function fetchPlayerById(playerId: string): Promise<Player | null> {
  const { data, error } = await supabase.from('players').select('*').eq('id', playerId).maybeSingle();
  raise('Loading player', error);
  return data ? mapPlayer(data) : null;
}

export async function fetchPlayerStats(playerId: string): Promise<PlayerStats> {
  const stats = emptyStats();
  const [{ data: bat, error: e1 }, { data: bowl, error: e2 }] = await Promise.all([
    supabase.from('batting_performances').select('*').eq('player_id', playerId),
    supabase.from('bowling_performances').select('*').eq('player_id', playerId),
  ]);
  raise('Loading batting stats', e1); raise('Loading bowling stats', e2);
  const matchIds = new Set<string>();
  for (const b of bat ?? []) { if (b.status !== 'did_not_bat') stats.battingInnings++; if (b.status === 'out') stats.dismissals++; stats.runs += b.runs; stats.ballsFaced += b.balls; matchIds.add(b.match_id); }
  for (const b of bowl ?? []) { stats.ballsBowled += b.legal_balls; stats.runsConceded += b.runs; stats.wickets += b.wickets; matchIds.add(b.match_id); }
  stats.matches = matchIds.size;
  return stats;
}

export async function fetchPlayerPerformances(playerId: string): Promise<{ batting: BattingPerformance[]; bowling: BowlingPerformance[] }> {
  const [{ data: bat, error: e1 }, { data: bowl, error: e2 }] = await Promise.all([
    supabase.from('batting_performances').select('*').eq('player_id', playerId),
    supabase.from('bowling_performances').select('*').eq('player_id', playerId),
  ]);
  raise('Loading performances (batting)', e1); raise('Loading performances (bowling)', e2);
  return { batting: (bat ?? []).map(mapBat), bowling: (bowl ?? []).map(mapBowl) };
}

export async function fetchJoinableTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from('teams').select('*').eq('is_own_team', true).order('name');
  raise('Loading teams', error);
  return (data ?? []).map(mapTeam);
}

// ============================================================================
// Task 1: ball-by-ball live scoring persistence
// ============================================================================

export async function fetchLiveInnings(matchId: string): Promise<LiveInningsRow[]> {
  const { data, error } = await supabase.from('live_innings').select('*').eq('match_id', matchId).order('innings_number');
  raise('Loading live innings', error);
  return (data ?? []).map(mapLiveInnings);
}

/** Only your own roster exists as rows to score against, so each innings tracks exactly one
 *  side: pass strikerId/nonStrikerId (and leave bowlerId null) when your team is batting, or
 *  bowlerId (and leave the batters null) when your team is bowling — see liveInnings.ts. */
export async function startLiveInnings(input: {
  matchId: string; inningsNumber: 1 | 2; battingTeamId: string; bowlingTeamId: string;
  strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null; tracksBowler: boolean; target: number | null;
}): Promise<LiveInningsRow> {
  // Idempotent: a double-submit (double-click, or retrying after an earlier RLS rejection
  // that actually went through) used to crash with "duplicate key value violates unique
  // constraint live_innings_match_id_innings_number_key". If this innings number already
  // exists for the match, resume it instead of inserting a second row.
  const { data: already, error: checkErr } = await supabase.from('live_innings').select('*').eq('match_id', input.matchId).eq('innings_number', input.inningsNumber).maybeSingle();
  raise('Checking for an existing innings', checkErr);
  if (already) return mapLiveInnings(already);

  const { data, error } = await supabase.from('live_innings').insert({
    match_id: input.matchId, innings_number: input.inningsNumber, batting_team_id: input.battingTeamId, bowling_team_id: input.bowlingTeamId,
    striker_id: input.strikerId, non_striker_id: input.nonStrikerId, current_bowler_id: input.bowlerId,
    awaiting_new_bowler: input.tracksBowler && input.bowlerId === null, target: input.target,
  }).select().single();
  raise('Starting innings', error);
  await supabase.from('matches').update({ status: 'live' }).eq('id', input.matchId);
  return mapLiveInnings(data);
}

export async function fetchOverRuns(inningsId: string, overNumber: number): Promise<{ runsSoFar: number; wicketsSoFar: number }> {
  const { data, error } = await supabase.from('live_balls').select('runs_off_bat, extra_runs, is_wicket').eq('innings_id', inningsId).eq('over_number', overNumber);
  raise('Loading current over', error);
  const rows = data ?? [];
  return { runsSoFar: rows.reduce((s, r) => s + r.runs_off_bat + r.extra_runs, 0), wicketsSoFar: rows.filter((r) => r.is_wicket).length };
}

export async function fetchInningsBalls(inningsId: string): Promise<LiveBallRow[]> {
  const { data, error } = await supabase.from('live_balls').select('*').eq('innings_id', inningsId).order('over_number').order('ball_in_over');
  raise('Loading balls', error);
  return (data ?? []).map(mapLiveBall);
}

export async function fetchInningsOvers(inningsId: string): Promise<LiveOverRow[]> {
  const { data, error } = await supabase.from('live_overs').select('*').eq('innings_id', inningsId).order('over_number');
  raise('Loading overs', error);
  return (data ?? []).map(mapLiveOver);
}

/** Records one delivery and the innings state it produced (both computed client-side by
 *  algorithms/liveInnings.ts — this just persists the result), plus the finalized over row
 *  when an over just completed or the innings ended mid-over. */
export async function recordDelivery(args: {
  inningsId: string; ballInOver: number; delivery: Delivery; shotZone: string | null;
  dismissedPlayerId: string | null; fielderId: string | null; strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null;
  nextState: {
    runs: number; wickets: number; legalBalls: number; freeHit: boolean;
    strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null; lastOverBowlerId: string | null;
    legalBallsInOver: number; overNumber: number; awaitingNewBatsman: boolean; awaitingNewBowler: boolean; completed: boolean; endReason: string | null;
  };
  finalizedOver: { overNumber: number; bowlerId: string; runsConceded: number; wicketsTaken: number } | null;
  overNumberForBall: number;
}) {
  const { error: ballErr } = await supabase.from('live_balls').insert({
    innings_id: args.inningsId, over_number: args.overNumberForBall, ball_in_over: args.ballInOver,
    runs_off_bat: args.delivery.runsOffBat, extra_type: args.delivery.extra?.type ?? 'none', extra_runs: args.delivery.extra?.runs ?? 0,
    shot_zone: args.shotZone, is_wicket: !!args.delivery.wicket, wicket_kind: args.delivery.wicket?.kind ?? null,
    striker_id: args.strikerId, non_striker_id: args.nonStrikerId, bowler_id: args.bowlerId, dismissed_player_id: args.dismissedPlayerId,
    fielder_id: args.fielderId,
  });
  raise('Recording delivery', ballErr);

  if (args.finalizedOver) {
    const { error: overErr } = await supabase.from('live_overs').upsert({
      innings_id: args.inningsId, over_number: args.finalizedOver.overNumber, bowler_id: args.finalizedOver.bowlerId,
      runs_conceded: args.finalizedOver.runsConceded, wickets_taken: args.finalizedOver.wicketsTaken,
    }, { onConflict: 'innings_id,over_number' });
    raise('Finalizing over', overErr);
  }

  const s = args.nextState;
  const { error: inningsErr } = await supabase.from('live_innings').update({
    runs: s.runs, wickets: s.wickets, legal_balls: s.legalBalls, free_hit: s.freeHit,
    striker_id: s.strikerId, non_striker_id: s.nonStrikerId, current_bowler_id: s.bowlerId, last_over_bowler_id: s.lastOverBowlerId,
    legal_balls_in_over: s.legalBallsInOver, current_over_number: s.overNumber,
    awaiting_new_batsman: s.awaitingNewBatsman, awaiting_new_bowler: s.awaitingNewBowler, completed: s.completed, end_reason: s.endReason,
  }).eq('id', args.inningsId);
  raise('Updating innings state', inningsErr);

  if (s.completed) await supabase.from('live_innings').select('match_id').eq('id', args.inningsId).maybeSingle();
}

export async function setLiveNewBatsman(inningsId: string, strikerId: string | null, nonStrikerId: string | null) {
  const { error } = await supabase.from('live_innings').update({ striker_id: strikerId, non_striker_id: nonStrikerId, awaiting_new_batsman: false }).eq('id', inningsId);
  raise('Setting new batsman', error);
}

export async function setLiveNewBowler(inningsId: string, bowlerId: string) {
  const { error } = await supabase.from('live_innings').update({ current_bowler_id: bowlerId, awaiting_new_bowler: false }).eq('id', inningsId);
  raise('Setting new bowler', error);
}

export async function finishMatch(matchId: string, result: string) {
  const { error } = await supabase.from('matches').update({ status: 'completed', result }).eq('id', matchId);
  raise('Finishing match', error);
}

/** Resets a match stuck as "live" (e.g. started by accident, or abandoned) back to
 *  scheduled, and marks any in-progress innings on it as completed so a fresh "Start live
 *  scoring" click creates a clean new innings instead of resuming the old one. */
export async function abandonMatch(matchId: string) {
  const { error: inningsErr } = await supabase.from('live_innings').update({ completed: true, end_reason: 'abandoned' }).eq('match_id', matchId).eq('completed', false);
  raise('Abandoning innings', inningsErr);
  const { error } = await supabase.from('matches').update({ status: 'scheduled' }).eq('id', matchId);
  raise('Abandoning match', error);
}

/** Deletes a match and everything hanging off it. Done in dependency order from the client
 *  rather than relying on DB cascade settings we don't control for every table (some of
 *  these — batting/bowling performances, match_requests — predate this project's migrations
 *  and we don't know their exact FK actions). match_requests.resulting_match_id is nulled
 *  first so a request that led to this match isn't itself blocked from being deleted later. */
export async function deleteMatch(matchId: string) {
  const innings = await supabase.from('live_innings').select('id').eq('match_id', matchId);
  const inningsIds = (innings.data ?? []).map((r: any) => r.id as string);
  if (inningsIds.length) {
    await supabase.from('live_balls').delete().in('innings_id', inningsIds);
    await supabase.from('live_overs').delete().in('innings_id', inningsIds);
  }
  await supabase.from('live_innings').delete().eq('match_id', matchId);
  await supabase.from('playing_xi').delete().eq('match_id', matchId);
  await supabase.from('playing_xi_submissions').delete().eq('match_id', matchId);
  await supabase.from('batting_performances').delete().eq('match_id', matchId);
  await supabase.from('bowling_performances').delete().eq('match_id', matchId);
  await supabase.from('match_requests').update({ resulting_match_id: null }).eq('resulting_match_id', matchId);
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  raise('Deleting match', error);
}

// ============================================================================
// Task 8: opponent profiles
// ============================================================================

export async function fetchOpponentProfile(ownerTeamId: string, opponentTeamId: string): Promise<OpponentProfile | null> {
  const [{ data, error }, { data: opp }] = await Promise.all([
    supabase.from('opponent_profiles').select('*').eq('owner_team_id', ownerTeamId).eq('opponent_team_id', opponentTeamId).maybeSingle(),
    supabase.from('teams').select('name').eq('id', opponentTeamId).maybeSingle(),
  ]);
  raise('Loading opponent profile', error);
  return data ? mapOpponentProfile(data, opp?.name ?? 'Opponent') : null;
}

export async function fetchOpponentProfiles(ownerTeamId: string): Promise<OpponentProfile[]> {
  const { data, error } = await supabase.from('opponent_profiles').select('*, teams:opponent_team_id(name)').eq('owner_team_id', ownerTeamId).order('updated_at', { ascending: false });
  raise('Loading opponent profiles', error);
  return (data ?? []).map((row: any) => mapOpponentProfile(row, row.teams?.name ?? 'Opponent'));
}

export async function upsertOpponentProfile(input: { ownerTeamId: string; opponentTeamId: string; bowlingTendency: OpponentBowlingTendency; battingTendency: OpponentBattingTendency; notes: string }) {
  const { error } = await supabase.from('opponent_profiles').upsert({
    owner_team_id: input.ownerTeamId, opponent_team_id: input.opponentTeamId, bowling_tendency: input.bowlingTendency, batting_tendency: input.battingTendency, notes: input.notes, updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_team_id,opponent_team_id' });
  raise('Saving opponent profile', error);
}

// ============================================================================
// Task 9: match requests (coach -> coach challenge/accept)
// ============================================================================

export async function fetchDiscoverableTeams(excludeTeamId: string): Promise<Team[]> {
  const { data, error } = await supabase.from('teams').select('*').eq('is_own_team', true).neq('id', excludeTeamId).order('name');
  raise('Loading teams', error);
  return (data ?? []).map(mapTeam);
}

export async function fetchMatchRequests(teamId: string): Promise<MatchRequest[]> {
  const { data, error } = await supabase.from('match_requests').select('*, from_team:from_team_id(name), to_team:to_team_id(name)').or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`).order('created_at', { ascending: false });
  raise('Loading match requests', error);
  return (data ?? []).map((r: any) => mapMatchRequest(r, r.from_team?.name ?? 'Unknown', r.to_team?.name ?? 'Unknown'));
}

export async function sendMatchRequest(input: { fromTeamId: string; toTeamId: string; proposedDate: string; proposedVenue: string; format: FormatId; customOvers: number | null; message: string }) {
  const { error } = await supabase.from('match_requests').insert({
    from_team_id: input.fromTeamId, to_team_id: input.toTeamId, proposed_date: input.proposedDate, proposed_venue: input.proposedVenue, format: input.format, custom_overs: input.customOvers ?? null, message: input.message || null,
  });
  raise('Sending match request', error);
}

export async function cancelMatchRequest(requestId: string) {
  const { error } = await supabase.from('match_requests').update({ status: 'cancelled' }).eq('id', requestId);
  raise('Cancelling match request', error);
}

export async function declineMatchRequest(requestId: string) {
  const { error } = await supabase.from('match_requests').update({ status: 'declined' }).eq('id', requestId);
  raise('Declining match request', error);
}

/** Permanently removes a match request row (as opposed to cancel/decline, which just change
 *  its status) — for clearing clutter out of the list entirely. */
export async function deleteMatchRequest(requestId: string) {
  const { error } = await supabase.from('match_requests').delete().eq('id', requestId);
  raise('Deleting match request', error);
}

/** Accepting creates one `matches` row visible to BOTH teams (see the matches_select/update
 *  "either side" RLS policies) and links it back to the request. The accepting team is the
 *  "host" and starts out with scoring authority, same as a directly-scheduled match — they
 *  can delegate it to the challenger from the Live Match page. */
export async function acceptMatchRequest(request: MatchRequest) {
  // The team that SENT the challenge is the host and keeps scoring priority by default — the
  // team that accepts only gets a tracked match, not scoring rights (they can still be handed
  // scoring access later via delegateScoring). team_id on a `matches` row is always the host.
  const { data: match, error: matchErr } = await supabase.from('matches').insert({
    team_id: request.fromTeamId, opponent_team_id: request.toTeamId, opponent_name: request.toTeamName,
    format: request.format, custom_overs: request.customOvers ?? null, venue: request.proposedVenue, date: request.proposedDate,
    scoring_team_id: request.fromTeamId,
  }).select().single();
  raise('Creating match from request', matchErr);
  const { error } = await supabase.from('match_requests').update({ status: 'accepted', resulting_match_id: match.id }).eq('id', request.id);
  raise('Accepting match request', error);
  return mapMatch(match, request.toTeamId);
}

/** Called once both innings of a live-scored match are complete: folds every ball into
 *  batting/bowling scorecard rows (see scorecardAggregation.ts) and saves + completes the
 *  match in one go, the same place a manually-entered scorecard lands. */
export async function finalizeLiveScorecard(matchId: string, innings: { inningsNumber: 1 | 2; battingTeamId: string; bowlingTeamId: string; squadOrder: string[] }[], result: string) {
  const { aggregateBatting, aggregateBowling } = await import('../algorithms/scorecardAggregation');
  // Fielder credit (catch/run-out/stumping) was captured as a player id during live scoring —
  // resolve every team's roster once here so the saved dismissal text reads "c Rohan b Arjun"
  // instead of a bare id, on every scorecard that reads batting_performances.dismissal.
  const teamIds = [...new Set(innings.flatMap((i) => [i.battingTeamId, i.bowlingTeamId]))];
  const rosters = await Promise.all(teamIds.map((tid) => fetchTeamPlayers(tid)));
  const nameById = new Map<string, string>();
  rosters.flat().forEach((p) => nameById.set(p.id, p.name));
  const nameOf = (id: string) => nameById.get(id) ?? 'Unknown';

  const bat: Omit<BattingPerformance, 'id' | 'matchId'>[] = [];
  const bowl: Omit<BowlingPerformance, 'id' | 'matchId'>[] = [];
  for (const inn of innings) {
    const rows = await fetchLiveInnings(matchId);
    const row = rows.find((r) => r.inningsNumber === inn.inningsNumber);
    if (!row) continue;
    const balls = (await fetchInningsBalls(row.id)).map((b) => ({ overNumber: b.overNumber, ballInOver: b.ballInOver, runsOffBat: b.runsOffBat, extraType: b.extraType, extraRuns: b.extraRuns, isWicket: b.isWicket, wicketKind: b.wicketKind, strikerId: b.strikerId, nonStrikerId: b.nonStrikerId, bowlerId: b.bowlerId, dismissedPlayerId: b.dismissedPlayerId, fielderId: b.fielderId }));
    for (const b of aggregateBatting(balls, inn.squadOrder, nameOf)) bat.push({ playerId: b.playerId, innings: inn.inningsNumber, position: b.position, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, status: b.status, dismissal: b.dismissal });
    for (const b of aggregateBowling(balls)) bowl.push({ playerId: b.playerId, innings: inn.inningsNumber, legalBalls: b.legalBalls, maidens: b.maidens, runs: b.runs, wickets: b.wickets, wides: b.wides, noBalls: b.noBalls });
  }
  await saveScorecard(matchId, bat, bowl, result);
}

/** Catches / run-outs / stumpings credited to each of this team's players, across every match
 *  they've played — the fielding half of the Leaderboard (alongside batting/bowling from
 *  fetchTeamStats). Derived straight from live_balls.fielder_id rather than a separate table,
 *  since every completed match's ball-by-ball log is kept. */
export async function fetchFieldingStats(teamId: string): Promise<Record<string, { catches: number; runOuts: number; stumpings: number }>> {
  const { data: inningsRows, error: e1 } = await supabase.from('live_innings').select('id').eq('bowling_team_id', teamId);
  raise('Loading fielding stats', e1);
  const inningsIds = (inningsRows ?? []).map((r: any) => r.id as string);
  if (inningsIds.length === 0) return {};
  const { data: balls, error: e2 } = await supabase.from('live_balls').select('wicket_kind, fielder_id').in('innings_id', inningsIds).not('fielder_id', 'is', null);
  raise('Loading fielding stats', e2);
  const { aggregateFielding } = await import('../algorithms/scorecardAggregation');
  return aggregateFielding((balls ?? []).map((b: any) => ({ overNumber: 0, ballInOver: 0, runsOffBat: 0, extraType: 'none' as const, extraRuns: 0, isWicket: true, wicketKind: b.wicket_kind, strikerId: null, nonStrikerId: null, bowlerId: null, dismissedPlayerId: null, fielderId: b.fielder_id })));
}
