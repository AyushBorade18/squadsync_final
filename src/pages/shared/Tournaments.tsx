import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useTournaments, useAddTournament, useDiscoverableTeams, useAddTeamToTournament, useRemoveTeamFromTournament, useDeleteTournament } from '../../lib/queries';
import { Card, EmptyState, Button, Badge, LoadingState, ErrorState, Modal } from '../../components/primitives';
import { generateBracket, type BracketNode } from '../../algorithms/tournament';
import { getFormat, type FormatId } from '../../algorithms/formats';
import type { Tournament } from '../../types/domain';
import { Plus, Trophy, Trash2, UserPlus, X } from 'lucide-react';

export function TournamentsPage({ role }: { role: 'player' | 'coach' }) {
  const { profile, team } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [addingTeamsTo, setAddingTeamsTo] = useState<Tournament | null>(null);
  const deleteTournament = useDeleteTournament(profile?.id ?? '');
  const removeTeam = useRemoveTeamFromTournament(profile?.id ?? '');
  if (!profile) return null;
  const { data: tournaments, isLoading, error } = useTournaments(profile.id);
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  const remove = async (t: Tournament) => {
    if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;
    await deleteTournament.mutateAsync(t.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Tournaments</h1>
        {role === 'coach' && <Button onClick={() => setShowNew(true)}><Plus size={16} /> New tournament</Button>}
      </div>
      {tournaments!.length === 0 ? (
        <EmptyState title="No tournaments yet" body={role === 'coach' ? 'Create a tournament and add teams to generate fixtures and a bracket.' : 'Your coach hasn\'t entered any tournaments yet.'} action={role === 'coach' ? <Button onClick={() => setShowNew(true)}><Plus size={16} /> Create tournament</Button> : undefined} />
      ) : (
        <div className="space-y-6">
          {tournaments!.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2"><Trophy size={16} className="text-[var(--color-gold)]" /><span className="font-semibold">{t.name}</span><Badge>{t.format}</Badge></div>
                {role === 'coach' && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setAddingTeamsTo(t)}><UserPlus size={14} /> Add team</Button>
                    <Button variant="ghost" onClick={() => remove(t)} disabled={deleteTournament.isPending}><Trash2 size={14} className="text-[var(--color-leather)]" /></Button>
                  </div>
                )}
              </div>
              {t.teamIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {t.teamIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 text-xs rounded-full bg-black/[0.04] px-2.5 py-1">
                      {id === team?.id ? team.name : (t.teamNames[id] ?? 'Team')}
                      {role === 'coach' && (
                        <button onClick={() => removeTeam.mutate({ tournamentId: t.id, teamId: id })} className="hover:text-[var(--color-leather)]"><X size={11} /></button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {t.teamIds.length >= 2 ? <Bracket teams={t.teamIds.map((id) => id === team?.id ? team.name : (t.teamNames[id] ?? 'Team'))} /> : <p className="text-sm text-[var(--color-ink-muted)]">Add at least 2 teams to generate a bracket.</p>}
            </Card>
          ))}
        </div>
      )}
      {showNew && role === 'coach' && <NewTournamentModal onClose={() => setShowNew(false)} />}
      {addingTeamsTo && role === 'coach' && <AddTeamModal tournament={addingTeamsTo} onClose={() => setAddingTeamsTo(null)} />}
    </div>
  );
}

function AddTeamModal({ tournament, onClose }: { tournament: Tournament; onClose: () => void }) {
  const { profile, team } = useAuth();
  const { data: teams, isLoading, error } = useDiscoverableTeams(team?.id);
  const addTeam = useAddTeamToTournament(profile?.id ?? '');
  const [err, setErr] = useState('');

  const already = new Set(tournament.teamIds);
  const options = (teams ?? []).filter((t) => !already.has(t.id));

  const add = async (teamId: string) => {
    setErr('');
    try { await addTeam.mutateAsync({ tournamentId: tournament.id, teamId }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add that team.'); }
  };

  return (
    <Modal title={`Add a team to ${tournament.name}`} onClose={onClose}>
      {isLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
        <div className="space-y-2">
          {options.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">No more discoverable teams to add — other coaches need to sign up first.</p>
          ) : options.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--color-line)] last:border-0">
              <span className="text-sm font-medium">{t.name}</span>
              <Button variant="secondary" onClick={() => add(t.id)} disabled={addTeam.isPending}>Add</Button>
            </div>
          ))}
          {err && <p className="text-sm text-[var(--color-leather)]">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

function Bracket({ teams }: { teams: string[] }) {
  const root = generateBracket(teams);
  const rounds: BracketNode[][] = [];
  const collect = (n: BracketNode, depth: number) => { rounds[depth] = rounds[depth] || []; rounds[depth].push(n); if (n.left) collect(n.left, depth - 1); if (n.right) collect(n.right, depth - 1); };
  collect(root, root.round);
  const ordered = Object.keys(rounds).map(Number).sort((a, b) => a - b).map((r) => rounds[r]);
  return (
    <div className="flex gap-8 overflow-x-auto pb-2">
      {ordered.map((round, ri) => (
        <div key={ri} className="flex flex-col justify-around gap-3 shrink-0">
          <p className="text-xs font-semibold text-[var(--color-ink-muted)]">{ri === ordered.length - 1 ? 'Final' : `Round ${ri + 1}`}</p>
          {round.map((n, i) => (
            <div key={i} className={`px-3 py-2 rounded-[var(--radius-sm)] text-sm hairline min-w-[140px] ${n.team ? 'bg-[var(--color-surface)]' : 'bg-black/[0.02] text-[var(--color-ink-faint)]'}`}>{n.team ?? 'TBD'}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function NewTournamentModal({ onClose }: { onClose: () => void }) {
  const { profile, team } = useAuth();
  const addTournament = useAddTournament(profile!.id);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<FormatId>('T20');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim() || !profile) return;
    setError('');
    try { await addTournament.mutateAsync({ name: name.trim(), format, teamIds: team ? [team.id] : [], ownerProfileId: profile.id, startDate: new Date().toISOString() }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create tournament.'); }
  };

  return (
    <Modal title="New tournament" onClose={onClose}>
      <div className="space-y-3.5">
        <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" placeholder="Inter-College Cup" /></div>
        <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">Format</label><select value={format} onChange={(e) => setFormat(e.target.value as FormatId)} className="input mt-1">{(['T10', 'T20', 'ODI'] as const).map((f) => <option key={f} value={f}>{getFormat(f).name}</option>)}</select></div>
        {error && <p className="text-sm text-[var(--color-leather)]">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={addTournament.isPending}>{addTournament.isPending ? 'Creating…' : 'Create'}</Button>
      </div>
    </Modal>
  );
}
