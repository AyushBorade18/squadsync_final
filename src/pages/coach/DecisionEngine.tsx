import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats, useMatches, useOpponentProfile } from '../../lib/queries';
import { toSquadPlayer } from '../../lib/repo';
import { Card, EmptyState, SectionLabel, Stat, Badge, LoadingState, ErrorState } from '../../components/primitives';
import { recommendXI, DEFAULT_BASELINES, type PitchType, type OpponentBowlingTendency, type GraphEdge, type RoleSlot, type SquadPlayer } from '../../algorithms/selection';
import { getFormat, type FormatId } from '../../algorithms/formats';

export function DecisionEnginePage() {
  const { team } = useAuth();
  const [format, setFormat] = useState<FormatId>('T20');
  const [pitchType, setPitchType] = useState<PitchType | ''>('');
  const [opponentTendency, setOpponentTendency] = useState<OpponentBowlingTendency | ''>('');
  const [view, setView] = useState<'bars' | 'graph'>('bars');
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  const { data: matches } = useMatches(team?.id);
  const upcoming = matches?.filter((m) => m.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
  const { data: opponentProfile } = useOpponentProfile(team?.id, upcoming?.opponentTeamId ?? undefined);

  // Default the opponent-tendency dropdown from the saved scouting profile for the next
  // match, if one exists — the coach can still override it for a hypothetical matchup.
  useEffect(() => { if (opponentProfile && opponentTendency === '') setOpponentTendency(opponentProfile.bowlingTendency); }, [opponentProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const rules = getFormat(format === 'CUSTOM' ? 'T20' : format);
  const squad = players && stats ? players.map((p) => toSquadPlayer(p, stats[p.id])) : [];
  const context = { pitchType: pitchType || undefined, opponentBowlingTendency: opponentTendency || undefined };
  const rec = useMemo(() => recommendXI(squad, rules, DEFAULT_BASELINES[format], context), [squad, rules, format, pitchType, opponentTendency]);

  if (!team) return null;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players!.length < 2) return <div><h1 className="text-xl font-bold mb-6">Decision Engine</h1><EmptyState title="Not enough players" body="Add your squad first, then the decision engine can compare options." /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div><h1 className="text-xl font-bold">Decision Engine</h1><p className="text-sm text-[var(--color-ink-muted)] mt-0.5">Why this XI, in plain terms</p></div>
        <select value={format} onChange={(e) => setFormat(e.target.value as FormatId)} className="input w-auto">{(['T10', 'T20', 'ODI', 'TEST'] as const).map((f) => <option key={f} value={f}>{getFormat(f).name}</option>)}</select>
      </div>

      <Card className="p-4 mb-6">
        <SectionLabel>Match context — feeds the selection score below</SectionLabel>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--color-ink-muted)]">Pitch</label>
            <select className="input w-auto mt-1" value={pitchType} onChange={(e) => setPitchType(e.target.value as PitchType | '')}>
              <option value="">Unknown / balanced</option>
              <option value="batting_friendly">Batting-friendly</option>
              <option value="bowling_friendly">Bowling-friendly</option>
              <option value="balanced">Balanced</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-ink-muted)]">Opponent's attack{opponentProfile && <span className="text-[var(--color-pitch)]"> (from saved profile)</span>}</label>
            <select className="input w-auto mt-1" value={opponentTendency} onChange={(e) => setOpponentTendency(e.target.value as OpponentBowlingTendency | '')}>
              <option value="">Unknown / balanced</option>
              <option value="pace_heavy">Pace-heavy</option>
              <option value="spin_heavy">Spin-heavy</option>
              <option value="balanced">Balanced</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4"><Stat label="Selection Score" value={rec.selectionScore.toFixed(0) + ' / 100'} tone="pitch" /></Card>
        <Card className="p-4"><Stat label="Role Coverage" value={`${(rec.coverage * 100).toFixed(0)}%`} /></Card>
        <Card className="p-4"><Stat label="Bat/Bowl Balance" value={`${(rec.balance * 100).toFixed(0)}%`} /></Card>
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Player comparison — selection factors</SectionLabel>
          <div className="flex gap-1 text-xs">
            <button onClick={() => setView('bars')} className={`px-2.5 py-1 rounded-full font-medium ${view === 'bars' ? 'bg-[var(--color-pitch)] text-white' : 'bg-black/[0.04] text-[var(--color-ink-muted)]'}`}>Breakdown</button>
            <button onClick={() => setView('graph')} className={`px-2.5 py-1 rounded-full font-medium ${view === 'graph' ? 'bg-[var(--color-pitch)] text-white' : 'bg-black/[0.04] text-[var(--color-ink-muted)]'}`}>Full graph</button>
          </div>
        </div>
        {view === 'bars' ? (
          <div className="space-y-4">
            {rec.picks.map((pk) => (
              <div key={pk.slot.id}>
                <div className="flex justify-between text-sm mb-1.5"><span className="font-medium">{pk.player.name} <span className="text-[var(--color-ink-muted)] font-normal">· {pk.slot.label}</span></span><span className="tabular font-semibold">{pk.fit.toFixed(0)}</span></div>
                <BreakdownBars breakdown={pk.breakdown} />
              </div>
            ))}
          </div>
        ) : (
          <BipartiteGraphView graph={rec.graph} slots={rec.slots} pool={rec.pool} />
        )}
        {view === 'bars' && <p className="text-xs text-[var(--color-ink-faint)] mt-1">Weighted 70% base role fit (real stats) + 20% match context (pitch/opponent) + 10% recent fatigue, plus a small fielding bonus.</p>}
      </Card>

      {rec.violations.length > 0 && (
        <Card className="p-5 mb-4">
          <SectionLabel>Constraint warnings</SectionLabel>
          <ul className="text-sm space-y-1.5">{rec.violations.map((v, i) => <li key={i} className="flex gap-2"><Badge tone="gold">!</Badge><span>{v}</span></li>)}</ul>
        </Card>
      )}

      {rec.alternatives.length > 0 && (
        <Card className="p-5">
          <SectionLabel>Alternative selections</SectionLabel>
          <ul className="text-sm space-y-2">
            {rec.alternatives.map((a, i) => (
              <li key={i} className="flex items-center justify-between"><span><span className="font-medium">{a.in}</span> instead of <span className="font-medium">{a.out}</span></span><Badge tone={a.fitChange >= 0 ? 'pitch' : 'neutral'}>{a.fitChange > 0 ? '+' : ''}{a.fitChange.toFixed(0)} fit</Badge></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function BreakdownBars({ breakdown }: { breakdown: { base: number; context: number; fatigue: number; fielding: number } }) {
  const rows: { label: string; value: number; max: number; color: string }[] = [
    { label: 'Base role fit (70%)', value: breakdown.base, max: 100, color: 'var(--color-pitch)' },
    { label: 'Match context (20%)', value: breakdown.context, max: 100, color: 'var(--color-gold)' },
    { label: 'Fatigue (10%)', value: breakdown.fatigue, max: 100, color: 'var(--color-leather)' },
  ];
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-ink-muted)] w-32 shrink-0">{r.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (r.value / r.max) * 100)}%`, background: r.color }} /></div>
          <span className="text-[11px] tabular text-[var(--color-ink-muted)] w-8 text-right">{r.value.toFixed(0)}</span>
        </div>
      ))}
      {breakdown.fielding > 0 && <p className="text-[11px] text-[var(--color-gold)]">+{breakdown.fielding.toFixed(1)} fielding tiebreak</p>}
    </div>
  );
}

/** Every player x slot edge drawn as a bipartite graph — the honest version of "why this
 *  XI": you can see every option that was considered, not just the winners. */
function BipartiteGraphView({ graph, slots, pool }: { graph: GraphEdge[]; slots: RoleSlot[]; pool: SquadPlayer[] }) {
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [hoverPlayer, setHoverPlayer] = useState<string | null>(null);
  const rowH = 28;
  const height = Math.max(slots.length, pool.length) * rowH + 20;
  const leftX = 90, rightX = 310;
  const slotY = (i: number) => 14 + i * ((height - 28) / Math.max(1, slots.length - 1 || 1));
  const playerY = (i: number) => 14 + i * ((height - 28) / Math.max(1, pool.length - 1 || 1));
  const slotIndex = new Map(slots.map((s, i) => [s.id, i]));
  const playerIndex = new Map(pool.map((p, i) => [p.id, i]));

  const maxScore = Math.max(1, ...graph.map((e) => e.score));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 400 ${height}`} className="w-full" style={{ minHeight: 260, height }}>
        {graph.filter((e) => e.eligible).map((e, i) => {
          const si = slotIndex.get(e.slotId)!, pi = playerIndex.get(e.playerId)!;
          const highlighted = hoverSlot === e.slotId || hoverPlayer === e.playerId;
          const dim = (hoverSlot !== null && hoverSlot !== e.slotId) || (hoverPlayer !== null && hoverPlayer !== e.playerId);
          return (
            <line key={i} x1={leftX} y1={slotY(si)} x2={rightX} y2={playerY(pi)}
              stroke={e.selected ? 'var(--color-pitch)' : 'var(--color-ink-faint)'}
              strokeWidth={e.selected ? 2 : 1}
              opacity={dim ? 0.06 : highlighted ? 0.9 : Math.max(0.08, e.score / maxScore) * (e.selected ? 0.9 : 0.35)} />
          );
        })}
        {slots.map((s, i) => (
          <g key={s.id} onMouseEnter={() => setHoverSlot(s.id)} onMouseLeave={() => setHoverSlot(null)}>
            <circle cx={leftX} cy={slotY(i)} r={4} fill="var(--color-pitch-dark)" />
            <text x={leftX - 10} y={slotY(i) + 3} textAnchor="end" fontSize={10.5} fill="var(--color-ink)" style={{ cursor: 'default' }}>{s.label}</text>
          </g>
        ))}
        {pool.map((p, i) => (
          <g key={p.id} onMouseEnter={() => setHoverPlayer(p.id)} onMouseLeave={() => setHoverPlayer(null)}>
            <circle cx={rightX} cy={playerY(i)} r={4} fill="var(--color-leather)" />
            <text x={rightX + 10} y={playerY(i) + 3} fontSize={10.5} fill="var(--color-ink)" style={{ cursor: 'default' }}>{p.name}</text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-[var(--color-ink-faint)] mt-2">Every eligible player x role pairing, weighted by score. Solid green lines are this XI's picks — hover a role or player to trace its options.</p>
    </div>
  );
}
