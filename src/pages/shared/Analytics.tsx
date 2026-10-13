import { useAuth } from '../../lib/auth';
import { usePlayers, useMatches, useTeamStats, useMatchPerformances } from '../../lib/queries';
import { Card, EmptyState, Stat, SectionLabel, LoadingState, ErrorState } from '../../components/primitives';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';

export function AnalyticsPage({ role }: { role: 'player' | 'coach' }) {
  const { team, profile } = useAuth();
  if (!team) return <EmptyState title="No team yet" body="Analytics appear once you have a team and match data." />;
  const { data: allMatches, isLoading: lm, error: em } = useMatches(team.id);
  const { data: players, isLoading: lp, error: ep } = usePlayers(team.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team.id);
  if (lm || lp || ls) return <LoadingState />;
  if (em || ep || es) return <ErrorState message={(em || ep || es)!.message} />;

  const matches = allMatches!.filter((m) => m.status === 'completed');
  if (matches.length === 0) return <div><h1 className="text-xl font-bold mb-6">Analytics</h1><EmptyState title="No completed matches yet" body="Once scorecards are entered for completed matches, trends and comparisons will appear here." /></div>;

  return <AnalyticsBody role={role} matches={matches} players={players!} stats={stats!} profileId={profile?.id} />;
}

function AnalyticsBody({ role, matches, players, stats, profileId }: any) {
  const matchIds = matches.map((m: any) => m.id);
  const { data: perf, isLoading, error } = useMatchPerformances(matchIds);
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  const trend = matches.slice().reverse().map((m: any) => {
    const bat = perf!.batting.filter((b) => b.matchId === m.id);
    const bowl = perf!.bowling.filter((b) => b.matchId === m.id);
    return { match: new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), runs: bat.reduce((s, b) => s + b.runs, 0), wickets: bowl.reduce((s, b) => s + b.wickets, 0) };
  });
  const topRuns = players.map((p: any) => ({ name: p.name.split(' ')[0], runs: stats[p.id]?.runs ?? 0 })).sort((a: any, b: any) => b.runs - a.runs).slice(0, 6);
  const me = role === 'player' ? players.find((p: any) => p.profileId === profileId) : null;
  const meStats = me ? stats[me.id] : null;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Analytics</h1>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <SectionLabel>Team runs per match</SectionLabel>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="match" tick={{ fontSize: 11 }} stroke="var(--color-ink-faint)" /><YAxis tick={{ fontSize: 11 }} stroke="var(--color-ink-faint)" width={30} /><Tooltip /><Line type="monotone" dataKey="runs" stroke="#1f5c40" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <SectionLabel>Top run scorers (all matches)</SectionLabel>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topRuns}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-ink-faint)" /><YAxis tick={{ fontSize: 11 }} stroke="var(--color-ink-faint)" width={30} /><Tooltip /><Bar dataKey="runs" fill="#1f5c40" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      {meStats && (
        <Card className="p-5">
          <SectionLabel>Your batting profile</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <Stat label="Matches" value={meStats.matches} />
            <Stat label="Runs" value={meStats.runs} tone="pitch" />
            <Stat label="Average" value={meStats.dismissals ? (meStats.runs / meStats.dismissals).toFixed(1) : '—'} />
            <Stat label="Strike rate" value={meStats.ballsFaced ? ((meStats.runs / meStats.ballsFaced) * 100).toFixed(1) : '—'} />
          </div>
        </Card>
      )}
      {role === 'coach' && (
        <Card className="p-5 mt-4">
          <SectionLabel>Squad balance</SectionLabel>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={players.slice(0, 8).map((p: any) => { const s = stats[p.id]; return { name: p.name.split(' ')[0], bat: s?.dismissals ? Math.min(100, (s.runs / s.dismissals) * 2) : 10, bowl: s?.wickets ? Math.min(100, s.wickets * 8) : 5 }; })}>
              <PolarGrid stroke="var(--color-line)" /><PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
              <Radar dataKey="bat" stroke="#1f5c40" fill="#1f5c40" fillOpacity={0.25} />
              <Radar dataKey="bowl" stroke="#a13a2c" fill="#a13a2c" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
