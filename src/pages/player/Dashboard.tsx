import { useAuth } from '../../lib/auth';
import { usePlayers, useMatches, useTeamStats } from '../../lib/queries';
import { Card, Stat, EmptyState, Badge, SectionLabel, LoadingState, ErrorState } from '../../components/primitives';
import { JoinTeam } from '../../components/JoinTeam';

export function PlayerDashboard() {
  const { profile, team, refresh } = useAuth();
  if (!team) return (<div><h1 className="text-xl font-bold mb-1">Welcome, {profile?.name}</h1><p className="text-sm text-[var(--color-ink-muted)] mb-6">Let's get you set up.</p><JoinTeam onJoined={refresh} /></div>);

  const { data: players, isLoading: lp, error: ep } = usePlayers(team.id);
  const { data: matches, isLoading: lm, error: em } = useMatches(team.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team.id);

  if (lp || lm || ls) return <LoadingState label="Loading your dashboard…" />;
  if (ep || em || es) return <ErrorState message={(ep || em || es)?.message ?? 'Could not load data.'} />;

  const me = players!.find((p) => p.profileId === profile?.id);
  const myStats = me ? stats![me.id] : null;
  const next = matches!.find((m) => m.status === 'scheduled');
  const recent = matches!.filter((m) => m.status === 'completed').slice(0, 3);

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Welcome back, {profile?.name.split(' ')[0]}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-6">{team.name}</p>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2">
          <SectionLabel>Your form</SectionLabel>
          {myStats && myStats.matches > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Matches" value={myStats.matches} />
              <Stat label="Runs" value={myStats.runs} tone="pitch" />
              <Stat label="Wickets" value={myStats.wickets} tone="leather" />
              <Stat label="Average" value={myStats.dismissals ? (myStats.runs / myStats.dismissals).toFixed(1) : '—'} />
            </div>
          ) : <p className="text-sm text-[var(--color-ink-muted)]">No match data yet — your stats will build up as matches are recorded.</p>}
        </Card>
        <Card className="p-5">
          <SectionLabel>Next match</SectionLabel>
          {next ? (<div><p className="font-semibold text-sm">{team.shortName} vs {next.opponentName}</p><p className="text-xs text-[var(--color-ink-muted)] mt-1">{next.venue}</p><p className="text-xs text-[var(--color-ink-muted)]">{new Date(next.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p></div>) : <p className="text-sm text-[var(--color-ink-muted)]">No match scheduled.</p>}
        </Card>
      </div>

      <div className="mt-4">
        <SectionLabel>Recent results</SectionLabel>
        {recent.length === 0 ? <EmptyState title="No results yet" body="Completed matches will show up here." /> : (
          <div className="space-y-2">
            {recent.map((m) => (
              <Card key={m.id} className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium">{team.shortName} vs {m.opponentName}</span>
                <Badge tone="pitch">{m.result ?? 'Completed'}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
