import { useMemo } from 'react';
import { clamp01 } from '../ungaMapMath';

export type ScrollScene = {
  id: string;
  start: number; // raw progress start (0..1)
  end: number;   // raw progress end (0..1)
  // Future: implement "resistance" between scenes (requires a non-linear mapping + hysteresis).
  resistance?: number; // 0..1 (unused for now)
};

export function useScrollScenes(rawProgress: number, scenes: ScrollScene[]) {
  return useMemo(() => {
    const t = clamp01(rawProgress);
    const sorted = [...scenes].sort((a, b) => a.start - b.start);

    const active =
      sorted.find((s) => t >= s.start && t <= s.end) ??
      (t < sorted[0]?.start ? sorted[0] : sorted[sorted.length - 1]);

    if (!active) {
      return {
        sceneId: 'default',
        sceneProgress: t,
        effectiveProgress: t,
      };
    }

    const denom = active.end - active.start;
    const sceneProgress = denom > 0 ? clamp01((t - active.start) / denom) : 0;

    // For now, no resistance mapping: effectiveProgress == rawProgress.
    // Later: map raw scroll into a piecewise "screen" progression with friction at boundaries.
    return {
      sceneId: active.id,
      sceneProgress,
      effectiveProgress: t,
    };
  }, [rawProgress, scenes]);
}


