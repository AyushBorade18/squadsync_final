import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../lib/auth';
import { usePlayers, useMatches, useAddMatch, useScorecard, useDeleteMatch } from '../../lib/queries';
import { ensureOpponent } from '../../lib/repo';
import { Button, Card, Badge, EmptyState, SectionLabel, LoadingState, ErrorState, Modal } from '../../components/primitives';
import { formatOvers } from '../../algorithms/overs';
import { getFormat, maxOversPerBowlerFor, type FormatId } from '../../algorithms/formats';
import { Plus, Radio, Trash2 } from 'lucide-react';

const FORMATS: FormatId[] = ['T10', 'T20', 'ODI', 'TEST', 'CUSTOM'];

export function MatchesPage({ role }: { role: 'player' | 'coach' }) {
  const { team } = useAuth();
  const nav = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const { data: matches, isLoading, error } = useMatches(team?.id);
  const deleteMatch = useDeleteMatch();

  if (!team) return <EmptyState title="No team yet" body="Create your team first from Settings." />;
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  const earliestUpcoming = matches!.filter((m) => m.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];

  const removeMatch = async (id: string, label: string) => {
    if (!window.confirm(`Delete "${label}"? All its scoring data is deleted too — this can't be undone.`)) return;
    await deleteMatch.mutateAsync(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Matches</h1>
          <p className="text-sm text-[var(--color-ink-muted)] mt-0.5">{team.name}</p>
        </div>
        {role === 'coach' && <Button onClick={() => setShowNew(true)}><Plus size={16} /> New match</Button>}
      </div>

      {matches!.length === 0 ? (
        <EmptyState title="No matches yet" body={role === 'coach' ? 'Schedule your first match to start tracking results.' : 'Your coach hasn\'t added any matches yet.'}
          action={role === 'coach' ? <Button onClick={() => setShowNew(true)}><Plus size={16} /> Schedule a match</Button> : undefined} />
      ) : (
        <div className="space-y-2.5">
          {matches!.map((m) => (
            <Card key={m.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{team.shortName} vs {m.opponentName}</span>
                  <Badge tone={m.status === 'live' ? 'leather' : m.status === 'completed' ? 'pitch' : 'neutral'}>{m.status}</Badge>
                  <Badge>{m.format}</Badge>
                  {m.format === 'CUSTOM' && m.customOvers && <Badge>{m.customOvers} ov</Badge>}
                </div>
                <p className="text-sm text-[var(--color-ink-muted)] mt-1">{m.venue} · {new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                {m.tossWonByTeamId && (
                  <p className="text-xs text-[var(--color-ink-faint)] mt-1">Toss: {m.tossWonByTeamId === team.id ? team.shortName : m.opponentName} won, chose to {m.tossDecision}</p>
                )}
                {m.opponentCaptainName && (
                  <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">{m.opponentName}'s captain: {m.opponentCaptainName}</p>
                )}
                {m.opponentBowlerName && (
                  <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">{m.opponentName}'s opening bowler: {m.opponentBowlerName} ({m.opponentBowlerType})</p>
                )}
                {(m.status === 'live' || m.status === 'scheduled') && (
                  <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">Scoring: {m.scoringTeamId === team.id ? `${team.shortName} (you)` : m.opponentName}</p>
                )}
                {m.status === 'scheduled' && (
                  <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">Playing XI: {m.tossWonByTeamId ? 'submitted, toss done' : 'pending submission / toss'}</p>
                )}
                {m.result && <p className="text-sm text-[var(--color-pitch-dark)] mt-1 font-medium">{m.result}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {m.status === 'completed' && <Button variant="secondary" onClick={() => setViewing(m.id)}>Scorecard</Button>}
                {role === 'coach' && (m.status === 'live' || m.id === earliestUpcoming?.id) && (
                  <Button variant={m.status === 'live' ? 'danger' : 'secondary'} onClick={() => nav(`/${role}/live/${m.id}`)}><Radio size={14} /> {m.status === 'live' ? 'Continue scoring' : 'Start live scoring'}</Button>
                )}
                {role === 'coach' && (
                  <Button variant="ghost" onClick={() => removeMatch(m.id, `${team.shortName} vs ${m.opponentName}`)} disabled={deleteMatch.isPending} aria-label="Delete match">
                    <Trash2 size={14} className="text-[var(--color-leather)]" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewMatchModal teamId={team.id} onClose={() => setShowNew(false)} />}
      {viewing && (
        <ScorecardViewer
          matchId={viewing} teamId={team.id}
          opponentTeamId={matches!.find((m) => m.id === viewing)?.opponentTeamId ?? null}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function NewMatchModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const addMatch = useAddMatch(teamId);
  const [opponent, setOpponent] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [format, setFormat] = useState<FormatId>('T20');
  const [customOvers, setCustomOvers] = useState(15);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!opponent.trim() || !venue.trim() || !date) return;
    if (format === 'CUSTOM' && (!Number.isInteger(customOvers) || customOvers < 1)) { setError('Enter a whole number of overs (at least 1).'); return; }
    setError('');
    try {
      const opp = await ensureOpponent(opponent.trim());
      await addMatch.mutateAsync({ teamId, opponentTeamId: opp.id, opponentName: opponent.trim(), venue: venue.trim(), date, format, tournamentId: null, customOvers: format === 'CUSTOM' ? customOvers : null });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not schedule match.'); }
  };

  return (
    <Modal title="Schedule a match" onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Opponent"><input value={opponent} onChange={(e) => setOpponent(e.target.value)} className="input" placeholder="Riverside CC" /></Field>
        <Field label="Venue"><input value={venue} onChange={(e) => setVenue(e.target.value)} className="input" placeholder="College Ground" /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value as FormatId)} className="input">
            {FORMATS.map((f) => <option key={f} value={f}>{f === 'CUSTOM' ? 'Custom' : getFormat(f as Exclude<FormatId, 'CUSTOM'>).name}</option>)}
          </select>
        </Field>
        {format === 'CUSTOM' && (
          <Field label="Overs per innings">
            <input type="number" min={1} className="input" value={customOvers} onChange={(e) => setCustomOvers(Math.max(1, Math.round(Number(e.target.value))))} />
            <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">
              Max overs per bowler is worked out automatically — {maxOversPerBowlerFor(customOvers)} over{maxOversPerBowlerFor(customOvers) > 1 ? 's' : ''} for a {customOvers}-over match (the same 1-in-5 rule as T10/T20/ODI: 2, 4 and 10 respectively).
            </p>
          </Field>
        )}
        {error && <p className="text-sm text-[var(--color-leather)]">{error}</p>}
        <Button className="w-full mt-2" onClick={submit} disabled={addMatch.isPending}>{addMatch.isPending ? 'Scheduling…' : 'Schedule match'}</Button>
      </div>
    </Modal>
  );
}


function ScorecardViewer({ matchId, teamId, opponentTeamId, onClose }: { matchId: string; teamId: string; opponentTeamId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useScorecard(matchId);
  // A completed match's scorecard has players from BOTH sides — fetch both rosters (not just
  // ours) so the opposing team's names resolve too instead of falling back to "Unknown".
  const { data: players } = usePlayers(teamId);
  const { data: opponentPlayers } = usePlayers(opponentTeamId ?? undefined);
  const nameOf = (id: string) => players?.find((p) => p.id === id)?.name ?? opponentPlayers?.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <Modal title="Scorecard" onClose={onClose} wide>
      {isLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
        <>
          {([1, 2] as const).map((inn) => {
            const bat = data!.batting.filter((b) => b.innings === inn);
            const bowl = data!.bowling.filter((b) => b.innings === inn);
            if (bat.length === 0 && bowl.length === 0) return null;
            const totalRuns = bat.reduce((s, b) => s + b.runs, 0);
            const totalWickets = bat.filter((b) => b.status === 'out').length;
            const totalLegalBalls = bowl.reduce((s, b) => s + b.legalBalls, 0);
            const chartData = bat.filter((b) => b.status !== 'did_not_bat').map((b) => ({ name: nameOf(b.playerId).split(' ')[0], runs: b.runs }));
            return (
              <div key={inn} className="mb-8 last:mb-0">
                <div className="flex items-baseline gap-2 mb-3">
                  <h3 className="font-semibold text-sm">Innings {inn}</h3>
                  <span className="tabular text-sm text-[var(--color-ink-muted)]">{totalRuns}/{totalWickets} ({formatOvers(totalLegalBalls)} ov)</span>
                </div>
                <SectionLabel>Batting</SectionLabel>
                <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[360px]">
                  <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
                  <tbody>{bat.map((b) => (
                    <tr key={b.id} className="border-t border-[var(--color-line)]"><td className="py-1.5 font-medium whitespace-nowrap">{nameOf(b.playerId)} {b.status === 'not_out' && <span className="text-[var(--color-ink-faint)]">*</span>}</td><td className="tabular">{b.runs}</td><td className="tabular">{b.balls}</td><td className="tabular">{b.fours}</td><td className="tabular">{b.sixes}</td><td className="tabular">{b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : '—'}</td></tr>
                  ))}</tbody>
                </table>
                </div>
                {chartData.length > 0 && (
                  <div className="mb-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData}>
                        <CartesianGrid stroke="var(--color-line)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-ink-faint)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--color-ink-faint)" width={28} />
                        <Tooltip />
                        <Bar dataKey="runs" fill="#1f5c40" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {bowl.length > 0 && (
                  <>
                    <SectionLabel>Bowling</SectionLabel>
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[360px]">
                      <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
                      <tbody>{bowl.map((b) => (
                        <tr key={b.id} className="border-t border-[var(--color-line)]"><td className="py-1.5 font-medium whitespace-nowrap">{nameOf(b.playerId)}</td><td className="tabular">{formatOvers(b.legalBalls)}</td><td className="tabular">{b.maidens}</td><td className="tabular">{b.runs}</td><td className="tabular">{b.wickets}</td><td className="tabular">{b.legalBalls ? (b.runs / (b.legalBalls / 6)).toFixed(2) : '—'}</td></tr>
                      ))}</tbody>
                    </table>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {data!.batting.length === 0 && data!.bowling.length === 0 && <p className="text-sm text-[var(--color-ink-muted)]">No scorecard was recorded for this match.</p>}
        </>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">{label}</label><div className="mt-1">{children}</div></div>;
}
