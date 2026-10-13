import { useRef, useState } from 'react';
import { Avatar, Badge } from './primitives';
import type { Player } from '../types/domain';
import type { PlayerStats } from '../algorithms/selection';

const roleLabel: Record<Player['playerRole'], string> = { batter: 'Batter', bowler: 'Bowler', all_rounder: 'All-rounder', wicketkeeper: 'Wicketkeeper' };

/** Subtle 3D tilt on hover — a real depth cue for a card the person is about to open,
 *  not decoration on every card on the page. */
export function PlayerCard({ player, stats, onClick, selected }: { player: Player; stats: PlayerStats; onClick?: () => void; selected?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const avg = stats.dismissals > 0 ? (stats.runs / stats.dismissals).toFixed(1) : stats.runs > 0 ? stats.runs.toFixed(0) : '—';
  const wkts = stats.wickets;

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        setTilt({ x: py * -6, y: px * 6 });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: 'transform 120ms ease-out' }}
      className={`text-left w-full bg-[var(--color-surface)] rounded-[var(--radius-md)] p-4 hairline hover:border-[var(--color-line-strong)] hover:shadow-[0_8px_24px_-12px_rgba(20,24,26,0.18)] ${selected ? 'border-[var(--color-pitch)] ring-1 ring-[var(--color-pitch)]' : ''}`}
    >
      <div className="flex items-start justify-between">
        <Avatar seed={player.photoSeed} name={player.name} size={44} />
        <div className="flex flex-col items-end gap-1">
          {player.isKeeper && <Badge tone="gold">WK</Badge>}
          {player.injuryStatus !== 'available' && <Badge tone="leather">{player.injuryStatus === 'injured' ? 'Injured' : 'Unavailable'}</Badge>}
        </div>
      </div>
      <p className="mt-3 font-semibold text-[15px] leading-tight">{player.name}</p>
      <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">{roleLabel[player.playerRole]}{player.bowlingStyle ? ` · ${player.bowlingStyle}` : ''}</p>
      <div className="mt-3 flex gap-4 text-sm">
        <div><span className="tabular font-semibold">{avg}</span><span className="text-[var(--color-ink-faint)] text-xs ml-1">avg</span></div>
        {player.bowlingStyle && <div><span className="tabular font-semibold">{wkts}</span><span className="text-[var(--color-ink-faint)] text-xs ml-1">wkts</span></div>}
      </div>
      {/* Roster attributes set on the player's profile page — shown here so an edit is
         visibly reflected on this grid instead of only existing on the profile. */}
      {(player.battingVsPace !== 'average' || player.battingVsSpin !== 'average' || player.fieldingTier !== 'average') && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {player.battingVsPace !== 'average' && <Badge tone={player.battingVsPace === 'strong' ? 'pitch' : 'leather'}>vs pace: {player.battingVsPace}</Badge>}
          {player.battingVsSpin !== 'average' && <Badge tone={player.battingVsSpin === 'strong' ? 'pitch' : 'leather'}>vs spin: {player.battingVsSpin}</Badge>}
          {player.fieldingTier !== 'average' && <Badge tone={player.fieldingTier === 'excellent' ? 'gold' : 'neutral'}>fielding: {player.fieldingTier}</Badge>}
        </div>
      )}
    </button>
  );
}
