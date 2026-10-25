import { useEffect, useState } from 'react';

// Opening shows a short, skippable welcome animation once during each visit.
export function Opening({ onComplete }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), 1150);
    const onKey = () => setLeaving(true);
    window.addEventListener('keydown', onKey, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(onComplete, 450);
    return () => window.clearTimeout(timer);
  }, [leaving, onComplete]);

  return (
    <div
      className={`opener${leaving ? ' opener--leaving' : ''}`}
      onClick={() => setLeaving(true)}
      role="button"
      tabIndex={0}
      aria-label="Skip welcome animation"
    >
      <span className="opener-box" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <path className="box-flap box-flap--left" d="M8 21 30 8l4 14-22 13z" />
          <path className="box-flap box-flap--right" d="m34 22 2-14 20 13-20 14z" />
          <path d="m10 25 22 12 22-12v28L32 62 10 53z" />
          <path d="M32 37v25M10 25l22 12 22-12" />
        </svg>
      </span>
      <span className="opener-name">Smart Warehouse</span>
      <span className="opener-hint">Click or press any key to skip</span>
    </div>
  );
}
