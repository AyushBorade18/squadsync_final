# SquadSync — Phase 1–2 build

Cricket analytics and decision-support platform. Player and Coach/Captain experiences,
built with React + TypeScript + Vite + Tailwind CSS.

## Run it

```
npm install
npm run dev
```

Open the printed local URL. Sign up as a Coach first (creates a team), add a few players
under Players, then sign up as a Player and join that team from the Dashboard.

## What's real right now

- All cricket logic (overs, formats, scoring rules, Hungarian-algorithm team selection,
  batting order, bowling planner, tournament brackets, player network) is in
  `src/algorithms/`, fully unit-tested (`npm test`), and independent of the UI.
- Data is stored in your browser's `localStorage` (see `src/lib/db.ts`), matching the shape
  the proposed Supabase schema would use, so swapping in real Supabase later means changing
  the repository layer (`src/lib/repo.ts`), not the pages.
- No seed/demo data — every team starts empty, per your "everything real" instruction. The
  only exception is the Live Match screen, which auto-advances a sample score every few
  seconds purely to demonstrate the live layout; it's clearly separate demo logic
  (`LiveCommandCenter` in `src/pages/shared/LiveMatch.tsx`), not real scoring input yet.

## What isn't built yet

- Supabase (Phase 3): auth, Postgres, RLS. Today's auth/database is local-only.
- Ball-by-ball live scoring input (only the demo ticker above).
- A real cricket data API.
- PWA packaging, deployment.

## Tests

```
npm test
```
74 tests covering overs conversion, format rules, the scoring engine (wides, no-balls, free
hits, byes, innings-end conditions), the live-innings reducer (strike rotation, over
completion, single-side tracking, chase-ends-mid-over), the Hungarian algorithm (including a
brute-force cross-check), context-aware suitability scoring, the next-bowler CSP's three
tiers, team selection, batting order, the bowling planner's constraints, scorecard
aggregation from ball-by-ball data, the wagon wheel, the player-network graph, and
tournament bracket/round-robin generation.

## Build

```
npm run build
```

## Phase 3 update — Supabase is live

- Auth is real Supabase email/password auth (`src/lib/auth.tsx`). Profile + team are
  auto-provisioned from signup metadata on first login — this handles both "email
  confirmation required" and "instant session" Supabase project settings.
- All data now goes through `src/lib/repo.ts` (async Supabase queries) and
  `src/lib/queries.ts` (React Query hooks — loading/error states are automatic).
- `.env` holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (git-ignored; see
  `.env.example` for the shape). You'll need your own `.env` to run this.
- RLS is enforced at the database level — see the SQL from the Phase 3 chat for the
  exact policies, especially `selection_scores_coach_only`.

## Phase 4 update — ball-by-ball scoring, richer selection, scouting & challenges

**Run `sql/phase4_migration.sql` in your Supabase SQL editor before using this build** — it
adds the `live_innings`/`live_overs`/`live_balls` tables, new columns on `players`
(injury/availability, batting-vs-pace/spin, fielding tier), and the `opponent_profiles` /
`match_requests` tables, all with RLS policies matching the Phase 3 pattern.

- **Real ball-by-ball live scoring** (`src/algorithms/liveInnings.ts`, wired up in
  `src/pages/shared/LiveMatch.tsx`) replaces the old demo ticker and the manual
  totals-entry scorecard form. Strike rotation, over completion, free hits, the
  constraint-relaxed next-bowler suggestion, and innings-end conditions are all handled by
  the same tested reducer. Because only your own roster has player rows, each innings
  tracks exactly one side's identities (your batters when you bat, your bowler when you
  bowl) — see the comment on `processDelivery` for why. At match end, every ball is folded
  into the same batting/bowling scorecard rows as before (`src/algorithms/
  scorecardAggregation.ts`), so the Scorecard viewer and all existing stats/analytics keep
  working unchanged.
- **Wagon wheel**: an 8-zone shot picker feeds an SVG plot on the Live Match page, scaled by
  runs and colored by boundary.
- **Richer suitability scoring** (`suitabilityScore` in `src/algorithms/selection.ts`):
  70% base role fit (real stats) + 20% match context (pitch type / opponent's bowling
  tendency) + 10% recent-fatigue + a small fielding tiebreak. The Decision Engine shows the
  full breakdown per player and lets you set the match context; it also now excludes
  injured/unavailable players automatically.
- **Full bipartite graph view** on the Decision Engine: every eligible player x role-slot
  edge, not just the picks, with hover-to-highlight.
- **Next-bowler suggestion** (`suggestNextBowler` in `src/algorithms/bowlingPlanner.ts`):
  a 3-tier constraint-relaxation CSP (capped out -> no-consecutive-over -> whole-squad
  emergency), surfaced live after every over.
- **Player attributes**: injury/availability, batting-vs-pace/spin, fielding tier are now
  editable per player (Players -> a player's profile) and persisted, replacing the old
  per-session "mark unavailable" toggle (which still exists as a match-day-only override).
- **Opponent scouting profiles**: a saved bowling/batting tendency + notes per opponent
  (Opponent Analysis), reused automatically as the Decision Engine's match context for your
  next match against them.
- **Match requests**: a new "Match Requests" page lets a coach challenge another
  coach-managed team; accepting creates a real tracked match for both sides, instead of an
  always-untracked opponent stub.

Everything above is additive to the existing schema — nothing from Phase 3 was removed or
renamed.

## Phase 9/10 update — both-sides scoring, untracked-opponent XI, deletes, PWA

**Run `sql/phase4_migration.sql` again in your Supabase SQL editor** — it's fully
idempotent (safe to re-run), and this version adds the critical fix below plus match
requests, Playing XI, toss, and untracked-opponent columns/tables.

- **Fixed: opponent roster was unreadable.** `players` only had a "read your own team"
  RLS policy, so a tracked opponent's batters/bowlers silently came back as an empty list
  — this is why "Choose a bowler" looked empty and scoring-delegation only ever showed your
  own team. The policy now also grants read access to any team you have a match against.
- **Fixed: toss result wasn't driving the opening pickers.** `StartInningsPicker` /
  `SecondInningsSetup` used to let you manually toggle "who's batting first" after the
  toss was recorded — that toggle, not the toss, decided which side's pickers showed, so it
  could show the wrong side. Who bats first is now computed directly from
  `tossWonByTeamId` + `tossDecision` and shown as a fact, with no override.
- **Untracked opponents** (a direct-scheduled match, not from an accepted Match Request) no
  longer need just a single bowler name — the host now enters the opponent's full Playing
  XI (name + batter/bowler/all-rounder + optional keeper) before the toss. This creates real
  player rows for them, so every picker from then on (batter, bowler, new batsman, next
  bowler) works exactly like a tracked opponent.
- **Match requests can be deleted** (`Match Requests` page), in addition to accept/decline.
- **Gating**: no ball can be scored while a new batsman or new bowler is awaited; 10 wickets
  is always all out; a dismissed batter can never be picked again that innings; a bowler can
  never bowl two overs in a row (absolute — never relaxed, only the per-format overs cap
  relaxes under the 3-tier suggestion).
- **PWA**: the app is installable (`vite-plugin-pwa`, manifest + service worker,
  `npm run build` emits `dist/sw.js`). On a phone, "Add to Home Screen" from the deployed
  URL installs it like a native app.

### Deploying

1. Push this project to a GitHub repo (or `vercel --prod` directly from this folder with the
   Vercel CLI).
2. On [vercel.com](https://vercel.com), "Add New Project" → import the repo → framework
   preset "Vite" → add the two env vars from `.env.example`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) → Deploy. `vercel.json` already has the
   SPA rewrite so client-side routing works on refresh.
3. Re-run `sql/phase4_migration.sql` against the **same Supabase project** your deployed env
   vars point to — the RLS fix above only takes effect once it's run there.

## Phase 11 update — fixed from live two-account testing (scorecard, analytics, mobile)

- **Fixed: opponent's name showed as "Unknown" in the Scorecard, and the challenged team
  saw "No scorecard was recorded for this match" / blank analytics.** Two separate bugs that
  looked related:
  1. `ScorecardViewer` (Matches page) only ever fetched YOUR team's roster to resolve
     `player_id -> name`, so the other side's rows (which were always there) rendered as
     "Unknown". It now fetches both rosters.
  2. `batting_performances`/`bowling_performances` predate this project's own migrations, and
     their original Supabase select policy only ever recognized the match's host
     (`matches.team_id`), never the challenger (`matches.opponent_team_id`) — so the
     non-host side's SELECT returned zero rows, for their own stats as well as the
     opponent's. That's why only the scoring team's Analytics ever had numbers. **Fixed in
     `sql/phase4_migration.sql`** (new "either side" select/write policies for both tables) —
     **you must re-run this file against your live Supabase project** for this to take
     effect; the code fix alone does not change what the database returns.
- **Mobile navigation now has every section.** The bottom bar used to hard-code 5 tabs and
  silently drop the rest (Team Selection, Decision Engine, Batting Order, Bowling Planner,
  Match Requests, What-If Simulator, Tournaments, Leaderboard, Settings, My Profile, My
  Performance were all unreachable on a phone). The bar now shows the 4 most-used sections
  (Home, Matches, Live, Analytics) plus a "More" button that opens every remaining section —
  the exact same list as the desktop sidebar, nothing held back.
- **Mobile layout overflow.** A handful of pages (the Scorecard modal's tables in particular)
  could render wider than the phone's screen, which is what forced pinch-zooming to read
  anything. Tables now scroll horizontally inside their own card instead of widening the
  page, and the whole app now has a document-level safety net (`overflow-x: hidden` on
  `html`/`body`) so no single wide element can drag the page wider than the viewport again.
- **Tests, typecheck, and production build all verified clean** (`npm test` — 77/77,
  `npx tsc -b`, `npm run build`) before this was packaged.

### What to do with this update (you're already deployed)

1. **Supabase first** — open your Supabase project's SQL editor and re-run the whole
   `sql/phase4_migration.sql` file. It's fully idempotent, so re-running it is safe even
   though you've run earlier versions of it before; this is what actually fixes the
   scorecard/analytics visibility bug — the code changes alone can't fix a database-level
   permission gap.
2. **Push the code.**
   - If this project is already a Git repo connected to Vercel: replace the changed files
     (`src/pages/shared/Matches.tsx`, `src/pages/player/Performance.tsx`,
     `src/components/Shell.tsx`, `src/components/primitives.tsx`, `src/index.css`,
     `sql/phase4_migration.sql`, this `README.md`) with the ones in this zip, then:
     ```
     git add -A
     git commit -m "Fix scorecard/analytics visibility and mobile nav"
     git push
     ```
     Vercel auto-redeploys on every push to the connected branch — no dashboard steps needed.
   - If you haven't put this in Git yet: create a new GitHub repo, then from this project's
     folder:
     ```
     git init
     git add -A
     git commit -m "SquadSync"
     git branch -M main
     git remote add origin https://github.com/<you>/<repo>.git
     git push -u origin main
     ```
     Then on [vercel.com](https://vercel.com) → "Add New Project" → import that repo →
     framework preset "Vite" → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from your
     own `.env`, never committed) → Deploy.
3. **Double-check the env vars on Vercel** (Project → Settings → Environment Variables) point
   at the same Supabase project you just ran the SQL against — a mismatch here looks exactly
   like an RLS bug (silent empty data) but isn't one.


## Phase 12 update
- Fixed `bowling_style_type` enum crash on the opposing Playing XI (batters now store NULL; others 'pace').
- Opposing XI form: name field has a full-width row; Batter/Bowler/All-rounder toggle sits below it.
- Live scoring header was white-on-white (Card background override) — fixed, and now shows a live scorecard (batters, bowler figures, last wicket).
- Fielder credit: caught / stumped / run out now ask "by whom"; shown on scorecards ("c Rohan b Arjun") and counted on the Leaderboard.
- Leaderboard: Overall / Batting / Bowling / Fielding tabs.
- Batting Order and Bowling Planner first ask which XI / bowlers you are using.
- Analytics: KPI tiles, 8 charts, batting, bowling and match-by-match tables.
- Live polling on matches, players, playing XI and requests — no more switching accounts to "unstick" a match.
- Match-request bell + badge (desktop sidebar, mobile header, More drawer).
- Pinch-zoom disabled; mobile Matches cards wrap; installed app now skips login when a session exists and updates itself on each deploy.
- Scorecard names now come embedded with the scorecard (no more "Unknown" for the other team).
**Re-run `sql/phase4_migration.sql` in the Supabase SQL Editor** (adds `live_balls.fielder_id` and a players read policy).
