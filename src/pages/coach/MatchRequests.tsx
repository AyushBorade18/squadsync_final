import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useDiscoverableTeams, useMatchRequests, useSendMatchRequest, useRespondToMatchRequest, useDeleteMatchRequest } from '../../lib/queries';
import { Card, Button, Badge, EmptyState, SectionLabel, LoadingState, ErrorState, Modal } from '../../components/primitives';
import { getFormat, maxOversPerBowlerFor, type FormatId } from '../../algorithms/formats';
import type { MatchRequest } from '../../types/domain';
import { Plus, Trash2 } from 'lucide-react';

const FORMATS: FormatId[] = ['T10', 'T20', 'ODI', 'TEST', 'CUSTOM'];

/** Coach-to-coach challenge -> accept -> a real tracked match for both sides, replacing an
 *  "opponent" that's otherwise always an untracked name you typed in. Both coaches see the
 *  same match row once accepted (and both can get to it from Matches), but only accepting
 *  here — not just seeing it appear — moves straight into live-match setup. */
export function MatchRequestsPage() {
  const { team } = useAuth();
  const nav = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const { data: requests, isLoading, error } = useMatchRequests(team?.id);
  const respond = useRespondToMatchRequest(team?.id ?? '');
  const del = useDeleteMatchRequest(team?.id ?? '');
  const [err, setErr] = useState('');

  if (!team) return null;
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  const accept = async (r: MatchRequest) => {
    setErr('');
    try {
      const match = await respond.mutateAsync({ action: 'accept', request: r });
      // The accepting coach is the one who just clicked — take them straight into the
      // pre-match setup (toss, playing XI, etc.) instead of back to a request list. The
      // challenger sees the match appear on their own Matches page once they reload it —
      // there's no way to move someone else's browser for them.
      if (match) nav(`/coach/live/${match.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not accept the request.'); }
  };

  const incoming = requests!.filter((r) => r.toTeamId === team.id && r.status === 'pending');
  const history = requests!.filter((r) => r.status !== 'pending' || r.fromTeamId === team.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold">Match Requests</h1><p className="text-sm text-[var(--color-ink-muted)] mt-0.5">Challenge another coach's team — accepting creates a real match for both sides</p></div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} /> Challenge a team</Button>
      </div>

      {incoming.length > 0 && (
        <Card className="p-5 mb-4">
          <SectionLabel>Waiting on your response</SectionLabel>
          {err && <p className="text-sm text-[var(--color-leather)] mb-2">{err}</p>}
          <div className="space-y-2.5">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-line)] last:border-0">
                <div>
                  <p className="text-sm font-semibold">{r.fromTeamName} <Badge>{r.format}</Badge>{r.format === 'CUSTOM' && r.customOvers && <Badge>{r.customOvers} ov</Badge>}</p>
                  <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">{r.proposedVenue} · {new Date(r.proposedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{r.message && ` · "${r.message}"`}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button onClick={() => accept(r)} disabled={respond.isPending}>Accept</Button>
                  <Button variant="secondary" onClick={() => respond.mutate({ action: 'decline', request: r })} disabled={respond.isPending}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionLabel>History</SectionLabel>
        {history.length === 0 ? <EmptyState title="No requests yet" body="Send a challenge to another coach's team to get your first tracked match against them." /> : (
          <div className="space-y-2">
            {history.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm py-1.5">
                <span>{r.fromTeamId === team.id ? `You → ${r.toTeamName}` : `${r.fromTeamName} → you`} <span className="text-[var(--color-ink-muted)]">· {r.format}{r.format === 'CUSTOM' && r.customOvers ? ` (${r.customOvers} ov)` : ''} · {new Date(r.proposedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></span>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'accepted' ? 'pitch' : r.status === 'pending' ? 'gold' : 'neutral'}>{r.status}</Badge>
                  {r.status === 'pending' && r.fromTeamId === team.id && <Button variant="ghost" onClick={() => respond.mutate({ action: 'cancel', request: r })}>Cancel</Button>}
                  <button
                    aria-label="Delete request" title="Delete request" disabled={del.isPending}
                    onClick={() => { if (window.confirm('Delete this match request? This cannot be undone.')) del.mutate(r.id); }}
                    className="p-1.5 rounded hover:bg-black/5 text-[var(--color-ink-faint)] hover:text-[var(--color-leather)] disabled:opacity-40"
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showNew && <NewRequestModal teamId={team.id} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewRequestModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const { data: teams, isLoading, error: loadErr } = useDiscoverableTeams(teamId);
  const send = useSendMatchRequest(teamId);
  const [toTeamId, setToTeamId] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [format, setFormat] = useState<FormatId>('T20');
  const [customOvers, setCustomOvers] = useState(15);
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!toTeamId || !date || !venue.trim()) { setErr('Pick a team, date and venue.'); return; }
    if (format === 'CUSTOM' && (!Number.isInteger(customOvers) || customOvers < 1)) { setErr('Enter a whole number of overs (at least 1).'); return; }
    setErr('');
    try { await send.mutateAsync({ fromTeamId: teamId, toTeamId, proposedDate: date, proposedVenue: venue.trim(), format, customOvers: format === 'CUSTOM' ? customOvers : null, message }); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the request.'); }
  };

  return (
    <Modal title="Challenge a team" onClose={onClose}>
      {isLoading ? <LoadingState /> : loadErr ? <ErrorState message={loadErr.message} /> : (
        <div className="space-y-3.5">
          <Field label="Team">
            <select className="input" value={toTeamId} onChange={(e) => setToTeamId(e.target.value)}>
              <option value="">Choose a team</option>
              {teams!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {teams!.length === 0 && <p className="text-xs text-[var(--color-ink-faint)] mt-1">No other coach-managed teams are discoverable yet — they need to sign up as a coach first.</p>}
          </Field>
          <Field label="Proposed date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Venue"><input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="College Ground" /></Field>
          <Field label="Format">
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value as FormatId)}>{FORMATS.map((f) => <option key={f} value={f}>{f === 'CUSTOM' ? 'Custom' : getFormat(f as Exclude<FormatId, 'CUSTOM'>).name}</option>)}</select>
          </Field>
          {format === 'CUSTOM' && (
            <Field label="Overs per innings">
              <input type="number" min={1} className="input" value={customOvers} onChange={(e) => setCustomOvers(Math.max(1, Math.round(Number(e.target.value))))} />
              <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">Max overs per bowler: {maxOversPerBowlerFor(customOvers)} (the same 1-in-5 rule as T10/T20/ODI).</p>
            </Field>
          )}
          <Field label="Message (optional)"><input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Up for a friendly on Sunday?" /></Field>
          {err && <p className="text-sm text-[var(--color-leather)]">{err}</p>}
          <Button className="w-full" onClick={submit} disabled={send.isPending}>{send.isPending ? 'Sending…' : 'Send challenge'}</Button>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">{label}</label><div className="mt-1">{children}</div></div>;
}
