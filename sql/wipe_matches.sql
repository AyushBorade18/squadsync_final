-- ============================================================================
-- Wipes every match and everything hanging off it (live scoring data,
-- scorecards, playing XIs, match requests) — for clearing out test data
-- before you start using the app for real. Teams and players are untouched.
--
-- Run this yourself in Supabase's SQL editor when you're ready; it is NOT run
-- automatically by anything in this project. There's no undo once it runs.
-- ============================================================================

delete from live_balls;
delete from live_overs;
delete from live_innings;
delete from playing_xi;
delete from playing_xi_submissions;
delete from batting_performances;
delete from bowling_performances;
delete from match_requests;
delete from matches;

-- If you also have a selection_scores table from Phase 3 and want it cleared:
-- delete from selection_scores;
