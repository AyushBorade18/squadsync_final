import type { FormatId } from '../algorithms/formats';
import type { BowlingStyle, InjuryStatus, MatchupTier, FieldingTier, OpponentBowlingTendency, OpponentBattingTendency } from '../algorithms/selection';
import type { DismissalKind, ExtraType } from '../algorithms/scoring';
import type { ShotZone } from '../algorithms/wagonWheel';

export type Role = 'player' | 'coach';
export type BattingStyle = 'right_hand' | 'left_hand';
export type PlayerRole = 'batter' | 'bowler' | 'all_rounder' | 'wicketkeeper';

export interface Profile { id: string; name: string; role: Role; email: string; avatarSeed: string; }

export interface Player {
  id: string; profileId: string | null; name: string; teamId: string;
  playerRole: PlayerRole; battingStyle: BattingStyle; bowlingStyle: BowlingStyle;
  isKeeper: boolean; jerseyNumber: number | null; photoSeed: string;
  /** Roster attributes feeding the Decision Engine's weighted suitability formula. */
  injuryStatus: InjuryStatus;
  battingVsPace: MatchupTier;
  battingVsSpin: MatchupTier;
  fieldingTier: FieldingTier;
  oversBowledRecentMatches: number;
}

export interface Team { id: string; name: string; shortName: string; ownerProfileId: string; isOwnTeam: boolean; }

export interface Match {
  id: string; teamId: string; opponentTeamId: string | null; opponentName: string;
  format: FormatId; venue: string; date: string; status: 'scheduled' | 'live' | 'completed';
  /** Absolute team id, not "us/them" — stored once and read correctly from either coach's
   *  screen, since a match row is now visible to both sides. */
  tossWonByTeamId: string | null; tossDecision: 'bat' | 'bowl' | null;
  result: string | null; tournamentId: string | null;
  /** Only meaningful when format === 'CUSTOM' — the overs-per-innings the coach picked when
   *  scheduling the match. Null for every preset format, which has its own fixed overs. */
  customOvers: number | null;
  /** Which team currently has the right to enter balls. Defaults to whoever owns the match
   *  row (scheduled it, or accepted the challenge) — the "host" — and can be delegated. */
  scoringTeamId: string | null;
  /** True when the opponent is a real coached team with its own roster/account (came from an
   *  accepted match request) — false when it's a placeholder team created by ensureOpponent
   *  for a directly-scheduled match with no tracked roster on the other side. */
  opponentIsTracked: boolean;
  /** Only ever set for an untracked opponent: captured at the toss / at innings start since
   *  there's no coach account on the other side to submit this themselves. */
  opponentCaptainName: string | null;
  opponentBowlerName: string | null;
  opponentBowlerType: 'pace' | 'spin' | null;
}

export interface BattingPerformance {
  id: string; matchId: string; playerId: string; innings: 1 | 2; position: number;
  runs: number; balls: number; fours: number; sixes: number;
  status: 'not_out' | 'out' | 'did_not_bat'; dismissal: string | null;
  /** Embedded from the players table at fetch time so a scorecard never depends on a separate roster lookup succeeding. */
  playerName?: string;
}
export interface BowlingPerformance {
  id: string; matchId: string; playerId: string; innings: 1 | 2;
  legalBalls: number; maidens: number; runs: number; wickets: number; wides: number; noBalls: number;
  playerName?: string;
}
export interface InningsSummary { matchId: string; innings: 1 | 2; battingTeam: string; runs: number; wickets: number; legalBalls: number; }

export interface PlayingXIEntry {
  id: string; matchId: string; teamId: string; playerId: string;
  battingOrder: number | null; isCaptain: boolean; isKeeper: boolean;
}
export interface Tournament { id: string; name: string; format: FormatId; teamIds: string[]; teamNames: Record<string, string>; ownerProfileId: string; startDate: string; }

export interface SelectionScoreRecord { matchId: string; playerId: string; roleSlotId: string; fit: number; }

/** Task 8: a saved scouting record per opponent, reused across matches rather than
 *  re-derived from scratch every time. */
export interface OpponentProfile {
  id: string; ownerTeamId: string; opponentTeamId: string; opponentName: string;
  bowlingTendency: OpponentBowlingTendency; battingTendency: OpponentBattingTendency; notes: string;
  updatedAt: string;
}

/** Task 9: coach-to-coach challenge -> accept -> creates a real tracked match for both sides. */
export type MatchRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export interface MatchRequest {
  id: string; fromTeamId: string; fromTeamName: string; toTeamId: string; toTeamName: string;
  proposedDate: string; proposedVenue: string; format: FormatId; customOvers: number | null; message: string;
  status: MatchRequestStatus; resultingMatchId: string | null; createdAt: string;
}

/** Task 1: live, ball-by-ball innings — the persisted mirror of algorithms/liveInnings.ts. */
export interface LiveInningsRow {
  id: string; matchId: string; inningsNumber: 1 | 2; battingTeamId: string; bowlingTeamId: string;
  strikerId: string | null; nonStrikerId: string | null; currentBowlerId: string | null; lastOverBowlerId: string | null;
  legalBallsInOver: number; currentOverNumber: number;
  runs: number; wickets: number; legalBalls: number; freeHit: boolean;
  awaitingNewBatsman: boolean; awaitingNewBowler: boolean; completed: boolean; endReason: string | null; target: number | null;
}
export interface LiveBallRow {
  id: string; inningsId: string; overNumber: number; ballInOver: number;
  runsOffBat: number; extraType: ExtraType | 'none'; extraRuns: number; shotZone: ShotZone | null;
  isWicket: boolean; wicketKind: DismissalKind | null;
  strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null; dismissedPlayerId: string | null;
  /** Fielding credit — who caught it, effected the run out, or did the stumping. Only ever
   *  set for caught/run_out/stumped; null for every other dismissal kind and every non-wicket
   *  ball. */
  fielderId: string | null;
}
export interface LiveOverRow { id: string; inningsId: string; overNumber: number; bowlerId: string; runsConceded: number; wicketsTaken: number; }
