import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { toSquadPlayer } from '../../lib/repo';
import { Card, EmptyState, Avatar, LoadingState, ErrorState } from '../../components/primitives';
import { recommendXI, DEFAULT_BASELINES } from '../../algorithms/selection';
import { recommendBattingOrder, moveInOrder, orderScore } from '../../algorithms/battingOrder';
import { getFormat } from '../../algorithms/formats';
import { ChevronUp, ChevronDown } from 'lucide-react';

export function BattingOrderPage() {
  const { team } = useAuth();
  const [order, setOrder] = useState<string[] | null>(null);
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);

  const rules = getFormat('T20');
  const squad = players && stats ? players.map((p) => toSquadPlayer(p, stats[p.id])) : [];
  const rec = useMemo(() => recommendXI(squad, rules, DEFAULT_BASELINES.T20), [squad, rules]);
  const currentOrder = order ?? recommendBattingOrder(rec.picks);
  const batSkill = Object.fromEntries(rec.picks.map((p) => [p.player.id, p.skills.bat]));
  const nameOf = (id: string) => rec.picks.find((p) => p.player.id === id)?.player.name ?? '?';
  const slotOf = (id: string) => rec.picks.find((p) => p.player.id === id)?.slot.label ?? '';

  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= currentOrder.length) return; setOrder(moveInOrder(currentOrder, i, j)); };

  if (!team) return null;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players!.length < 2) return <div><h1 className="text-xl font-bold mb-6">Batting Order</h1><EmptyState title="Not enough players" body="Add your squad first." /></div>;
  if (rec.picks.length === 0) return <EmptyState title="Not enough players" body="Add at least 11 players." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div><h1 className="text-xl font-bold">Batting Order</h1><p className="text-sm text-[var(--color-ink-muted)] mt-0.5">Drag isn't required — use the arrows to reorder, keyboard-friendly.</p></div>
        <button onClick={() => setOrder(null)} className="text-sm text-[var(--color-pitch-dark)] hover:underline">Reset to recommended</button>
      </div>
      <p className="text-xs text-[var(--color-ink-faint)] mb-4">Order strength: <span className="tabular font-semibold text-[var(--color-ink)]">{orderScore(currentOrder, batSkill).toFixed(0)}</span></p>
      <Card className="p-2">
        {currentOrder.map((id, i) => (
          <div key={id} className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--color-line)] last:border-0">
            <span className="tabular w-5 text-center text-sm font-bold text-[var(--color-ink-faint)]">{i + 1}</span>
            <Avatar seed={id} name={nameOf(id)} size={30} />
            <div className="flex-1"><p className="text-sm font-medium">{nameOf(id)}</p><p className="text-xs text-[var(--color-ink-muted)]">{slotOf(id)}</p></div>
            <div className="flex flex-col">
              <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20 hover:text-[var(--color-pitch)]"><ChevronUp size={16} /></button>
              <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === currentOrder.length - 1} className="p-0.5 disabled:opacity-20 hover:text-[var(--color-pitch)]"><ChevronDown size={16} /></button>
            </div>
          </div>
        ))}
      </Card>
      <p className="text-xs text-[var(--color-ink-faint)] mt-2">Recommendation only — set the order that fits the match plan.</p>
    </div>
  );
}
