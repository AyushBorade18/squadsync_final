import { useEffect, useRef, useState } from 'react';

/** Counts up to `value` once, on mount/change. Purposeful motion: it draws the eye to a
 *  number that just changed (a live score), not decoration on every render. */
export function NumberTicker({ value, decimals = 0, className = '' }: { value: number; decimals?: number; className?: string }) {
  // Guard against undefined/null/NaN reaching here from a still-loading or malformed row —
  // display.toFixed() on a non-finite value used to render this whole component blank.
  const safe = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(safe);
  const prev = useRef(safe);

  useEffect(() => {
    const from = prev.current;
    const to = safe;
    prev.current = safe;
    if (from === to) { setDisplay(to); return; }
    const duration = 500;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safe]);

  return <span className={`tabular ${className}`}>{(Number.isFinite(display) ? display : 0).toFixed(decimals)}</span>;
}
