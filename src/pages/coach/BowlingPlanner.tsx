import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { toSquadPlayer } from '../../lib/repo';
import { Card, EmptyState, SectionLabel, Badge, LoadingState, ErrorState } from '../../components/primitives';
import { skillsOf, DEFAULT_BASELINES } from '../../algorithms/selection';
import { planBowling } from '../../algorithms/bowlingPlanner';
import { getFormat, type FormatId } from '../../algorithms/formats';

export function BowlingPlannerPage() {
  const { team } = useAuth();
  const [format, setFormat] = useState<FormatId>('T20');
  const { data: allPlayers, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  const players = (allPlayers ?? []).filter((p) => p.bowlingStyle);

  const rules = getFormat(format === 'CUSTOM' ? 'T20' : format);
  const bowlers = useMemo(() => (!stats ? [] : players.map((p) => ({ id: p.id, style: p.bowlingStyle!, skill: skillsOf(toSquadPlayer(p, stats[p.id]), DEFAULT_BASELINES[format]).bowl || 40 }))), [players, stats, format]);
  const plan = useMemo(() => planBowling(bowlers, rules), [bowlers, rules]);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';

  if (!team) return null;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players.length < 2) return <div><h1 className="text-xl font-bold mb-6">Bowling Planner</h1><EmptyState title="Not enough bowlers" body="Add bowlers to your squad to plan an over-by-over allocation." /></div>;

  const totals = new Map<string, number>();
  plan?.forEach((p) => totals.set(p.bowlerId, (totals.get(p.bowlerId) ?? 0) + 1));

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">Bowling Planner</h1>
        <select value={format} onChange={(e) => setFormat(e.target.value as FormatId)} className="input w-auto">{(['T10', 'T20', 'ODI'] as const).map((f) => <option key={f} value={f}>{getFormat(f).name}</option>)}</select>
      </div>

      {!plan ? (
        <EmptyState title="No valid plan" body={`Not enough eligible bowlers to cover ${rules.oversPerInnings} overs within the ${rules.maxOversPerBowler}-over-per-bowler limit.`} />
      ) : (
        <>
          <Card className="p-5 mb-4">
            <SectionLabel>Over-by-over allocation</SectionLabel>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {plan.map((o) => (
                <div key={o.over} className="hairline rounded-[6px] p-1.5 text-center" title={`${nameOf(o.bowlerId)} — ${o.phase}`}>
                  <p className="text-[10px] text-[var(--color-ink-faint)]">{o.over}</p>
                  <p className="text-[11px] font-semibold truncate">{nameOf(o.bowlerId).split(' ')[0]}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5 mb-4">
            <SectionLabel>Overs bowled</SectionLabel>
            <div className="space-y-2">{[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
              <div key={id} className="flex justify-between text-sm"><span>{nameOf(id)}</span><span className="tabular font-medium">{n} / {rules.maxOversPerBowler}</span></div>
            ))}</div>
          </Card>
          <div className="flex gap-2 text-xs">
            <Badge tone="pitch">Powerplay</Badge><Badge tone="gold">Middle</Badge><Badge tone="leather">Death</Badge>
          </div>
        </>
      )}
    </div>
  );
}
