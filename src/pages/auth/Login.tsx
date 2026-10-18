import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Button } from '../../components/primitives';

export function LoginPage({ role }: { role: 'player' | 'coach' }) {
  const { signUp, logIn, profile, loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && profile) return <Navigate to={profile.role === 'coach' ? '/coach' : '/player'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!name.trim() || !email.trim()) { setError('Enter your name and email.'); return; }
        const res = await signUp(name.trim(), email.trim(), password, role, teamName.trim());
        if (!res.ok) { setError(res.message ?? 'Could not create account.'); return; }
        if (res.message) { setNotice(res.message); return; } // email confirmation required
      } else {
        if (!email.trim()) { setError('Enter your email.'); return; }
        const res = await logIn(email.trim(), password);
        if (!res.ok) { setError(res.message ?? 'Could not log in.'); return; }
      }
      nav(role === 'player' ? '/player' : '/coach');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-paper)] node-field flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="h-8 w-8 rounded-[7px] bg-[var(--color-pitch)] flex items-center justify-center"><div className="h-3 w-3 rounded-full bg-[var(--color-gold)]" /></div>
          <span className="font-bold text-lg tracking-tight">SquadSync</span>
        </div>
        <div className="bg-[var(--color-surface)] hairline rounded-[var(--radius-lg)] p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-pitch)] mb-1">{role === 'player' ? 'Player' : 'Coach / Captain'}</p>
          <h1 className="text-xl font-bold mb-6">{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="text-xs font-medium text-[var(--color-ink-muted)]">Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-[var(--radius-sm)] hairline px-3 py-2.5 text-sm bg-[var(--color-paper)]" placeholder="Rohan Sharma" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-[var(--color-ink-muted)]">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-[var(--radius-sm)] hairline px-3 py-2.5 text-sm bg-[var(--color-paper)]" placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-ink-muted)]">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-[var(--radius-sm)] hairline px-3 py-2.5 text-sm bg-[var(--color-paper)]" placeholder="At least 6 characters" />
            </div>
            {mode === 'signup' && role === 'coach' && (
              <div>
                <label className="text-xs font-medium text-[var(--color-ink-muted)]">Team name</label>
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="mt-1 w-full rounded-[var(--radius-sm)] hairline px-3 py-2.5 text-sm bg-[var(--color-paper)]" placeholder="Riverside Cricket Club" />
              </div>
            )}
            {error && <p className="text-sm text-[var(--color-leather)]">{error}</p>}
            {notice && <p className="text-sm text-[var(--color-pitch-dark)]">{notice}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</Button>
          </form>
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice(''); }} className="mt-4 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-pitch)] w-full text-center">
            {mode === 'login' ? "New here? Create an account" : 'Already have an account? Log in'}
          </button>
        </div>
        <p className="text-center text-xs text-[var(--color-ink-faint)] mt-5">
          {role === 'player' ? 'Coach or captain?' : 'Playing on a team?'}{' '}
          <a href={role === 'player' ? '/coach/login' : '/player/login'} className="underline">Switch login</a>
        </p>
      </div>
    </div>
  );
}
