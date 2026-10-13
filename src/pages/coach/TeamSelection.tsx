import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { toSquadPlayer } from '../../lib/repo';
import { Card, EmptyState, Badge, SectionLabel, Stat, LoadingState, ErrorState } from '../../components/primitives';
import { PlayerCard } from '../../components/PlayerCard';
import { recommendXI, DEFAULT_BASELINES } from '../../algorithms/selection';
import { getFormat, type FormatId } from '../../algorithms/formats';

export function TeamSelectionPage() {
  const { team } = useAuth();
  const [format, setFormat] = useState<FormatId>('T20');
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);

  const rules = getFormat(format === 'CUSTOM' ? 'T20' : format);
  const squad = players && stats ? players.map((p) => toSquadPlayer(p, stats[p.id], !unavailable.has(p.id))) : [];
  const rec = useMemo(() => recommendXI(squad, rules, DEFAULT_BASELINES[format]), [squad, rules, format]);

  if (!team) return null;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players!.length < 2) return <div><h1 className="text-xl font-bold mb-6">Team Selection</h1><EmptyState title="Not enough players" body="Add at least 11 players to your squad to run selection." /></div>;

  const toggle = (id: string) => setUnavailable((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="text-xl font-bold">Team Selection</h1><p className="text-sm text-[var(--color-ink-muted)] mt-0.5">15-player squad → role coverage → recommended XI</p></div>
        <select value={format} onChange={(e) => setFormat(e.target.value as FormatId)} className="input w-auto">
          {(['T10', 'T20', 'ODI', 'TEST'] as const).map((f) => <option key={f} value={f}>{getFormat(f).name}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-4"><Stat label="Selection Score" value={rec.selectionScore.toFixed(0)} tone="pitch" /></Card>
        <Card className="p-4"><Stat label="Coverage" value={`${(rec.coverage * 100).toFixed(0)}%`} /></Card>
        <Card className="p-4"><Stat label="Balance" value={`${(rec.balance * 100).toFixed(0)}%`} /></Card>
      </div>

      {rec.violations.length > 0 && (
        <Card className="p-4 mb-6 bg-[var(--color-leather-soft)] border-0">
          <SectionLabel>Things to check</SectionLabel>
          <ul className="text-sm space-y-1 text-[var(--color-leather)]">{rec.violations.map((v, i) => <li key={i}>• {v}</li>)}</ul>
        </Card>
      )}

      {rec.picks.length > 0 && (
        <Card className="p-5 mb-6">
          <SectionLabel>Recommended XI</SectionLabel>
          <div className="space-y-1.5">
            {rec.picks.map((pk) => (
              <div key={pk.slot.id} className="flex items-center justify-between py-2 border-b border-[var(--color-line)] last:border-0">
                <div className="flex items-center gap-3">
                  <Badge>{pk.slot.label}</Badge>
                  <span className="text-sm font-medium">{pk.player.name}</span>
                  {pk.confidence < 1 && <span className="text-xs text-[var(--color-gold)]">low data</span>}
                </div>
                <div className="w-28"><div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full bg-[var(--color-pitch)]" style={{ width: `${Math.min(100, pk.fit)}%` }} /></div></div>
              </div>
            ))}
          </div>
          {rec.alternatives.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--color-line)]">
              <SectionLabel>Alternatives worth considering</SectionLabel>
              <ul className="text-sm space-y-1 text-[var(--color-ink-muted)]">
                {rec.alternatives.map((a, i) => <li key={i}>Swap <span className="text-[var(--color-ink)] font-medium">{a.out}</span> for <span className="text-[var(--color-ink)] font-medium">{a.in}</span> ({a.fitChange > 0 ? '+' : ''}{a.fitChange.toFixed(0)} fit)</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      <SectionLabel>Squad — click to leave out for this match only (injured/unavailable players from Players are already excluded)</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {players!.map((p) => (
          <div key={p.id} className={unavailable.has(p.id) ? 'opacity-40' : ''}>
            <PlayerCard player={p} stats={stats![p.id]} onClick={() => toggle(p.id)} selected={!unavailable.has(p.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
