import { type ReactNode, type ButtonHTMLAttributes, useRef } from 'react';
import { X } from 'lucide-react';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-[var(--color-pitch)] text-white hover:bg-[var(--color-pitch-dark)]',
    secondary: 'bg-[var(--color-surface)] text-[var(--color-ink)] hairline hover:border-[var(--color-line-strong)]',
    ghost: 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-black/[0.03]',
    danger: 'bg-[var(--color-leather)] text-white hover:opacity-90',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-[var(--color-surface)] hairline rounded-[var(--radius-md)] ${className}`}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-semibold text-[var(--color-ink-muted)] mb-3">{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'pitch' | 'gold' | 'leather' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-black/[0.05] text-[var(--color-ink-muted)]',
    pitch: 'bg-[var(--color-pitch-soft)] text-[var(--color-pitch-dark)]',
    gold: 'bg-[var(--color-gold-soft)] text-[var(--color-gold)]',
    leather: 'bg-[var(--color-leather-soft)] text-[var(--color-leather)]',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-leather)] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-leather)]" />
      </span>
      <span className="text-xs font-bold tracking-wide text-[var(--color-leather)]">LIVE</span>
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="node-field hairline rounded-[var(--radius-md)] px-8 py-14 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1.5 text-sm text-[var(--color-ink-muted)] max-w-sm mx-auto">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** `seed` only ever picks the background color (so it can be an id, stable across renders).
 *  `name`, when given, is what the initials are drawn from — never the seed/id. */
export function Avatar({ seed, name, size = 40 }: { seed: string; name?: string; size?: number }) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const initials = name ? initialsOf(name) : seed.slice(0, 2).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 32% 34%)` }}
    >{initials}</div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-[var(--color-ink-muted)] py-10 justify-center">
      <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-pitch)] animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="hairline rounded-[var(--radius-md)] px-6 py-8 text-center bg-[var(--color-leather-soft)]">
      <p className="text-sm font-semibold text-[var(--color-leather)]">Something went wrong</p>
      <p className="text-sm text-[var(--color-leather)]/80 mt-1">{message}</p>
    </div>
  );
}

export function Stat({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: 'neutral' | 'pitch' | 'leather' | 'gold' }) {
  const colors: Record<string, string> = { neutral: 'text-[var(--color-ink)]', pitch: 'text-[var(--color-pitch)]', leather: 'text-[var(--color-leather)]', gold: 'text-[var(--color-gold)]' };
  return (
    <div>
      <div className={`tabular text-2xl font-bold ${colors[tone]}`}>{value}</div>
      <div className="text-xs text-[var(--color-ink-muted)] mt-0.5">{label}</div>
    </div>
  );
}

/** Shared modal shell — one definition so every form in the app gets the same, reliable
 *  behavior instead of each page hand-rolling its own backdrop. Two things this fixes that
 *  ad-hoc backdrops kept getting wrong:
 *   1. A tall form (lots of fields) is capped at 85vh and scrolls INSIDE the panel, so every
 *      field stays reachable on a small phone screen instead of the panel overflowing it.
 *   2. The backdrop only closes on a genuine click that both starts and ends on the backdrop
 *      itself (tracked via mousedown, not just the click target). A plain onClick-based
 *      backdrop closes on ANY click whose target bubbles up to it — including the tail end of
 *      a drag/text-selection that started inside the form (e.g. selecting text in a venue
 *      field and releasing slightly outside it) or a scroll gesture inside the panel that ends
 *      near its edge. That's what made forms feel like they were "closing on their own" while
 *      someone was still filling them in. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const downOnBackdrop = useRef(false);
  return (
    <div
      className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center p-3 sm:p-4"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); downOnBackdrop.current = false; }}
    >
      <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
