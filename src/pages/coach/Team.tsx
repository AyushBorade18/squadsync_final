import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { PlayerCard } from '../../components/PlayerCard';
import { EmptyState, Button, LoadingState, ErrorState } from '../../components/primitives';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

export function CoachTeam() {
  const { team } = useAuth();
  if (!team) return null;
  const { data: players, isLoading: lp, error: ep } = usePlayers(team.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team.id);
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold">{team.name}</h1><p className="text-sm text-[var(--color-ink-muted)] mt-0.5">{players!.length} squad members</p></div>
        <Link to="/coach/players"><Button><Plus size={16} /> Manage roster</Button></Link>
      </div>
      {players!.length === 0 ? <EmptyState title="No players yet" body="Build your squad from the Players page." action={<Link to="/coach/players"><Button><Plus size={16} />Add players</Button></Link>} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {players!.map((p) => <PlayerCard key={p.id} player={p} stats={stats![p.id]} />)}
        </div>
      )}
    </div>
  );
}
