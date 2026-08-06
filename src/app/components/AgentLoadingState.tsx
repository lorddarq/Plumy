import { useEffect, useState } from 'react';

const CHEVRON_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const ORBIT_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const position = ORBIT_ORDER.indexOf(index);
  return position === -1 ? null : position * 110;
});

const PATTERNS = {
  Drive: { delays: CHEVRON_DELAYS, duration: 650, round: false },
  Dots: { delays: CHEVRON_DELAYS, duration: 650, round: true },
  Orbit: { delays: ORBIT_DELAYS, duration: 950, round: false },
} as const;

function useElapsed() {
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTicks(value => value + 1), 100);
    return () => window.clearInterval(timer);
  }, []);

  const totalSeconds = ticks / 10;
  return totalSeconds < 60
    ? `${totalSeconds.toFixed(1)}s`
    : `${Math.floor(totalSeconds / 60)}m ${(totalSeconds % 60).toFixed(1)}s`;
}

export function AgentLoadingState({ label = 'Working', variant = 'Drive' }: { label?: string; variant?: keyof typeof PATTERNS }) {
  const elapsed = useElapsed();
  const pattern = PATTERNS[variant] || PATTERNS.Drive;

  return (
    <div className="flex w-fit items-center gap-2.5" role="status" aria-live="polite">
      <span className="agent-loading-grid" aria-hidden="true">
        {pattern.delays.map((delay, index) => (
          <span
            key={index}
            className={`agent-loading-cell${pattern.round ? ' is-round' : ''}`}
            style={{
              opacity: delay === null ? 0.07 : 0.15,
              animation: delay === null ? 'none' : `agent-loading-pixel ${pattern.duration}ms ease-in-out ${delay}ms infinite`,
            }}
          />
        ))}
      </span>
      <span className="agent-loading-label">{label}</span>
      <span className="font-mono text-[12px] tabular-nums text-slate-400">{elapsed}</span>
    </div>
  );
}
