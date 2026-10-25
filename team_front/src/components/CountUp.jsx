import { useEffect, useRef, useState } from 'react';

// CountUp shows a value that gently counts from zero to its current number.
export function CountUp({ value, active = true, className = '' }) {
  const [count, setCount] = useState(active ? 0 : value);
  const previousValue = useRef(active ? 0 : value);
  const countRef = useRef(active ? 0 : value);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = active && !reducedMotion;

  useEffect(() => {
    if (!shouldAnimate) {
      countRef.current = value;
      previousValue.current = value;
      return undefined;
    }
    const startValue = previousValue.current;
    if (startValue === value) return undefined;
    let frame = 0;
    const start = performance.now();
    const duration = 600; // EDIT HERE: Change this to speed up or slow down count-ups.
    const update = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const nextCount = Math.round(startValue + (value - startValue) * progress);
      countRef.current = nextCount;
      setCount(nextCount);
      if (progress === 1) previousValue.current = value;
      if (progress < 1) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => {
      window.cancelAnimationFrame(frame);
      previousValue.current = countRef.current;
    };
  }, [shouldAnimate, value]);

  const displayCount = shouldAnimate ? count : value;
  const digits = String(displayCount).padStart(String(value).length, '0');
  return (
    <span className={`count-value ${className}`} aria-label={String(value)}>
      <span className="count-digits" aria-hidden="true">
        {digits.split('').map((digit, index) => (
          <span className="digit-window" key={`${index}-${digits.length}`}>
            <span className="digit-strip" style={{ transform: `translateY(-${Number(digit)}em)` }}>
              {Array.from({ length: 10 }, (_, number) => <span key={number}>{number}</span>)}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
