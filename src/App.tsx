import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { Landing } from './pages/auth/Landing';
import { LoginPage } from './pages/auth/Login';

import { PlayerDashboard } from './pages/player/Dashboard';
import { PlayerProfile } from './pages/player/Profile';
import { PlayerPerformance } from './pages/player/Performance';
import { PlayerTeam } from './pages/player/TeamView';
import { MatchesPage } from './pages/shared/Matches';
import { LiveMatchPage } from './pages/shared/LiveMatch';
import { AnalyticsPage } from './pages/shared/Analytics';
import { TournamentsPage } from './pages/shared/Tournaments';
import { LeaderboardPage } from './pages/shared/Leaderboard';
import { SettingsPage } from './pages/shared/Settings';

import { CoachDashboard } from './pages/coach/Dashboard';
import { CoachTeam } from './pages/coach/Team';
import { PlayersPage } from './pages/coach/Players';
import { PlayerProfileCoachView } from './pages/coach/PlayerProfile';
import { TeamSelectionPage } from './pages/coach/TeamSelection';
import { DecisionEnginePage } from './pages/coach/DecisionEngine';
import { BattingOrderPage } from './pages/coach/BattingOrder';
import { BowlingPlannerPage } from './pages/coach/BowlingPlanner';
import { MatchRequestsPage } from './pages/coach/MatchRequests';
import { WhatIfSimulatorPage } from './pages/coach/WhatIfSimulator';

function Protected({ role, children }: { role: 'player' | 'coach'; children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile || profile.role !== role) return <Navigate to={role === 'player' ? '/player/login' : '/coach/login'} replace />;
  return <Shell role={role}>{children}</Shell>;
}

export default function App() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={qc}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/player/login" element={<LoginPage role="player" />} />
          <Route path="/coach/login" element={<LoginPage role="coach" />} />

          <Route path="/player" element={<Protected role="player"><PlayerDashboard /></Protected>} />
          <Route path="/player/profile" element={<Protected role="player"><PlayerProfile /></Protected>} />
          <Route path="/player/performance" element={<Protected role="player"><PlayerPerformance /></Protected>} />
          <Route path="/player/team" element={<Protected role="player"><PlayerTeam /></Protected>} />
          <Route path="/player/matches" element={<Protected role="player"><MatchesPage role="player" /></Protected>} />
          <Route path="/player/live" element={<Protected role="player"><LiveMatchPage role="player" /></Protected>} />
          <Route path="/player/live/:matchId" element={<Protected role="player"><LiveMatchPage role="player" /></Protected>} />
          <Route path="/player/analytics" element={<Protected role="player"><AnalyticsPage role="player" /></Protected>} />
          <Route path="/player/tournaments" element={<Protected role="player"><TournamentsPage role="player" /></Protected>} />
          <Route path="/player/leaderboard" element={<Protected role="player"><LeaderboardPage /></Protected>} />
          <Route path="/player/settings" element={<Protected role="player"><SettingsPage role="player" /></Protected>} />

          <Route path="/coach" element={<Protected role="coach"><CoachDashboard /></Protected>} />
          <Route path="/coach/team" element={<Protected role="coach"><CoachTeam /></Protected>} />
          <Route path="/coach/players" element={<Protected role="coach"><PlayersPage /></Protected>} />
          <Route path="/coach/players/:id" element={<Protected role="coach"><PlayerProfileCoachView /></Protected>} />
          <Route path="/coach/matches" element={<Protected role="coach"><MatchesPage role="coach" /></Protected>} />
          <Route path="/coach/live" element={<Protected role="coach"><LiveMatchPage role="coach" /></Protected>} />
          <Route path="/coach/live/:matchId" element={<Protected role="coach"><LiveMatchPage role="coach" /></Protected>} />
          <Route path="/coach/selection" element={<Protected role="coach"><TeamSelectionPage /></Protected>} />
          <Route path="/coach/decision" element={<Protected role="coach"><DecisionEnginePage /></Protected>} />
          <Route path="/coach/batting-order" element={<Protected role="coach"><BattingOrderPage /></Protected>} />
          <Route path="/coach/bowling-planner" element={<Protected role="coach"><BowlingPlannerPage /></Protected>} />
          <Route path="/coach/analytics" element={<Protected role="coach"><AnalyticsPage role="coach" /></Protected>} />
          <Route path="/coach/match-requests" element={<Protected role="coach"><MatchRequestsPage /></Protected>} />
          <Route path="/coach/simulator" element={<Protected role="coach"><WhatIfSimulatorPage /></Protected>} />
          <Route path="/coach/tournaments" element={<Protected role="coach"><TournamentsPage role="coach" /></Protected>} />
          <Route path="/coach/leaderboard" element={<Protected role="coach"><LeaderboardPage /></Protected>} />
          <Route path="/coach/settings" element={<Protected role="coach"><SettingsPage role="coach" /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  );
}
