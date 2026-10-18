-- ============================================================================
-- SquadSync — Phase 4 migration
-- Run this once in your Supabase project's SQL editor (Database -> SQL Editor).
-- It assumes the Phase 3 schema already exists: teams, players, matches,
-- is_coach_of_team(team_id), is_member_of_team(team_id).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ball-by-ball live scoring (task 1)
-- ----------------------------------------------------------------------------
do $$ begin
  create type extra_type as enum ('none','wide','no_ball','bye','leg_bye','penalty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dismissal_kind as enum (
    'bowled','caught','lbw','stumped','hit_wicket','run_out',
    'obstructing','handled_ball','hit_ball_twice','timed_out','retired_out'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type shot_zone as enum (
    'long_on','long_off','mid_wicket','cover','square_leg','point','fine_leg','third_man'
  );
exception when duplicate_object then null; end $$;

create table if not exists live_innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  innings_number int not null default 1,
  batting_team_id uuid not null references teams(id),
  bowling_team_id uuid not null references teams(id),
  striker_id uuid references players(id),
  non_striker_id uuid references players(id),
  current_bowler_id uuid references players(id),
  last_over_bowler_id uuid references players(id),
  legal_balls_in_over int not null default 0,
  current_over_number int not null default 1,
  runs int not null default 0,
  wickets int not null default 0,
  legal_balls int not null default 0,
  free_hit boolean not null default false,
  awaiting_new_batsman boolean not null default false,
  awaiting_new_bowler boolean not null default false,
  completed boolean not null default false,
  end_reason text,
  target int,
  created_at timestamptz default now(),
  unique (match_id, innings_number)
);

create table if not exists live_overs (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references live_innings(id) on delete cascade,
  over_number int not null,
  bowler_id uuid not null references players(id),
  runs_conceded int not null default 0,
  wickets_taken int not null default 0,
  unique (innings_id, over_number)
);

create table if not exists live_balls (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references live_innings(id) on delete cascade,
  over_number int not null,
  ball_in_over int not null,
  runs_off_bat int not null default 0,
  extra_type extra_type not null default 'none',
  extra_runs int not null default 0,
  shot_zone shot_zone,
  is_wicket boolean not null default false,
  wicket_kind dismissal_kind,
  striker_id uuid references players(id),
  non_striker_id uuid references players(id),
  bowler_id uuid references players(id),
  dismissed_player_id uuid references players(id),
  created_at timestamptz default now()
);

create index if not exists live_balls_innings_idx on live_balls(innings_id);
create index if not exists live_overs_innings_idx on live_overs(innings_id);
create index if not exists live_innings_match_idx on live_innings(match_id);

alter table live_innings enable row level security;
alter table live_overs enable row level security;
alter table live_balls enable row level security;

drop policy if exists "live_innings_select_members" on live_innings;
create policy "live_innings_select_members" on live_innings
  for select using (is_member_of_team(batting_team_id) or is_member_of_team(bowling_team_id));
drop policy if exists "live_innings_all_coach" on live_innings;
create policy "live_innings_all_coach" on live_innings
  for all using (is_coach_of_team(batting_team_id)) with check (is_coach_of_team(batting_team_id));

drop policy if exists "live_overs_select_members" on live_overs;
create policy "live_overs_select_members" on live_overs
  for select using (exists (select 1 from live_innings li where li.id = live_overs.innings_id and (is_member_of_team(li.batting_team_id) or is_member_of_team(li.bowling_team_id))));
drop policy if exists "live_overs_all_coach" on live_overs;
create policy "live_overs_all_coach" on live_overs
  for all using (exists (select 1 from live_innings li where li.id = live_overs.innings_id and is_coach_of_team(li.batting_team_id)))
  with check (exists (select 1 from live_innings li where li.id = live_overs.innings_id and is_coach_of_team(li.batting_team_id)));

drop policy if exists "live_balls_select_members" on live_balls;
create policy "live_balls_select_members" on live_balls
  for select using (exists (select 1 from live_innings li where li.id = live_balls.innings_id and (is_member_of_team(li.batting_team_id) or is_member_of_team(li.bowling_team_id))));
drop policy if exists "live_balls_all_coach" on live_balls;
create policy "live_balls_all_coach" on live_balls
  for all using (exists (select 1 from live_innings li where li.id = live_balls.innings_id and is_coach_of_team(li.batting_team_id)))
  with check (exists (select 1 from live_innings li where li.id = live_balls.innings_id and is_coach_of_team(li.batting_team_id)));

do $$ begin
  alter publication supabase_realtime add table live_innings, live_overs, live_balls;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Richer player attributes (tasks 6 & 7): injury/availability + matchup tiers
-- ----------------------------------------------------------------------------
do $$ begin
  create type injury_status as enum ('available','injured','unavailable');
exception when duplicate_object then null; end $$;
do $$ begin
  create type matchup_tier as enum ('weak','average','strong');
exception when duplicate_object then null; end $$;
do $$ begin
  create type fielding_tier as enum ('average','good','excellent');
exception when duplicate_object then null; end $$;

alter table players add column if not exists injury_status injury_status not null default 'available';
alter table players add column if not exists batting_vs_pace matchup_tier not null default 'average';
alter table players add column if not exists batting_vs_spin matchup_tier not null default 'average';
alter table players add column if not exists fielding_tier fielding_tier not null default 'average';
alter table players add column if not exists overs_bowled_recent_matches int not null default 0;

-- ----------------------------------------------------------------------------
-- 3. Opponent profiles (task 8)
-- ----------------------------------------------------------------------------
do $$ begin
  create type bowling_tendency as enum ('pace_heavy','spin_heavy','balanced');
exception when duplicate_object then null; end $$;
do $$ begin
  create type batting_tendency as enum ('pace_heavy','spin_heavy','balanced');
exception when duplicate_object then null; end $$;

create table if not exists opponent_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references teams(id) on delete cascade,
  opponent_team_id uuid not null references teams(id) on delete cascade,
  bowling_tendency bowling_tendency not null default 'balanced',
  batting_tendency batting_tendency not null default 'balanced',
  notes text,
  updated_at timestamptz default now(),
  unique (owner_team_id, opponent_team_id)
);

alter table opponent_profiles enable row level security;
drop policy if exists "opponent_profiles_select_members" on opponent_profiles;
create policy "opponent_profiles_select_members" on opponent_profiles
  for select using (is_member_of_team(owner_team_id));
drop policy if exists "opponent_profiles_all_coach" on opponent_profiles;
create policy "opponent_profiles_all_coach" on opponent_profiles
  for all using (is_coach_of_team(owner_team_id)) with check (is_coach_of_team(owner_team_id));

-- ----------------------------------------------------------------------------
-- 4. Match requests (task 9): coach-to-coach challenge -> accept -> real match
-- ----------------------------------------------------------------------------
do $$ begin
  create type match_request_status as enum ('pending','accepted','declined','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists match_requests (
  id uuid primary key default gen_random_uuid(),
  from_team_id uuid not null references teams(id) on delete cascade,
  to_team_id uuid not null references teams(id) on delete cascade,
  proposed_date date not null,
  proposed_venue text not null,
  format text not null,
  message text,
  status match_request_status not null default 'pending',
  resulting_match_id uuid references matches(id),
  created_at timestamptz default now()
);

alter table match_requests enable row level security;
drop policy if exists "match_requests_select_involved" on match_requests;
create policy "match_requests_select_involved" on match_requests
  for select using (is_member_of_team(from_team_id) or is_member_of_team(to_team_id));
drop policy if exists "match_requests_insert_sender_coach" on match_requests;
create policy "match_requests_insert_sender_coach" on match_requests
  for insert with check (is_coach_of_team(from_team_id));
drop policy if exists "match_requests_update_either_coach" on match_requests;
create policy "match_requests_update_either_coach" on match_requests
  for update using (is_coach_of_team(from_team_id) or is_coach_of_team(to_team_id));

-- This table requires every "own team" to be discoverable by other coaches so they can
-- send a request to it. Phase 3's teams table otherwise only lets a coach see teams they
-- belong to; this adds read access to the public directory of own-teams (name/short_name
-- only matter here — no player data is exposed by this policy).
drop policy if exists "teams_select_own_teams_public" on teams;
create policy "teams_select_own_teams_public" on teams
  for select using (is_own_team = true);

do $$ begin
  alter publication supabase_realtime add table match_requests;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Phase 4.1 bug-fix patch — safe to re-run, every statement is idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Bug: "Custom" format had no way to record the overs count the coach picked.
-- ----------------------------------------------------------------------------
alter table matches add column if not exists custom_overs integer;

-- ----------------------------------------------------------------------------
-- Bug: starting an innings where the OPPONENT bats first sets batting_team_id
-- to the opponent's team, which the coach doesn't own — so the old policies
-- (checking only is_coach_of_team(batting_team_id)) rejected the write with
-- "new row violates row-level security policy for table 'live_innings'".
-- A coach must be able to write a live_innings/live_overs/live_balls row as
-- long as they own EITHER side of that innings, not just the batting side.
-- ----------------------------------------------------------------------------
drop policy if exists "live_innings_all_coach" on live_innings;
create policy "live_innings_all_coach" on live_innings
  for all
  using (is_coach_of_team(batting_team_id) or is_coach_of_team(bowling_team_id))
  with check (is_coach_of_team(batting_team_id) or is_coach_of_team(bowling_team_id));

drop policy if exists "live_overs_all_coach" on live_overs;
create policy "live_overs_all_coach" on live_overs
  for all
  using (exists (select 1 from live_innings li where li.id = live_overs.innings_id and (is_coach_of_team(li.batting_team_id) or is_coach_of_team(li.bowling_team_id))))
  with check (exists (select 1 from live_innings li where li.id = live_overs.innings_id and (is_coach_of_team(li.batting_team_id) or is_coach_of_team(li.bowling_team_id))));

drop policy if exists "live_balls_all_coach" on live_balls;
create policy "live_balls_all_coach" on live_balls
  for all
  using (exists (select 1 from live_innings li where li.id = live_balls.innings_id and (is_coach_of_team(li.batting_team_id) or is_coach_of_team(li.bowling_team_id))))
  with check (exists (select 1 from live_innings li where li.id = live_balls.innings_id and (is_coach_of_team(li.batting_team_id) or is_coach_of_team(li.bowling_team_id))));

-- ============================================================================
-- Phase 5 — both-sides matches, scoring authority, playing XI, toss.
-- Safe to re-run; every statement is idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A match row is owned by whichever team scheduled it (direct "New match") or
-- accepted the challenge (match requests). The OTHER side never had read/write
-- access to that same row, so a challenger could never see or score their own
-- match. Add a symmetric policy: a coach (or player) of EITHER team on a match
-- can read it, and the opponent-side coach can update it (needed for toss,
-- scoring delegation, and finishing the match from either side).
-- ----------------------------------------------------------------------------
drop policy if exists "matches_select_either_side" on matches;
create policy "matches_select_either_side" on matches
  for select using (is_member_of_team(team_id) or (opponent_team_id is not null and is_member_of_team(opponent_team_id)));

drop policy if exists "matches_update_either_coach" on matches;
create policy "matches_update_either_coach" on matches
  for update using (is_coach_of_team(team_id) or (opponent_team_id is not null and is_coach_of_team(opponent_team_id)));

-- ----------------------------------------------------------------------------
-- Scoring authority: exactly one team may enter balls at a time. Defaults to
-- the team that owns the match row (the "host" — whoever scheduled it, or
-- whoever accepted the challenge), who can delegate it to the other side.
-- Toss result is stored absolutely (which team, not "us/them") so it reads
-- correctly from either coach's screen.
-- ----------------------------------------------------------------------------
alter table matches add column if not exists scoring_team_id uuid references teams(id);
update matches set scoring_team_id = team_id where scoring_team_id is null;

alter table matches add column if not exists toss_won_by_team_id uuid references teams(id);
alter table matches add column if not exists toss_decision text check (toss_decision in ('bat', 'bowl'));

-- live_innings/live_overs/live_balls additionally require scoring authority on
-- top of owning either side — a coach who has delegated scoring away, or who
-- never had it, can still read live data (via the select policies above join)
-- but can no longer write it.
drop policy if exists "live_innings_all_coach" on live_innings;
create policy "live_innings_all_coach" on live_innings
  for all
  using (exists (select 1 from matches m where m.id = live_innings.match_id and is_coach_of_team(m.scoring_team_id)))
  with check (exists (select 1 from matches m where m.id = live_innings.match_id and is_coach_of_team(m.scoring_team_id)));
drop policy if exists "live_innings_select_either_side" on live_innings;
create policy "live_innings_select_either_side" on live_innings
  for select using (is_member_of_team(batting_team_id) or is_member_of_team(bowling_team_id));

drop policy if exists "live_overs_all_coach" on live_overs;
create policy "live_overs_all_coach" on live_overs
  for all
  using (exists (select 1 from live_innings li join matches m on m.id = li.match_id where li.id = live_overs.innings_id and is_coach_of_team(m.scoring_team_id)))
  with check (exists (select 1 from live_innings li join matches m on m.id = li.match_id where li.id = live_overs.innings_id and is_coach_of_team(m.scoring_team_id)));

drop policy if exists "live_balls_all_coach" on live_balls;
create policy "live_balls_all_coach" on live_balls
  for all
  using (exists (select 1 from live_innings li join matches m on m.id = li.match_id where li.id = live_balls.innings_id and is_coach_of_team(m.scoring_team_id)))
  with check (exists (select 1 from live_innings li join matches m on m.id = li.match_id where li.id = live_balls.innings_id and is_coach_of_team(m.scoring_team_id)));

-- Match requests had no way to propose a Custom overs count either.
alter table match_requests add column if not exists custom_overs integer;

-- ----------------------------------------------------------------------------
-- Playing XI: each coach picks and submits their own XI for a specific match.
-- A match cannot start live scoring (enforced client-side) until the scoring
-- team's own XI is submitted. Both sides can read either XI once submitted.
-- ----------------------------------------------------------------------------
create table if not exists playing_xi (
  id uuid primary key default gen_random_uuid()
);
-- Self-heals a playing_xi table left over from an earlier partial run of this file that
-- didn't have every column this phase needs — "create table if not exists" is a no-op when
-- the table already exists in some other shape, which is exactly what caused
-- "column playing_xi.team_id does not exist" even after this migration had supposedly run.
alter table playing_xi add column if not exists match_id uuid references matches(id) on delete cascade;
alter table playing_xi add column if not exists team_id uuid references teams(id);
alter table playing_xi add column if not exists player_id uuid references players(id);
alter table playing_xi add column if not exists batting_order integer;
alter table playing_xi add column if not exists is_captain boolean not null default false;
alter table playing_xi add column if not exists is_keeper boolean not null default false;
alter table playing_xi add column if not exists created_at timestamptz default now();
-- Checked against pg_constraint directly rather than caught via exception: re-running this
-- statement when the constraint (or a same-shaped one under a different name, or just its
-- backing index) already exists from a previous run has been seen to raise duplicate_object
-- (42710), duplicate_table (42P07, Postgres naming the error after the implicit index) or,
-- for a table that already has ANY unique/pk constraint on these columns, other codes —
-- an upfront existence check sidesteps guessing every exception code Postgres might use.
do $$ begin
  -- contype = 'u' only — playing_xi's own `id` column already carries a primary key (contype
  -- 'p') from its create-table statement above, which is unrelated to this unique constraint
  -- and must not short-circuit this check.
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'playing_xi' and c.contype = 'u'
  ) then
    alter table playing_xi add constraint playing_xi_match_team_player_key unique (match_id, team_id, player_id);
  end if;
exception when duplicate_object then null; when duplicate_table then null; when unique_violation then
  raise notice 'playing_xi has duplicate (match_id, team_id, player_id) rows from earlier testing — skipping the unique constraint. Clear the table and re-run this file if you want it enforced.';
end $$;
alter table playing_xi enable row level security;
drop policy if exists "playing_xi_select_either_side" on playing_xi;
create policy "playing_xi_select_either_side" on playing_xi
  for select using (exists (select 1 from matches m where m.id = playing_xi.match_id and (is_member_of_team(m.team_id) or is_member_of_team(m.opponent_team_id))));
drop policy if exists "playing_xi_write_own_coach" on playing_xi;
create policy "playing_xi_write_own_coach" on playing_xi
  for all using (is_coach_of_team(team_id)) with check (is_coach_of_team(team_id));

create table if not exists playing_xi_submissions (
  submitted_at timestamptz default now()
);
-- Same self-healing as playing_xi above, for the same reason.
alter table playing_xi_submissions add column if not exists match_id uuid references matches(id) on delete cascade;
alter table playing_xi_submissions add column if not exists team_id uuid references teams(id);
alter table playing_xi_submissions add column if not exists submitted_at timestamptz default now();
-- Checked against pg_constraint directly (see the playing_xi block above for why): a table
-- can have at most one primary key, so blindly re-adding one on a re-run of this file raises
-- "multiple primary keys for table ... are not allowed" (42P16) if an earlier run (even one
-- that predates this file, under a different constraint name) already gave it one.
do $$ begin
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'playing_xi_submissions' and c.contype = 'p'
  ) then
    alter table playing_xi_submissions add constraint playing_xi_submissions_pkey primary key (match_id, team_id);
  end if;
exception when duplicate_object then null; when duplicate_table then null; when unique_violation then
  raise notice 'playing_xi_submissions has duplicate (match_id, team_id) rows from earlier testing — skipping the primary key. Clear the table and re-run this file if you want it enforced.';
end $$;
alter table playing_xi_submissions enable row level security;
drop policy if exists "playing_xi_submissions_select_either_side" on playing_xi_submissions;
create policy "playing_xi_submissions_select_either_side" on playing_xi_submissions
  for select using (exists (select 1 from matches m where m.id = playing_xi_submissions.match_id and (is_member_of_team(m.team_id) or is_member_of_team(m.opponent_team_id))));
drop policy if exists "playing_xi_submissions_write_own_coach" on playing_xi_submissions;
create policy "playing_xi_submissions_write_own_coach" on playing_xi_submissions
  for all using (is_coach_of_team(team_id)) with check (is_coach_of_team(team_id));

-- ============================================================================
-- Phase 6 — delete a match or tournament from the app, and fix the
-- tournament_teams RLS gap (adding a team to a tournament was rejected with
-- "new row violates row-level security policy" because that table had RLS
-- enabled from Phase 3 but was never given a policy that lets the tournament's
-- owner write to it). Safe to re-run; every statement is idempotent.
-- ============================================================================

alter table tournament_teams enable row level security;
drop policy if exists "tournament_teams_all_owner" on tournament_teams;
create policy "tournament_teams_all_owner" on tournament_teams
  for all
  using (exists (select 1 from tournaments t where t.id = tournament_teams.tournament_id and t.owner_profile_id = auth.uid()))
  with check (exists (select 1 from tournaments t where t.id = tournament_teams.tournament_id and t.owner_profile_id = auth.uid()));

drop policy if exists "tournaments_delete_owner" on tournaments;
create policy "tournaments_delete_owner" on tournaments
  for delete using (owner_profile_id = auth.uid());

-- Deleting a match is allowed for either side's coach, not just whoever currently holds
-- scoring_team_id (that column only gates WRITING live balls, not deleting the match).
drop policy if exists "matches_delete_either_coach" on matches;
create policy "matches_delete_either_coach" on matches
  for delete using (is_coach_of_team(team_id) or (opponent_team_id is not null and is_coach_of_team(opponent_team_id)));

-- The existing live_innings/live_overs/live_balls "all" policies additionally require
-- scoring authority (needed for writing balls); deleting a match's data when tidying up or
-- removing it shouldn't be blocked just because scoring was delegated away at some point, so
-- these delete policies key off being coach of EITHER side instead.
drop policy if exists "live_innings_delete_either_coach" on live_innings;
create policy "live_innings_delete_either_coach" on live_innings
  for delete using (is_coach_of_team(batting_team_id) or is_coach_of_team(bowling_team_id));

drop policy if exists "live_overs_delete_either_coach" on live_overs;
create policy "live_overs_delete_either_coach" on live_overs
  for delete using (exists (select 1 from live_innings li where li.id = live_overs.innings_id and (is_coach_of_team(li.batting_team_id) or is_coach_of_team(li.bowling_team_id))));

drop policy if exists "live_balls_delete_either_coach" on live_balls;
create policy "live_balls_delete_either_coach" on live_balls
  for delete using (exists (select 1 from live_innings li where li.id = live_balls.innings_id and (is_coach_of_team(li.batting_team_id) or is_coach_of_team(li.bowling_team_id))));

-- playing_xi/playing_xi_submissions' existing write policy only lets a coach touch their OWN
-- team_id's rows; deleting a whole match needs to remove BOTH sides' rows.
drop policy if exists "playing_xi_delete_either_side" on playing_xi;
create policy "playing_xi_delete_either_side" on playing_xi
  for delete using (exists (select 1 from matches m where m.id = playing_xi.match_id and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))));

drop policy if exists "playing_xi_submissions_delete_either_side" on playing_xi_submissions;
create policy "playing_xi_submissions_delete_either_side" on playing_xi_submissions
  for delete using (exists (select 1 from matches m where m.id = playing_xi_submissions.match_id and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))));

-- batting_performances/bowling_performances predate this project's migration files (Phase 3),
-- so we don't know their exact existing policies — this just ADDS a permissive delete path
-- scoped to either side's coach, on top of whatever is already there.
drop policy if exists "batting_performances_delete_either_coach" on batting_performances;
create policy "batting_performances_delete_either_coach" on batting_performances
  for delete using (exists (select 1 from matches m where m.id = batting_performances.match_id and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))));

drop policy if exists "bowling_performances_delete_either_coach" on bowling_performances;
create policy "bowling_performances_delete_either_coach" on bowling_performances
  for delete using (exists (select 1 from matches m where m.id = bowling_performances.match_id and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))));

-- ============================================================================
-- Phase 7 — fixes this round:
--   1. Accepting a match request was rejected by RLS (insert policy only let a coach insert
--      a row naming THEIR OWN team_id, but acceptMatchRequest names the CHALLENGER as host).
--   2. New columns to capture, for a directly-scheduled match against an untracked opponent
--      (no real coach account / roster — see ensureOpponent, which creates a placeholder team
--      with is_own_team = false): the opposing captain's name (captured at the toss) and the
--      opposing opening bowler's name + type (captured when starting an innings we're batting).
-- Safe to re-run; every statement is idempotent.
-- ============================================================================

-- (1) Accepting a challenge makes the CHALLENGER the host (team_id) — matching the "whoever
-- sent the challenge keeps scoring priority" rule — but it's the ACCEPTING coach's browser
-- that performs the insert. The original insert policy only let a coach insert a row where
-- they coach team_id, which the accepter doesn't, so that insert was rejected with
-- "new row violates row-level security policy for table matches". This adds the missing path:
-- insert is also fine when the inserter coaches the OTHER side being named on the row.
drop policy if exists "matches_insert_either_coach" on matches;
create policy "matches_insert_either_coach" on matches
  for insert with check (is_coach_of_team(team_id) or (opponent_team_id is not null and is_coach_of_team(opponent_team_id)));

-- (2) Untracked-opponent capture columns on matches. All nullable — only ever set for a
-- direct-scheduled match (opponent_team_id points at an is_own_team = false placeholder).
alter table matches add column if not exists opponent_captain_name text;
alter table matches add column if not exists opponent_bowler_name text;
alter table matches add column if not exists opponent_bowler_type text;
do $$ begin
  alter table matches add constraint matches_opponent_bowler_type_check check (opponent_bowler_type in ('pace', 'spin'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Phase 9 fix: a coach could only ever read their OWN team's players table rows.
-- For a tracked opponent (from an accepted match request), the opposing coach's roster
-- was therefore invisible — "Choose a bowler" / "On strike" showed as empty for their
-- side even though the app was correctly asking for it. Grant read access to a team's
-- players whenever the viewer coaches (or plays for) a team that has a match against them.
-- ============================================================================
drop policy if exists "players_select_own_team" on players;
drop policy if exists "players_select_own_or_matched" on players;
create policy "players_select_own_or_matched" on players
  for select using (
    is_member_of_team(team_id)
    or exists (
      select 1 from matches m
      where (m.team_id = players.team_id or m.opponent_team_id = players.team_id)
        and (is_member_of_team(m.team_id) or (m.opponent_team_id is not null and is_member_of_team(m.opponent_team_id)))
    )
  );

-- A placeholder/untracked opponent team (owner_profile_id is null) has no coach of its own,
-- so the host needs to be able to insert players under it when capturing that side's XI.
drop policy if exists "players_insert_own_or_untracked_opponent" on players;
create policy "players_insert_own_or_untracked_opponent" on players
  for insert with check (
    is_coach_of_team(team_id)
    or exists (select 1 from teams t where t.id = players.team_id and t.owner_profile_id is null)
  );

-- ============================================================================
-- Phase 10 fix — the big one from live two-account testing:
--   1. The challenged/non-host team got "No scorecard was recorded for this match" even
--      though the host could see a full scorecard, AND that same team's Analytics/stats
--      never populated (runs/average/wickets stayed blank) no matter how many matches they
--      played — only the side that actually performed the live scoring ever saw its own
--      numbers. batting_performances/bowling_performances predate this project's migration
--      files, so their original select policy is unknown, but every symptom points at the
--      same root cause: that policy was scoped to matches.team_id (the host) only, never
--      matches.opponent_team_id (the challenger) — so the non-host side's own rows (not just
--      the opponent's) were invisible to RLS. This ADDS a permissive "either side" select
--      policy on top of whatever already exists (Postgres OR's multiple permissive policies
--      together for the same command, so this only ever grants more access, never less).
--   2. Same reasoning applied to insert/update, so finishing a match works regardless of
--      which side (host or a delegated scorer) performed the live scoring.
-- Safe to re-run; every statement is idempotent.
-- ============================================================================
drop policy if exists "batting_performances_select_either_side" on batting_performances;
create policy "batting_performances_select_either_side" on batting_performances
  for select using (exists (
    select 1 from matches m where m.id = batting_performances.match_id
      and (is_member_of_team(m.team_id) or (m.opponent_team_id is not null and is_member_of_team(m.opponent_team_id)))
  ));
drop policy if exists "batting_performances_write_either_coach" on batting_performances;
create policy "batting_performances_write_either_coach" on batting_performances
  for all using (exists (
    select 1 from matches m where m.id = batting_performances.match_id
      and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))
  )) with check (exists (
    select 1 from matches m where m.id = batting_performances.match_id
      and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))
  ));

drop policy if exists "bowling_performances_select_either_side" on bowling_performances;
create policy "bowling_performances_select_either_side" on bowling_performances
  for select using (exists (
    select 1 from matches m where m.id = bowling_performances.match_id
      and (is_member_of_team(m.team_id) or (m.opponent_team_id is not null and is_member_of_team(m.opponent_team_id)))
  ));
drop policy if exists "bowling_performances_write_either_coach" on bowling_performances;
create policy "bowling_performances_write_either_coach" on bowling_performances
  for all using (exists (
    select 1 from matches m where m.id = bowling_performances.match_id
      and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))
  )) with check (exists (
    select 1 from matches m where m.id = bowling_performances.match_id
      and (is_coach_of_team(m.team_id) or (m.opponent_team_id is not null and is_coach_of_team(m.opponent_team_id)))
  ));

-- live_innings/live_overs/live_balls SELECT already covers either side (see Phase 5 above),
-- but double-check it's actually in place in case an older project only ran part of this
-- file — this is a no-op if it's already there.
drop policy if exists "live_innings_select_either_side" on live_innings;
create policy "live_innings_select_either_side" on live_innings
  for select using (is_member_of_team(batting_team_id) or is_member_of_team(bowling_team_id));

-- ============================================================================
-- Phase 11 — fielder credit (catch by / run out by / stumped by), and the policy work
-- needed for the mobile app's redesigned untracked-opponent XI form and dynamic live
-- scoring. Safe to re-run; every statement is idempotent.
-- ============================================================================

-- Who gets credit as the catcher / the fielder who ran the batter out / the keeper who
-- stumped them. Only ever set for caught/run_out/stumped (enforced client-side); null for
-- every other dismissal kind and every non-wicket ball.
alter table live_balls add column if not exists fielder_id uuid references players(id);

-- bowling_style_type previously rejected the literal string "none" (used for a pure batter
-- entered through the untracked-opponent Playing XI form) — that column is nullable and
-- should hold NULL for "no bowling style", not an invalid enum string. Nothing to migrate on
-- existing rows (the bad insert always failed before any row was written), this just
-- documents the fix living in submitUntrackedOpponentXI (src/lib/repo.ts).

-- The untracked-opponent Playing XI form captures a WHOLE lineup in one submit; if the
-- player INSERT above succeeds but the match has no opponent_team_id row visible yet (edge
-- case: match row fetched before this team's own join resolved), the playing_xi insert that
-- immediately follows in the same request needs the same "either side" latitude as matches
-- generally get, which it already has from Phase 5 (playing_xi_write_own_coach checks
-- is_coach_of_team(team_id) directly, not via a match join, so it's unaffected by this).

-- Phase 11b: a player row is readable by anyone who can see a scorecard that includes them,
-- so names never fall back to "Unknown" for the other team's coach.
drop policy if exists "players_select_via_performances" on players;
create policy "players_select_via_performances" on players
  for select using (
    exists (
      select 1 from batting_performances bp join matches m on m.id = bp.match_id
      where bp.player_id = players.id
        and (is_member_of_team(m.team_id) or (m.opponent_team_id is not null and is_member_of_team(m.opponent_team_id)))
    )
    or exists (
      select 1 from bowling_performances bw join matches m on m.id = bw.match_id
      where bw.player_id = players.id
        and (is_member_of_team(m.team_id) or (m.opponent_team_id is not null and is_member_of_team(m.opponent_team_id)))
    )
  );
