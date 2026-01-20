import { useEffect, useState } from 'react';
import type { AlignmentMap, PowerBloc } from '../ungaMapTypes';

/** Compact format from precomputed JSON (shortened keys to save space) */
type CompactAlignment = {
  b: PowerBloc;  // bloc
  v: number;     // value (distance to closest bloc)
  s: number;     // strength (0-1)
  m: Partial<Record<PowerBloc, number | null>>;  // metrics
};

type PrecomputedData = Record<string, CompactAlignment>;

/** Expand compact format to full AlignmentMap */
function expandPrecomputed(data: PrecomputedData): AlignmentMap {
  const map: AlignmentMap = {};
  for (const [countryKey, compact] of Object.entries(data)) {
    map[countryKey] = {
      bloc: compact.b,
      value: compact.v,
      strength: compact.s,
      metrics: compact.m,
    };
  }
  return map;
}

export function useUngAAlignment() {
  const [alignmentMap, setAlignmentMap] = useState<AlignmentMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadAlignments = async () => {
      setError(null);
      setLoading(true);

      try {
        const response = await fetch(`${import.meta.env.BASE_URL}unga_alignment_precomputed.json`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load alignment data (${response.status})`);
        }

        const data = (await response.json()) as PrecomputedData;
        const nextMap = expandPrecomputed(data);

        if (!controller.signal.aborted) {
          setAlignmentMap(nextMap);
          setLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Kon UNGA-afstanden niet laden.');
        setLoading(false);
      }
    };

    loadAlignments();
    return () => controller.abort();
  }, []);

  return { alignmentMap, loading, error };
}


