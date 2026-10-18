/** React Query hooks: every page gets loading / error / data for free, and mutations
 *  auto-refresh the right queries (see invalidateQueries below each mutation). */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as repo from './repo';
import type { Tournament } from '../types/domain';

export const qk = {
  players: (teamId: string) => ['players', teamId],
  matches: (teamId: string) => ['matches', teamId],
  stats: (teamId: string) => ['stats', teamId],
  scorecard: (matchId: string) => ['scorecard', matchId],
  tournaments: (profileId: string) => ['tournaments', profileId],
  joinableTeams: () => ['joinableTeams'],
};

// Two different coach accounts, each in their own browser, never share a React Query cache —
// an opponent submitting their Playing XI (or anything else) only invalidates THEIR OWN
// client's cache, not the host's. Without polling, the host's screen stayed stuck on stale
// data until something else forced a refetch (switching tabs/accounts, which remounts the
// app) — that's what made starting a match feel like it needed a manual account-switch
// "unstick". Polling closes that gap without needing real-time infrastructure.
export const usePlayers = (teamId?: string) => useQuery({ queryKey: qk.players(teamId ?? ''), queryFn: () => repo.fetchTeamPlayers(teamId!), enabled: !!teamId, refetchInterval: 8000 });
export const useMatches = (teamId?: string) => useQuery({ queryKey: qk.matches(teamId ?? ''), queryFn: () => repo.fetchTeamMatches(teamId!), enabled: !!teamId, refetchInterval: 6000 });
export const useTeamStats = (teamId?: string) => useQuery({ queryKey: qk.stats(teamId ?? ''), queryFn: () => repo.fetchTeamStats(teamId!), enabled: !!teamId });
export const useScorecard = (matchId?: string) => useQuery({ queryKey: qk.scorecard(matchId ?? ''), queryFn: () => repo.fetchScorecard(matchId!), enabled: !!matchId });
export const useTournaments = (profileId?: string) => useQuery({ queryKey: qk.tournaments(profileId ?? ''), queryFn: () => repo.fetchTournaments(profileId!), enabled: !!profileId });
export const useJoinableTeams = () => useQuery({ queryKey: qk.joinableTeams(), queryFn: repo.fetchJoinableTeams });
export const usePlayer = (playerId?: string) => useQuery({ queryKey: ['player', playerId], queryFn: () => repo.fetchPlayerById(playerId!), enabled: !!playerId });
export const usePlayerStats = (playerId?: string) => useQuery({ queryKey: ['playerStats', playerId], queryFn: () => repo.fetchPlayerStats(playerId!), enabled: !!playerId });
export const usePlayerPerformances = (playerId?: string) => useQuery({ queryKey: ['playerPerf', playerId], queryFn: () => repo.fetchPlayerPerformances(playerId!), enabled: !!playerId });
export const useMatchPerformances = (matchIds: string[]) => useQuery({ queryKey: ['matchPerf', ...matchIds.slice().sort()], queryFn: () => repo.fetchPerformancesForMatches(matchIds), enabled: matchIds.length > 0 });

export function useAddPlayer(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof repo.addPlayer>[0]) => repo.addPlayer(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.players(teamId) }); qc.invalidateQueries({ queryKey: qk.stats(teamId) }); },
  });
}

export function useAddMatch(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof repo.addMatch>[0]) => repo.addMatch(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.matches(teamId) }),
  });
}

export function useSetToss(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { tossWonByTeamId: string; tossDecision: 'bat' | 'bowl'; opponentCaptainName?: string | null }) => repo.setToss(matchId, args.tossWonByTeamId, args.tossDecision, args.opponentCaptainName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });
}

export function useSetOpponentBowler(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { name: string; type: 'pace' | 'spin' }) => repo.setOpponentBowler(matchId, args.name, args.type),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });
}

export function useDelegateScoring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { matchId: string; scoringTeamId: string }) => repo.delegateScoring(args.matchId, args.scoringTeamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });
}

export const usePlayingXI = (matchId?: string) => useQuery({ queryKey: ['playingXI', matchId ?? ''], queryFn: () => repo.fetchPlayingXI(matchId!), enabled: !!matchId, refetchInterval: 4000 });
export const usePlayingXISubmissions = (matchId?: string) => useQuery({ queryKey: ['playingXISubmissions', matchId ?? ''], queryFn: () => repo.fetchPlayingXISubmissions(matchId!), enabled: !!matchId, refetchInterval: 4000 });
export function useSubmitPlayingXI(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { teamId: string; entries: Parameters<typeof repo.submitPlayingXI>[2] }) => repo.submitPlayingXI(matchId, args.teamId, args.entries),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['playingXI', matchId] }), qc.invalidateQueries({ queryKey: ['playingXISubmissions', matchId] })]),
  });
}

export function useSubmitUntrackedOpponentXI(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { opponentTeamId: string; entries: Parameters<typeof repo.submitUntrackedOpponentXI>[2] }) => repo.submitUntrackedOpponentXI(matchId, args.opponentTeamId, args.entries),
    onSuccess: (_d, args) => Promise.all([
      qc.invalidateQueries({ queryKey: ['playingXI', matchId] }),
      qc.invalidateQueries({ queryKey: ['playingXISubmissions', matchId] }),
      qc.invalidateQueries({ queryKey: qk.players(args.opponentTeamId) }),
    ]),
  });
}

export function useSaveScorecard(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof repo.saveScorecard>) => repo.saveScorecard(...args),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: qk.matches(teamId) });
      qc.invalidateQueries({ queryKey: qk.stats(teamId) });
      qc.invalidateQueries({ queryKey: qk.scorecard(args[0]) });
    },
  });
}

export function useAddTournament(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Tournament, 'id' | 'teamNames'>) => repo.addTournament(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tournaments(profileId) }),
  });
}

export function useAddTeamToTournament(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { tournamentId: string; teamId: string }) => repo.addTeamToTournament(args.tournamentId, args.teamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tournaments(profileId) }),
  });
}

export function useRemoveTeamFromTournament(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { tournamentId: string; teamId: string }) => repo.removeTeamFromTournament(args.tournamentId, args.teamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tournaments(profileId) }),
  });
}

export function useDeleteTournament(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) => repo.deleteTournament(tournamentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tournaments(profileId) }),
  });
}

export function useJoinTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { teamId: string; profileId: string; profileName: string }) => repo.joinTeam(args.teamId, args.profileId, args.profileName),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ============================================================================
// Task 1: live scoring
// ============================================================================
export const useLiveInnings = (matchId?: string) => useQuery({ queryKey: ['liveInnings', matchId ?? ''], queryFn: () => repo.fetchLiveInnings(matchId!), enabled: !!matchId, refetchInterval: 4000 });
export const useInningsBalls = (inningsId?: string) => useQuery({ queryKey: ['liveBalls', inningsId ?? ''], queryFn: () => repo.fetchInningsBalls(inningsId!), enabled: !!inningsId, refetchInterval: 4000 });
export const useInningsOvers = (inningsId?: string) => useQuery({ queryKey: ['liveOvers', inningsId ?? ''], queryFn: () => repo.fetchInningsOvers(inningsId!), enabled: !!inningsId, refetchInterval: 4000 });

export function useStartLiveInnings(matchId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (args: Parameters<typeof repo.startLiveInnings>[0]) => repo.startLiveInnings(args), onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['liveInnings', matchId] }), qc.invalidateQueries({ queryKey: qk.matches(matchId) })]) });
}
export function useRecordDelivery(inningsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof repo.recordDelivery>[0]) => repo.recordDelivery(args),
    // IMPORTANT: this promise must resolve only once the invalidated queries have actually
    // refetched. Otherwise mutateAsync() resolves (re-enabling the ball-entry buttons) before
    // `thisOverBalls` is fresh, and a fast double-tap submits two balls against the same
    // stale over — which is how an over ends up with more than 6 balls recorded.
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['liveInnings'] }),
      qc.invalidateQueries({ queryKey: ['liveBalls', inningsId] }),
      qc.invalidateQueries({ queryKey: ['liveOvers', inningsId] }),
    ]),
  });
}
export function useSetLiveNewBatsman() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (args: { inningsId: string; strikerId: string | null; nonStrikerId: string | null }) => repo.setLiveNewBatsman(args.inningsId, args.strikerId, args.nonStrikerId), onSuccess: () => qc.invalidateQueries({ queryKey: ['liveInnings'] }) });
}
export function useSetLiveNewBowler() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (args: { inningsId: string; bowlerId: string }) => repo.setLiveNewBowler(args.inningsId, args.bowlerId), onSuccess: () => qc.invalidateQueries({ queryKey: ['liveInnings'] }) });
}
export function useFinishMatch(teamId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (args: { matchId: string; result: string }) => repo.finishMatch(args.matchId, args.result), onSuccess: () => qc.invalidateQueries({ queryKey: qk.matches(teamId) }) });
}
/** Abandon a stuck live match (e.g. started by accident, or the wrong one is stuck as
 *  "live" and blocking every other match from being selectable for scoring). */
export function useAbandonMatch(teamId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (matchId: string) => repo.abandonMatch(matchId), onSuccess: () => qc.invalidateQueries({ queryKey: qk.matches(teamId) }) });
}

export function useDeleteMatch() {
  const qc = useQueryClient();
  // The caller doesn't necessarily know both sides' team ids (a deleted match might have been
  // the opponent's own match too), so invalidate every team's matches cache by key prefix.
  return useMutation({ mutationFn: (matchId: string) => repo.deleteMatch(matchId), onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }) });
}

// ============================================================================
// Task 6/7: player attributes
// ============================================================================
export function useUpdatePlayerAttributes(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { playerId: string; attrs: Parameters<typeof repo.updatePlayerAttributes>[1] }) => repo.updatePlayerAttributes(args.playerId, args.attrs),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.players(teamId) }),
  });
}

// ============================================================================
// Task 8: opponent profiles
// ============================================================================
export const useOpponentProfiles = (teamId?: string) => useQuery({ queryKey: ['opponentProfiles', teamId ?? ''], queryFn: () => repo.fetchOpponentProfiles(teamId!), enabled: !!teamId });
export const useOpponentProfile = (teamId?: string, opponentTeamId?: string) => useQuery({ queryKey: ['opponentProfile', teamId ?? '', opponentTeamId ?? ''], queryFn: () => repo.fetchOpponentProfile(teamId!, opponentTeamId!), enabled: !!teamId && !!opponentTeamId });
export function useUpsertOpponentProfile(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof repo.upsertOpponentProfile>[0]) => repo.upsertOpponentProfile(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opponentProfiles', teamId] }),
  });
}

// ============================================================================
// Task 9: match requests
// ============================================================================
export const useDiscoverableTeams = (excludeTeamId?: string) => useQuery({ queryKey: ['discoverableTeams', excludeTeamId ?? ''], queryFn: () => repo.fetchDiscoverableTeams(excludeTeamId!), enabled: !!excludeTeamId });
export const useMatchRequests = (teamId?: string) => useQuery({ queryKey: ['matchRequests', teamId ?? ''], queryFn: () => repo.fetchMatchRequests(teamId!), enabled: !!teamId, refetchInterval: 8000 });
export function useSendMatchRequest(teamId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (args: Parameters<typeof repo.sendMatchRequest>[0]) => repo.sendMatchRequest(args), onSuccess: () => qc.invalidateQueries({ queryKey: ['matchRequests', teamId] }) });
}
export function useRespondToMatchRequest(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { action: 'accept' | 'decline' | 'cancel'; request: Parameters<typeof repo.acceptMatchRequest>[0] }) => {
      if (args.action === 'accept') return repo.acceptMatchRequest(args.request);
      if (args.action === 'decline') { await repo.declineMatchRequest(args.request.id); return null; }
      await repo.cancelMatchRequest(args.request.id);
      return null;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['matchRequests', teamId] }); qc.invalidateQueries({ queryKey: qk.matches(teamId) }); },
  });
}
export function useDeleteMatchRequest(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => repo.deleteMatchRequest(requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matchRequests', teamId] }),
  });
}

// ============================================================================
// Fielding credit (catches / run-outs / stumpings) for the Leaderboard.
// ============================================================================
export const useFieldingStats = (teamId?: string) => useQuery({ queryKey: ['fieldingStats', teamId ?? ''], queryFn: () => repo.fetchFieldingStats(teamId!), enabled: !!teamId });

export function useFinalizeLiveScorecard(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof repo.finalizeLiveScorecard>) => repo.finalizeLiveScorecard(...args),
    onSuccess: (_d, args) => { qc.invalidateQueries({ queryKey: qk.matches(teamId) }); qc.invalidateQueries({ queryKey: qk.stats(teamId) }); qc.invalidateQueries({ queryKey: qk.scorecard(args[0]) }); },
  });
}
