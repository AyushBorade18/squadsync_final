import { Link } from 'react-router-dom';
import { Shield, User } from 'lucide-react';

export function Landing() {
  return (
    <div className="min-h-screen bg-[var(--color-paper)] node-field flex flex-col items-center justify-center px-4 text-center">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-9 w-9 rounded-[8px] bg-[var(--color-pitch)] flex items-center justify-center"><div className="h-3.5 w-3.5 rounded-full bg-[var(--color-gold)]" /></div>
        <span className="font-bold text-2xl tracking-tight">SquadSync</span>
      </div>
      <p className="text-[var(--color-ink-muted)] mb-10">Smarter cricket. Better decisions.</p>
      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-[520px]">
        <Link to="/player/login" className="bg-[var(--color-surface)] hairline rounded-[var(--radius-lg)] p-6 text-left hover:border-[var(--color-pitch)] transition-colors">
          <User className="text-[var(--color-pitch)] mb-3" size={22} />
          <p className="font-semibold">I'm a Player</p>
          <p className="text-sm text-[var(--color-ink-muted)] mt-1">Track your performance, matches and form.</p>
        </Link>
        <Link to="/coach/login" className="bg-[var(--color-surface)] hairline rounded-[var(--radius-lg)] p-6 text-left hover:border-[var(--color-pitch)] transition-colors">
          <Shield className="text-[var(--color-pitch)] mb-3" size={22} />
          <p className="font-semibold">I'm a Coach / Captain</p>
          <p className="text-sm text-[var(--color-ink-muted)] mt-1">Manage your squad, selection and strategy.</p>
        </Link>
      </div>
    </div>
  );
}
