import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid, User, TrendingUp, Users, CalendarDays, Radio, BarChart3, Trophy, Award,
  Settings, Target, GitBranch, ListOrdered, Wind, Shield, FlaskConical, LogOut, Swords, Menu, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Avatar } from './primitives';

interface NavItem { to: string; label: string; icon: typeof User }

const playerNav: NavItem[] = [
  { to: '/player', label: 'Dashboard', icon: LayoutGrid },
  { to: '/player/profile', label: 'My Profile', icon: User },
  { to: '/player/performance', label: 'My Performance', icon: TrendingUp },
  { to: '/player/team', label: 'My Team', icon: Users },
  { to: '/player/matches', label: 'Matches', icon: CalendarDays },
  { to: '/player/live', label: 'Live Match', icon: Radio },
  { to: '/player/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/player/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/player/leaderboard', label: 'Leaderboard', icon: Award },
  { to: '/player/settings', label: 'Settings', icon: Settings },
];

const coachNav: NavItem[] = [
  { to: '/coach', label: 'Dashboard', icon: LayoutGrid },
  { to: '/coach/team', label: 'My Team', icon: Shield },
  { to: '/coach/players', label: 'Players', icon: Users },
  { to: '/coach/matches', label: 'Matches', icon: CalendarDays },
  { to: '/coach/live', label: 'Live Match', icon: Radio },
  { to: '/coach/selection', label: 'Team Selection', icon: Target },
  { to: '/coach/decision', label: 'Decision Engine', icon: GitBranch },
  { to: '/coach/batting-order', label: 'Batting Order', icon: ListOrdered },
  { to: '/coach/bowling-planner', label: 'Bowling Planner', icon: Wind },
  { to: '/coach/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/coach/match-requests', label: 'Match Requests', icon: Swords },
  { to: '/coach/simulator', label: 'What-If Simulator', icon: FlaskConical },
  { to: '/coach/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/coach/leaderboard', label: 'Leaderboard', icon: Award },
  { to: '/coach/settings', label: 'Settings', icon: Settings },
];

// Only the 4 most-used sections get a permanent bottom-nav slot — everything else (every
// single sidebar item still exists on mobile, just one tap further) lives behind "More".
// Live Match used to be missing from mobile entirely even though it's the single most
// time-critical screen during an actual match — it's now pinned here alongside it.
const mobilePrimary = (role: 'player' | 'coach'): NavItem[] => [
  { to: role === 'player' ? '/player' : '/coach', label: 'Home', icon: LayoutGrid },
  { to: role === 'player' ? '/player/matches' : '/coach/matches', label: 'Matches', icon: CalendarDays },
  { to: role === 'player' ? '/player/live' : '/coach/live', label: 'Live', icon: Radio },
  { to: role === 'player' ? '/player/analytics' : '/coach/analytics', label: 'Analytics', icon: BarChart3 },
];

export function Shell({ role, children }: { role: 'player' | 'coach'; children: ReactNode }) {
  const { profile, team, logOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = role === 'player' ? playerNav : coachNav;
  const primary = mobilePrimary(role);
  // Everything NOT already pinned to the bottom bar shows up in "More" — every desktop
  // sidebar tab stays reachable on mobile, none of them silently dropped.
  const moreItems = items.filter((it) => !primary.some((p) => p.to === it.to));
  const moreIsActive = moreItems.some((it) => location.pathname === it.to || (it.to !== '/player' && it.to !== '/coach' && location.pathname.startsWith(it.to + '/')));

  return (
    <div className="min-h-screen bg-[var(--color-paper)] md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="px-5 h-16 flex items-center gap-2 border-b border-[var(--color-line)]">
          <div className="h-7 w-7 rounded-[6px] bg-[var(--color-pitch)] flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-gold)]" />
          </div>
          <span className="font-bold tracking-tight text-[15px]">SquadSync</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/player' || to === '/coach'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-[var(--color-pitch-soft)] text-[var(--color-pitch-dark)]' : 'text-[var(--color-ink-muted)] hover:bg-black/[0.035] hover:text-[var(--color-ink)]'
                }`
              }
            >
              <Icon size={17} strokeWidth={2} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--color-line)] p-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <Avatar seed={profile?.avatarSeed ?? 'x'} name={profile?.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{profile?.name}</p>
              <p className="text-xs text-[var(--color-ink-muted)] truncate">{team?.name ?? (role === 'coach' ? 'No team yet' : 'Unaffiliated')}</p>
            </div>
            <button onClick={() => { logOut(); nav('/'); }} aria-label="Log out" className="p-1.5 rounded hover:bg-black/5 text-[var(--color-ink-muted)]">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 md:ml-64">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-10 bg-[var(--color-surface)]/90 backdrop-blur border-b border-[var(--color-line)] h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-[6px] bg-[var(--color-pitch)] flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-[var(--color-gold)]" /></div>
            <span className="font-bold text-sm">SquadSync</span>
          </div>
          <button onClick={() => { logOut(); nav('/'); }} aria-label="Log out"><LogOut size={18} className="text-[var(--color-ink-muted)]" /></button>
        </header>

        <main className="px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8 max-w-[1200px]">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-[var(--color-surface)] border-t border-[var(--color-line)] flex justify-around py-1.5">
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/player' || to === '/coach'} className={({ isActive }) => `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[11px] font-medium min-w-0 ${isActive ? 'text-[var(--color-pitch)]' : 'text-[var(--color-ink-faint)]'}`}>
            <Icon size={19} /> <span className="truncate max-w-[64px]">{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[11px] font-medium min-w-0 ${moreIsActive ? 'text-[var(--color-pitch)]' : 'text-[var(--color-ink-faint)]'}`}
        >
          <Menu size={19} /> More
        </button>
      </nav>

      {/* Mobile "More" drawer — every remaining sidebar section, one tap away. */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex items-end" role="dialog" aria-label="More navigation">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMoreOpen(false)} />
          <div className="relative w-full bg-[var(--color-surface)] rounded-t-[var(--radius-lg)] max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-line)] sticky top-0 bg-[var(--color-surface)]">
              <span className="font-bold text-sm">More</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="p-1.5 rounded hover:bg-black/5"><X size={18} /></button>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              {moreItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to} to={to} onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => `flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-3 text-xs font-medium text-center ${isActive ? 'bg-[var(--color-pitch-soft)] text-[var(--color-pitch-dark)]' : 'text-[var(--color-ink-muted)] hover:bg-black/[0.035]'}`}
                >
                  <Icon size={20} strokeWidth={2} /> <span className="leading-tight">{label}</span>
                </NavLink>
              ))}
            </div>
            <button onClick={() => { setMoreOpen(false); logOut(); nav('/'); }} className="w-full flex items-center gap-2 px-5 py-3.5 border-t border-[var(--color-line)] text-sm text-[var(--color-ink-muted)]">
              <LogOut size={16} /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
