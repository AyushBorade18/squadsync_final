import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePlayers, useTeamStats, useFieldingStats } from '../../lib/queries';
import { Card, EmptyState, Avatar, Badge, LoadingState, ErrorState } from '../../components/primitives';
import { Award } from 'lucide-react';

type Tab = 'overall' | 'batting' | 'bowling' | 'fielding';

/** Overall rating blends all three disciplines: batting points (runs, boundaries-agnostic strike
 *  contribution), bowling points (wickets weighted heavily, economy bonus) and fielding points
 *  (catches, stumpings, run-outs) — so a bowler or keeper can top the board, not only run-scorers. */
export function LeaderboardPage() {
  const { team } = useAuth();
  const [tab, setTab] = useState<Tab>('overall');
  const { data: players, isLoading: lp, error: ep } = usePlayers(team?.id);
  const { data: stats, isLoading: ls, error: es } = useTeamStats(team?.id);
  const { data: fielding, isLoading: lf } = useFieldingStats(team?.id);
  if (!team) return <EmptyState title="No team yet" body="The leaderboard fills in once your team has players and match data." />;
  if (lp || ls || lf) return <LoadingState />;
  if (ep || es) return <ErrorState message={(ep || es)!.message} />;
  if (players!.length === 0) return <div><h1 className="text-xl font-bold mb-6">Leaderboard</h1><EmptyState title="No players yet" body="Add players to your squad to see rankings." /></div>;

  const rows = players!.map((p) => {
    const s = stats![p.id];
    const f = fielding?.[p.id] ?? { catches: 0, runOuts: 0, stumpings: 0 };
    const fieldingActs = f.catches + f.runOuts + f.stumpings;
    const overs = s.ballsBowled / 6;
    const econ = overs > 0 ? s.runsConceded / overs : null;
    const sr = s.ballsFaced ? (s.runs / s.ballsFaced) * 100 : 0;
    const battingPts = s.runs + Math.max(0, sr - 100) * 0.1 * Math.min(s.battingInnings, 10);
    const bowlingPts = s.wickets * 25 + (econ !== null && s.ballsBowled >= 6 ? Math.max(0, 8 - econ) * overs * 1.5 : 0);
    const fieldingPts = f.catches * 10 + f.stumpings * 12 + f.runOuts * 12;
    return { p, s, f, fieldingActs, econ, battingPts, bowlingPts, fieldingPts, total: battingPts + bowlingPts + fieldingPts };
  });
  const sorted = [...rows].sort((a, b) =>
    tab === 'batting' ? b.s.runs - a.s.runs :
    tab === 'bowling' ? b.s.wickets - a.s.wickets || (a.econ ?? 99) - (b.econ ?? 99) :
    tab === 'fielding' ? b.fieldingActs - a.fieldingActs :
    b.total - a.total);
  const tabs: { id: Tab; label: string }[] = [{ id: 'overall', label: 'Overall' }, { id: 'batting', label: 'Batting' }, { id: 'bowling', label: 'Bowling' }, { id: 'fielding', label: 'Fielding' }];

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Leaderboard</h1>
      <div className="flex gap-1 p-1 rounded-[var(--radius-sm)] bg-black/[0.04] w-fit mb-4 overflow-x-auto max-w-full">
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`px-3.5 py-1.5 rounded-[5px] text-sm font-medium ${tab === t.id ? 'bg-[var(--color-pitch)] text-white' : 'text-[var(--color-ink-muted)]'}`}>{t.label}</button>)}
      </div>
      <Card>
        <div className="divide-y divide-[var(--color-line)]">
          {sorted.map(({ p, s, f, econ, battingPts, bowlingPts, fieldingPts, total }, i) => (
            <div key={p.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
              <span className={`w-6 text-center font-bold tabular ${i === 0 ? 'text-[var(--color-gold)]' : 'text-[var(--color-ink-faint)]'}`}>{i + 1}</span>
              <Avatar seed={p.photoSeed} name={p.name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.name}</p>
                {i === 0 && total > 0 && <Badge tone="gold"><Award size={11} className="mr-1 inline" />{tab === 'overall' ? 'Top performer' : `Top ${tab}`}</Badge>}
                {tab === 'overall' && <p className="text-[11px] text-[var(--color-ink-faint)] tabular mt-0.5">Bat {battingPts.toFixed(0)} · Bowl {bowlingPts.toFixed(0)} · Field {fieldingPts.toFixed(0)}</p>}
              </div>
              <div className="text-right shrink-0">
                {tab === 'overall' && <p className="tabular font-semibold text-sm">{total.toFixed(0)} pts</p>}
                {tab === 'batting' && <><p className="tabular font-semibold text-sm">{s.runs} runs</p><p className="text-xs text-[var(--color-ink-muted)] tabular">SR {s.ballsFaced ? ((s.runs / s.ballsFaced) * 100).toFixed(0) : '—'}</p></>}
                {tab === 'bowling' && <><p className="tabular font-semibold text-sm">{s.wickets} wkts</p><p className="text-xs text-[var(--color-ink-muted)] tabular">Econ {econ !== null ? econ.toFixed(2) : '—'}</p></>}
                {tab === 'fielding' && <><p className="tabular font-semibold text-sm">{f.catches + f.runOuts + f.stumpings} dismissals</p><p className="text-xs text-[var(--color-ink-muted)] tabular">{f.catches}c · {f.stumpings}st · {f.runOuts}ro</p></>}
                {tab === 'overall' && <p className="text-xs text-[var(--color-ink-muted)] tabular">{s.runs}r · {s.wickets}w · {f.catches + f.runOuts + f.stumpings}f</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-[var(--color-ink-faint)] mt-3">Overall = batting + bowling + fielding points. Fielding credit comes from "caught / run out / stumped by" recorded during live scoring.</p>
    </div>
  );
}
