import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Profile, Role, Team } from '../types/domain';

interface AuthState { profile: Profile | null; team: Team | null; loading: boolean; }
interface AuthApi extends AuthState {
  signUp(name: string, email: string, password: string, role: Role, teamName?: string): Promise<{ ok: boolean; message?: string }>;
  logIn(email: string, password: string): Promise<{ ok: boolean; message?: string }>;
  logOut(): Promise<void>;
  refresh(): Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

async function loadProfileAndTeam(userId: string): Promise<{ profile: Profile | null; team: Team | null }> {
  let { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

  // First time this session is seen after email confirmation: the profile/team weren't
  // created at signUp time (no session existed then), so provision them now from the
  // name/role/teamName we stashed in the user's metadata during signUp.
  if (!prof) {
    const { data: { user } } = await supabase.auth.getUser();
    const meta = user?.user_metadata as { name?: string; role?: Role; teamName?: string } | undefined;
    if (user && meta?.name && meta?.role) {
      const { data: created } = await supabase.from('profiles').insert({ id: user.id, name: meta.name, role: meta.role }).select().maybeSingle();
      prof = created;
      if (prof && meta.role === 'coach') {
        const short = (meta.teamName || meta.name).replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'TM';
        await supabase.from('teams').insert({ name: meta.teamName || `${meta.name}'s Team`, short_name: short, owner_profile_id: user.id, is_own_team: true });
      }
    }
  }
  if (!prof) return { profile: null, team: null };
  const profile: Profile = { id: prof.id, name: prof.name, role: prof.role, email: '', avatarSeed: prof.id };

  // Coach: the team they own. Player: the team of the roster row linked to their profile.
  const { data: owned } = await supabase.from('teams').select('*').eq('owner_profile_id', userId).maybeSingle();
  let team: Team | null = owned ? mapTeam(owned) : null;
  if (!team) {
    const { data: playerRow } = await supabase.from('players').select('team_id').eq('profile_id', userId).maybeSingle();
    if (playerRow) {
      const { data: t } = await supabase.from('teams').select('*').eq('id', playerRow.team_id).maybeSingle();
      if (t) team = mapTeam(t);
    }
  }
  return { profile, team };
}

const mapTeam = (t: any): Team => ({ id: t.id, name: t.name, shortName: t.short_name, ownerProfileId: t.owner_profile_id, isOwnTeam: t.is_own_team });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ profile: null, team: null, loading: true });

  const recompute = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setState({ profile: null, team: null, loading: false }); return; }
    const { profile, team } = await loadProfileAndTeam(session.user.id);
    setState({ profile, team, loading: false });
  };

  useEffect(() => {
    recompute();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { recompute(); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp: AuthApi['signUp'] = async (name, email, password, role, teamName) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, role, teamName: teamName ?? null } } });
    if (error) return { ok: false, message: error.message };
    if (!data.session) {
      // Email confirmation is required by this Supabase project's settings. The profile
      // and team get created automatically on first login after the user confirms.
      return { ok: true, message: 'Check your email to confirm your account, then log in.' };
    }
    if (data.user) {
      const { error: profErr } = await supabase.from('profiles').insert({ id: data.user.id, name, role });
      if (profErr) return { ok: false, message: profErr.message };
      if (role === 'coach') {
        const short = (teamName || name).replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'TM';
        const { error: teamErr } = await supabase.from('teams').insert({ name: teamName || `${name}'s Team`, short_name: short, owner_profile_id: data.user.id, is_own_team: true });
        if (teamErr) return { ok: false, message: teamErr.message };
      }
    }
    await recompute();
    return { ok: true };
  };

  const logIn: AuthApi['logIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    await recompute();
    return { ok: true };
  };

  const logOut = async () => { await supabase.auth.signOut(); setState({ profile: null, team: null, loading: false }); };

  return <Ctx.Provider value={{ ...state, signUp, logIn, logOut, refresh: recompute }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
