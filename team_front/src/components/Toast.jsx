import { useEffect } from 'react';

// Toast gives a brief spoken and visible confirmation after a parcel arrives.
export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div className="toast-container">
      <div className="toast" role="status" aria-live="polite">{message}</div>
    </div>
  );
}
