import { useEffect, useState } from 'react';
import type { AlignmentMap, BlocDistance, CountryDistanceRecord, OverallDistanceResponse, PowerBloc } from '../ungaMapTypes';
import { POWER_BLOC_COLORS, UNGA_API_BASE } from '../ungaMapConfig';
import { resolveCountryKey } from '../ungaMapSvgCountry';

const buildAlignmentMap = (
  countries: CountryDistanceRecord[],
  getValue: (blocRow: BlocDistance) => number | null,
  options: { preferLower: boolean }
): AlignmentMap => {
  const map: AlignmentMap = {};
  const { preferLower } = options;

  countries.forEach((countryEntry: CountryDistanceRecord) => {
    const countryKey = resolveCountryKey(countryEntry.country);
    if (!countryKey) return;

    let bestBloc: PowerBloc | null = null;
    let bestValue: number | null = null;
    const metrics: Partial<Record<PowerBloc, number | null>> = {};

    countryEntry.blocs.forEach((blocRow: BlocDistance) => {
      const bloc = blocRow.bloc.toUpperCase() as PowerBloc;
      if (POWER_BLOC_COLORS[bloc]) {
        const val = getValue(blocRow);
        metrics[bloc] = val;

        if (val !== null) {
          let isBetter = false;
          if (bestValue === null) {
            isBetter = true;
          } else {
            isBetter = preferLower ? val < bestValue : val > bestValue;
          }

          if (isBetter) {
            bestValue = val;
            bestBloc = bloc;
          }
        }
      }
    });

    if (bestBloc && bestValue !== null) {
      let strength = 0;
      // Assuming distances roughly 0-4
      strength = preferLower ? Math.max(0, 1 - bestValue / 4) : Math.min(1, bestValue);

      map[countryKey] = {
        bloc: bestBloc,
        strength,
        value: bestValue,
        metrics,
      };
    }
  });

  return map;
};

export function useUngAAlignment() {
  const [alignmentMap, setAlignmentMap] = useState<AlignmentMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchAlignments = async () => {
      setError(null);
      setLoading(true);

      try {
        const response = await fetch(`${UNGA_API_BASE}/unga-distances/overall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`UNGA API error (${response.status})`);
        }

        const data = (await response.json()) as OverallDistanceResponse;
        const nextMap = buildAlignmentMap(data.countries, (blocRow) => blocRow.average_distance ?? null, {
          preferLower: true,
        });

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

    fetchAlignments();
    return () => controller.abort();
  }, []);

  return { alignmentMap, loading, error };
}


