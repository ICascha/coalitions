import { useEffect, useRef, useState } from 'react';

export function useCoalitionLoop(options: {
  enabled: boolean;
  coalitionCount: number;
  startDelayMs: number;
  cycleMs: number;
}) {
  const { enabled, coalitionCount, startDelayMs, cycleMs } = options;
  const delayTimeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setActiveIndex(0);
      setLoopEnabled(false);
      if (delayTimeoutRef.current !== null) {
        window.clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    delayTimeoutRef.current = window.setTimeout(() => {
      setLoopEnabled(true);
      setActiveIndex(0);
      intervalRef.current = window.setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % Math.max(1, coalitionCount));
      }, cycleMs);
    }, startDelayMs);

    return () => {
      if (delayTimeoutRef.current !== null) {
        window.clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setLoopEnabled(false);
    };
  }, [enabled, coalitionCount, startDelayMs, cycleMs]);

  return { activeIndex, loopEnabled };
}



