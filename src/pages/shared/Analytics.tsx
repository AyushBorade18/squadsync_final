import { useAuth } from '../../lib/auth';
import { usePlayers, useMatches, useTeamStats, useMatchPerformances } from '../../lib/queries';
import { Card, EmptyState, Stat, SectionLabel, LoadingState, ErrorState, Badge } from '../../components/primitives';
import { formatOvers } from '../../algorithms/overs';
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  PieChart, Pie, Cell, Legend, ComposedChart, Area,
} from 'recharts';
import type { Match, Player, BattingPerformance, BowlingPerformance } from '../../types/domain';
import type { PlayerStats } from '../../algorithms/selection';

const GREEN = '#1f5c40', RED = '#a13a2c', GOLD = '#a9781f', GREY = '#8b9096';
const axis = { tick: { fontSize: 11 }, stroke: 'var(--color-ink-faint)' } as const;

export function AnalyticsPage({ role }: { role: 'player' | 'coach' }) {
  const { team, profile } = useAuth();
  const { data: allMatches, isLoading: lm, error: em } = useMatches(team?.id);
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  if (!team) return <EmptyState title="No team yet" body="Analytics appear once you have a team and match data." />;
  if (lm || lp || ls) return <LoadingState />;
  if (em || ep || es) return <ErrorState message={(em || ep || es)!.message} />;

  const matches = allMatches!.filter((m) => m.status === 'completed');
  if (matches.length === 0) return <div><h1 className="text-xl font-bold mb-6">Analytics</h1><EmptyState title="No completed matches yet" body="Once a match is finished, trends, tables and comparisons appear here." /></div>;
  return <AnalyticsBody role={role} matches={matches} players={players!} stats={stats!} profileId={profile?.id} />;
}

function AnalyticsBody({ role, matches, players, stats, profileId }: { role: 'player' | 'coach'; matches: Match[]; players: Player[]; stats: Record<string, PlayerStats>; profileId?: string }) {
  const { data: perf, isLoading, error } = useMatchPerformances(matches.map((m) => m.id));
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  const own = new Set(players.map((p) => p.id));
  const bat = perf!.batting as BattingPerformance[];
  const bowl = perf!.bowling as BowlingPerformance[];
  const ownBat = bat.filter((b) => own.has(b.playerId));
  const ownBowl = bowl.filter((b) => own.has(b.playerId));

  // ---- per-match trend (own runs scored vs runs conceded, wickets taken, run rate) ----
  const ordered = matches.slice().sort((a, b) => a.date.localeCompare(b.date));
  let won = 0, lost = 0, tied = 0;
  const trend = ordered.map((m) => {
    const mb = bat.filter((b) => b.matchId === m.id);
    const scored = mb.filter((b) => own.has(b.playerId)).reduce((s, b) => s + b.runs, 0);
    const conceded = mb.filter((b) => !own.has(b.playerId)).reduce((s, b) => s + b.runs, 0);
    const balls = ownBat.filter((b) => b.matchId === m.id).reduce((s, b) => s + b.balls, 0);
    const wk = ownBowl.filter((b) => b.matchId === m.id).reduce((s, b) => s + b.wickets, 0);
    if (scored > conceded) won++; else if (scored < conceded) lost++; else tied++;
    return { match: new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), scored, conceded, wickets: wk, rr: balls ? +((scored / balls) * 6).toFixed(2) : 0 };
  });

  // ---- batting / bowling tables ----
  const batRows = players.map((p) => {
    const rows = ownBat.filter((b) => b.playerId === p.id && b.status !== 'did_not_bat');
    const runs = rows.reduce((s, b) => s + b.runs, 0), balls = rows.reduce((s, b) => s + b.balls, 0);
    const outs = rows.filter((b) => b.status === 'out').length;
    return { id: p.id, name: p.name, inns: rows.length, runs, balls, fours: rows.reduce((s, b) => s + b.fours, 0), sixes: rows.reduce((s, b) => s + b.sixes, 0), hs: rows.reduce((m, b) => Math.max(m, b.runs), 0), avg: outs ? runs / outs : null, sr: balls ? (runs / balls) * 100 : null };
  }).filter((r) => r.inns > 0).sort((a, b) => b.runs - a.runs);
  const bowlRows = players.map((p) => {
    const rows = ownBowl.filter((b) => b.playerId === p.id && b.legalBalls > 0);
    const balls = rows.reduce((s, b) => s + b.legalBalls, 0), runs = rows.reduce((s, b) => s + b.runs, 0), wk = rows.reduce((s, b) => s + b.wickets, 0);
    return { id: p.id, name: p.name, balls, maidens: rows.reduce((s, b) => s + b.maidens, 0), runs, wk, econ: balls ? runs / (balls / 6) : null, avg: wk ? runs / wk : null, extras: rows.reduce((s, b) => s + b.wides + b.noBalls, 0) };
  }).filter((r) => r.balls > 0).sort((a, b) => b.wk - a.wk || (a.econ ?? 99) - (b.econ ?? 99));

  const totalRuns = batRows.reduce((s, r) => s + r.runs, 0), totalBalls = batRows.reduce((s, r) => s + r.balls, 0);
  const totalWk = bowlRows.reduce((s, r) => s + r.wk, 0);
  const totalBowlBalls = bowlRows.reduce((s, r) => s + r.balls, 0), totalConceded = bowlRows.reduce((s, r) => s + r.runs, 0);
  const boundaries = batRows.reduce((s, r) => s + r.fours + r.sixes, 0);
  const results = [{ name: 'Won', value: won, color: GREEN }, { name: 'Lost', value: lost, color: RED }, { name: 'Tied', value: tied, color: GREY }].filter((r) => r.value > 0);
  const boundaryData = batRows.slice(0, 8).map((r) => ({ name: r.name.split(' ')[0], fours: r.fours, sixes: r.sixes }));
  const wicketData = bowlRows.slice(0, 8).map((r) => ({ name: r.name.split(' ')[0], wickets: r.wk }));
  const runShare = batRows.slice(0, 6).map((r, i) => ({ name: r.name.split(' ')[0], value: r.runs, color: [GREEN, GOLD, RED, '#4a7c8a', '#6b4e9b', GREY][i] }));
  const dismissalMix: Record<string, number> = {};
  ownBat.filter((b) => b.status === 'out').forEach((b) => { const k = (b.dismissal ?? 'out').replace(/^(c |st |lbw|b |run out|hit wicket).*/, '$1').trim() || 'out'; dismissalMix[k] = (dismissalMix[k] ?? 0) + 1; });
  const dismissalData = Object.entries(dismissalMix).map(([k, v]) => ({ name: ({ c: 'Caught', st: 'Stumped', lbw: 'LBW', b: 'Bowled', 'run out': 'Run out', 'hit wicket': 'Hit wicket' } as Record<string, string>)[k] ?? k, value: v }));

  const me = role === 'player' ? players.find((p) => p.profileId === profileId) : null;
  const meStats = me ? stats[me.id] : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6"><h1 className="text-xl font-bold">Analytics</h1><Badge>{matches.length} match{matches.length > 1 ? 'es' : ''}</Badge></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="p-4"><Stat label="Record (W-L-T)" value={`${won}-${lost}-${tied}`} tone="pitch" /></Card>
        <Card className="p-4"><Stat label="Runs scored" value={totalRuns} /></Card>
        <Card className="p-4"><Stat label="Team strike rate" value={totalBalls ? ((totalRuns / totalBalls) * 100).toFixed(1) : '—'} /></Card>
        <Card className="p-4"><Stat label="Boundaries (4s+6s)" value={boundaries} tone="gold" /></Card>
        <Card className="p-4"><Stat label="Wickets taken" value={totalWk} tone="leather" /></Card>
        <Card className="p-4"><Stat label="Economy" value={totalBowlBalls ? (totalConceded / (totalBowlBalls / 6)).toFixed(2) : '—'} /></Card>
        <Card className="p-4"><Stat label="Avg score / match" value={matches.length ? Math.round(totalRuns / matches.length) : '—'} /></Card>
        <Card className="p-4"><Stat label="Overs bowled" value={formatOvers(totalBowlBalls)} /></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <SectionLabel>Runs scored vs conceded, per match</SectionLabel>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={trend}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="match" {...axis} /><YAxis {...axis} width={30} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="scored" name="Scored" stroke={GREEN} fill={GREEN} fillOpacity={0.15} /><Line dataKey="conceded" name="Conceded" stroke={RED} strokeWidth={2} dot={{ r: 3 }} /></ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <SectionLabel>Run rate &amp; wickets per match</SectionLabel>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={trend}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="match" {...axis} /><YAxis yAxisId="l" {...axis} width={30} /><YAxis yAxisId="r" orientation="right" {...axis} width={26} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="r" dataKey="wickets" name="Wickets" fill={RED} radius={[4, 4, 0, 0]} /><Line yAxisId="l" dataKey="rr" name="Run rate" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} /></ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <SectionLabel>Top run scorers</SectionLabel>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={batRows.slice(0, 8).map((r) => ({ name: r.name.split(' ')[0], runs: r.runs }))}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} width={30} /><Tooltip /><Bar dataKey="runs" fill={GREEN} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <SectionLabel>Top wicket takers</SectionLabel>
          {wicketData.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={wicketData}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} width={30} /><Tooltip /><Bar dataKey="wickets" fill={RED} radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[var(--color-ink-muted)] py-10 text-center">No bowling data yet.</p>}
        </Card>
        <Card className="p-5">
          <SectionLabel>Boundaries by batter</SectionLabel>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={boundaryData}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} width={30} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="fours" name="Fours" stackId="b" fill={GREEN} /><Bar dataKey="sixes" name="Sixes" stackId="b" fill={GOLD} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <SectionLabel>Share of team runs</SectionLabel>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart><Pie data={runShare} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>{runShare.map((r) => <Cell key={r.name} fill={r.color} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <SectionLabel>Results</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={results} dataKey="value" nameKey="name" outerRadius={75} label>{results.map((r) => <Cell key={r.name} fill={r.color} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </Card>
        {dismissalData.length > 0 && (
          <Card className="p-5">
            <SectionLabel>How our batters got out</SectionLabel>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dismissalData} layout="vertical"><CartesianGrid stroke="var(--color-line)" horizontal={false} /><XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="name" {...axis} width={70} /><Tooltip /><Bar dataKey="value" fill={GOLD} radius={[0, 4, 4, 0]} /></BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      <Card className="p-5 mb-4">
        <SectionLabel>Batting table</SectionLabel>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[460px]">
          <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Batter</th><th>Inn</th><th>Runs</th><th>HS</th><th>Avg</th><th>SR</th><th>4s</th><th>6s</th></tr></thead>
          <tbody>{batRows.map((r) => (
            <tr key={r.id} className="border-t border-[var(--color-line)] tabular"><td className="py-1.5 font-medium whitespace-nowrap font-sans">{r.name}</td><td>{r.inns}</td><td className="font-semibold">{r.runs}</td><td>{r.hs}</td><td>{r.avg !== null ? r.avg.toFixed(1) : '—'}</td><td>{r.sr !== null ? r.sr.toFixed(1) : '—'}</td><td>{r.fours}</td><td>{r.sixes}</td></tr>
          ))}</tbody></table></div>
      </Card>
      <Card className="p-5 mb-4">
        <SectionLabel>Bowling table</SectionLabel>
        {bowlRows.length === 0 ? <p className="text-sm text-[var(--color-ink-muted)]">No bowling data yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[460px]">
            <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th><th>Avg</th><th>Wd/Nb</th></tr></thead>
            <tbody>{bowlRows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)] tabular"><td className="py-1.5 font-medium whitespace-nowrap font-sans">{r.name}</td><td>{formatOvers(r.balls)}</td><td>{r.maidens}</td><td>{r.runs}</td><td className="font-semibold">{r.wk}</td><td>{r.econ !== null ? r.econ.toFixed(2) : '—'}</td><td>{r.avg !== null ? r.avg.toFixed(1) : '—'}</td><td>{r.extras}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>
      <Card className="p-5 mb-4">
        <SectionLabel>Match-by-match</SectionLabel>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
          <thead><tr className="text-left text-xs text-[var(--color-ink-muted)]"><th className="py-1">Match</th><th>Scored</th><th>Conceded</th><th>Wkts</th><th>RR</th></tr></thead>
          <tbody>{ordered.map((m, i) => (
            <tr key={m.id} className="border-t border-[var(--color-line)] tabular"><td className="py-1.5 whitespace-nowrap font-sans">vs {m.opponentName} <span className="text-xs text-[var(--color-ink-faint)]">{trend[i].match}</span></td><td>{trend[i].scored}</td><td>{trend[i].conceded}</td><td>{trend[i].wickets}</td><td>{trend[i].rr}</td></tr>
          ))}</tbody></table></div>
      </Card>

      {meStats && (
        <Card className="p-5 mb-4">
          <SectionLabel>Your batting profile</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Matches" value={meStats.matches} />
            <Stat label="Runs" value={meStats.runs} tone="pitch" />
            <Stat label="Average" value={meStats.dismissals ? (meStats.runs / meStats.dismissals).toFixed(1) : '—'} />
            <Stat label="Strike rate" value={meStats.ballsFaced ? ((meStats.runs / meStats.ballsFaced) * 100).toFixed(1) : '—'} />
          </div>
        </Card>
      )}
      {role === 'coach' && (
        <Card className="p-5">
          <SectionLabel>Squad balance</SectionLabel>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={players.slice(0, 8).map((p) => { const s = stats[p.id]; return { name: p.name.split(' ')[0], bat: s?.dismissals ? Math.min(100, (s.runs / s.dismissals) * 2) : 10, bowl: s?.wickets ? Math.min(100, s.wickets * 8) : 5 }; })}>
              <PolarGrid stroke="var(--color-line)" /><PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
              <Radar dataKey="bat" stroke={GREEN} fill={GREEN} fillOpacity={0.25} /><Radar dataKey="bowl" stroke={RED} fill={RED} fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
