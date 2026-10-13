import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats, useAddPlayer } from '../../lib/queries';
import { PlayerCard } from '../../components/PlayerCard';
import { EmptyState, Button, LoadingState, ErrorState } from '../../components/primitives';
import type { PlayerRole, BattingStyle } from '../../types/domain';
import type { BowlingStyle } from '../../algorithms/selection';
import { Plus, X } from 'lucide-react';

export function PlayersPage() {
  const { team } = useAuth();
  const nav = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  if (!team) return null;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Players</h1>
        <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add player</Button>
      </div>
      {players!.length === 0 ? <EmptyState title="No players yet" body="Add your squad to unlock selection, analytics and match tracking." action={<Button onClick={() => setShowAdd(true)}><Plus size={16} />Add your first player</Button>} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {players!.map((p) => <PlayerCard key={p.id} player={p} stats={stats![p.id]} onClick={() => nav(`/coach/players/${p.id}`)} />)}
        </div>
      )}
      {showAdd && <AddPlayerModal teamId={team.id} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddPlayerModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const addPlayer = useAddPlayer(teamId);
  const [name, setName] = useState('');
  const [role, setRole] = useState<PlayerRole>('batter');
  const [battingStyle, setBattingStyle] = useState<BattingStyle>('right_hand');
  const [bowlingStyle, setBowlingStyle] = useState<BowlingStyle>(null);
  const [isKeeper, setIsKeeper] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setError('');
    try {
      await addPlayer.mutateAsync({ profileId: null, name: name.trim(), teamId, playerRole: role, battingStyle, bowlingStyle: role === 'batter' || role === 'wicketkeeper' ? null : bowlingStyle, isKeeper: isKeeper || role === 'wicketkeeper', jerseyNumber: null });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add player.'); }
  };

  return (
    <div className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-lg">Add player</h2><button onClick={onClose}><X size={18} /></button></div>
        <div className="space-y-3.5">
          <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" placeholder="Player name" /></div>
          <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as PlayerRole)} className="input mt-1">
              <option value="batter">Batter</option><option value="bowler">Bowler</option><option value="all_rounder">All-rounder</option><option value="wicketkeeper">Wicketkeeper</option>
            </select>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">Batting style</label>
            <select value={battingStyle} onChange={(e) => setBattingStyle(e.target.value as BattingStyle)} className="input mt-1"><option value="right_hand">Right-hand</option><option value="left_hand">Left-hand</option></select>
          </div>
          {(role === 'bowler' || role === 'all_rounder') && (
            <div><label className="text-xs font-medium text-[var(--color-ink-muted)]">Bowling style</label>
              <select value={bowlingStyle ?? ''} onChange={(e) => setBowlingStyle((e.target.value || null) as BowlingStyle)} className="input mt-1"><option value="">None</option><option value="pace">Pace</option><option value="spin">Spin</option></select>
            </div>
          )}
          {role !== 'wicketkeeper' && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isKeeper} onChange={(e) => setIsKeeper(e.target.checked)} /> Also keeps wicket</label>
          )}
          {error && <p className="text-sm text-[var(--color-leather)]">{error}</p>}
          <Button className="w-full" onClick={submit} disabled={addPlayer.isPending}>{addPlayer.isPending ? 'Adding…' : 'Add to squad'}</Button>
        </div>
      </div>
    </div>
  );
}
