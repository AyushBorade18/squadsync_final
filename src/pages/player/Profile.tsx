import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats } from '../../lib/queries';
import { Card, Avatar, Stat, SectionLabel, EmptyState, LoadingState, ErrorState } from '../../components/primitives';

export function PlayerProfile() {
  const { profile, team } = useAuth();
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  if (!team) return <EmptyState title="Join a team first" body="Your profile fills in once you're on a squad." />;
  if (lp || ls) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;

  const me = players!.find((p) => p.profileId === profile?.id);
  if (!me) return <EmptyState title="You're not on the roster yet" body="Ask your coach to add you, or join from the Dashboard." />;
  const s = stats![me.id];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Avatar seed={me.photoSeed} name={me.name} size={64} />
        <div>
          <h1 className="text-xl font-bold">{me.name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)] capitalize">{me.playerRole.replace('_', '-')} · {me.battingStyle.replace('_', '-')}{me.bowlingStyle ? ` · ${me.bowlingStyle}` : ''}</p>
        </div>
      </div>
      <Card className="p-5">
        <SectionLabel>Career statistics</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Matches" value={s.matches} />
          <Stat label="Runs" value={s.runs} tone="pitch" />
          <Stat label="Average" value={s.dismissals ? (s.runs / s.dismissals).toFixed(1) : '—'} />
          <Stat label="Strike rate" value={s.ballsFaced ? ((s.runs / s.ballsFaced) * 100).toFixed(1) : '—'} />
          {me.bowlingStyle && <><Stat label="Wickets" value={s.wickets} tone="leather" /><Stat label="Economy" value={s.ballsBowled ? (s.runsConceded / (s.ballsBowled / 6)).toFixed(2) : '—'} /></>}
        </div>
      </Card>
    </div>
  );
}
