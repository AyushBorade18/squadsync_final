import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { usePlayer, usePlayerStats, useUpdatePlayerAttributes } from '../../lib/queries';
import { Card, Avatar, Stat, SectionLabel, Button, EmptyState, LoadingState, ErrorState } from '../../components/primitives';
import type { InjuryStatus, MatchupTier, FieldingTier } from '../../algorithms/selection';

export function PlayerProfileCoachView() {
  const { id } = useParams();
  const { team } = useAuth();
  const { data: player, isLoading: lp, error: ep } = usePlayer(id);
  const { data: s, isLoading: ls, error: es } = usePlayerStats(id);
  const updateAttrs = useUpdatePlayerAttributes(team?.id ?? '');

  const [injuryStatus, setInjuryStatus] = useState<InjuryStatus>('available');
  const [battingVsPace, setBattingVsPace] = useState<MatchupTier>('average');
  const [battingVsSpin, setBattingVsSpin] = useState<MatchupTier>('average');
  const [fieldingTier, setFieldingTier] = useState<FieldingTier>('average');
  const [oversRecent, setOversRecent] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (player) { setInjuryStatus(player.injuryStatus); setBattingVsPace(player.battingVsPace); setBattingVsSpin(player.battingVsSpin); setFieldingTier(player.fieldingTier); setOversRecent(player.oversBowledRecentMatches); }
  }, [player]);

  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (!player) return <EmptyState title="Player not found" body="This player may have been removed." />;

  const save = async () => {
    setSaved(false);
    await updateAttrs.mutateAsync({ playerId: player.id, attrs: { injuryStatus, battingVsPace, battingVsSpin, fieldingTier, oversBowledRecentMatches: oversRecent } });
    setSaved(true);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Avatar seed={player.photoSeed} name={player.name} size={64} />
        <div>
          <h1 className="text-xl font-bold">{player.name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)] capitalize">{player.playerRole.replace('_', '-')} · {player.battingStyle.replace('_', '-')}{player.bowlingStyle ? ` · ${player.bowlingStyle}` : ''}{player.isKeeper ? ' · Keeper' : ''}</p>
        </div>
      </div>
      <Card className="p-5 mb-4">
        <SectionLabel>Statistics</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Matches" value={s!.matches} />
          <Stat label="Runs" value={s!.runs} tone="pitch" />
          <Stat label="Average" value={s!.dismissals ? (s!.runs / s!.dismissals).toFixed(1) : '—'} />
          <Stat label="Strike rate" value={s!.ballsFaced ? ((s!.runs / s!.ballsFaced) * 100).toFixed(1) : '—'} />
          {player.bowlingStyle && <><Stat label="Wickets" value={s!.wickets} tone="leather" /><Stat label="Economy" value={s!.ballsBowled ? (s!.runsConceded / (s!.ballsBowled / 6)).toFixed(2) : '—'} /></>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionLabel>Roster attributes — feed the Decision Engine's selection score</SectionLabel>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-ink-muted)]">Availability</label>
            <select className="input mt-1" value={injuryStatus} onChange={(e) => setInjuryStatus(e.target.value as InjuryStatus)}>
              <option value="available">Available</option><option value="injured">Injured</option><option value="unavailable">Unavailable</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-ink-muted)]">Fielding</label>
            <select className="input mt-1" value={fieldingTier} onChange={(e) => setFieldingTier(e.target.value as FieldingTier)}>
              <option value="average">Average</option><option value="good">Good</option><option value="excellent">Excellent</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-ink-muted)]">Batting vs pace</label>
            <select className="input mt-1" value={battingVsPace} onChange={(e) => setBattingVsPace(e.target.value as MatchupTier)}>
              <option value="weak">Weak</option><option value="average">Average</option><option value="strong">Strong</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-ink-muted)]">Batting vs spin</label>
            <select className="input mt-1" value={battingVsSpin} onChange={(e) => setBattingVsSpin(e.target.value as MatchupTier)}>
              <option value="weak">Weak</option><option value="average">Average</option><option value="strong">Strong</option>
            </select>
          </div>
          {player.bowlingStyle && (
            <div>
              <label className="text-xs font-medium text-[var(--color-ink-muted)]">Overs bowled in recent matches</label>
              <input type="number" min={0} className="input mt-1" value={oversRecent} onChange={(e) => setOversRecent(Math.max(0, Number(e.target.value)))} />
              <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">Used for the fatigue factor — higher workload lowers their bowling-slot score.</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Button onClick={save} disabled={updateAttrs.isPending}>{updateAttrs.isPending ? 'Saving…' : 'Save attributes'}</Button>
          {saved && !updateAttrs.isPending && <span className="text-sm text-[var(--color-pitch)]">Saved</span>}
        </div>
      </Card>
    </div>
  );
}
