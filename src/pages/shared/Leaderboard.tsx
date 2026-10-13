import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { Card, EmptyState, Avatar, Badge, LoadingState, ErrorState } from '../../components/primitives';
import { Award } from 'lucide-react';

export function LeaderboardPage() {
  const { team } = useAuth();
  if (!team) return <EmptyState title="No team yet" body="The leaderboard fills in once your team has players and match data." />;
  const { data: players, isLoading: lp, error: ep } = usePlayers(team.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team.id);
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players!.length === 0) return <div><h1 className="text-xl font-bold mb-6">Leaderboard</h1><EmptyState title="No players yet" body="Add players to your squad to see rankings." /></div>;

  const ranked = players!.map((p) => ({ p, s: stats![p.id] })).sort((a, b) => b.s.runs - a.s.runs);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Leaderboard</h1>
      <Card>
        <div className="divide-y divide-[var(--color-line)]">
          {ranked.map(({ p, s }, i) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className={`w-6 text-center font-bold tabular ${i === 0 ? 'text-[var(--color-gold)]' : 'text-[var(--color-ink-faint)]'}`}>{i + 1}</span>
              <Avatar seed={p.photoSeed} name={p.name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.name}</p>
                {i === 0 && s.runs > 0 && <Badge tone="gold"><Award size={11} className="mr-1 inline" />Top scorer</Badge>}
              </div>
              <div className="text-right">
                <p className="tabular font-semibold text-sm">{s.runs} runs</p>
                <p className="text-xs text-[var(--color-ink-muted)] tabular">{s.wickets} wkts</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
