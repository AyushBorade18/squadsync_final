import { useAuth } from '../../lib/auth';
import { usePlayers, usePlayerPerformances } from '../../lib/queries';
import { Card, EmptyState, SectionLabel, LoadingState, ErrorState } from '../../components/primitives';
import { formatOvers } from '../../algorithms/overs';

export function PlayerPerformance() {
  const { profile, team } = useAuth();
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const me = players?.find((p) => p.profileId === profile?.id);
  const { data: perf, isLoading: lf, error: ef } = usePlayerPerformances(me?.id);

  if (!team) return <EmptyState title="Join a team first" body="Match-by-match performance appears once you're on a squad." />;
  if (lp || (me && lf)) return <LoadingState />;
  if (ep || ef) return <ErrorState message={(ep || ef)!.message} />;
  if (!me) return <EmptyState title="You're not on the roster yet" body="Ask your coach to add you." />;

  const { batting: bat, bowling: bowl } = perf!;
  if (bat.length === 0 && bowl.length === 0) return <div><h1 className="text-xl font-bold mb-6">My Performance</h1><EmptyState title="No innings recorded yet" body="Your match-by-match performance will appear here once your coach enters scorecards." /></div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">My Performance</h1>
      {bat.length > 0 && (
        <Card className="p-5 mb-4">
          <SectionLabel>Batting, innings by innings</SectionLabel>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[320px]">
            <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Runs</th><th>Balls</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>{bat.map((b) => (<tr key={b.id} className="border-t border-[var(--color-line)]"><td className="py-1.5 tabular font-medium">{b.runs}{b.status === 'not_out' && '*'}</td><td className="tabular">{b.balls}</td><td className="tabular">{b.fours}</td><td className="tabular">{b.sixes}</td><td className="tabular">{b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : '—'}</td></tr>))}</tbody>
          </table>
          </div>
        </Card>
      )}
      {bowl.length > 0 && (
        <Card className="p-5">
          <SectionLabel>Bowling, innings by innings</SectionLabel>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[320px]">
            <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Overs</th><th>Runs</th><th>Wkts</th><th>Econ</th></tr></thead>
            <tbody>{bowl.map((b) => (<tr key={b.id} className="border-t border-[var(--color-line)]"><td className="py-1.5 tabular font-medium">{formatOvers(b.legalBalls)}</td><td className="tabular">{b.runs}</td><td className="tabular">{b.wickets}</td><td className="tabular">{b.legalBalls ? (b.runs / (b.legalBalls / 6)).toFixed(2) : '—'}</td></tr>))}</tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}
