import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useJoinableTeams, useJoinTeam } from '../lib/queries';
import { Button, Card, EmptyState } from './primitives';

export function JoinTeam({ onJoined }: { onJoined: () => void }) {
  const { profile } = useAuth();
  const { data: teams, isLoading } = useJoinableTeams();
  const join = useJoinTeam();
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');

  if (isLoading) return <Card className="p-6 max-w-md"><p className="text-sm text-[var(--color-ink-muted)]">Loading teams…</p></Card>;
  if (!teams || teams.length === 0) return <EmptyState title="No teams to join yet" body="Ask your coach to create their SquadSync team first, then come back and join it." />;

  const submit = async () => {
    if (!teamId || !profile) return;
    setError('');
    try { await join.mutateAsync({ teamId, profileId: profile.id, profileName: profile.name }); onJoined(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not join team.'); }
  };

  return (
    <Card className="p-6 max-w-md">
      <p className="font-semibold mb-1">Join your team</p>
      <p className="text-sm text-[var(--color-ink-muted)] mb-4">Pick the team your coach set up on SquadSync.</p>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="input mb-3">
        <option value="">Select a team…</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {error && <p className="text-sm text-[var(--color-leather)] mb-3">{error}</p>}
      <Button className="w-full" onClick={submit} disabled={!teamId || join.isPending}>{join.isPending ? 'Joining…' : 'Join team'}</Button>
    </Card>
  );
}
