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

    // Choose the active scene.
    // Important behavior: if there is a GAP between scene A.end and scene B.start, we keep returning scene A,
    // with sceneProgress clamped to 1. This creates a "stop"/resistance zone where the UI can settle before
    // entering the next screen.
    let activeIndex = -1;
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (t < current.start) {
        activeIndex = Math.max(0, i - 1);
        break;
      }
      if (!next || t < next.start) {
        activeIndex = i;
        break;
      }
    }
    if (activeIndex < 0) activeIndex = 0;
    const active = sorted[activeIndex];

    if (!active) {
      return {
        sceneId: 'default',
        sceneProgress: t,
        effectiveProgress: t,
      };
    }

    const denom = active.end - active.start;
    const sceneProgress =
      denom > 0 ? clamp01((Math.min(t, active.end) - active.start) / denom) : 0;

    // Map raw progress into an "effective" story progress based on scene ordering.
    // This makes each scene occupy the same effective width (1/N), while allowing gaps to act as holds.
    const sceneCount = Math.max(1, sorted.length);
    const effectiveStart = activeIndex / sceneCount;
    const effectiveEnd = (activeIndex + 1) / sceneCount;
    const effectiveProgress = effectiveStart + (effectiveEnd - effectiveStart) * sceneProgress;

    return {
      sceneId: active.id,
      sceneProgress,
      effectiveProgress,
    };
  }, [rawProgress, scenes]);
}


