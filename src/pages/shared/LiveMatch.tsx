import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useMatches, usePlayers, useLiveInnings, useInningsBalls, useInningsOvers, useStartLiveInnings, useRecordDelivery, useSetLiveNewBatsman, useSetLiveNewBowler, useFinalizeLiveScorecard, useAbandonMatch, useSetToss, useDelegateScoring, usePlayingXI, usePlayingXISubmissions, useSubmitPlayingXI, useSubmitUntrackedOpponentXI } from '../../lib/queries';
import { EmptyState, Card, LiveDot, Badge, LoadingState, ErrorState, Button } from '../../components/primitives';
import { NumberTicker } from '../../components/NumberTicker';
import { formatOvers, runRate, requiredRunRate } from '../../algorithms/overs';
import { getFormat, rulesForOvers, type FormatId } from '../../algorithms/formats';
import { processDelivery, setNewBatsman, setNewBowler, type LiveInningsState } from '../../algorithms/liveInnings';
import type { Delivery, DismissalKind, ExtraType } from '../../algorithms/scoring';
import { suggestNextBowler } from '../../algorithms/bowlingPlanner';
import { SHOT_ZONES, shotToPoint, type ShotZone, type ShotEvent } from '../../algorithms/wagonWheel';
import { aggregateBatting, aggregateBowling, formatDismissal } from '../../algorithms/scorecardAggregation';
import type { Player } from '../../types/domain';

type XICategory = 'batter' | 'bowler' | 'all_rounder';
import type { LiveInningsRow, LiveBallRow, LiveOverRow, PlayingXIEntry } from '../../types/domain';

export function LiveMatchPage({ role }: { role: 'player' | 'coach' }) {
  const { team } = useAuth();
  const { matchId } = useParams();
  const { data: matches, isLoading, error } = useMatches(team?.id);

  if (!team) return <EmptyState title="No team yet" body="Live matches appear once your team exists." />;
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  // A specific match was requested (clicked from Matches) — always honor that exact match,
  // even if a *different* match is stuck "live". Without this, scoring always landed on
  // whichever match happened to be live already, regardless of which one was clicked.
  const requested = matchId ? matches!.find((m) => m.id === matchId) : undefined;
  const live = matches!.find((m) => m.status === 'live');
  const upcoming = matches!.filter((m) => m.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
  const target = requested ?? live ?? upcoming;

  if (!target) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">Live Match</h1>
        <EmptyState
          title="No match is live right now"
          body={role === 'coach' ? 'Schedule a match from Matches, then start live scoring here on match day.' : "Check back when your team's next match kicks off."}
        />
      </div>
    );
  }
  if (target.status === 'scheduled') {
    if (role !== 'coach') {
      return (
        <div>
          <h1 className="text-xl font-bold mb-6">Live Match</h1>
          <EmptyState title="No match is live right now" body={`Your next match is ${team.shortName} vs ${target.opponentName} on ${new Date(target.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`} />
        </div>
      );
    }
    return (
      <LiveMatchSetup
        matchId={target.id} teamId={team.id} opponentTeamId={target.opponentTeamId} opponent={target.opponentName}
        format={target.format} customOvers={target.customOvers} teamShort={team.shortName}
        tossWonByTeamId={target.tossWonByTeamId} tossDecision={target.tossDecision} scoringTeamId={target.scoringTeamId}
        opponentIsTracked={target.opponentIsTracked}
      />
    );
  }
  return (
    <LiveCommandCenter
      matchId={target.id} teamId={team.id} teamShort={team.shortName} opponent={target.opponentName}
      format={target.format} customOvers={target.customOvers} role={role}
      scoringTeamId={target.scoringTeamId} opponentTeamId={target.opponentTeamId} opponentIsTracked={target.opponentIsTracked}
    />
  );
}

/** A player is only selectable for live scoring (opening pair, new batsman, bowler) once
 *  they're part of that match's SUBMITTED playing XI for this team — not the whole roster.
 *  Falls back to the full roster if the XI hasn't loaded yet / wasn't submitted, so the UI
 *  never looks like an empty dead-end while data is in flight. */
function xiRoster(players: Player[], xi: PlayingXIEntry[] | undefined, teamId: string): Player[] {
  if (!xi) return players;
  const ids = new Set(xi.filter((e) => e.teamId === teamId).map((e) => e.playerId));
  if (ids.size === 0) return players;
  return players.filter((p) => ids.has(p.id));
}

// ============================================================================
// Pre-match setup: coach picks the opening pair and the first bowler.
// ============================================================================

/** For an untracked opponent (direct-scheduled, no SquadSync coach account on their side), the
 *  host types in the opposing Playing XI — name + category — right here, before anything else
 *  can proceed. This creates real player rows for them, so every picker from this point on
 *  (batter, bowler, new batsman, next bowler) works exactly like it does for a tracked team. */
function UntrackedOpponentXISetup({ matchId, opponentTeamId, opponentName }: { matchId: string; opponentTeamId: string; opponentName: string }) {
  const [rows, setRows] = useState<{ name: string; category: XICategory; isKeeper: boolean }[]>(
    Array.from({ length: 11 }, () => ({ name: '', category: 'batter' as XICategory, isKeeper: false })),
  );
  const submit = useSubmitUntrackedOpponentXI(matchId);
  const [err, setErr] = useState('');

  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const go = async () => {
    const filled = rows.filter((r) => r.name.trim());
    if (filled.length < 2) { setErr('Enter at least 2 players for the opposing XI.'); return; }
    if (filled.filter((r) => r.isKeeper).length > 1) { setErr('Only one player can be the wicketkeeper.'); return; }
    setErr('');
    try { await submit.mutateAsync({ opponentTeamId, entries: filled.map((r) => ({ name: r.name.trim(), category: r.category, isKeeper: r.isKeeper })) }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save their Playing XI."); }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-1">{opponentName}'s Playing XI</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-6">{opponentName} doesn't have a SquadSync account, so enter their lineup here — name and role for each player — so they can be selected for batting and bowling throughout live scoring.</p>
      <Card className="p-5">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--color-line)] p-2.5">
              {/* Name gets its own full-width row — typing room was the whole complaint, so
                  nothing shares this row with it. Category + WK move to a second row below. */}
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-xs text-[var(--color-ink-faint)] tabular">{i + 1}</span>
                <input className="input flex-1" placeholder={`Player ${i + 1} name`} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 mt-2 pl-7">
                <div className="flex rounded-[var(--radius-sm)] bg-black/[0.04] p-0.5 text-xs font-medium">
                  {(['batter', 'bowler', 'all_rounder'] as XICategory[]).map((cat) => (
                    <button key={cat} type="button" onClick={() => update(i, { category: cat })}
                      className={`px-2.5 py-1.5 rounded-[5px] transition-colors ${r.category === cat ? 'bg-[var(--color-pitch)] text-white' : 'text-[var(--color-ink-muted)]'}`}>
                      {cat === 'batter' ? 'Batter' : cat === 'bowler' ? 'Bowler' : 'All-rounder'}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-xs text-[var(--color-ink-muted)] whitespace-nowrap ml-auto">
                  <input type="checkbox" checked={r.isKeeper} onChange={(e) => update(i, { isKeeper: e.target.checked })} /> WK
                </label>
              </div>
            </div>
          ))}
        </div>
        {err && <p className="text-sm text-[var(--color-leather)] mt-3">{err}</p>}
        <Button className="w-full mt-4" onClick={go} disabled={submit.isPending}>{submit.isPending ? 'Saving…' : `Save ${opponentName}'s Playing XI`}</Button>
      </Card>
    </div>
  );
}

function LiveMatchSetup({ matchId, teamId, opponentTeamId, opponent, format, customOvers, teamShort, tossWonByTeamId, tossDecision, scoringTeamId, opponentIsTracked }: {
  matchId: string; teamId: string; opponentTeamId: string | null; opponent: string; format: FormatId; customOvers: number | null; teamShort: string;
  tossWonByTeamId: string | null; tossDecision: 'bat' | 'bowl' | null; scoringTeamId: string | null; opponentIsTracked: boolean;
}) {
  const { data: players, isLoading, error } = usePlayers(teamId);
  // The opponent always has a real roster by the time this flow needs it — a tracked opponent
  // has their own account's roster, and an untracked one gets one from UntrackedOpponentXISetup
  // just below. Fetch it unconditionally so both sides are always selectable together.
  const { data: opponentPlayers, isLoading: loadingOpp } = usePlayers(opponentTeamId ?? undefined);
  const { data: xi } = usePlayingXI(matchId);
  if (isLoading || loadingOpp) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  const list = players ?? [];
  const oppList = opponentPlayers ?? [];
  const ownCaptain = (xi ?? []).find((e) => e.teamId === teamId && e.isCaptain);
  const ownCaptainName = ownCaptain ? (list.find((p) => p.id === ownCaptain.playerId)?.name ?? null) : null;

  if (!opponentIsTracked && opponentTeamId && oppList.length === 0) {
    return <UntrackedOpponentXISetup matchId={matchId} opponentTeamId={opponentTeamId} opponentName={opponent} />;
  }

  // Both coaches pick and submit their own XI independently; only the team with scoring
  // authority (the host by default — see Match.scoringTeamId) records the toss and starts
  // the innings. The other coach waits here, watching, like a player would.
  return (
    <PlayingXIGate matchId={matchId} teamId={teamId} teamShort={teamShort} players={list}>
      {scoringTeamId !== null && scoringTeamId !== teamId ? (
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-1"><Badge>{format}</Badge>{format === 'CUSTOM' && customOvers && <Badge>{customOvers} ov</Badge>}</div>
          <h1 className="text-xl font-bold mb-6">{teamShort} vs {opponent}</h1>
          <EmptyState title="Your XI is in — waiting on the toss" body={`${opponent} has scoring access for this match and will record the toss and start play. You'll see it live here once they do.`} />
        </div>
      ) : tossWonByTeamId === null ? (
        <TossPicker
          matchId={matchId} teamId={teamId} opponentTeamId={opponentTeamId ?? teamId} teamShort={teamShort} opponent={opponent}
          format={format} customOvers={customOvers} ownCaptainName={ownCaptainName} opponentIsTracked={opponentIsTracked}
          opponentPlayers={oppList}
        />
      ) : (
        <StartInningsPicker
          matchId={matchId} teamId={teamId} opponentTeamId={opponentTeamId} opponent={opponent} teamShort={teamShort}
          ownPlayers={xiRoster(list, xi, teamId)}
          opponentPlayers={opponentTeamId ? xiRoster(oppList, xi, opponentTeamId) : []}
          tossWonByTeamId={tossWonByTeamId} tossDecision={tossDecision} opponentIsTracked={opponentIsTracked}
        />
      )}
    </PlayingXIGate>
  );
}

function TossPicker({ matchId, teamId, opponentTeamId, teamShort, opponent, format, customOvers, ownCaptainName, opponentIsTracked, opponentPlayers }: {
  matchId: string; teamId: string; opponentTeamId: string; teamShort: string; opponent: string; format: FormatId; customOvers: number | null;
  ownCaptainName: string | null; opponentIsTracked: boolean; opponentPlayers: Player[];
}) {
  const setToss = useSetToss(matchId);
  const [winner, setWinner] = useState(teamId);
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  const [opponentCaptainName, setOpponentCaptainName] = useState('');
  const [err, setErr] = useState('');

  const go = async () => {
    setErr('');
    try {
      await setToss.mutateAsync({
        tossWonByTeamId: winner, tossDecision: decision,
        // Only captured here for an untracked opponent — a real tracked opponent has their own
        // coach who submits their captain as part of their playing XI.
        opponentCaptainName: !opponentIsTracked ? (opponentCaptainName.trim() || null) : undefined,
      });
    }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not record the toss.'); }
  };

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-2 mb-1"><Badge>{format}</Badge>{format === 'CUSTOM' && customOvers && <Badge>{customOvers} ov</Badge>}</div>
      <h1 className="text-xl font-bold mb-6">{teamShort} vs {opponent} — the toss</h1>
      <Card className="p-5 space-y-4">
        <Field label="Who won the toss?">
          <div className="flex gap-2">
            <Button variant={winner === teamId ? 'primary' : 'secondary'} onClick={() => setWinner(teamId)} className="flex-1">{teamShort}</Button>
            <Button variant={winner === opponentTeamId ? 'primary' : 'secondary'} onClick={() => setWinner(opponentTeamId)} className="flex-1">{opponent}</Button>
          </div>
        </Field>
        <Field label="What did they choose?">
          <div className="flex gap-2">
            <Button variant={decision === 'bat' ? 'primary' : 'secondary'} onClick={() => setDecision('bat')} className="flex-1">Bat first</Button>
            <Button variant={decision === 'bowl' ? 'primary' : 'secondary'} onClick={() => setDecision('bowl')} className="flex-1">Bowl first</Button>
          </div>
        </Field>
        <Field label={`${teamShort}'s captain`}>
          <p className="text-sm py-2 px-3 rounded-[var(--radius-sm)] bg-black/[0.03]">{ownCaptainName ?? '— not set in your submitted XI —'}</p>
        </Field>
        {!opponentIsTracked && (
          <Field label={`${opponent}'s captain`}>
            <select className="input" value={opponentCaptainName} onChange={(e) => setOpponentCaptainName(e.target.value)}>
              <option value="">Choose their captain</option>
              {opponentPlayers.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">Picked from the Playing XI you entered for {opponent}.</p>
          </Field>
        )}
        {err && <p className="text-sm text-[var(--color-leather)]">{err}</p>}
        <Button className="w-full" onClick={go} disabled={setToss.isPending}>{setToss.isPending ? 'Recording…' : 'Record toss & continue'}</Button>
      </Card>
    </div>
  );
}

/** Opening pair + opening bowler. By the time this renders, BOTH sides always have a real
 *  Playing XI — a tracked opponent has their own account's roster, and an untracked one got
 *  one from UntrackedOpponentXISetup — so both pickers are always collected, from whichever
 *  side the toss actually put there. */
function StartInningsPicker({ matchId, teamId, opponentTeamId, opponent, teamShort, ownPlayers, opponentPlayers, tossWonByTeamId, tossDecision }: {
  matchId: string; teamId: string; opponentTeamId: string | null; opponent: string; teamShort: string;
  ownPlayers: Player[]; opponentPlayers: Player[];
  tossWonByTeamId: string; tossDecision: 'bat' | 'bowl' | null; opponentIsTracked: boolean;
}) {
  const startInningsMut = useStartLiveInnings(matchId);
  // Who bats first is a FACT determined by the toss, never an editable choice — a manual
  // toggle here is exactly what let the picker show the wrong side's batters/bowlers.
  const weAreBatting = tossWonByTeamId === teamId ? tossDecision === 'bat' : tossDecision === 'bowl';
  const [striker, setStriker] = useState('');
  const [nonStriker, setNonStriker] = useState('');
  const [bowler, setBowler] = useState('');
  const [err, setErr] = useState('');

  const opponentSideId = opponentTeamId ?? teamId;
  const battingRoster = weAreBatting ? ownPlayers : opponentPlayers;
  const bowlingRosterAll = weAreBatting ? opponentPlayers : ownPlayers;
  const bowlingRoster = bowlingRosterAll.filter((p) => p.bowlingStyle !== null).length > 0 ? bowlingRosterAll.filter((p) => p.bowlingStyle !== null) : bowlingRosterAll;

  const begin = async () => {
    if (!striker || !nonStriker || striker === nonStriker) { setErr('Pick two different opening batters.'); return; }
    if (!bowler) { setErr('Pick an opening bowler.'); return; }
    setErr('');
    try {
      await startInningsMut.mutateAsync({
        matchId, inningsNumber: 1,
        battingTeamId: weAreBatting ? teamId : opponentSideId, bowlingTeamId: weAreBatting ? opponentSideId : teamId,
        strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler, tracksBowler: true, target: null,
      });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the innings.'); }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-1">{teamShort} vs {opponent} — start live scoring</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-6">Toss: {tossWonByTeamId === teamId ? teamShort : opponent} won and chose to {tossDecision}.</p>
      <Card className="p-5 space-y-4">
        <Field label="Who's batting first?">
          <p className="text-sm font-semibold px-3 py-2.5 rounded-[var(--radius-sm)] bg-[var(--color-pitch-soft)] text-[var(--color-pitch-dark)]">
            {weAreBatting ? teamShort : opponent} bat first, {weAreBatting ? opponent : teamShort} bowl first — set by the toss above.
          </p>
        </Field>
        {battingRoster.length === 0 ? (
          <p className="text-sm text-[var(--color-leather)]">{weAreBatting ? teamShort : opponent} has no players in their Playing XI yet, so there's nobody to pick as an opening batter. {weAreBatting ? 'Add your squad from Players and submit your XI again.' : `Ask ${opponent}'s coach to add their squad and submit a Playing XI.`}</p>
        ) : (
          <>
            <Field label={`On strike (${weAreBatting ? teamShort : opponent})`}><PlayerSelect players={battingRoster} value={striker} onChange={setStriker} /></Field>
            <Field label="At the other end"><PlayerSelect players={battingRoster} value={nonStriker} onChange={setNonStriker} /></Field>
          </>
        )}
        {bowlingRoster.length === 0 ? (
          <p className="text-sm text-[var(--color-leather)]">{weAreBatting ? opponent : teamShort} has no players in their Playing XI yet, so there's nobody to pick as an opening bowler. {!weAreBatting ? 'Add your squad from Players and submit your XI again.' : `Ask ${opponent}'s coach to add their squad and submit a Playing XI.`}</p>
        ) : (
          <Field label={`Opening bowler (${weAreBatting ? opponent : teamShort})`}><PlayerSelect players={bowlingRoster} value={bowler} onChange={setBowler} placeholder="Choose a bowler" /></Field>
        )}
        {err && <p className="text-sm text-[var(--color-leather)]">{err}</p>}
        <Button className="w-full" onClick={begin} disabled={startInningsMut.isPending || !striker || !nonStriker || !bowler}>
          {startInningsMut.isPending ? 'Starting…' : 'Start scoring'}
        </Button>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Playing XI: each coach must submit their own XI before their side of the
// match can start scoring. Both XIs are visible to either team once submitted.
// ----------------------------------------------------------------------------

function PlayingXIGate({ matchId, teamId, teamShort, players, children }: { matchId: string; teamId: string; teamShort: string; players: Player[]; children: React.ReactNode }) {
  const { data: submissions, isLoading } = usePlayingXISubmissions(matchId);
  if (isLoading) return <LoadingState />;
  const submitted = (submissions ?? []).includes(teamId);
  if (!submitted) return <PlayingXIPicker matchId={matchId} teamId={teamId} teamShort={teamShort} players={players} />;
  return <>{children}</>;
}

function PlayingXIPicker({ matchId, teamId, teamShort, players }: { matchId: string; teamId: string; teamShort: string; players: Player[] }) {
  const submit = useSubmitPlayingXI(matchId);
  const required = Math.min(11, players.length);
  const [selected, setSelected] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState('');
  const [keeperId, setKeeperId] = useState('');
  const [err, setErr] = useState('');

  if (players.length === 0) {
    return (
      <div className="max-w-lg">
        <h1 className="text-xl font-bold mb-1">{teamShort}'s squad is empty</h1>
        <EmptyState title="Add your players first" body={`${teamShort} has no players on the roster, so there's nobody to put in a Playing XI. Go to Players and add at least 2 (ideally 11) before scoring this match.`} />
      </div>
    );
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= required ? s : [...s, id]));
  const chosen = players.filter((p) => selected.includes(p.id));

  const go = async () => {
    if (selected.length === 0 || selected.length !== required) { setErr(`Pick exactly ${required} player${required === 1 ? '' : 's'}.`); return; }
    setErr('');
    try {
      await submit.mutateAsync({ teamId, entries: selected.map((id, i) => ({ playerId: id, battingOrder: i + 1, isCaptain: id === captainId, isKeeper: id === keeperId })) });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit the playing XI.'); }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-1">Pick {teamShort}'s playing XI</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-6">Submit your {required} for this match — scoring can't start until both sides have.</p>
      <Card className="p-5">
        <div className="space-y-1 max-h-72 overflow-y-auto mb-4">
          {players.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-[var(--color-line)] last:border-0">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="flex-1">{p.name}</span>
              <span className="text-xs text-[var(--color-ink-faint)]">{p.playerRole.replace('_', '-')}</span>
            </label>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Captain"><PlayerSelect players={chosen} value={captainId} onChange={setCaptainId} /></Field>
          <Field label="Wicketkeeper"><PlayerSelect players={chosen} value={keeperId} onChange={setKeeperId} /></Field>
        </div>
        <p className="text-xs text-[var(--color-ink-faint)] mb-3">{selected.length}/{required} selected</p>
        {err && <p className="text-sm text-[var(--color-leather)] mb-3">{err}</p>}
        <Button className="w-full" onClick={go} disabled={submit.isPending}>{submit.isPending ? 'Submitting…' : 'Submit playing XI'}</Button>
      </Card>
    </div>
  );
}

function PlayerSelect({ players, value, onChange, placeholder }: { players: Player[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? 'Choose a player'}</option>
      {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">{label}</label><div className="mt-1.5">{children}</div></div>;
}

// ============================================================================
// Live command center: real ball-by-ball scoring.
// ============================================================================

function toLiveState(row: LiveInningsRow): LiveInningsState {
  return {
    runs: row.runs, wickets: row.wickets, legalBalls: row.legalBalls,
    extras: { wide: 0, no_ball: 0, bye: 0, leg_bye: 0, penalty: 0 }, // not persisted per-type; totals are derived from live_balls when needed
    freeHit: row.freeHit,
    strikerId: row.strikerId, nonStrikerId: row.nonStrikerId, bowlerId: row.currentBowlerId, lastOverBowlerId: row.lastOverBowlerId,
    legalBallsInOver: row.legalBallsInOver, overNumber: row.currentOverNumber,
    awaitingNewBatsman: row.awaitingNewBatsman, awaitingNewBowler: row.awaitingNewBowler, completed: row.completed,
    endReason: row.endReason as LiveInningsState['endReason'], dismissedPlayerId: null,
  };
}

function LiveCommandCenter({ matchId, teamId, teamShort, opponent, format, customOvers, role, scoringTeamId, opponentTeamId, opponentIsTracked }: {
  matchId: string; teamId: string; teamShort: string; opponent: string; format: FormatId; customOvers: number | null; role: 'player' | 'coach';
  scoringTeamId: string | null; opponentTeamId: string | null; opponentIsTracked: boolean;
}) {
  const rules = format === 'CUSTOM' ? rulesForOvers(customOvers ?? 20) : getFormat(format);
  const nav = useNavigate();
  const { data: players, isLoading: lp } = usePlayers(teamId);
  // Whoever holds scoring access must be able to pick players from BOTH sides for a tracked
  // opponent (real roster from a match request) — not just their own team. Fetch both rosters
  // unconditionally here so delegated scoring works the same as hosting it.
  const { data: opponentPlayers, isLoading: lop } = usePlayers(opponentTeamId ?? undefined);
  const { data: playingXI } = usePlayingXI(matchId);
  const { data: inningsRows, isLoading: li, error: ei } = useLiveInnings(matchId);
  const current = inningsRows?.find((r) => !r.completed) ?? inningsRows?.[inningsRows.length - 1];
  const { data: balls, isFetching: fetchingBalls } = useInningsBalls(current?.id);
  const { data: overs } = useInningsOvers(current?.id);
  const recordDelivery = useRecordDelivery(current?.id ?? '');
  const setBatsman = useSetLiveNewBatsman();
  const setBowlerMut = useSetLiveNewBowler();
  const finalize = useFinalizeLiveScorecard(teamId);
  const startSecondInnings = useStartLiveInnings(matchId);
  const abandon = useAbandonMatch(teamId);
  const delegate = useDelegateScoring();

  const [zone, setZone] = useState<ShotZone | null>(null);
  const [newBatsmanId, setNewBatsmanId] = useState('');
  const [newBowlerId, setNewBowlerId] = useState('');
  const [err, setErr] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [delegating, setDelegating] = useState(false);

  if (lp || li || lop) return <LoadingState />;
  if (ei) return <ErrorState message={ei.message} />;
  if (!current) return <LoadingState label="Setting up the innings…" />;

  // Scoring authority: the host has it by default (scoring_team_id), but can hand it to the
  // other coach. Whoever doesn't hold it watches live, exactly like a player would — no ball
  // entry, no next-batsman/bowler pickers, no finish/abandon. Whoever DOES hold it can pick
  // players from either side (see opponentPlayers above), not just their own team.
  const canScore = role === 'coach' && (scoringTeamId === null || scoringTeamId === teamId);
  const list = players ?? [];
  const oppList = opponentPlayers ?? [];
  const nameOf = (id: string | null) => {
    if (!id) return '—';
    return list.find((p) => p.id === id)?.name ?? oppList.find((p) => p.id === id)?.name ?? '—';
  };
  // A team's roster, restricted to this match's submitted playing XI — resolved for WHICHEVER
  // side battingTeamId/bowlingTeamId actually is, not just our own.
  const rosterFor = (tid: string) => xiRoster(tid === teamId ? list : oppList, playingXI, tid);

  const state = toLiveState(current);
  // Once out, out for the innings — a dismissed batter can't be sent back in. Only the
  // current striker/non-striker were being excluded before, which let an earlier wicket's
  // batter get picked straight back in as the "new" batsman.
  const dismissedPlayerIds = new Set((balls ?? []).filter((b) => b.isWicket && b.dismissedPlayerId).map((b) => b.dismissedPlayerId as string));
  const thisOverBalls = (balls ?? []).filter((b) => b.overNumber === current.currentOverNumber);
  const overBeingBowled = { runsSoFar: thisOverBalls.reduce((s, b) => s + b.runsOffBat + b.extraRuns, 0), wicketsSoFar: thisOverBalls.filter((b) => b.isWicket).length };
  // Both sides always have a real Playing XI by the time scoring starts — a tracked opponent
  // has their own account's roster, an untracked one got one from UntrackedOpponentXISetup —
  // so both batting and bowling are always fully tracked, whichever side is "us".
  const tracksBatsmanNow = true;
  const tracksBowlerNow = true;
  const battingRoster = rosterFor(current.battingTeamId);
  const bowlingRoster = rosterFor(current.bowlingTeamId);
  const battingSideLabel = current.battingTeamId === teamId ? teamShort : opponent;
  const bowlingSideLabel = current.bowlingTeamId === teamId ? teamShort : opponent;
  const lastWicketBall = [...(balls ?? [])].reverse().find((b) => b.isWicket);
  // The live scorecard for the batters/bowler currently out in the middle — folded from the
  // same ball-by-ball log the post-match scorecard is built from (algorithms/scorecardAggregation),
  // so "runs/balls" here always matches what the finished scorecard will show.
  const battingFigures = aggregateBatting(balls ?? [], battingRoster.map((p) => p.id), nameOf);
  const bowlingFigures = aggregateBowling(balls ?? []);
  const strikerFig = battingFigures.find((f) => f.playerId === current.strikerId);
  const nonStrikerFig = battingFigures.find((f) => f.playerId === current.nonStrikerId);
  const bowlerFig = bowlingFigures.find((f) => f.playerId === current.currentBowlerId);

  const rr = runRate(current.runs, current.legalBalls);
  const req = current.target !== null ? requiredRunRate(current.target, current.runs, rules.oversPerInnings! * rules.ballsPerOver - current.legalBalls) : null;

  const submit = async (delivery: Delivery, dismissedOverride?: string) => {
    setErr('');
    try {
      const result = processDelivery(state, delivery, rules, { overBeingBowled, target: current.target ?? undefined, tracksBatsman: tracksBatsmanNow, tracksBowler: tracksBowlerNow });
      await recordDelivery.mutateAsync({
        inningsId: current.id, ballInOver: thisOverBalls.length + 1, delivery, shotZone: zone,
        dismissedPlayerId: delivery.wicket ? (dismissedOverride ?? result.state.dismissedPlayerId) : null,
        fielderId: delivery.wicket ? (delivery.wicket.fielderId ?? null) : null,
        strikerId: state.strikerId, nonStrikerId: state.nonStrikerId, bowlerId: state.bowlerId,
        nextState: result.state, finalizedOver: result.finalizedOver, overNumberForBall: current.currentOverNumber,
      });
      setZone(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not record that ball.'); }
  };

  const confirmBatsman = async () => {
    if (!newBatsmanId) return;
    const next = setNewBatsman(state, newBatsmanId, true);
    await setBatsman.mutateAsync({ inningsId: current.id, strikerId: next.strikerId, nonStrikerId: next.nonStrikerId });
    setNewBatsmanId('');
  };
  const confirmBowler = async () => {
    if (!newBowlerId) return;
    setNewBowler(state, newBowlerId);
    await setBowlerMut.mutateAsync({ inningsId: current.id, bowlerId: newBowlerId });
    setNewBowlerId('');
  };

  const finishMatch = async () => {
    setFinishing(true);
    try {
      // Each innings' batting figures are aggregated against THAT innings' batting team's own
      // roster — not always "our" roster — so a tracked opponent's batting card is complete too.
      const squadFor = (tid: string) => (tid === teamId ? list : oppList).map((p) => p.id);
      const inningsArg = (inningsRows ?? []).map((r) => ({ inningsNumber: r.inningsNumber, battingTeamId: r.battingTeamId, bowlingTeamId: r.bowlingTeamId, squadOrder: squadFor(r.battingTeamId) }));
      const result = `${current.inningsNumber === 2 ? (current.runs >= (current.target ?? Infinity) ? (current.battingTeamId === teamId ? 'Won' : 'Lost') : current.battingTeamId === teamId ? 'Lost' : 'Won') : 'Match'} — recorded from live scoring`;
      await finalize.mutateAsync([matchId, inningsArg, result]);
    } finally { setFinishing(false); }
  };

  const abandonThis = async () => {
    if (!window.confirm(`Abandon this match? "${teamShort} vs ${opponent}" will go back to scheduled and stop blocking other matches from being scored. Nothing already recorded is deleted.`)) return;
    setAbandoning(true);
    try { await abandon.mutateAsync(matchId); nav(`/${role}/matches`); }
    finally { setAbandoning(false); }
  };

  const handOverScoring = async () => {
    if (!opponentTeamId) return;
    if (!window.confirm(`Hand scoring access to ${opponent}? You'll only be able to watch live until they hand it back.`)) return;
    setDelegating(true);
    try { await delegate.mutateAsync({ matchId, scoringTeamId: opponentTeamId }); }
    finally { setDelegating(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2"><LiveDot /><Badge>{format}</Badge></div>
          <h1 className="text-xl font-bold mt-1">{teamShort} vs {opponent}</h1>
        </div>
        <div className="flex gap-2">
          {canScore && current.completed && current.inningsNumber === 2 && (
            <Button onClick={finishMatch} disabled={finishing}>{finishing ? 'Finishing…' : 'Finish match'}</Button>
          )}
          {/* Delegating to an untracked opponent would hand scoring to a placeholder team
              nobody can log in as — leaving the match unscoreable. Only offer this for a real,
              tracked opponent with their own coach account. */}
          {canScore && opponentTeamId && opponentIsTracked && (
            <Button variant="secondary" onClick={handOverScoring} disabled={delegating}>{delegating ? 'Handing over…' : `Hand scoring to ${opponent}`}</Button>
          )}
          {canScore && (
            <Button variant="secondary" onClick={abandonThis} disabled={abandoning}>{abandoning ? 'Abandoning…' : 'Abandon match'}</Button>
          )}
        </div>
      </div>

      {!canScore && role === 'coach' && (
        <Card className="p-4 mb-4 bg-black/[0.03] border-0">
          <p className="text-sm font-semibold">{opponent} has scoring access — you're watching live.</p>
          <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">They'll hand it back to you if they want you to take over.</p>
        </Card>
      )}

      {current.completed && current.inningsNumber === 1 && canScore && (
        <SecondInningsSetup
          matchId={matchId} teamId={teamId} teamShort={teamShort} opponent={opponent}
          ownPlayers={rosterFor(teamId)} opponentPlayers={opponentTeamId ? rosterFor(opponentTeamId) : []}
          opponentIsTracked={opponentIsTracked} firstInnings={current} startMut={startSecondInnings}
        />
      )}

      {/* A plain div, not <Card> — Card hardcodes a white bg-[var(--color-surface)] class that
          was winning the CSS cascade over this card's own dark-green override (equal
          specificity, declared earlier in the compiled stylesheet), which left this entire
          block rendering white-background-with-white-text: a "blank" card. */}
      <div className="p-6 rounded-[var(--radius-md)] bg-[var(--color-pitch-dark)] text-white mb-4">
        <p className="text-sm text-white/70">Innings {current.inningsNumber} — {battingSideLabel}</p>
        <div className="flex items-end gap-3 mt-1">
          <NumberTicker value={current.runs} className="text-5xl font-bold" />
          <span className="text-3xl font-bold text-white/50">/</span>
          <NumberTicker value={current.wickets} className="text-3xl font-bold" />
          <span className="text-lg text-white/70 mb-1.5 ml-1">({formatOvers(current.legalBalls)} ov)</span>
        </div>
        <div className="flex gap-6 mt-4 text-sm text-white/80 flex-wrap">
          <span>RR <span className="tabular font-semibold text-white">{rr.toFixed(2)}</span></span>
          {req !== null && <span>Need <span className="tabular font-semibold text-white">{req.toFixed(2)}</span>/over</span>}
          {current.target !== null && <span>Target <span className="tabular font-semibold text-white">{current.target}</span></span>}
          {current.freeHit && <span className="text-[var(--color-gold)] font-semibold">FREE HIT</span>}
        </div>
        {current.completed && <p className="mt-3 text-sm font-semibold text-[var(--color-gold)]">Innings complete — {current.endReason?.replace('_', ' ')}</p>}

        {/* Live scorecard — the two batters out in the middle and the current bowler, folded
            live from the same ball-by-ball log the finished scorecard uses. */}
        <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="flex justify-between"><span className="font-medium">{nameOf(current.strikerId)} <span className="text-[var(--color-gold)]">*</span></span><span className="tabular text-white/80">{strikerFig ? `${strikerFig.runs} (${strikerFig.balls})` : '—'}</span></div>
          <div className="flex justify-between"><span className="font-medium">{nameOf(current.currentBowlerId)}</span><span className="tabular text-white/80">{bowlerFig ? `${formatOvers(bowlerFig.legalBalls)}-${bowlerFig.runs}-${bowlerFig.wickets}` : '—'}</span></div>
          <div className="flex justify-between"><span>{nameOf(current.nonStrikerId)}</span><span className="tabular text-white/80">{nonStrikerFig ? `${nonStrikerFig.runs} (${nonStrikerFig.balls})` : '—'}</span></div>
        </div>
        {lastWicketBall && (
          <p className="mt-2 text-xs text-white/70">
            Last wicket: {nameOf(lastWicketBall.dismissedPlayerId)} {formatDismissal({ dismissalKind: lastWicketBall.wicketKind, dismissedByBowlerId: lastWicketBall.bowlerId, fielderId: lastWicketBall.fielderId }, nameOf)}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-4">
        {tracksBatsmanNow && (
          <Card className="p-4">
            <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">Batting — {battingSideLabel}</p>
            <div className="flex justify-between text-sm py-1"><span>{nameOf(current.strikerId)} <span className="text-[var(--color-pitch)]">*</span></span></div>
            <div className="flex justify-between text-sm py-1"><span>{nameOf(current.nonStrikerId)}</span></div>
            {!tracksBowlerNow && <p className="text-[11px] text-[var(--color-ink-faint)] mt-2">{opponent}'s bowler isn't tracked.</p>}
          </Card>
        )}
        {tracksBowlerNow && (
          <Card className="p-4">
            <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">Bowling — {bowlingSideLabel}</p>
            <div className="flex justify-between text-sm py-1"><span>{nameOf(current.currentBowlerId)}</span><span className="tabular text-[var(--color-ink-muted)]">{formatOvers(current.legalBallsInOver + (current.currentOverNumber - 1) * rules.ballsPerOver)}</span></div>
            {!tracksBatsmanNow && <p className="text-[11px] text-[var(--color-ink-faint)] mt-2">{opponent}'s batters aren't tracked.</p>}
          </Card>
        )}
        <Card className="p-4">
          <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">This over</p>
          <div className="flex gap-1.5 mt-1 flex-wrap">{thisOverBalls.map((b, i) => <BallChip key={i} ball={b} />)}</div>
        </Card>
      </div>

      {canScore && !current.completed && (
        <>
          {tracksBatsmanNow && current.awaitingNewBatsman ? (
            <Card className="p-4 mb-4">
              <p className="text-sm font-semibold mb-1">
                {lastWicketBall ? `${nameOf(lastWicketBall.dismissedPlayerId)} is out — ${current.runs}/${current.wickets}.` : 'Wicket!'} Who's batting next?
              </p>
              <p className="text-xs text-[var(--color-ink-muted)] mb-2">Only players from {battingSideLabel}'s submitted XI who haven't batted yet are shown. No more balls can be recorded until the new batsman is confirmed.</p>
              {(() => {
                const available = battingRoster.filter((p) => p.id !== current.strikerId && p.id !== current.nonStrikerId && !dismissedPlayerIds.has(p.id));
                if (available.length === 0) return <p className="text-sm text-[var(--color-leather)]">Nobody left in {battingSideLabel}'s submitted XI who hasn't already batted — check their Playing XI has all 11 names.</p>;
                return (
                  <div className="flex gap-2">
                    <PlayerSelect players={available} value={newBatsmanId} onChange={setNewBatsmanId} />
                    <Button onClick={confirmBatsman} disabled={!newBatsmanId}>Confirm</Button>
                  </div>
                );
              })()}
            </Card>
          ) : tracksBowlerNow && current.awaitingNewBowler ? (
            <NextBowlerPanel players={bowlingRoster} overs={overs ?? []} lastOverBowlerId={current.lastOverBowlerId} maxOversPerBowler={rules.maxOversPerBowler} value={newBowlerId} onChange={setNewBowlerId} onConfirm={confirmBowler} pending={setBowlerMut.isPending} />
          ) : (
            <BallEntry onSubmit={submit} freeHit={current.freeHit} zone={zone} onZone={setZone} pending={recordDelivery.isPending || fetchingBalls} showWagonWheel={tracksBatsmanNow} fieldingRoster={bowlingRoster} />
          )}
          {err && <p className="text-sm text-[var(--color-leather)] mt-3">{err}</p>}
        </>
      )}

      <RecentOvers overs={overs ?? []} nameOf={nameOf} />
      {tracksBatsmanNow && <WagonWheelCard balls={balls ?? []} strikerId={current.strikerId} nameOf={nameOf} />}
      <PlayingXIPanel teamId={teamId} teamShort={teamShort} opponent={opponent} entries={playingXI ?? []} nameOf={nameOf} />
    </div>
  );
}

function PlayingXIPanel({ teamId, teamShort, opponent, entries, nameOf }: { teamId: string; teamShort: string; opponent: string; entries: PlayingXIEntry[]; nameOf: (id: string | null) => string }) {
  const own = entries.filter((e) => e.teamId === teamId).sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99));
  const theirs = entries.filter((e) => e.teamId !== teamId).sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99));
  if (own.length === 0 && theirs.length === 0) return null;
  return (
    <Card className="p-4 mt-4">
      {own.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">Playing XI — {teamShort}</p>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {own.map((e) => (
              <span key={e.id} className="text-xs rounded-full bg-black/[0.04] px-2.5 py-1">
                {nameOf(e.playerId)}{e.isCaptain && ' (c)'}{e.isKeeper && ' (wk)'}
              </span>
            ))}
          </div>
        </>
      )}
      {theirs.length > 0 ? (
        <>
          <p className="text-xs font-semibold text-[var(--color-ink-muted)] mt-3 mb-2">Playing XI — {opponent}</p>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {theirs.map((e) => (
              <span key={e.id} className="text-xs rounded-full bg-black/[0.04] px-2.5 py-1">
                {nameOf(e.playerId)}{e.isCaptain && ' (c)'}{e.isKeeper && ' (wk)'}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-2">{opponent}'s XI hasn't been submitted yet.</p>
      )}
    </Card>
  );
}

/** Second-innings opening pair/bowler — same logic as StartInningsPicker: both sides always
 *  have a real Playing XI by this point, so both pickers are always collected. */
function SecondInningsSetup({ matchId, teamId, teamShort, opponent, ownPlayers, opponentPlayers, firstInnings, startMut }: {
  matchId: string; teamId: string; teamShort: string; opponent: string; ownPlayers: Player[]; opponentPlayers: Player[]; opponentIsTracked: boolean;
  firstInnings: LiveInningsRow; startMut: ReturnType<typeof useStartLiveInnings>;
}) {
  const weAreBattingSecond = firstInnings.bowlingTeamId === teamId;
  const [striker, setStriker] = useState('');
  const [nonStriker, setNonStriker] = useState('');
  const [bowler, setBowler] = useState('');
  const [err, setErr] = useState('');
  const target = firstInnings.runs + 1;

  const battingRoster = weAreBattingSecond ? ownPlayers : opponentPlayers;
  const bowlingRosterAll = weAreBattingSecond ? opponentPlayers : ownPlayers;
  const bowlingRoster = bowlingRosterAll.filter((p) => p.bowlingStyle !== null).length > 0 ? bowlingRosterAll.filter((p) => p.bowlingStyle !== null) : bowlingRosterAll;

  const begin = async () => {
    if (!striker || !nonStriker || striker === nonStriker) { setErr('Pick two different opening batters.'); return; }
    if (!bowler) { setErr('Pick an opening bowler.'); return; }
    setErr('');
    try {
      await startMut.mutateAsync({
        matchId, inningsNumber: 2, battingTeamId: firstInnings.bowlingTeamId, bowlingTeamId: firstInnings.battingTeamId,
        strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler, tracksBowler: true, target,
      });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the second innings.'); }
  };

  return (
    <Card className="p-5 mb-4">
      <p className="text-sm font-semibold mb-1">First innings complete — {firstInnings.runs}/{firstInnings.wickets}</p>
      <p className="text-xs text-[var(--color-ink-muted)] mb-4">Target for the chase: <span className="font-semibold text-[var(--color-ink)]">{target}</span></p>
      <div className="space-y-3">
        {battingRoster.length === 0 ? (
          <p className="text-sm text-[var(--color-leather)]">{weAreBattingSecond ? teamShort : opponent} has no players in their Playing XI yet, so there's nobody to pick as an opening batter.</p>
        ) : (
          <>
            <Field label={`On strike (${weAreBattingSecond ? teamShort : opponent})`}><PlayerSelect players={battingRoster} value={striker} onChange={setStriker} /></Field>
            <Field label="At the other end"><PlayerSelect players={battingRoster} value={nonStriker} onChange={setNonStriker} /></Field>
          </>
        )}
        {bowlingRoster.length === 0 ? (
          <p className="text-sm text-[var(--color-leather)]">{weAreBattingSecond ? opponent : teamShort} has no players in their Playing XI yet, so there's nobody to pick as an opening bowler.</p>
        ) : (
          <Field label={`Opening bowler (${weAreBattingSecond ? opponent : teamShort})`}><PlayerSelect players={bowlingRoster} value={bowler} onChange={setBowler} placeholder="Choose a bowler" /></Field>
        )}
        {err && <p className="text-sm text-[var(--color-leather)]">{err}</p>}
        <Button onClick={begin} disabled={startMut.isPending}>{startMut.isPending ? 'Starting…' : 'Start second innings'}</Button>
      </div>
    </Card>
  );
}

function BallChip({ ball }: { ball: LiveBallRow }) {
  const label = ball.isWicket ? 'W' : ball.extraType === 'wide' ? 'Wd' : ball.extraType === 'no_ball' ? 'Nb' : ball.extraType === 'bye' ? `${ball.extraRuns}b` : ball.extraType === 'leg_bye' ? `${ball.extraRuns}lb` : String(ball.runsOffBat);
  const boundary = ball.runsOffBat === 4 || ball.runsOffBat === 6;
  return (
    <span className={`h-7 min-w-7 px-1 rounded-full flex items-center justify-center text-xs font-bold ${ball.isWicket ? 'bg-[var(--color-leather-soft)] text-[var(--color-leather)]' : boundary ? 'bg-[var(--color-pitch-soft)] text-[var(--color-pitch-dark)]' : 'bg-black/5 text-[var(--color-ink-muted)]'}`}>{label}</span>
  );
}

// ----------------------------------------------------------------------------
// Ball entry controls: runs, extras, wicket — with the wagon-wheel zone picker.
// ----------------------------------------------------------------------------

const DISMISSAL_KINDS: { kind: DismissalKind; label: string }[] = [
  { kind: 'bowled', label: 'Bowled' }, { kind: 'caught', label: 'Caught' }, { kind: 'lbw', label: 'LBW' },
  { kind: 'run_out', label: 'Run out' }, { kind: 'stumped', label: 'Stumped' }, { kind: 'hit_wicket', label: 'Hit wicket' },
  { kind: 'obstructing', label: 'Obstructing the field' }, { kind: 'handled_ball', label: 'Handled the ball' },
];

const FIELDER_CREDIT_KINDS: DismissalKind[] = ['caught', 'run_out', 'stumped'];

function BallEntry({ onSubmit, freeHit, zone, onZone, pending, showWagonWheel, fieldingRoster }: { onSubmit: (d: Delivery, dismissed?: string) => void; freeHit: boolean; zone: ShotZone | null; onZone: (z: ShotZone | null) => void; pending: boolean; showWagonWheel: boolean; fieldingRoster: Player[] }) {
  const [showExtras, setShowExtras] = useState(false);
  const [showWicket, setShowWicket] = useState(false);
  const [extraKind, setExtraKind] = useState<Exclude<ExtraType, 'penalty'>>('bye');
  const [extraRuns, setExtraRuns] = useState(1);
  // Caught / run out / stumped need a fielder picked before the wicket is confirmed — every
  // other dismissal kind (bowled, lbw, hit wicket, …) has no fielder credit and fires straight
  // away like before.
  const [pendingKind, setPendingKind] = useState<DismissalKind | null>(null);
  const [fielderId, setFielderId] = useState('');

  const hitRuns = (runs: number) => onSubmit({ runsOffBat: runs });
  const hitWide = () => onSubmit({ runsOffBat: 0, extra: { type: 'wide', runs: 1 } });
  const hitNoBall = () => onSubmit({ runsOffBat: 0, extra: { type: 'no_ball', runs: 1 } });
  const hitExtra = () => { onSubmit({ runsOffBat: 0, extra: { type: extraKind, runs: extraRuns } }); setShowExtras(false); };
  const hitWicket = (kind: DismissalKind) => {
    if (FIELDER_CREDIT_KINDS.includes(kind) && fieldingRoster.length > 0) { setPendingKind(kind); return; }
    onSubmit({ runsOffBat: 0, wicket: { kind } });
    setShowWicket(false);
  };
  const confirmFielderWicket = () => {
    if (!pendingKind) return;
    onSubmit({ runsOffBat: 0, wicket: { kind: pendingKind, fielderId: fielderId || null } });
    setShowWicket(false); setPendingKind(null); setFielderId('');
  };

  return (
    <Card className="p-4">
      {showWagonWheel && (
        <>
          <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">Where did it go? <span className="text-[var(--color-ink-faint)]">(optional, for the wagon wheel)</span></p>
          <div className="grid grid-cols-4 gap-1.5 mb-4 max-w-xs">
            {SHOT_ZONES.map((z) => (
              <button key={z.id} onClick={() => onZone(zone === z.id ? null : z.id)} className={`text-[11px] rounded-[var(--radius-sm)] px-1.5 py-1.5 font-medium transition-colors ${zone === z.id ? 'bg-[var(--color-pitch)] text-white' : 'bg-black/[0.04] text-[var(--color-ink-muted)] hover:bg-black/[0.07]'}`}>{z.label}</button>
            ))}
          </div>
        </>
      )}

      {freeHit && <p className="text-xs font-semibold text-[var(--color-gold)] mb-2">Free hit — only a run out or obstruction/handling can dismiss the batter.</p>}

      <div className="flex flex-wrap gap-2 mb-3">
        {[0, 1, 2, 3, 4, 6].map((r) => (
          <button key={r} disabled={pending} onClick={() => hitRuns(r)} className="h-11 w-11 rounded-full bg-[var(--color-pitch-soft)] hover:bg-[var(--color-pitch)] hover:text-white text-[var(--color-pitch-dark)] text-base font-bold transition-colors">{r}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={hitWide}>Wide</Button>
        <Button variant="secondary" disabled={pending} onClick={hitNoBall}>No ball</Button>
        <Button variant="secondary" disabled={pending} onClick={() => setShowExtras((s) => !s)}>Bye / leg bye</Button>
        <Button variant="danger" disabled={pending} onClick={() => setShowWicket((s) => !s)}>Wicket</Button>
      </div>

      {showExtras && (
        <div className="flex items-center gap-2 mt-3 p-3 rounded-[var(--radius-sm)] bg-black/[0.03]">
          <select className="input w-auto" value={extraKind} onChange={(e) => setExtraKind(e.target.value as 'bye' | 'leg_bye')}>
            <option value="bye">Bye</option><option value="leg_bye">Leg bye</option>
          </select>
          <select className="input w-auto" value={extraRuns} onChange={(e) => setExtraRuns(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} run{n > 1 ? 's' : ''}</option>)}
          </select>
          <Button onClick={hitExtra}>Add</Button>
        </div>
      )}

      {showWicket && !pendingKind && (
        <div className="flex flex-wrap gap-2 mt-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-leather-soft)]">
          {DISMISSAL_KINDS.map((d) => <Button key={d.kind} variant="secondary" onClick={() => hitWicket(d.kind)}>{d.label}</Button>)}
        </div>
      )}
      {showWicket && pendingKind && (
        <div className="mt-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-leather-soft)]">
          <p className="text-sm font-semibold mb-2">
            {pendingKind === 'caught' ? 'Caught by' : pendingKind === 'stumped' ? 'Stumped by' : 'Run out by'} — who gets fielding credit?
          </p>
          <div className="flex gap-2">
            <select className="input" value={fielderId} onChange={(e) => setFielderId(e.target.value)}>
              <option value="">Not sure / skip</option>
              {fieldingRoster.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button onClick={confirmFielderWicket}>Confirm</Button>
            <Button variant="ghost" onClick={() => { setPendingKind(null); setFielderId(''); }}>Back</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Next-bowler suggestion: the 3-tier CSP relaxation, surfaced live.
// ----------------------------------------------------------------------------

function NextBowlerPanel({ players, overs, lastOverBowlerId, maxOversPerBowler, value, onChange, onConfirm, pending }: {
  players: Player[]; overs: LiveOverRow[]; lastOverBowlerId: string | null; maxOversPerBowler: number | null;
  value: string; onChange: (v: string) => void; onConfirm: () => void; pending: boolean;
}) {
  const bowlers = useMemo(() => {
    const oversByBowler = new Map<string, number>();
    for (const o of overs) oversByBowler.set(o.bowlerId, (oversByBowler.get(o.bowlerId) ?? 0) + 1);
    return players.map((p) => ({
      id: p.id, name: p.name, bowlingStyle: p.bowlingStyle, skill: 60, oversBowledThisInnings: oversByBowler.get(p.id) ?? 0,
    }));
  }, [players, overs]);
  const suggestions = suggestNextBowler(bowlers, maxOversPerBowler, lastOverBowlerId);

  return (
    <Card className="p-4 mb-4">
      <p className="text-sm font-semibold mb-1">Over complete — who bowls next?</p>
      <p className="text-xs text-[var(--color-ink-muted)] mb-3">Ranked by who's available to bowl right now. No more balls can be recorded until a bowler is confirmed.</p>
      <div className="space-y-1.5 mb-3 max-h-56 overflow-y-auto">
        {suggestions.map((s) => (
          <button key={s.bowlerId} disabled={!s.eligible} onClick={() => onChange(s.bowlerId)}
            className={`w-full flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-sm text-left transition-colors ${value === s.bowlerId ? 'bg-[var(--color-pitch)] text-white' : s.eligible ? 'bg-black/[0.03] hover:bg-black/[0.06]' : 'opacity-40'}`}>
            <span className="font-medium">{s.name}{s.tier !== 'normal' && s.eligible && <Badge tone="gold">{s.tier}</Badge>}</span>
            <span className={`text-xs ${value === s.bowlerId ? 'text-white/80' : 'text-[var(--color-ink-muted)]'}`}>{s.reason}</span>
          </button>
        ))}
      </div>
      <Button onClick={onConfirm} disabled={!value || pending}>{pending ? 'Confirming…' : 'Confirm bowler'}</Button>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Recent overs timeline + wagon wheel.
// ----------------------------------------------------------------------------

function RecentOvers({ overs, nameOf }: { overs: LiveOverRow[]; nameOf: (id: string | null) => string }) {
  if (overs.length === 0) return null;
  const recent = [...overs].sort((a, b) => b.overNumber - a.overNumber).slice(0, 6);
  return (
    <Card className="p-4 mb-4">
      <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">Recent overs</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {recent.map((o) => (
          <div key={o.id} className="shrink-0 rounded-[var(--radius-sm)] bg-black/[0.03] px-3 py-2 min-w-[92px]">
            <p className="text-[11px] text-[var(--color-ink-muted)]">Over {o.overNumber}</p>
            <p className="text-sm font-semibold tabular">{o.runsConceded}{o.wicketsTaken > 0 && <span className="text-[var(--color-leather)]"> ({o.wicketsTaken}w)</span>}</p>
            <p className="text-[11px] text-[var(--color-ink-muted)] truncate">{nameOf(o.bowlerId)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WagonWheelCard({ balls, strikerId, nameOf }: { balls: LiveBallRow[]; strikerId: string | null; nameOf: (id: string | null) => string }) {
  const shots: ShotEvent[] = balls.filter((b) => b.shotZone && b.runsOffBat > 0).map((b) => ({ zone: b.shotZone as ShotZone, runs: b.runsOffBat, isBoundary: b.runsOffBat === 4 || b.runsOffBat === 6 }));
  if (shots.length === 0) return null;
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-3">Wagon wheel — {strikerId ? nameOf(strikerId) : 'this innings'}</p>
      <svg viewBox="-110 -110 220 220" className="w-full max-w-[280px] mx-auto">
        <circle cx={0} cy={0} r={100} fill="var(--color-pitch-soft)" opacity={0.4} />
        <circle cx={0} cy={0} r={100} fill="none" stroke="var(--color-line-strong)" />
        <circle cx={0} cy={0} r={4} fill="var(--color-ink-muted)" />
        {shots.map((s, i) => {
          const p = shotToPoint(s, 95);
          return <line key={i} x1={0} y1={0} x2={p.x} y2={p.y} stroke={s.isBoundary ? 'var(--color-leather)' : 'var(--color-pitch-dark)'} strokeWidth={s.isBoundary ? 2 : 1} opacity={0.75} />;
        })}
        {shots.map((s, i) => {
          const p = shotToPoint(s, 95);
          return <circle key={i} cx={p.x} cy={p.y} r={s.isBoundary ? 4 : 2.5} fill={s.isBoundary ? 'var(--color-leather)' : 'var(--color-pitch-dark)'} />;
        })}
      </svg>
    </Card>
  );
}
