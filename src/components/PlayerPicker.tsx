import { useState } from 'react';
import { Card, Button, Avatar } from './primitives';
import type { Player } from '../types/domain';

/** "Who's playing?" step shown before Batting Order / Bowling Planner build anything — the
 *  coach explicitly confirms the players for this match instead of the page silently reusing
 *  whatever XI was last computed. */
export function PlayerPicker({ title, subtitle, players, min, max, initial, confirmLabel, onConfirm, detail }: {
  title: string; subtitle: string; players: Player[]; min: number; max: number; initial?: string[];
  confirmLabel: string; onConfirm: (ids: string[]) => void; detail?: (p: Player) => string;
}) {
  const [selected, setSelected] = useState<string[]>(initial ?? []);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  const ok = selected.length >= min && selected.length <= max;
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-1">{title}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mb-5">{subtitle}</p>
      <Card className="p-3">
        <div className="max-h-[55vh] overflow-y-auto">
          {players.map((p) => (
            <label key={p.id} className="flex items-center gap-3 px-2 py-2.5 border-b border-[var(--color-line)] last:border-0 cursor-pointer">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4" />
              <Avatar seed={p.id} name={p.name} size={28} />
              <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
              <span className="text-xs text-[var(--color-ink-faint)]">{detail ? detail(p) : p.playerRole.replace('_', '-')}</span>
            </label>
          ))}
        </div>
      </Card>
      <div className="flex items-center justify-between mt-3 gap-3">
        <p className="text-xs text-[var(--color-ink-muted)] tabular">{selected.length} selected{min === max ? ` of ${max}` : ` (pick ${min}–${max})`}</p>
        <Button onClick={() => onConfirm(selected)} disabled={!ok}>{confirmLabel}</Button>
      </div>
    </div>
  );
}
