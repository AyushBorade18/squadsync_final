import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { toSquadPlayer } from '../../lib/repo';
import { Card, EmptyState, SectionLabel, Stat, Badge, LoadingState, ErrorState } from '../../components/primitives';
import { recommendXI, DEFAULT_BASELINES } from '../../algorithms/selection';
import { getFormat, type FormatId } from '../../algorithms/formats';

export function WhatIfSimulatorPage() {
  const { team } = useAuth();
  const [format, setFormat] = useState<FormatId>('T20');
  const [out, setOut] = useState<Set<string>>(new Set());
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);

  const rules = getFormat(format === 'CUSTOM' ? 'T20' : format);
  const baseline = useMemo(() => (!players || !stats ? null : recommendXI(players.map((p) => toSquadPlayer(p, stats[p.id])), rules, DEFAULT_BASELINES[format])), [players, stats, rules, format]);
  const simulated = useMemo(() => (!players || !stats ? null : recommendXI(players.map((p) => toSquadPlayer(p, stats[p.id], !out.has(p.id))), rules, DEFAULT_BASELINES[format])), [players, stats, rules, format, out]);

  const toggle = (id: string) => setOut((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!team) return null;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players!.length < 2) return <div><h1 className="text-xl font-bold mb-6">What-If Simulator</h1><EmptyState title="Not enough players" body="Add your squad first." /></div>;
  if (!baseline || !simulated) return <LoadingState />;

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="text-xl font-bold">What-If Simulator</h1>
        <select value={format} onChange={(e) => setFormat(e.target.value as FormatId)} className="input w-auto">{(['T10', 'T20', 'ODI'] as const).map((f) => <option key={f} value={f}>{getFormat(f).name}</option>)}</select>
      </div>
      <Badge tone="gold">Simulation — nothing here is saved</Badge>

      <div className="mt-4 flex flex-wrap gap-2">
        {players!.map((p) => (
          <button key={p.id} onClick={() => toggle(p.id)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${out.has(p.id) ? 'bg-[var(--color-leather-soft)] text-[var(--color-leather)] border-transparent line-through' : 'hairline hover:border-[var(--color-line-strong)]'}`}>{p.name}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <Card className="p-5">
          <SectionLabel>Actual recommended XI</SectionLabel>
          <Stat label="Selection Score" value={baseline.selectionScore.toFixed(0)} tone="pitch" />
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm"><Stat label="Coverage" value={`${(baseline.coverage * 100).toFixed(0)}%`} /><Stat label="Balance" value={`${(baseline.balance * 100).toFixed(0)}%`} /></div>
        </Card>
        <Card className="p-5 border-[var(--color-gold)]">
          <SectionLabel>Simulated XI</SectionLabel>
          <Stat label="Selection Score" value={simulated.selectionScore.toFixed(0)} tone={simulated.selectionScore >= baseline.selectionScore ? 'pitch' : 'leather'} />
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm"><Stat label="Coverage" value={`${(simulated.coverage * 100).toFixed(0)}%`} /><Stat label="Balance" value={`${(simulated.balance * 100).toFixed(0)}%`} /></div>
          <p className="text-xs text-[var(--color-ink-muted)] mt-3">{simulated.selectionScore >= baseline.selectionScore ? 'Holds up about as well as the real XI.' : `${(baseline.selectionScore - simulated.selectionScore).toFixed(0)} points weaker than the real XI.`}</p>
        </Card>
      </div>

      {simulated.violations.length > 0 && (
        <Card className="p-5 mt-4"><SectionLabel>New constraint warnings in this scenario</SectionLabel><ul className="text-sm space-y-1">{simulated.violations.map((v, i) => <li key={i}>• {v}</li>)}</ul></Card>
      )}
    </div>
  );
}
