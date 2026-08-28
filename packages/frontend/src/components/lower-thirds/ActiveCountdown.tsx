import { TEST_ID_LOWER_THIRD_COUNTDOWN } from "../../constants/testIds";
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface ActiveCountdownProps {
  /** ISO timestamp when auto-dismiss will fire */
  autoDismissAt: string;
}

export function ActiveCountdown({ autoDismissAt }: ActiveCountdownProps): ReactNode {
  const startTime = useRef(Date.now());
  const targetTime = useRef(new Date(autoDismissAt).getTime());
  const totalDuration = useRef(targetTime.current - startTime.current);
  const [remaining, setRemaining] = useState(() => Math.max(0, targetTime.current - Date.now()));

  useEffect(() => {
    startTime.current = Date.now();
    targetTime.current = new Date(autoDismissAt).getTime();
    totalDuration.current = targetTime.current - startTime.current;

    const update = (): void => setRemaining(Math.max(0, targetTime.current - Date.now()));
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [autoDismissAt]);

  // Cap at totalDuration to prevent clock skew between backend/frontend from showing +1 second
  const rawSeconds = Math.ceil(remaining / 1000);
  const maxSeconds = totalDuration.current > 0 ? Math.round(totalDuration.current / 1000) : rawSeconds;
  const seconds = Math.min(rawSeconds, maxSeconds);
  const progress = totalDuration.current > 0 ? remaining / totalDuration.current : 0;

  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="lt-countdown-indicator" data-testid={TEST_ID_LOWER_THIRD_COUNTDOWN} aria-label={`Auto-dismiss in ${seconds} seconds`}>
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="2" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="var(--color-warning)"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
          style={{ transition: "stroke-dashoffset 100ms linear" }}
        />
      </svg>
      <span className="lt-countdown-text">{seconds}s</span>
    </div>
  );
}
