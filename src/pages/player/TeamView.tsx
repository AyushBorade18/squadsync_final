import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { PlayerCard } from '../../components/PlayerCard';
import { EmptyState, LoadingState, ErrorState } from '../../components/primitives';

export function PlayerTeam() {
  const { team } = useAuth();
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  if (!team) return <EmptyState title="No team yet" body="Join your coach's team from the Dashboard." />;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">{team.name}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-6">{players!.length} squad members</p>
      {players!.length === 0 ? <EmptyState title="No players yet" body="Your coach hasn't added any players yet." /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {players!.map((p) => <PlayerCard key={p.id} player={p} stats={stats![p.id]} />)}
        </div>
      )}
    </div>
  );
}
