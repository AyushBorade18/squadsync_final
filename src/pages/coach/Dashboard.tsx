import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { usePlayers, useMatches, useTeamStats } from '../../lib/queries';
import { Card, Stat, EmptyState, Badge, SectionLabel, Button, LoadingState, ErrorState } from '../../components/primitives';
import { Target, Users, ListOrdered } from 'lucide-react';

export function CoachDashboard() {
  const { profile, team } = useAuth();
  if (!team) return <EmptyState title="No team yet" body="Something went wrong creating your team — try signing up again." />;
  const { data: players, isLoading: lp, error: ep } = usePlayers(team.id);
  const { data: matches, isLoading: lm, error: em } = useMatches(team.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team.id);
  if (lp || lm || ls) return <LoadingState label="Loading command centre…" />;
  if (ep || em || es) return <ErrorState message={(ep || em || es)!.message} />;

  const totalRuns = players!.reduce((s, p) => s + (stats![p.id]?.runs ?? 0), 0);
  const next = matches!.find((m) => m.status === 'scheduled');

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Command centre</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-6">{team.name} · {profile?.name}</p>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2 md:row-span-2">
          <SectionLabel>Squad overview</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <Stat label="Players" value={players!.length} />
            <Stat label="Team runs" value={totalRuns} tone="pitch" />
            <Stat label="Matches played" value={matches!.filter((m) => m.status === 'completed').length} />
            <Stat label="Upcoming" value={matches!.filter((m) => m.status === 'scheduled').length} />
          </div>
          {players!.length === 0 ? (
            <EmptyState title="Your squad is empty" body="Add players to start building your team." action={<Link to="/coach/players"><Button><Users size={16} />Add players</Button></Link>} />
          ) : (
            <div className="flex flex-wrap gap-2 mt-2">
              {players!.slice(0, 10).map((p) => <span key={p.id} className="text-xs px-2.5 py-1 rounded-full bg-black/[0.04]">{p.name}</span>)}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionLabel>Next match</SectionLabel>
          {next ? (<div><p className="font-semibold text-sm">{team.shortName} vs {next.opponentName}</p><p className="text-xs text-[var(--color-ink-muted)] mt-1">{next.venue} · {new Date(next.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p><Badge>{next.format}</Badge></div>) : <p className="text-sm text-[var(--color-ink-muted)]">Nothing scheduled.</p>}
        </Card>

        <Card className="p-5">
          <SectionLabel>Quick actions</SectionLabel>
          <div className="space-y-2">
            <Link to="/coach/selection" className="flex items-center gap-2 text-sm font-medium text-[var(--color-pitch-dark)] hover:underline"><Target size={15} /> Run team selection</Link>
            <Link to="/coach/batting-order" className="flex items-center gap-2 text-sm font-medium text-[var(--color-pitch-dark)] hover:underline"><ListOrdered size={15} /> Set batting order</Link>
            <Link to="/coach/players" className="flex items-center gap-2 text-sm font-medium text-[var(--color-pitch-dark)] hover:underline"><Users size={15} /> Manage players</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
