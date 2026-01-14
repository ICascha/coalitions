import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import worldMapSvg from '@/assets/world_map_interactive_t0.2.svg?raw';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { svgNameToAlpha3 } from '@/data/svgCountryAlpha3';
import { alpha3ToCountryName } from '@/data/alpha3ToCountryName';
// import { StoryMode } from './StoryMode';

const POWER_BLOCS = ['EU', 'USA', 'CHINA', 'RUSSIA'] as const;
type PowerBloc = (typeof POWER_BLOCS)[number];

const POWER_BLOC_COLORS: Record<PowerBloc, string> = {
  EU: '#0ea5e9',
  USA: '#16a34a',
  CHINA: '#dc2626',
  RUSSIA: '#f97316',
};

const POWER_BLOC_LABELS: Record<PowerBloc, string> = {
  EU: 'Europese Unie',
  USA: 'Verenigde Staten',
  CHINA: 'China',
  RUSSIA: 'Rusland',
};

const POWER_BLOC_HOME_KEYS: Record<PowerBloc, string[]> = {
  EU: ['EU', 'EUROPEAN UNION'],
  USA: ['USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'],
  CHINA: ['CHINA', 'PEOPLE\'S REPUBLIC OF CHINA', 'PRC', 'CHN'],
  RUSSIA: ['RUSSIA', 'RUS'],
};

const FBIC_DEFAULT_METRICS = [
  'fbic',
  'bandwidth',
  'politicalbandwidth',
  'economicbandwidth',
  'securitybandwidth',
  'dependence',
  'economicdependence',
  'securitydependence',
  'foreignaid2021usdafromb',
];

const EU_MEMBER_ISOS = new Set([
  'AUT',
  'BEL',
  'BGR',
  'HRV',
  'CYP',
  'CZE',
  'DNK',
  'EST',
  'FIN',
  'FRA',
  'DEU',
  'GRC',
  'HUN',
  'IRL',
  'ITA',
  'LVA',
  'LTU',
  'LUX',
  'MLT',
  'NLD',
  'POL',
  'PRT',
  'ROU',
  'SVK',
  'SVN',
  'ESP',
  'SWE',
]);

type BlocDistance = {
  bloc: string;
  average_distance: number | null;
  observations: number;
};

type CountryDistanceRecord = {
  country: string;
  blocs: BlocDistance[];
};

type OverallDistanceResponse = {
  available_blocs: string[];
  total_countries: number;
  countries: CountryDistanceRecord[];
};

type BlocMetricMap = Partial<Record<PowerBloc, number | null>>;

type CountryAlignment = {
  bloc: PowerBloc;
  value: number | null;
  strength: number;
  metrics: BlocMetricMap;
};

type AlignmentMap = Record<string, CountryAlignment>;

type BlocTimePoint = {
  year: number;
  distance: number;
};

type TimeSeriesMap = Partial<Record<PowerBloc, BlocTimePoint[]>>;

type LineChartRow = { year: string } & Partial<Record<PowerBloc, number | null>>;

type TooltipAlignmentState = {
  type: 'alignment';
  name: string;
  alignment: CountryAlignment | null;
  x: number;
  y: number;
};

type TooltipCriticalGoodsState = {
  type: 'criticalGoods';
  name: string;
  count: number | null;
  x: number;
  y: number;
};

type TooltipState = TooltipAlignmentState | TooltipCriticalGoodsState;

type BlocTimeSeriesEntry = {
  year: number;
  distance: number | null;
};

type UngaCountryTimeSeriesResponse = {
  country: string;
  blocs: { bloc: string; points: BlocTimeSeriesEntry[] }[];
};

type UngaCountryCategoryTimeSeriesResponse = UngaCountryTimeSeriesResponse & {
  category: string;
};

type CategoryDistanceApiEntry = {
  bloc: string;
  category: string;
  distance: number | null;
};

type UngaCountryCategoryResponse = {
  country: string;
  categories: CategoryDistanceApiEntry[];
};

type UngaCategoryMapResponse = {
  category: string;
  available_categories: string[];
  available_blocs: string[];
  total_countries: number;
  countries: CountryDistanceRecord[];
};

type FbicMetricValue = {
  bloc: string;
  value: number | null;
};

type FbicCountryMetric = {
  country: string;
  blocs: FbicMetricValue[];
};

type FbicMetricResponse = {
  metric: string;
  available_metrics: string[];
  available_blocs: string[];
  total_countries: number;
  countries: FbicCountryMetric[];
};

type FbicTimeSeriesPoint = {
  year: number;
  fbic: number | null;
};

type FbicCountryTimeSeriesResponse = {
  country: string;
  blocs: { bloc: string; points: FbicTimeSeriesPoint[] }[];
};

type CriticalGoodItem = {
  hs22_code: string;
  hs22_description: string;
  subsectors: string[];
  cdi1: number | null;
  cdi2: number | null;
  cdi3: number | null;
  exporter_share_extra: number | null;
  share_fraction: number | null;
};

type CriticalGoodsResponse = {
  country: string;
  total_goods: number;
  limit: number;
  goods: CriticalGoodItem[];
};

type CriticalGoodsThresholdEntry = {
  country: string;
  total_goods_above_threshold: number;
  subsector_counts: Record<string, number>;
};

type CriticalGoodsThresholdResponse = {
  threshold: number;
  total_countries: number;
  countries: CriticalGoodsThresholdEntry[];
};

const UNGA_API_BASE =
  import.meta.env.VITE_UNGA_DISTANCE_API?.replace(/\/+$/, '') ?? 
  (import.meta.env.PROD 
    ? 'https://backendclustering-production.up.railway.app' 
    : 'http://localhost:8000');

const formatCountryName = (rawId: string) =>
  rawId
    .replace(/[_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeSvgId = (rawId: string) => formatCountryName(rawId).toUpperCase();

const resolveCountryKey = (rawId: string) => {
  const normalized = normalizeSvgId(rawId);
  if (!normalized || normalized === 'SVG2') {
    return null;
  }
  return svgNameToAlpha3[normalized] ?? normalized;
};
const normalizeCountryName = (name: string) => normalizeSvgId(name);

// Note: We intentionally avoid DOM reordering (appendChild) for SVG paths
// because it causes visual flashing for countries at the edge of the map
// (like Russia, USA, China). Instead, we rely purely on CSS styling
// (opacity, stroke, filter) for selection highlighting.

const deriveCountryKeys = (countryName: string) => {
  const normalized = normalizeCountryName(countryName);
  const keys = new Set<string>([countryName.toUpperCase(), normalized]);
  if (normalized.length === 3) {
    keys.add(normalized);
  }
  const isoFromSvg = svgNameToAlpha3[normalized];
  if (isoFromSvg) {
    keys.add(isoFromSvg);
  }
  return Array.from(keys);
};

const isEuMemberCountry = (keys: string[]) => keys.some((key) => EU_MEMBER_ISOS.has(key));

const alpha3NameMap: Record<string, string> = alpha3ToCountryName;

const getCountryDisplayName = (key: string | null, fallback: string) => {
  if (!key) {
    return fallback;
  }
  return alpha3NameMap[key] ?? fallback;
};

const toPowerBloc = (bloc: string): PowerBloc | null => {
  const normalized = bloc.toUpperCase() as PowerBloc;
  return POWER_BLOCS.includes(normalized) ? normalized : null;
};

const hexToRgb = (hex: string) => {
  const parsed = hex.replace('#', '');
  const bigint = parseInt(parsed, 16);
  return [
    (bigint >> 16) & 255,
    (bigint >> 8) & 255,
    bigint & 255,
  ];
};

const blendWithWhite = (hex: string, intensity: number) => {
  const [r, g, b] = hexToRgb(hex);
  const t = Math.max(0, Math.min(1, intensity));
  const blendChannel = (channel: number) => Math.round(255 - (255 - channel) * t);
  return `rgb(${blendChannel(r)}, ${blendChannel(g)}, ${blendChannel(b)})`;
};

const computeStrength = (
  bestValue: number | null,
  runnerUpValue: number | null,
  isHomeland: boolean,
  preferLower: boolean
) => {
  if (isHomeland) {
    return 1;
  }
  if (typeof bestValue !== 'number') {
    return 0;
  }

  if (preferLower) {
    if (typeof runnerUpValue !== 'number') {
      return Math.max(0.5, 1 - Math.min(bestValue / 2, 1));
    }
    const proximity = 1 - Math.min(bestValue / 2, 1);
    const gap = Math.max(0, Math.min(1, (runnerUpValue - bestValue) / 0.8));
    return Math.max(0.25, proximity * 0.5 + gap * 0.5);
  }

  const normalizedBest = Math.max(0, Math.min(1, bestValue));
  if (typeof runnerUpValue !== 'number') {
    return Math.max(0.4, normalizedBest);
  }
  const gap = Math.max(0, Math.min(1, (bestValue - runnerUpValue) / 0.5));
  return Math.max(0.25, normalizedBest * 0.6 + gap * 0.4);
};

const getFillColor = (alignment?: CountryAlignment) => {
  if (!alignment) {
    return '#e2e8f0';
  }
  return blendWithWhite(POWER_BLOC_COLORS[alignment.bloc], alignment.strength);
};

const formatMetricValue = (
  value: number | null | undefined,
  source: 'UNGA' | 'FBIC' | 'CRITICAL_GOODS'
) => {
  if (typeof value !== 'number') {
    return 'n.v.t.';
  }
  if (source === 'FBIC') {
    return value.toFixed(3);
  }
  return value.toFixed(2);
};

type AlignmentBuildOptions = {
  preferLower: boolean;
  treatEuMembersAsAligned?: boolean;
};

const buildAlignmentMap = (
  countryRows: { country: string; blocs: { bloc: string;[key: string]: unknown }[] }[],
  getMetric: (blocRow: { bloc: string;[key: string]: unknown }) => number | null,
  options: AlignmentBuildOptions
) => {
  const { preferLower, treatEuMembersAsAligned = false } = options;
  const nextMap: AlignmentMap = {};
  countryRows.forEach((countryRecord) => {
    const countryKeys = deriveCountryKeys(countryRecord.country);
    const isEuMember = isEuMemberCountry(countryKeys);

    const blocMetrics: BlocMetricMap = {};
    POWER_BLOCS.forEach((bloc) => {
      const blocData = countryRecord.blocs.find(
        (entry) => entry.bloc.toUpperCase() === bloc
      );
      blocMetrics[bloc] = blocData ? getMetric(blocData) : null;
    });

    if (treatEuMembersAsAligned && isEuMember) {
      blocMetrics.EU = preferLower ? 0 : 1;
    }

    const ordered = POWER_BLOCS
      .map((bloc) => ({ bloc, value: blocMetrics[bloc] }))
      .filter((entry): entry is { bloc: PowerBloc; value: number } =>
        typeof entry.value === 'number'
      )
      .sort((a, b) => (preferLower ? a.value - b.value : b.value - a.value));

    if (!ordered.length) {
      return;
    }

    const best = ordered[0];
    const runnerUp = ordered[1];
    const homelandKeys = POWER_BLOC_HOME_KEYS[best.bloc].map((homeKey) =>
      homeKey.toUpperCase()
    );
    const isHomeland = homelandKeys.some((homeKey) => countryKeys.includes(homeKey));
    const alignedHome = isHomeland || (treatEuMembersAsAligned && best.bloc === 'EU' && isEuMember);
    const strength = computeStrength(
      blocMetrics[best.bloc] ?? null,
      runnerUp?.value ?? null,
      alignedHome,
      preferLower
    );

    const alignment: CountryAlignment = {
      bloc: best.bloc,
      value: blocMetrics[best.bloc] ?? null,
      strength,
      metrics: blocMetrics,
    };

    countryKeys.forEach((key) => {
      nextMap[key] = alignment;
    });
  });

  return nextMap;
};

const formatCategoryLabel = (category: string) => {
  if (category === 'overall') {
    return 'Totaal (overall)';
  }
  return category
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatFbicMetricLabel = (metric: string) =>
  metric
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const integerFormatter = new Intl.NumberFormat('nl-NL');

const formatCountValue = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n.v.t.';
  }
  return integerFormatter.format(value);
};

const formatShareFraction = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n.v.t.';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatSubsectorList = (subsectors?: string[] | null) => {
  if (!Array.isArray(subsectors) || !subsectors.length) {
    return 'Geen subsector-informatie';
  }
  return subsectors.join(', ');
};

const CRITICAL_GOODS_BASE_COLOR = '#b45309';
const CRITICAL_GOODS_MIN_THRESHOLD = 0.05;
const CRITICAL_GOODS_MAX_THRESHOLD = 1;

const getCriticalGoodsFill = (count: number | null | undefined, maxCount: number) => {
  if (typeof count !== 'number' || count <= 0 || maxCount <= 0) {
    return '#e2e8f0';
  }
  const intensity = Math.min(1, Math.max(0, count / maxCount));
  return blendWithWhite(CRITICAL_GOODS_BASE_COLOR, intensity);
};

type MapDataSource = 'UNGA' | 'FBIC' | 'CRITICAL_GOODS';

export const UNGAMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [overallAlignment, setOverallAlignment] = useState<AlignmentMap>({});
  const [categoryAlignmentMaps, setCategoryAlignmentMaps] = useState<Record<string, AlignmentMap>>({});
  const [fbicAlignmentMaps, setFbicAlignmentMaps] = useState<Record<string, AlignmentMap>>({});
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<MapDataSource>('UNGA');
  const [selectedCategory, setSelectedCategory] = useState('overall');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedFbicMetric, setSelectedFbicMetric] = useState('fbic');
  const [availableFbicMetrics, setAvailableFbicMetrics] = useState<string[]>([...FBIC_DEFAULT_METRICS]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countrySeries, setCountrySeries] = useState<TimeSeriesMap>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [criticalGoodsSummary, setCriticalGoodsSummary] = useState<
    Record<string, { count: number; subsectors: Record<string, number> }>
  >({});
  const [criticalGoodsThreshold, setCriticalGoodsThreshold] = useState(0.25);
  const [criticalGoodsDetails, setCriticalGoodsDetails] = useState<Record<string, CriticalGoodsResponse>>({});

  const alignmentMap = useMemo(() => {
    if (dataSource === 'UNGA') {
      return selectedCategory === 'overall'
        ? overallAlignment
        : categoryAlignmentMaps[selectedCategory] ?? {};
    }
    if (dataSource === 'FBIC') {
      return fbicAlignmentMaps[selectedFbicMetric] ?? {};
    }
    return {};
  }, [dataSource, selectedCategory, overallAlignment, categoryAlignmentMaps, fbicAlignmentMaps, selectedFbicMetric]);

  const criticalGoodsMaxCount = useMemo(() => {
    return Object.values(criticalGoodsSummary).reduce((max, entry) => {
      const value = typeof entry?.count === 'number' ? entry.count : 0;
      return value > max ? value : max;
    }, 0);
  }, [criticalGoodsSummary]);

  useEffect(() => {
    setTooltip(null);
    setSelectedCountry(null);
    setCountrySeries({});
  }, [dataSource]);

  const svgMarkup = useMemo(() => {
    // Ensure the injected SVG scales responsively and fix transitions
    // that cause flashing on edge countries (Russia, USA, China)
    return worldMapSvg
      .replace(
        /<svg([^>]+)>/,
        '<svg$1 preserveAspectRatio="xMidYMid meet">'
      )
      // Override the SVG's built-in "transition: all" which causes flashing
      // on complex paths at map edges. Transition fill and stroke properties
      // but NOT opacity or filter (those cause the flash).
      .replace(
        /transition:\s*all[^;]*;/g,
        'transition: fill 0.2s ease-out, stroke 0.15s ease-out, stroke-width 0.15s ease-out;'
      );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const svgElement = container.querySelector('svg');
    if (!svgElement) {
      return;
    }

    const handleClick = (event: Event) => {
      const target = event.target as SVGElement | null;
      if (!target) {
        setTooltip(null);
        return;
      }

      event.stopPropagation();

      const countryId = target.id ?? target.getAttribute('data-name');
      if (!countryId) {
        setTooltip(null);
        setSelectedCountry(null);
        return;
      }

      const bounds = container.getBoundingClientRect();
      const mouseEvent = event as MouseEvent;
      const key = resolveCountryKey(countryId);
      if (!key) {
        setTooltip(null);
        setSelectedCountry(null);
        return;
      }

      const displayName = getCountryDisplayName(key, formatCountryName(countryId));
      if (dataSource === 'CRITICAL_GOODS') {
        const summary = criticalGoodsSummary[key];
        setTooltip({
          type: 'criticalGoods',
          name: displayName,
          count: summary?.count ?? null,
          x: mouseEvent.clientX - bounds.left,
          y: mouseEvent.clientY - bounds.top,
        });
      } else {
        setTooltip({
          type: 'alignment',
          name: displayName,
          alignment: alignmentMap[key] ?? null,
          x: mouseEvent.clientX - bounds.left,
          y: mouseEvent.clientY - bounds.top,
        });
      }
      setSelectedCountry(key);
    };

    const handleContainerClick = () => {
      setTooltip(null);
      setSelectedCountry(null);
    };

    svgElement.addEventListener('click', handleClick);
    container.addEventListener('click', handleContainerClick);

    return () => {
      svgElement.removeEventListener('click', handleClick);
      container.removeEventListener('click', handleContainerClick);
    };
  }, [alignmentMap, dataSource, criticalGoodsSummary]);

  // Note: We removed the pointerover-based DOM reordering (bringSvgElementToFront)
  // because it causes visual flashing for edge countries like Russia, USA, China.
  // The hover effect is now purely CSS-based via the SVG's built-in :hover styles.

  useEffect(() => {
    const controller = new AbortController();
    const fetchAlignments = async () => {
      setMapError(null);

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
        const nextMap = buildAlignmentMap(
          data.countries,
          (blocRow) => (blocRow as BlocDistance).average_distance ?? null,
          { preferLower: true, treatEuMembersAsAligned: true }
        );

        if (!controller.signal.aborted) {
          setOverallAlignment(nextMap);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setMapError(err instanceof Error ? err.message : 'Kon UNGA-afstanden niet laden.');
        setMapLoading(false);
      }
    };

    fetchAlignments();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (dataSource !== 'CRITICAL_GOODS') {
      return;
    }

    const controller = new AbortController();
    const fetchCriticalGoodsSummary = async () => {
      setMapLoading(true);
      setMapError(null);
      try {
        const params = new URLSearchParams({ threshold: criticalGoodsThreshold.toString() });
        const response = await fetch(
          `${UNGA_API_BASE}/critical-goods/threshold-summary?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Critical goods samenvatting fout (${response.status})`);
        }
        const data = (await response.json()) as CriticalGoodsThresholdResponse;
        const nextSummary: Record<string, { count: number; subsectors: Record<string, number> }> = {};
        data.countries.forEach((entry) => {
          const keys = deriveCountryKeys(entry.country);
          keys.forEach((key) => {
            nextSummary[key] = {
              count: entry.total_goods_above_threshold,
              subsectors: entry.subsector_counts ?? {},
            };
          });
        });
        if (!controller.signal.aborted) {
          setCriticalGoodsSummary(nextSummary);
          setMapLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setMapError(
          err instanceof Error ? err.message : 'Kon kritieke-goederenkaart niet laden.'
        );
        setMapLoading(false);
      }
    };

    fetchCriticalGoodsSummary();
    return () => controller.abort();
  }, [dataSource, criticalGoodsThreshold]);

  useEffect(() => {
    if (!selectedCountry) {
      setCountrySeries({});
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    if (dataSource === 'CRITICAL_GOODS') {
      setCountrySeries({});
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    setCountrySeries({});
    const fetchDetails = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const encodedCountry = encodeURIComponent(selectedCountry);
        const isCategoryView = dataSource === 'UNGA' && selectedCategory !== 'overall';
        const encodedCategory = isCategoryView
          ? encodeURIComponent(selectedCategory)
          : null;
        const endpoint =
          dataSource === 'UNGA'
            ? isCategoryView && encodedCategory
              ? `${UNGA_API_BASE}/unga-distances/${encodedCountry}/categories/${encodedCategory}/timeseries`
              : `${UNGA_API_BASE}/unga-distances/${encodedCountry}/timeseries`
            : `${UNGA_API_BASE}/fbic/countries/${encodedCountry}/timeseries`;
        const response = await fetch(endpoint, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            dataSource === 'UNGA'
              ? `UNGA tijdreeksen fout (${response.status})`
              : `FBIC tijdreeksen fout (${response.status})`
          );
        }

        const nextSeries: TimeSeriesMap = {};
        if (dataSource === 'UNGA') {
          const seriesData = (await response.json()) as
            | UngaCountryTimeSeriesResponse
            | UngaCountryCategoryTimeSeriesResponse;
          POWER_BLOCS.forEach((bloc) => {
            const blocSeries = seriesData.blocs.find(
              (entry) => toPowerBloc(entry.bloc) === bloc
            );
            if (blocSeries) {
              const points = blocSeries.points.filter(
                (point): point is BlocTimeSeriesEntry & { distance: number } =>
                  typeof point.distance === 'number'
              );
              if (points.length) {
                const orderedPoints = [...points].sort((a, b) => a.year - b.year);
                nextSeries[bloc] = orderedPoints.map((point) => ({
                  year: point.year,
                  distance: point.distance,
                }));
              }
            }
          });
        } else {
          const seriesData = (await response.json()) as FbicCountryTimeSeriesResponse;
          POWER_BLOCS.forEach((bloc) => {
            const blocSeries = seriesData.blocs.find(
              (entry) => toPowerBloc(entry.bloc) === bloc
            );
            if (blocSeries) {
              const points = blocSeries.points.filter(
                (point): point is FbicTimeSeriesPoint & { fbic: number } =>
                  typeof point.fbic === 'number'
              );
              if (points.length) {
                const orderedPoints = [...points].sort((a, b) => a.year - b.year);
                nextSeries[bloc] = orderedPoints.map((point) => ({
                  year: point.year,
                  distance: point.fbic,
                }));
              }
            }
          });
        }

        if (!controller.signal.aborted) {
          setCountrySeries(nextSeries);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setDetailError(err instanceof Error ? err.message : 'Kon landdetails niet laden.');
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    };

    fetchDetails();
    return () => controller.abort();
  }, [selectedCountry, dataSource, selectedCategory]);

  useEffect(() => {
    if (dataSource !== 'CRITICAL_GOODS') {
      return;
    }
    if (!selectedCountry) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const cached = criticalGoodsDetails[selectedCountry];
    if (cached) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    const fetchCriticalGoodsDetails = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const encoded = encodeURIComponent(selectedCountry);
        const response = await fetch(
          `${UNGA_API_BASE}/critical-goods/countries/${encoded}?limit=10`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Critical goods landenfout (${response.status})`);
        }
        const data = (await response.json()) as CriticalGoodsResponse;
        if (!controller.signal.aborted) {
          setCriticalGoodsDetails((prev) => ({ ...prev, [selectedCountry]: data }));
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setDetailError(
          err instanceof Error ? err.message : 'Kon kritieke goederen niet laden.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    };

    fetchCriticalGoodsDetails();
    return () => controller.abort();
  }, [dataSource, selectedCountry, criticalGoodsDetails]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const svgElement = container.querySelector('svg');
    const countriesGroup = svgElement?.querySelector('#countries') ?? svgElement;

    // Remove any previous highlight overlay
    const existingOverlay = svgElement?.querySelector('#selection-highlight-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const svgPaths = container.querySelectorAll<SVGPathElement>('path[id]');
    let selectedPathId: string | null = null;

    svgPaths.forEach((path) => {
      const key = resolveCountryKey(path.id);
      if (!key) {
        path.style.pointerEvents = 'none';
        path.style.opacity = '1';
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.filter = '';
        return;
      }
      path.style.pointerEvents = 'auto';
      const alignment = alignmentMap[key];
      const summary = criticalGoodsSummary[key];
      const fill =
        dataSource === 'CRITICAL_GOODS'
          ? getCriticalGoodsFill(summary?.count ?? null, criticalGoodsMaxCount)
          : getFillColor(alignment);
      path.style.fill = fill;

      if (selectedCountry) {
        const isSelected = selectedCountry === key;
        path.style.opacity = isSelected ? '1' : '0.35';
        // Don't set stroke on the original path - we'll use an overlay instead
        // to ensure the highlight border is always on top of adjacent countries
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.filter = 'none';
        
        if (isSelected) {
          selectedPathId = path.id;
        }
      } else {
        path.style.opacity = '1';
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.filter = 'none';
      }
    });

    // Create a highlight overlay for the selected country that renders on top
    // This avoids the z-index issue where adjacent countries hide the selection border
    if (selectedPathId && countriesGroup) {
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      overlay.setAttribute('id', 'selection-highlight-overlay');
      overlay.setAttribute('href', `#${selectedPathId}`);
      overlay.style.fill = 'none';
      overlay.style.stroke = '#0f172a';
      overlay.style.strokeWidth = '50000';
      overlay.style.pointerEvents = 'none';
      overlay.style.filter = 'drop-shadow(0 0 80000px rgba(15, 23, 42, 0.4))';
      // Append at the end so it renders on top of all countries
      countriesGroup.appendChild(overlay);
    }
  }, [alignmentMap, selectedCountry, dataSource, criticalGoodsSummary, criticalGoodsMaxCount]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchCategories = async () => {
      try {
        const response = await fetch(`${UNGA_API_BASE}/unga-distances/usa/categories`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as UngaCountryCategoryResponse;
        const categories = Array.from(
          new Set(
            data.categories
              .map((entry) => entry.category)
              .filter(
                (category): category is string =>
                  Boolean(category) && category.toLowerCase() !== 'overall'
              )
          )
        ).sort((a, b) => a.localeCompare(b));
        if (!controller.signal.aborted) {
          setAvailableCategories(categories);
        }
      } catch {
        // Ignore category list errors; user can still use overall view.
      }
    };

    fetchCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (dataSource !== 'FBIC') {
      return;
    }

    const cached = fbicAlignmentMaps[selectedFbicMetric];
    if (cached && Object.keys(cached).length) {
      setMapLoading(false);
      setMapError(null);
      return;
    }

    const controller = new AbortController();
    const fetchFbicMetric = async () => {
      setMapLoading(true);
      setMapError(null);
      try {
        const response = await fetch(`${UNGA_API_BASE}/fbic/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metric: selectedFbicMetric }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`FBIC metriek fout (${response.status})`);
        }

        const data = (await response.json()) as FbicMetricResponse;
        const nextMap = buildAlignmentMap(
          data.countries,
          (blocRow) => (blocRow as FbicMetricValue).value ?? null,
          { preferLower: false }
        );

        if (!controller.signal.aborted) {
          setFbicAlignmentMaps((prev) => ({ ...prev, [selectedFbicMetric]: nextMap }));
          if (data.available_metrics?.length) {
            setAvailableFbicMetrics(
              [...data.available_metrics].sort((a, b) => a.localeCompare(b))
            );
          }
          setMapLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setMapError(err instanceof Error ? err.message : 'Kon FBIC-gegevens niet laden.');
        setMapLoading(false);
      }
    };

    fetchFbicMetric();
    return () => controller.abort();
  }, [dataSource, selectedFbicMetric, fbicAlignmentMaps]);

  useEffect(() => {
    if (dataSource !== 'UNGA' || selectedCategory !== 'overall') {
      return;
    }
    const hasOverallData = Object.keys(overallAlignment).length > 0;
    if (hasOverallData) {
      setMapLoading(false);
      setMapError(null);
    } else if (mapError) {
      setMapLoading(false);
    } else {
      setMapLoading(true);
    }
  }, [dataSource, selectedCategory, overallAlignment, mapError]);

  useEffect(() => {
    if (dataSource !== 'UNGA' || selectedCategory === 'overall') {
      return;
    }

    const cached = categoryAlignmentMaps[selectedCategory];
    if (cached && Object.keys(cached).length) {
      setMapLoading(false);
      setMapError(null);
      return;
    }

    const controller = new AbortController();
    const fetchCategoryMap = async () => {
      setMapLoading(true);
      setMapError(null);
      try {
        const response = await fetch(`${UNGA_API_BASE}/unga-distances/category-map`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: selectedCategory }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`UNGA categoriekaart fout (${response.status})`);
        }

        const data = (await response.json()) as UngaCategoryMapResponse;
        const nextMap = buildAlignmentMap(
          data.countries,
          (blocRow) => (blocRow as BlocDistance).average_distance ?? null,
          { preferLower: true, treatEuMembersAsAligned: true }
        );

        if (!controller.signal.aborted) {
          setCategoryAlignmentMaps((prev) => ({ ...prev, [selectedCategory]: nextMap }));
          if (data.available_categories?.length) {
            setAvailableCategories((prev) => {
              const merged = new Set(prev);
              data.available_categories.forEach((category) => {
                if (category && category.toLowerCase() !== 'overall') {
                  merged.add(category);
                }
              });
              return Array.from(merged).sort((a, b) => a.localeCompare(b));
            });
          }
          setMapLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setMapError(
          err instanceof Error ? err.message : 'Kon categoriegegevens niet laden.'
        );
        setMapLoading(false);
      }
    };

    fetchCategoryMap();
    return () => controller.abort();
  }, [dataSource, selectedCategory, categoryAlignmentMaps]);

  const selectedCountryName = selectedCountry
    ? getCountryDisplayName(selectedCountry, selectedCountry)
    : null;
  const selectedAlignment = selectedCountry ? alignmentMap[selectedCountry] : null;
  const selectedCriticalGoodsSummary = selectedCountry
    ? criticalGoodsSummary[selectedCountry] ?? null
    : null;
  const selectedCriticalGoodsDetail = selectedCountry
    ? criticalGoodsDetails[selectedCountry] ?? null
    : null;
  const currentMetricLabel = useMemo(() => {
    if (dataSource === 'UNGA') {
      return selectedCategory === 'overall'
        ? 'Afstand (overall)'
        : `Afstand (${formatCategoryLabel(selectedCategory)})`;
    }
    if (dataSource === 'FBIC') {
      return formatFbicMetricLabel(selectedFbicMetric);
    }
    return `Kritieke goederen (HHI ≥ ${criticalGoodsThreshold.toFixed(2)})`;
  }, [dataSource, selectedCategory, selectedFbicMetric, criticalGoodsThreshold]);

  const descriptionText = useMemo(() => {
    if (dataSource === 'UNGA') {
      return 'Elke kleur toont het machtsblok (EU, VS, China of Rusland) waar een land het dichtst bij stemt tijdens de Algemene Vergadering. Hoe voller de kleur, hoe sterker de uitlijning.';
    }
    if (dataSource === 'FBIC') {
      return 'Elke kleur toont per FBIC-metriek welk machtsblok het zwaarst doorwerkt bij een land. Hoe voller de kleur, hoe sterker de band.';
    }
    return 'De kleurintensiteit laat zien hoeveel kritieke goederenexporteurs (boven de CDI1-drempel) een land telt. Klik voor de top 10 goederen op basis van CDI1.';
  }, [dataSource]);

  const lineChartDataset = useMemo<LineChartRow[]>(() => {
    const yearSet = new Set<number>();
    const blocYearMap = POWER_BLOCS.reduce<Record<PowerBloc, Map<number, number>>>(
      (acc, bloc) => ({ ...acc, [bloc]: new Map() }),
      {} as Record<PowerBloc, Map<number, number>>
    );
    POWER_BLOCS.forEach((bloc) => {
      countrySeries[bloc]?.forEach((point) => {
        yearSet.add(point.year);
        blocYearMap[bloc].set(point.year, point.distance);
      });
    });
    const years = Array.from(yearSet).sort((a, b) => a - b);
    return years.map((year) => {
      const row: LineChartRow = { year: year.toString() };
      POWER_BLOCS.forEach((bloc) => {
        row[bloc] = blocYearMap[bloc].get(year) ?? null;
      });
      return row;
    });
  }, [countrySeries]);


  const renderPlaceholder = (text: string, tone: 'muted' | 'error' = 'muted') => (
    <div
      className={cn(
        'flex h-full items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs',
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-600'
          : 'border-slate-200 bg-slate-50 text-slate-500'
      )}
    >
      {text}
    </div>
  );

  const renderLineChart = () => {
    if (!selectedCountry) {
      return renderPlaceholder('Selecteer een land om de tijdreeks te bekijken.');
    }
    if (detailError && !lineChartDataset.length) {
      return renderPlaceholder(detailError, 'error');
    }
    if (!lineChartDataset.length) {
      return renderPlaceholder(detailLoading ? 'Laden...' : 'Geen tijdreeks beschikbaar.');
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={lineChartDataset} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            dy={10}
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={45}
            axisLine={false}
            tickLine={false}
            domain={[0, 'auto']}
            tickFormatter={(value) =>
              typeof value === 'number' ? formatMetricValue(value, dataSource) : value
            }
            label={{
              value: currentMetricLabel,
              angle: -90,
              position: 'insideLeft',
              offset: 0,
              style: { fill: '#64748b', fontSize: 10, fontWeight: 500, textAnchor: 'middle' },
              dy: 0,
              dx: 4,
            }}
          />
          <RechartsTooltip
            content={({ active, payload, label }: any) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                    <p className="mb-2 text-xs font-semibold text-slate-700">Jaar {label}</p>
                    <div className="flex flex-col gap-1">
                      {payload.map((entry: any) => (
                        <div key={entry.name} className="flex items-center gap-2 text-xs">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-slate-500">{entry.name}:</span>
                          <span className="font-medium text-slate-700">
                            {typeof entry.value === 'number'
                              ? formatMetricValue(entry.value, dataSource)
                              : 'n.v.t.'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: '10px' }}
            iconType="circle"
            iconSize={8}
          />
          {POWER_BLOCS.map((bloc) => {
            const hasData = countrySeries[bloc]?.length;
            if (!hasData) {
              return null;
            }
            return (
              <Line
                key={bloc}
                type="monotone"
                dataKey={bloc}
                name={POWER_BLOC_LABELS[bloc]}
                stroke={POWER_BLOC_COLORS[bloc]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderCriticalGoodsList = () => {
    if (!selectedCountry) {
      return renderPlaceholder('Selecteer een land om de top 10 goederen te bekijken.');
    }
    if (detailError && !selectedCriticalGoodsDetail) {
      return renderPlaceholder(detailError, 'error');
    }
    if (detailLoading && !selectedCriticalGoodsDetail) {
      return renderPlaceholder('Laden...');
    }
    const goods = (selectedCriticalGoodsDetail?.goods ?? [])
      .filter((item) => {
        const share = item.share_fraction;
        const cdi1 = item.cdi1;
        return typeof share === 'number' && share > 0.25 && typeof cdi1 === 'number' && cdi1 > 0.25;
      })
      .sort((a, b) => (b.share_fraction ?? 0) - (a.share_fraction ?? 0))
      .slice(0, 10);

    if (!goods.length) {
      return renderPlaceholder('Geen kritieke goederen boven de drempel.');
    }

    return (
      <div className="max-h-[260px] overflow-auto divide-y divide-slate-100 text-sm">
        {goods.map((item, index) => (
          <div key={`${item.hs22_code}-${index}`} className="py-2 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-slate-500">
              <span>{item.hs22_code}</span>
              <span>Aandeel {formatShareFraction(item.share_fraction)}</span>
            </div>
            <div className="text-sm font-medium text-slate-800">{item.hs22_description}</div>
            <div className="text-xs text-slate-500">{formatSubsectorList(item.subsectors)}</div>
            <div className="text-xs text-slate-500">
              HHI {typeof item.cdi1 === 'number' ? item.cdi1.toFixed(3) : 'n.v.t.'}
              {typeof item.exporter_share_extra === 'number'
                ? ` · Extra aandeel ${formatShareFraction(item.exporter_share_extra)}`
                : ''}
            </div>
          </div>
        ))}
      </div>
    );
  };


  const blocLegend = POWER_BLOCS.map((bloc) => ({
    bloc,
    label: POWER_BLOC_LABELS[bloc],
    color: blendWithWhite(POWER_BLOC_COLORS[bloc], 0.85),
  }));

  const criticalGoodsLegend = [
    { label: 'Laag', color: blendWithWhite(CRITICAL_GOODS_BASE_COLOR, 0.2) },
    { label: 'Gemiddeld', color: blendWithWhite(CRITICAL_GOODS_BASE_COLOR, 0.55) },
    { label: 'Hoog', color: blendWithWhite(CRITICAL_GOODS_BASE_COLOR, 0.9) },
  ];

  const categoryOptions = useMemo(
    () => ['overall', ...availableCategories],
    [availableCategories]
  );

  return (
    <Card className="h-full p-4 md:p-6 flex-1 min-h-0 overflow-hidden flex flex-col">
      <div className="flex flex-col gap-2 pb-4">
        <h3 className="text-xl font-semibold text-[rgb(0,153,168)]">
          Algemene Vergadering (UNGA)
        </h3>
        <p className="text-sm text-gray-600">{descriptionText}</p>
      </div>

      <div className="flex flex-col gap-3 pb-4 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-4">
          {dataSource === 'CRITICAL_GOODS'
            ? criticalGoodsLegend.map((entry) => (
              <div key={entry.label} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-6 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span>{entry.label}</span>
              </div>
            ))
            : blocLegend.map((entry) => (
              <div key={entry.bloc} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-6 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span>{entry.label}</span>
              </div>
            ))}
        </div>
        <div className="flex flex-col gap-2 text-xs text-gray-500 sm:flex-row sm:items-center sm:gap-4">
          <span>Klik op een land voor de exacte waarden</span>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="unga-source" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Bron
              </label>
              <Select
                value={dataSource}
                onValueChange={(value) => setDataSource(value as MapDataSource)}
              >
                <SelectTrigger className="w-[180px] bg-slate-50 border-slate-200 hover:bg-slate-100 transition-colors text-slate-700 font-medium">
                  <SelectValue placeholder="Selecteer bron" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNGA">UNGA</SelectItem>
                  <SelectItem value="FBIC">FBIC</SelectItem>
                  <SelectItem value="CRITICAL_GOODS">Kritieke goederen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dataSource === 'UNGA' ? (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="unga-category"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Categorie
                </label>
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger className="w-[240px] bg-slate-50 border-slate-200 hover:bg-slate-100 transition-colors text-slate-700 font-medium">
                    <SelectValue placeholder="Selecteer categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {formatCategoryLabel(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : dataSource === 'FBIC' ? (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="fbic-metric"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  FBIC metriek
                </label>
                <Select
                  value={selectedFbicMetric}
                  onValueChange={setSelectedFbicMetric}
                >
                  <SelectTrigger className="w-[240px] bg-slate-50 border-slate-200 hover:bg-slate-100 transition-colors text-slate-700 font-medium">
                    <SelectValue placeholder="Selecteer metriek" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFbicMetrics.map((metric) => (
                      <SelectItem key={metric} value={metric}>
                        {formatFbicMetricLabel(metric)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="critical-threshold"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  HHI-drempel: {criticalGoodsThreshold.toFixed(2)}
                </label>
                <div className="flex items-center gap-3 w-[200px] h-9 px-1">
                  <Slider
                    value={[criticalGoodsThreshold]}
                    min={CRITICAL_GOODS_MIN_THRESHOLD}
                    max={CRITICAL_GOODS_MAX_THRESHOLD}
                    step={0.05}
                    onValueChange={([value]) => setCriticalGoodsThreshold(value)}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 min-w-0">
          <div className="relative min-h-[420px] overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 via-slate-100/50 to-slate-50 shadow-[inset_0_2px_20px_rgba(148,163,184,0.12)]">
            <div
              ref={containerRef}
              className={cn(
                'w-full h-full unga-map',
                '[&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-[70vh]',
                // Transition fill and stroke properties, but NOT opacity/filter which cause flashing
                '[&_path]:transition-[fill,stroke,stroke-width] [&_path]:duration-200 [&_path]:ease-out',
                '[&_path]:cursor-pointer',
                '[&_path:hover]:brightness-[1.05]'
              )}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm bg-white/60">
                Laden...
              </div>
            )}
            {mapError && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow">
                  {mapError}
                </div>
              </div>
            )}
            {tooltip && (
              <div
                className="absolute rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-lg border border-gray-200 pointer-events-none"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <div className="font-semibold">{tooltip.name}</div>
                {tooltip.type === 'alignment'
                  ? (() => {
                    const alignmentData = tooltip.alignment;
                    if (!alignmentData) {
                      return (
                        <div className="mt-0.5 text-xs text-gray-500">Geen data beschikbaar</div>
                      );
                    }
                    return (
                      <>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-600">
                          <span
                            className="inline-flex h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: blendWithWhite(
                                POWER_BLOC_COLORS[alignmentData.bloc],
                                Math.max(alignmentData.strength, 0.6)
                              ),
                            }}
                          />
                          <span>
                            {dataSource === 'UNGA' ? 'Dichtst bij' : 'Sterkste band met'}{' '}
                            {POWER_BLOC_LABELS[alignmentData.bloc]} (
                            {formatMetricValue(alignmentData.value, dataSource)})
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                          {POWER_BLOCS.map((bloc) => (
                            <div key={bloc} className="flex items-center justify-between gap-6">
                              <span>{POWER_BLOC_LABELS[bloc]}</span>
                              <span>
                                {formatMetricValue(alignmentData.metrics[bloc], dataSource)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()
                  : (
                    <div className="mt-0.5 text-xs text-gray-600">
                      {typeof tooltip.count === 'number'
                        ? `${formatCountValue(tooltip.count)} kritieke goederen`
                        : 'Geen data beschikbaar'}
                      <div className="text-[11px] text-gray-400">
                        HHI-drempel {criticalGoodsThreshold.toFixed(2)}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
        <div className="w-full lg:w-[420px] flex flex-col gap-4">
          <div className="rounded-xl border bg-white shadow-sm p-4 min-h-[140px]">
            {selectedCountryName ? (
              dataSource === 'CRITICAL_GOODS' ? (
                <>
                  <div className="text-lg font-semibold text-slate-900">{selectedCountryName}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {currentMetricLabel}
                  </div>
                  {selectedCriticalGoodsSummary ? (
                    <>
                      <div className="mt-3 text-3xl font-bold text-amber-700">
                        {formatCountValue(selectedCriticalGoodsSummary.count)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Exporteurs (Herfindahl-indicator boven de drempel)
                      </div>
                      {Object.keys(selectedCriticalGoodsSummary.subsectors || {}).length ? (
                        <div className="mt-3 space-y-1 text-xs text-slate-600">
                          {Object.entries(selectedCriticalGoodsSummary.subsectors)
                            .sort((a, b) => b[1] - a[1])
                            .map(([subsector, value]) => (
                              <div key={subsector} className="flex items-center justify-between">
                                <span>{subsector}</span>
                                <span>{formatCountValue(value)}</span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-500">
                          Geen subsector-uitsplitsing.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">
                      Geen kaartgegevens beschikbaar.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg font-semibold text-slate-900">{selectedCountryName}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {currentMetricLabel}
                  </div>
                  {selectedAlignment ? (
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      {POWER_BLOCS.map((bloc) => (
                        <div key={bloc} className="flex items-center justify-between">
                          <span>{POWER_BLOC_LABELS[bloc]}</span>
                          <span>
                            {formatMetricValue(selectedAlignment.metrics[bloc], dataSource)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">
                      Geen kaartgegevens beschikbaar.
                    </div>
                  )}
                </>
              )
            ) : (
              <div className="text-sm text-slate-500">Klik op een land om details te bekijken.</div>
            )}
          </div>
          {dataSource === 'CRITICAL_GOODS' ? (
            <div className="rounded-xl border bg-white shadow-sm p-4 h-[320px]">
              <div className="flex items-center justify-between pb-2">
                <h4 className="text-sm font-semibold text-slate-700">Top 10 HHI-goederen</h4>
                {selectedCountry && detailLoading && (
                  <span className="text-xs text-slate-400">Laden...</span>
                )}
              </div>
              <div className="h-[260px]">{renderCriticalGoodsList()}</div>
            </div>
          ) : (
            <div className="rounded-xl border bg-white shadow-sm p-4 h-[320px]">
              <div className="flex items-center justify-between pb-2">
                <h4 className="text-sm font-semibold text-slate-700">{currentMetricLabel} door de tijd</h4>
                {selectedCountry && detailLoading && (
                  <span className="text-xs text-slate-400">Laden...</span>
                )}
              </div>
              <div className="h-[260px]">{renderLineChart()}</div>
            </div>
          )}
          {detailError && selectedCountry && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {detailError}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default UNGAMap;
