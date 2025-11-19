import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveHeatMapCanvas,
  type ComputedCell,
  type HeatMapSerie,
  type TooltipComponent,
} from '@nivo/heatmap';
import { ResponsiveScatterPlot, type ScatterPlotNodeData } from '@nivo/scatterplot';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const IS_DEV = import.meta.env.DEV;

type ClustermapMatrix = {
  label?: string;
  countries: string[];
  distance_matrix: (number | null)[][];
  pair_count_matrix: (number | null)[][];
  average_distance?: number;
  average_pair_count?: number;
  min_pair_threshold?: number;
};

type ClustermapResponse = {
  overall: ClustermapMatrix;
  councils: ClustermapMatrix[];
  topics: ClustermapMatrix[];
};

type NamedMatrix = ClustermapMatrix & { label: string };
type PreparedClustermapResponse = {
  overall: NamedMatrix;
  councils: NamedMatrix[];
  topics: NamedMatrix[];
};

type HeatmapCellData = {
  x: string;
  y: number | null;
  distance: number | null;
  count: number;
};

type ViewMode = 'overall' | 'council' | 'topic';
type ClusterId = 'clusterA' | 'clusterB';
type ClusterSelections = Record<ClusterId, string[]>;
type ClusterOverlaySegment = {
  clusterId: ClusterId;
  startIndex: number;
  endIndex: number;
  countries: string[];
};
type ClusterStats = Record<
  ClusterId,
  {
    averageDistance: number | null;
    pairCount: number;
  }
>;
type ClusterComparison = {
  averageDistance: number | null;
  pairCount: number;
};
type ColorScaleMode = 'global' | 'relative';
type DistanceRange = { min: number; max: number };
type ClusterInsightsState = {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  reason?: string;
  disagreement: DisagreementResponse | null;
  variance: Record<ClusterId, VarianceResponse | null>;
};

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'overall', label: 'Alle onderwerpen' },
  { id: 'council', label: 'Per Raad' },
  { id: 'topic', label: 'Per Thema' },
];

const COUNTRY_CLUSTERMAP_DIR = 'country_clustermaps/';
const COUNTRY_CLUSTERMAP_MANIFEST = `${COUNTRY_CLUSTERMAP_DIR}index.json`;
const COUNTRY_APPROVAL_DATASET_CANDIDATES = [
  'country_approval_clustermap_detailed.json',
  'country_approval_clustermap.json',
];
const HEATMAP_MARGIN = { top: 120, right: 80, bottom: 60, left: 140 };
const rawCountryPositionsBase = import.meta.env.VITE_COUNTRY_POSITIONS_API ?? '';
const resolvedCountryPositionsBase =
  rawCountryPositionsBase && rawCountryPositionsBase.trim().length > 0
    ? rawCountryPositionsBase.trim()
    : import.meta.env.PROD
      ? 'https://backendclustering-production.up.railway.app'
      : '';
const API_BASE = resolvedCountryPositionsBase.replace(/\/+$/, '');
const CLUSTER_OPTIONS: { id: ClusterId; label: string }[] = [
  { id: 'clusterA', label: 'Cluster A' },
  { id: 'clusterB', label: 'Cluster B' },
];
const SCALE_MODE_OPTIONS: { id: ColorScaleMode; label: string; description: string }[] = [
  { id: 'global', label: 'Absolute schaal', description: '0–1 (alle datasets)' },
  { id: 'relative', label: 'Relatieve schaal', description: 'Min–max per dataset' },
];
const CLUSTER_STYLES: Record<
  ClusterId,
  { color: string; fill: string; border: string }
> = {
  clusterA: {
    color: 'rgb(0,153,168)',
    fill: 'rgba(0,153,168,0.13)',
    border: 'rgba(0,153,168,0.55)',
  },
  clusterB: {
    color: 'rgb(249,115,22)',
    fill: 'rgba(249,115,22,0.12)',
    border: 'rgba(249,115,22,0.45)',
  },
};
const CLUSTER_LABELS = CLUSTER_OPTIONS.reduce(
  (acc, option) => {
    acc[option.id] = option.label;
    return acc;
  },
  {} as Record<ClusterId, string>
);

const GEOGRAPHIC_CLUSTERS: Record<string, string[]> = {
  Noord: ['Denmark', 'Estonia', 'Finland', 'Latvia', 'Lithuania', 'Sweden'],
  Oost: ['Bulgaria', 'Czech Republic', 'Hungary', 'Poland', 'Romania', 'Slovakia'],
  Zuid: ['Croatia', 'Cyprus', 'Greece', 'Italy', 'Malta', 'Portugal', 'Slovenia', 'Spain'],
  West: ['Austria', 'Belgium', 'France', 'Germany', 'Ireland', 'Luxembourg', 'Netherlands'],
};

type ClustermapManifest = {
  overall: string;
  councils?: string[];
  topics?: string[];
};

type CountryClustermapDataset = {
  label?: string;
  category?: string;
  data: ClustermapMatrix & {
    pair_records?: unknown;
  };
};

type AggregatedClustermapPayload = {
  overall: ClustermapMatrix & { pair_records?: unknown };
  councils: (ClustermapMatrix & { pair_records?: unknown })[];
  topics: (ClustermapMatrix & { pair_records?: unknown })[];
};

type ClusterNode = {
  indices: number[];
  left?: ClusterNode;
  right?: ClusterNode;
};

type CountryPosition = {
  country: string;
  approval: number | null;
  stance?: string | null;
  rationale?: string | null;
  dimension_scores?: DimensionScore[];
};

type DimensionDefinition = {
  short_name: string;
  description: string;
  negative_pole: string;
  positive_pole: string;
};

type DimensionScore = {
  dimension: string;
  score: number;
};

type DisagreementResult = {
  proposal_id: string;
  title: string;
  council: string;
  topic: string;
  disagreement: number | null;
  average_set_a: number | null;
  average_set_b: number | null;
  dimensions: DimensionDefinition[];
  set_a_positions: CountryPosition[];
  set_b_positions: CountryPosition[];
};

type DisagreementResponse = {
  topic?: string | null;
  council?: string | null;
  total_proposals: number;
  proposals_with_both_sets: number;
  missing_countries: Record<string, string[]>;
  results: DisagreementResult[];
};

type VarianceResult = {
  proposal_id: string;
  title: string;
  council: string;
  topic: string;
  variance: number | null;
  mean_approval: number | null;
  dimensions: DimensionDefinition[];
  country_positions: CountryPosition[];
  missing_countries: string[];
};

type VarianceResponse = {
  topic?: string | null;
  council?: string | null;
  total_proposals: number;
  proposals_with_observations: number;
  missing_countries: Record<string, string[]>;
  results: VarianceResult[];
};

const sanitizeMatrix = (matrix: (number | null)[][]) =>
  matrix.map((row, rowIndex) =>
    row.map((value, columnIndex) => {
      if (rowIndex === columnIndex) {
        return 0;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      return 1;
    })
  );

const averageLinkageDistance = (a: ClusterNode, b: ClusterNode, distanceMatrix: number[][]) => {
  let sum = 0;
  let count = 0;

  for (const i of a.indices) {
    for (const j of b.indices) {
      sum += distanceMatrix[i][j];
      count++;
    }
  }

  return count > 0 ? sum / count : 1;
};

const computeHierarchicalOrder = (distanceMatrix: (number | null)[][]) => {
  const sanitized = sanitizeMatrix(distanceMatrix);
  const size = sanitized.length;

  if (size === 0) return [];
  if (size === 1) return [0];

  const nodes: ClusterNode[] = Array.from({ length: size }, (_, index) => ({
    indices: [index],
  }));

  while (nodes.length > 1) {
    let minDistance = Number.POSITIVE_INFINITY;
    let minI = 0;
    let minJ = 1;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = averageLinkageDistance(nodes[i], nodes[j], sanitized);
        if (distance < minDistance) {
          minDistance = distance;
          minI = i;
          minJ = j;
        }
      }
    }

    const right = nodes[minJ];
    const left = nodes[minI];
    const merged: ClusterNode = {
      indices: [...left.indices, ...right.indices],
      left,
      right,
    };

    nodes.splice(minJ, 1);
    nodes.splice(minI, 1);
    nodes.push(merged);
  }

  const order: number[] = [];

  const traverse = (node?: ClusterNode) => {
    if (!node) return;
    if (!node.left && !node.right) {
      order.push(node.indices[0]);
      return;
    }
    traverse(node.left);
    traverse(node.right);
  };

  traverse(nodes[0]);
  return order;
};

const getMatrixMaxDistance = (matrix?: ClustermapMatrix) => {
  if (!matrix) return 0;
  let max = 0;
  for (const row of matrix.distance_matrix) {
    for (const value of row) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        max = Math.max(max, value);
      }
    }
  }
  return max;
};

const getMatrixDistanceRange = (matrix?: ClustermapMatrix): DistanceRange => {
  if (!matrix) {
    return { min: 0, max: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of matrix.distance_matrix) {
    for (const value of row) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 0 };
  }
  return { min, max };
};

const getGlobalMaxDistance = (payload: ClustermapResponse) => {
  let maxDistance = getMatrixMaxDistance(payload.overall);
  for (const matrix of payload.councils) {
    maxDistance = Math.max(maxDistance, getMatrixMaxDistance(matrix));
  }
  for (const matrix of payload.topics) {
    maxDistance = Math.max(maxDistance, getMatrixMaxDistance(matrix));
  }
  return maxDistance || 1;
};

const formatScore = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return 'n.v.t.';
  }
  return value.toFixed(2);
};

const formatDistance = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return 'n.v.t.';
  }
  return value.toFixed(3);
};

const getPairCount = (value: number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const normalizeCloseness = (
  value: number | null,
  mode: ColorScaleMode,
  globalMaxDistance: number,
  range: DistanceRange
) => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (mode === 'relative') {
    const span = range.max - range.min;
    if (span <= 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, 1 - (value - range.min) / span));
  }
  if (globalMaxDistance <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, 1 - value / globalMaxDistance));
};

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`);
const sanitizeRelativePath = (path: string) => path.replace(/^\/+/, '');
const joinPublicPath = (basePath: string, relativePath: string) =>
  `${ensureTrailingSlash(basePath)}${sanitizeRelativePath(relativePath)}`;
const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

const normalizeDatasetPath = (path: string) =>
  path.startsWith(COUNTRY_CLUSTERMAP_DIR) ? path : `${COUNTRY_CLUSTERMAP_DIR}${path}`;

async function fetchJson<T>(url: string, resourceLabel: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kon ${resourceLabel} niet laden (status ${response.status}).`);
  }
  return (await response.json()) as T;
}

const parseDataset = (dataset: CountryClustermapDataset): ClustermapMatrix => {
  const { pair_records: _ignored, ...matrix } = dataset.data;
  return {
    ...matrix,
    label: matrix.label ?? dataset.label,
  };
};

const fetchDatasetMatrix = async (basePath: string, relativePath: string) => {
  const normalizedPath = normalizeDatasetPath(relativePath);
  const url = joinPublicPath(basePath, normalizedPath);
  const payload = await fetchJson<CountryClustermapDataset>(url, normalizedPath);
  return parseDataset(payload);
};

const stripPairRecords = (matrix: ClustermapMatrix & { pair_records?: unknown }): ClustermapMatrix => {
  const { pair_records: _ignored, ...rest } = matrix;
  return rest as ClustermapMatrix;
};

const fetchAggregatedClustermap = async (basePath: string): Promise<ClustermapResponse> => {
  let lastError: Error | null = null;

  for (const relativePath of COUNTRY_APPROVAL_DATASET_CANDIDATES) {
    try {
      const url = joinPublicPath(basePath, relativePath);
      const payload = await fetchJson<AggregatedClustermapPayload>(url, relativePath);
      if (IS_DEV) {
        console.info('[CountryApprovalHeatmapDetailed] dataset geladen:', relativePath);
      }
      return {
        overall: stripPairRecords(payload.overall),
        councils: payload.councils.map(stripPairRecords),
        topics: payload.topics.map(stripPairRecords),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (IS_DEV) {
        console.warn(
          `[CountryApprovalHeatmapDetailed] laden van ${relativePath} mislukt; probeer volgende dataset.`,
          lastError
        );
      }
    }
  }

  throw lastError ?? new Error('Geen raadspositiesdataset beschikbaar.');
};

const fetchManifestClustermap = async (basePath: string): Promise<ClustermapResponse> => {
  const manifestUrl = joinPublicPath(basePath, COUNTRY_CLUSTERMAP_MANIFEST);
  const manifest = await fetchJson<ClustermapManifest>(manifestUrl, COUNTRY_CLUSTERMAP_MANIFEST);
  if (!manifest.overall) {
    throw new Error('country_clustermaps manifest mist een overall-bestand.');
  }

  const councilPaths = manifest.councils ?? [];
  const topicPaths = manifest.topics ?? [];

  const [overallMatrix, councilsMatrices, topicsMatrices] = await Promise.all([
    fetchDatasetMatrix(basePath, manifest.overall),
    Promise.all(councilPaths.map((path) => fetchDatasetMatrix(basePath, path))),
    Promise.all(topicPaths.map((path) => fetchDatasetMatrix(basePath, path))),
  ]);

  return {
    overall: overallMatrix,
    councils: councilsMatrices,
    topics: topicsMatrices,
  };
};

const fetchDetailedHeatmapPayload = async (basePath: string): Promise<ClustermapResponse> => {
  try {
    return await fetchAggregatedClustermap(basePath);
  } catch (error) {
    if (IS_DEV) {
      console.warn(
        '[CountryApprovalHeatmapDetailed] gebruik manifestfallback voor raadspositiesdataset.',
        error
      );
    }
    return fetchManifestClustermap(basePath);
  }
};

const postJson = async <T,>(path: string, body: unknown, signal: AbortSignal): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export default function CountryApprovalHeatmapDetailed() {
  const basePath = import.meta.env.BASE_URL;
  const [data, setData] = useState<PreparedClustermapResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('topic');
  const [selectedCouncil, setSelectedCouncil] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [globalMaxDistance, setGlobalMaxDistance] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [activeCluster, setActiveCluster] = useState<ClusterId>('clusterA');
  const [clusterSelections, setClusterSelections] = useState<ClusterSelections>({
    clusterA: [],
    clusterB: [],
  });
  const [clusterStats, setClusterStats] = useState<ClusterStats>({
    clusterA: { averageDistance: null, pairCount: 0 },
    clusterB: { averageDistance: null, pairCount: 0 },
  });
  const [clusterComparison, setClusterComparison] = useState<ClusterComparison>({
    averageDistance: null,
    pairCount: 0,
  });
  const [clusterInsights, setClusterInsights] = useState<ClusterInsightsState>({
    status: 'idle',
    disagreement: null,
    variance: { clusterA: null, clusterB: null },
  });
  const [colorScaleMode, setColorScaleMode] = useState<ColorScaleMode>('global');

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchDetailedHeatmapPayload(basePath);

        if (!cancelled) {
          const prepared = preparePayload(payload);
          setData(prepared);
          setGlobalMaxDistance(getGlobalMaxDistance(prepared));
          setSelectedCouncil((prev) => prev || prepared.councils[0]?.label || '');
          setSelectedTopic((prev) => prev || prepared.topics[0]?.label || '');
          if (IS_DEV) {
            console.info(
              '[CountryApprovalHeatmapDetailed] datasets loaded',
              {
                councils: prepared.councils.length,
                topics: prepared.topics.length,
              }
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Onbekende fout bij het laden van de heatmapdata.');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [basePath]);

  const selectedMatrix: NamedMatrix | null = useMemo(() => {
    if (!data) return null;
    if (viewMode === 'overall') {
      return data.overall;
    }
    if (viewMode === 'council') {
      return (
        data.councils.find((entry) => entry.label === selectedCouncil) ??
        data.councils[0] ??
        null
      );
    }
    return (
      data.topics.find((entry) => entry.label === selectedTopic) ??
      data.topics[0] ??
      null
    );
  }, [data, viewMode, selectedCouncil, selectedTopic]);

  const filterContext = useMemo(() => {
    if (viewMode === 'topic' && selectedTopic) {
      return { topic: selectedTopic, label: `Thema: ${selectedTopic}` };
    }
    if (viewMode === 'council' && selectedCouncil) {
      return { council: selectedCouncil, label: `Raad: ${selectedCouncil}` };
    }
    if (viewMode === 'overall') {
      return { label: 'Alle onderwerpen en raden' };
    }
    return null;
  }, [viewMode, selectedTopic, selectedCouncil]);

  const distanceRange = useMemo<DistanceRange>(() => {
    if (!selectedMatrix) {
      return { min: 0, max: 0 };
    }
    return getMatrixDistanceRange(selectedMatrix);
  }, [selectedMatrix]);
  const distanceRangeMin = distanceRange.min;
  const distanceRangeMax = distanceRange.max;

  useEffect(() => {
    if (!selectedMatrix) {
      setClusterSelections({ clusterA: [], clusterB: [] });
      return;
    }
    setClusterSelections((prev) => ({
      clusterA: prev.clusterA.filter((country) => selectedMatrix.countries.includes(country)),
      clusterB: prev.clusterB.filter((country) => selectedMatrix.countries.includes(country)),
    }));
  }, [selectedMatrix]);

  useEffect(() => {
    if (IS_DEV && selectedMatrix) {
      console.info('[CountryApprovalHeatmapDetailed] switched dataset', selectedMatrix.label);
    }
  }, [selectedMatrix]);

  const rows = useMemo<HeatMapSerie<HeatmapCellData, {}>[]>(() => {
    if (!selectedMatrix) return [];

    const { countries, distance_matrix: distanceMatrix, pair_count_matrix: pairCounts } = selectedMatrix;
    const baseOrder = computeHierarchicalOrder(distanceMatrix);
    const included = new Set<number>();

    const order = (() => {
      if (!baseOrder.length) return baseOrder;
      const prioritizedOrder: number[] = [];
      const prioritizeCluster = (clusterId: ClusterId) => {
        const clusterSet = new Set(clusterSelections[clusterId]);
        if (!clusterSet.size) return;
        for (const index of baseOrder) {
          if (included.has(index)) continue;
          const country = countries[index];
          if (clusterSet.has(country)) {
            included.add(index);
            prioritizedOrder.push(index);
          }
        }
      };

      for (const option of CLUSTER_OPTIONS) {
        prioritizeCluster(option.id);
      }
      for (const index of baseOrder) {
        if (!included.has(index)) {
          included.add(index);
          prioritizedOrder.push(index);
        }
      }
      return prioritizedOrder;
    })();

    if (IS_DEV) {
      console.time(`[CountryApprovalHeatmapDetailed] build rows (${selectedMatrix.label})`);
    }

    const result = order.map((rowIndex) => ({
      id: countries[rowIndex],
      data: order.map((columnIndex) => {
        const distance =
          distanceMatrix[rowIndex]?.[columnIndex] ?? null;
        const count = pairCounts[rowIndex]?.[columnIndex] ?? null;

        return {
          x: countries[columnIndex],
          y: normalizeCloseness(
            typeof distance === 'number' ? distance : null,
            colorScaleMode,
            globalMaxDistance,
            distanceRange
          ),
          distance: typeof distance === 'number' ? distance : null,
          count: getPairCount(typeof count === 'number' ? count : null),
        };
      }),
    }));
    if (IS_DEV) {
      console.timeEnd(`[CountryApprovalHeatmapDetailed] build rows (${selectedMatrix.label})`);
    }
    return result;
  }, [
    selectedMatrix,
    globalMaxDistance,
    clusterSelections,
    colorScaleMode,
    distanceRangeMin,
    distanceRangeMax,
  ]);

  useEffect(() => {
    if (!selectedMatrix) {
      setClusterStats({
        clusterA: { averageDistance: null, pairCount: 0 },
        clusterB: { averageDistance: null, pairCount: 0 },
      });
      setClusterComparison({ averageDistance: null, pairCount: 0 });
      return;
    }

    const matrix = selectedMatrix.distance_matrix;
    const countryIndex = new Map(
      selectedMatrix.countries.map((country, index) => [country, index])
    );

    const stats: ClusterStats = {
      clusterA: { averageDistance: null, pairCount: 0 },
      clusterB: { averageDistance: null, pairCount: 0 },
    };

    for (const option of CLUSTER_OPTIONS) {
      const uniqueCountries = Array.from(new Set(clusterSelections[option.id]));
      if (uniqueCountries.length < 2) {
        stats[option.id] = { averageDistance: null, pairCount: 0 };
        continue;
      }

      const indices = uniqueCountries
        .map((country) => countryIndex.get(country))
        .filter((value): value is number => typeof value === 'number');

      if (indices.length < 2) {
        stats[option.id] = { averageDistance: null, pairCount: 0 };
        continue;
      }

      let total = 0;
      let count = 0;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const value = matrix[indices[i]]?.[indices[j]];
          if (typeof value === 'number' && Number.isFinite(value)) {
            total += value;
            count++;
          }
        }
      }

      stats[option.id] = {
        averageDistance: count > 0 ? total / count : null,
        pairCount: count,
      };
    }

    setClusterStats(stats);

    const clusterASet = Array.from(new Set(clusterSelections.clusterA));
    const clusterBSet = Array.from(new Set(clusterSelections.clusterB));
    if (!clusterASet.length || !clusterBSet.length) {
      setClusterComparison({ averageDistance: null, pairCount: 0 });
    } else {
      let betweenTotal = 0;
      let betweenCount = 0;
      for (const countryA of clusterASet) {
        const indexA = countryIndex.get(countryA);
        if (indexA === undefined) continue;
        for (const countryB of clusterBSet) {
          const indexB = countryIndex.get(countryB);
          if (indexB === undefined) continue;
          const value = matrix[indexA]?.[indexB];
          if (typeof value === 'number' && Number.isFinite(value)) {
            betweenTotal += value;
            betweenCount++;
          }
        }
      }
      setClusterComparison({
        averageDistance: betweenCount > 0 ? betweenTotal / betweenCount : null,
        pairCount: betweenCount,
      });
    }
  }, [clusterSelections, selectedMatrix]);

  useEffect(() => {
    if (!filterContext) {
      setClusterInsights({
        status: 'unavailable',
        reason: 'Selecteer een raad of thema om inzichten op te halen.',
        disagreement: null,
        variance: { clusterA: null, clusterB: null },
      });
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const filterPayload: Record<string, string> = {};
    if (filterContext.topic) filterPayload.topic = filterContext.topic;
    if (filterContext.council) filterPayload.council = filterContext.council;

    const hasClusterA = clusterSelections.clusterA.length > 0;
    const hasClusterB = clusterSelections.clusterB.length > 0;
    const varianceTargets = CLUSTER_OPTIONS.filter(
      (option) => clusterSelections[option.id].length > 0
    );
    const shouldFetch =
      (hasClusterA && hasClusterB) || varianceTargets.length > 0;

    if (!shouldFetch) {
      setClusterInsights({
        status: 'unavailable',
        reason: 'Selecteer minstens één land om inzichten op te halen.',
        disagreement: null,
        variance: { clusterA: null, clusterB: null },
      });
      return () => controller.abort();
    }

    setClusterInsights((prev) => ({
      status: 'loading',
      reason: undefined,
      disagreement: prev.disagreement,
      variance: prev.variance ?? { clusterA: null, clusterB: null },
    }));

    let nextDisagreement: DisagreementResponse | null = null;
    const nextVariance: Record<ClusterId, VarianceResponse | null> = {
      clusterA: null,
      clusterB: null,
    };

    const requests: Promise<void>[] = [];

    if (hasClusterA && hasClusterB) {
      const payload = {
        ...filterPayload,
        set_a: clusterSelections.clusterA,
        set_b: clusterSelections.clusterB,
      };
      requests.push(
        postJson<DisagreementResponse>('country-positions/detailed/disagreement', payload, signal).then((data) => {
          nextDisagreement = data;
        })
      );
    }

    for (const option of CLUSTER_OPTIONS) {
      const countries = clusterSelections[option.id];
      if (!countries.length) {
        nextVariance[option.id] = null;
        continue;
      }
      const payload = {
        ...filterPayload,
        set_a: countries,
      };
      requests.push(
        postJson<VarianceResponse>('country-positions/detailed/variance', payload, signal).then((data) => {
          nextVariance[option.id] = data;
        })
      );
    }

    Promise.all(requests)
      .then(() => {
        if (signal.aborted) return;
        setClusterInsights({
          status: 'ready',
          disagreement: nextDisagreement,
          variance: nextVariance,
        });
      })
      .catch((error) => {
        if (signal.aborted) {
          return;
        }
        setClusterInsights({
          status: 'error',
          reason:
            error instanceof Error
              ? error.message
              : 'Onbekende fout bij het ophalen van inzichten.',
          disagreement: nextDisagreement,
          variance: nextVariance,
        });
      });

    return () => controller.abort();
  }, [filterContext, clusterSelections]);

  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((serie, index) => {
      map.set(String(serie.id), index);
    });
    return map;
  }, [rows]);

  const columnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    const columns = rows[0]?.data ?? [];
    columns.forEach((datum, index) => {
      map.set(String(datum.x), index);
    });
    return map;
  }, [rows]);

  const clusterSegments = useMemo<ClusterOverlaySegment[]>(() => {
    if (!rows.length) return [];
    const result: ClusterOverlaySegment[] = [];
    const rowCountries = rows.map((serie) => String(serie.id));

    for (const option of CLUSTER_OPTIONS) {
      const selectionSet = new Set(clusterSelections[option.id]);
      if (!selectionSet.size) continue;

      let start: number | null = null;
      let countriesInSegment: string[] = [];
      rowCountries.forEach((country, index) => {
        if (selectionSet.has(country)) {
          if (start === null) {
            start = index;
            countriesInSegment = [country];
          } else {
            countriesInSegment.push(country);
          }
        } else if (start !== null) {
          result.push({
            clusterId: option.id,
            startIndex: start,
            endIndex: index - 1,
            countries: countriesInSegment,
          });
          start = null;
          countriesInSegment = [];
        }
      });

      if (start !== null) {
        result.push({
          clusterId: option.id,
          startIndex: start,
          endIndex: rowCountries.length - 1,
          countries: countriesInSegment,
        });
      }
    }

    return result;
  }, [rows, clusterSelections]);

  const addCountriesToCluster = useCallback(
    (clusterId: ClusterId, countries: string[]) => {
      if (!selectedMatrix) return;
      const allowed = new Set(selectedMatrix.countries);
      const valid = countries.filter((country) => allowed.has(country));
      if (!valid.length) return;
      const additions = new Set(valid);
      setClusterSelections((prev) => {
        const next: ClusterSelections = {
          clusterA: [...prev.clusterA],
          clusterB: [...prev.clusterB],
        };

        const targetSet = new Set(next[clusterId]);
        let changed = false;
        for (const country of additions) {
          if (!targetSet.has(country)) {
            targetSet.add(country);
            changed = true;
          }
        }
        next[clusterId] = Array.from(targetSet);

        for (const option of CLUSTER_OPTIONS) {
          if (option.id === clusterId) continue;
          const filtered = next[option.id].filter((country) => !additions.has(country));
          if (filtered.length !== next[option.id].length) {
            next[option.id] = filtered;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    },
    [selectedMatrix]
  );

  const handleManualAddCountry = useCallback(
    (clusterId: ClusterId, country: string) => {
      addCountriesToCluster(clusterId, [country]);
    },
    [addCountriesToCluster]
  );

  const handleSetCluster = useCallback(
    (clusterId: ClusterId, countries: string[]) => {
      if (!selectedMatrix) return;
      const allowed = new Set(selectedMatrix.countries);
      const valid = countries.filter((country) => allowed.has(country));

      setClusterSelections((prev) => {
        const next: ClusterSelections = {
          clusterA: [...prev.clusterA],
          clusterB: [...prev.clusterB],
        };

        // Set target cluster to exactly the valid preset countries
        next[clusterId] = valid;

        // Remove these countries from the other cluster
        for (const option of CLUSTER_OPTIONS) {
          if (option.id === clusterId) continue;
          next[option.id] = next[option.id].filter((c) => !valid.includes(c));
        }

        return next;
      });
    },
    [selectedMatrix]
  );

  const handleRemoveCountry = useCallback((clusterId: ClusterId, country: string) => {
    setClusterSelections((prev) => ({
      ...prev,
      [clusterId]: prev[clusterId].filter((entry) => entry !== country),
    }));
  }, []);

  const handleClearCluster = useCallback((clusterId: ClusterId) => {
    setClusterSelections((prev) => ({
      ...prev,
      [clusterId]: [],
    }));
  }, []);

  const handleHoverChange = useCallback(
    (cell: ComputedCell<HeatmapCellData> | null) => {
      if (!cell) {
        setHoveredCell(null);
        return;
      }

      const rowIndex = rowIndexMap.get(String(cell.serieId));
      const columnIndex = columnIndexMap.get(String(cell.data.x));

      if (rowIndex === undefined || columnIndex === undefined) {
        setHoveredCell(null);
        return;
      }

      setHoveredCell({ rowIndex, columnIndex });
    },
    [rowIndexMap, columnIndexMap]
  );

  const renderTooltip = useMemo<TooltipComponent<HeatmapCellData>>(() => {
    return function HeatmapTooltip({ cell }) {
      useEffect(() => {
        handleHoverChange(cell);
        return () => handleHoverChange(null);
      }, [cell, handleHoverChange]);

      return (
        <div className="rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-md">
          <div className="font-semibold text-[rgb(0,153,168)]">
            {cell.serieId} ↔ {cell.data.x}
          </div>
          <div>Afstemmingsscore: {formatScore(cell.data.y)}</div>
          <div>Gemiddelde afstand: {formatDistance(cell.data.distance)}</div>
          <div>Pair count: {cell.data.count}</div>
        </div>
      );
    };
  }, [handleHoverChange]);

  const handleCellClick = useCallback(
    (cell: ComputedCell<HeatmapCellData>) => {
      const countries = [String(cell.serieId), String(cell.data.x)];
      addCountriesToCluster(activeCluster, countries);
      console.info('[CountryApprovalHeatmapDetailed] cell click', {
        cluster: activeCluster,
        countries,
        closeness: cell.data.y,
        distance: cell.data.distance,
        count: cell.data.count,
      });
    },
    [activeCluster, addCountriesToCluster]
  );

  if (loading) {
    return (
      <Card className="flex h-[680px] items-center justify-center bg-white/70 text-slate-500">
        Heatmap laden…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex h-[680px] items-center justify-center bg-red-50 text-sm text-red-700">
        {error}
      </Card>
    );
  }

  if (!selectedMatrix || !rows.length) {
    return (
      <Card className="flex h-[680px] items-center justify-center bg-white/70 text-slate-500">
        Geen gegevens beschikbaar voor deze selectie.
      </Card>
    );
  }

  const averageDistance = selectedMatrix.average_distance ?? null;
  const averagePairCount = selectedMatrix.average_pair_count ?? null;

  return (
    <Card className="flex min-h-[680px] flex-col gap-4 bg-white/90 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Weergave
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setViewMode(option.id)}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                    viewMode === option.id
                      ? 'border-[rgb(0,153,168)] bg-[rgb(0,153,168)] text-white'
                      : 'border-[rgb(0,153,168)] text-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)]/10'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {viewMode !== 'overall' && (
              <div className="mt-3 w-full min-w-0 lg:w-72">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Kies {viewMode === 'council' ? 'raad' : 'thema'}
                </label>
                <select
                  value={viewMode === 'council' ? selectedCouncil : selectedTopic}
                  onChange={(event) =>
                    viewMode === 'council'
                      ? setSelectedCouncil(event.target.value)
                      : setSelectedTopic(event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 shadow-sm focus:border-[rgb(0,153,168)] focus:outline-none"
                >
                  {(viewMode === 'council' ? data?.councils : data?.topics)?.map((entry) => (
                    <option key={entry.label} value={entry.label ?? 'Onbekend'}>
                      {entry.label ?? 'Onbekend'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 rounded-md border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
          <div>
            <span className="text-xs uppercase tracking-wide text-slate-500">Dataset</span>
            <div className="font-semibold text-slate-800">{selectedMatrix.label}</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-slate-500">Gem. afstand</span>
            <div className="font-semibold text-slate-800">{formatDistance(averageDistance)}</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-slate-500">Gem. pair count</span>
            <div className="font-semibold text-slate-800">
              {averagePairCount !== null && Number.isFinite(averagePairCount)
                ? averagePairCount.toFixed(1)
                : 'n.v.t.'}
            </div>
          </div>
          <div className="min-w-[220px]">
            <span className="text-xs uppercase tracking-wide text-slate-500">Kleurschaal</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCALE_MODE_OPTIONS.map((option) => {
                const isActive = colorScaleMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setColorScaleMode(option.id)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-1.5 text-left text-xs transition',
                      isActive
                        ? 'border-[rgb(0,153,168)] bg-[rgb(0,153,168)] text-white shadow-sm'
                        : 'border-slate-300 text-slate-600 hover:border-[rgb(0,153,168)] hover:text-[rgb(0,153,168)]'
                    )}
                  >
                    <div className="font-semibold">{option.label}</div>
                    <div className="text-[10px] opacity-80">{option.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ClusterSelectionPanel
        selections={clusterSelections}
        activeCluster={activeCluster}
        onActiveClusterChange={setActiveCluster}
        availableCountries={selectedMatrix.countries}
        onAddCountry={handleManualAddCountry}
        onRemoveCountry={handleRemoveCountry}
        onClearCluster={handleClearCluster}
        onSetCluster={handleSetCluster}
        clusterStats={clusterStats}
        clusterComparison={clusterComparison}
      />

      <div className="flex-1 min-h-0">
        <HeatmapViewport
          rows={rows}
          tooltip={renderTooltip}
          onCellClick={handleCellClick}
          hoveredCell={hoveredCell}
          clusterSegments={clusterSegments}
        />
      </div>

      <ClusterInsightsSummary
        state={clusterInsights}
        filterContext={filterContext}
      />
    </Card>
  );
}

type HeatmapViewportProps = {
  rows: HeatMapSerie<HeatmapCellData, {}>[];
  tooltip: TooltipComponent<HeatmapCellData>;
  onCellClick: (cell: ComputedCell<HeatmapCellData>) => void;
  hoveredCell: HoveredCell | null;
  clusterSegments: ClusterOverlaySegment[];
};

const MIN_SIDE = 480;
const MAX_SIDE = 1040;

type HoveredCell = {
  rowIndex: number;
  columnIndex: number;
};

const HeatmapViewport = ({ rows, tooltip, onCellClick, hoveredCell, clusterSegments }: HeatmapViewportProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState<number>(() => MIN_SIDE);

  const rowCount = rows.length;
  const columnCount = rows[0]?.data.length ?? 0;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (!width) return;
      const nextSide = Math.max(MIN_SIDE, Math.min(width, MAX_SIDE));
      setSide((prev) => (prev === nextSide ? prev : nextSide));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: MAX_SIDE,
          height: side,
          transition: 'height 120ms ease',
        }}
      >
        <MemoizedHeatmap rows={rows} tooltip={tooltip} onCellClick={onCellClick} />
        <ClusterOverlay
          side={side}
          rowCount={rowCount}
          columnCount={columnCount}
          segments={clusterSegments}
        />
        <EdgeHighlightOverlay
          side={side}
          hoveredCell={hoveredCell}
          rowCount={rowCount}
          columnCount={columnCount}
        />
      </div>
    </div>
  );
};

const MemoizedHeatmap = memo(function Heatmap({
  rows,
  tooltip,
  onCellClick,
}: {
  rows: HeatMapSerie<HeatmapCellData, {}>[];
  tooltip: TooltipComponent<HeatmapCellData>;
  onCellClick: (cell: ComputedCell<HeatmapCellData>) => void;
}) {
  const pixelRatio =
    typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

  return (
    <ResponsiveHeatMapCanvas<HeatmapCellData, {}>
      data={rows}
      margin={HEATMAP_MARGIN}
      valueFormat={(value) => formatScore(typeof value === 'number' ? value : null)}
      forceSquare
      xInnerPadding={0.03}
      yInnerPadding={0.03}
      colors={{
        type: 'diverging',
        scheme: 'red_yellow_green',
        minValue: 0,
        maxValue: 1,
      }}
      axisTop={{
        tickSize: 5,
        tickPadding: 5,
        tickRotation: -55,
      }}
      axisLeft={{
        tickSize: 5,
        tickPadding: 5,
      }}
      axisRight={null}
      axisBottom={null}
      hoverTarget="cell"
      isInteractive
      enableLabels={false}
      activeOpacity={1}
      inactiveOpacity={1}
      borderWidth={1}
      borderColor={{ from: 'color', modifiers: [['brighter', 0.5]] }}
      emptyColor="#f8fafc"
      legends={[
        {
          anchor: 'bottom',
          direction: 'row',
          translateY: 40,
          length: 220,
          thickness: 12,
          tickSize: 0,
          title: 'Afstemmingsscore (1 = meest gelijk)',
          titleAlign: 'middle',
          titleOffset: 12,
        },
      ]}
      tooltip={tooltip}
      onClick={onCellClick}
      pixelRatio={pixelRatio}
    />
  );
});

type EdgeHighlightOverlayProps = {
  side: number;
  hoveredCell: HoveredCell | null;
  rowCount: number;
  columnCount: number;
};

const EdgeHighlightOverlay = ({
  side,
  hoveredCell,
  rowCount,
  columnCount,
}: EdgeHighlightOverlayProps) => {
  if (!hoveredCell) {
    return null;
  }

  const layout = computeHeatmapLayout(side, rowCount, columnCount);
  if (!layout) {
    return null;
  }

  const { cellSize, chartWidth, chartHeight, offsetX, offsetY } = layout;
  const rowTop = offsetY + hoveredCell.rowIndex * cellSize;
  const columnLeft = offsetX + hoveredCell.columnIndex * cellSize;

  const highlightColor = 'rgba(0, 153, 168, 0.12)';
  const borderColor = 'rgba(0, 153, 168, 0.5)';

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          width: chartWidth,
          top: rowTop,
          height: cellSize,
          background: highlightColor,
          borderTop: `1px solid ${borderColor}`,
          borderBottom: `1px solid ${borderColor}`,
          transition: 'all 80ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: offsetY,
          height: chartHeight,
          left: columnLeft,
          width: cellSize,
          background: highlightColor,
          borderLeft: `1px solid ${borderColor}`,
          borderRight: `1px solid ${borderColor}`,
          transition: 'all 80ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: rowTop,
          left: columnLeft,
          width: cellSize,
          height: cellSize,
          border: `2px solid ${borderColor}`,
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
          background: 'rgba(255, 255, 255, 0.1)',
          transition: 'all 80ms ease',
        }}
      />
    </div>
  );
};

type ClusterOverlayProps = {
  side: number;
  rowCount: number;
  columnCount: number;
  segments: ClusterOverlaySegment[];
};

const ClusterOverlay = ({ side, rowCount, columnCount, segments }: ClusterOverlayProps) => {
  if (!segments.length) {
    return null;
  }

  const layout = computeHeatmapLayout(side, rowCount, columnCount);
  if (!layout) {
    return null;
  }
  const { cellSize, chartWidth, chartHeight, offsetX, offsetY } = layout;

  return (
    <div className="pointer-events-none absolute inset-0">
      {segments.map((segment) => {
        const style = CLUSTER_STYLES[segment.clusterId];
        const rowTop = offsetY + segment.startIndex * cellSize;
        const rowHeight = (segment.endIndex - segment.startIndex + 1) * cellSize;
        const columnLeft = offsetX + segment.startIndex * cellSize;
        const columnWidth = rowHeight;
        const label = `${CLUSTER_LABELS[segment.clusterId]} (${segment.countries.length})`;

        return (
          <div key={`${segment.clusterId}-${segment.startIndex}-${segment.endIndex}`}>
            <div
              style={{
                position: 'absolute',
                left: offsetX,
                width: chartWidth,
                top: rowTop,
                height: rowHeight,
                background: style.fill,
                borderTop: `1px solid ${style.border}`,
                borderBottom: `1px solid ${style.border}`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: offsetY,
                height: chartHeight,
                left: columnLeft,
                width: columnWidth,
                background: style.fill,
                borderLeft: `1px solid ${style.border}`,
                borderRight: `1px solid ${style.border}`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: rowTop,
                left: columnLeft,
                width: columnWidth,
                height: rowHeight,
                border: `2px dashed ${style.border}`,
                borderRadius: 6,
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: rowTop + 8,
                left: columnLeft + 8,
                color: style.color,
                fontWeight: 600,
                fontSize: '0.75rem',
                textShadow: '0 1px 2px rgba(255,255,255,0.8)',
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const computeHeatmapLayout = (side: number, rowCount: number, columnCount: number) => {
  if (!rowCount || !columnCount) {
    return null;
  }
  const innerWidth = Math.max(0, side - HEATMAP_MARGIN.left - HEATMAP_MARGIN.right);
  const innerHeight = Math.max(0, side - HEATMAP_MARGIN.top - HEATMAP_MARGIN.bottom);
  if (!innerWidth || !innerHeight) {
    return null;
  }
  const cellSize = Math.min(innerWidth / columnCount, innerHeight / rowCount);
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return null;
  }
  const chartWidth = cellSize * columnCount;
  const chartHeight = cellSize * rowCount;
  const offsetX = HEATMAP_MARGIN.left + (innerWidth - chartWidth) / 2;
  const offsetY = HEATMAP_MARGIN.top + (innerHeight - chartHeight) / 2;
  return { cellSize, chartWidth, chartHeight, offsetX, offsetY };
};

type ClusterSelectionPanelProps = {
  selections: ClusterSelections;
  activeCluster: ClusterId;
  onActiveClusterChange: (cluster: ClusterId) => void;
  availableCountries: string[];
  onAddCountry: (cluster: ClusterId, country: string) => void;
  onRemoveCountry: (cluster: ClusterId, country: string) => void;
  onClearCluster: (cluster: ClusterId) => void;
  onSetCluster: (cluster: ClusterId, countries: string[]) => void;
  clusterStats: ClusterStats;
  clusterComparison: ClusterComparison;
};

const CountrySearchInput = ({
  availableCountries,
  onSelect,
  placeholder = 'Land toevoegen...',
}: {
  availableCountries: string[];
  onSelect: (country: string) => void;
  placeholder?: string;
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return availableCountries
      .filter((c) => c.toLowerCase().includes(lower))
      .slice(0, 5); // Limit results
  }, [availableCountries, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:border-[rgb(0,153,168)] focus:outline-none"
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.map((country) => (
            <button
              key={country}
              onClick={() => {
                onSelect(country);
                setQuery('');
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 text-slate-700"
            >
              {country}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ClusterSelectionPanel = ({
  selections,
  activeCluster,
  onActiveClusterChange,
  availableCountries,
  onAddCountry,
  onRemoveCountry,
  onClearCluster,
  onSetCluster,
  clusterStats,
  clusterComparison,
}: ClusterSelectionPanelProps) => {

  const renderClusterColumn = (clusterId: ClusterId) => {
    const isActive = activeCluster === clusterId;
    const style = CLUSTER_STYLES[clusterId];
    const stats = clusterStats[clusterId];
    const selected = selections[clusterId];
    const availableForThis = availableCountries.filter(c => !selections.clusterA.includes(c) && !selections.clusterB.includes(c));

    return (
      <div
        className={cn(
          "flex-1 rounded-lg border p-3 transition-all cursor-pointer",
          isActive
            ? "border-[rgb(0,153,168)] bg-white shadow-sm ring-1 ring-[rgb(0,153,168)]/20"
            : "border-slate-200 bg-slate-50/50 hover:bg-white hover:border-[rgb(0,153,168)]/50 hover:shadow-sm"
        )}
        onClick={() => onActiveClusterChange(clusterId)}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.color }} />
            <span className="font-semibold text-sm text-slate-800">{CLUSTER_LABELS[clusterId]}</span>
          </div>
          {selected.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearCluster(clusterId);
              }}
              className="text-[10px] text-slate-400 hover:text-red-500"
            >
              Wis alles
            </button>
          )}
        </div>

        <div className="mb-3 flex gap-4 text-[10px] text-slate-500">
          <div>
            <span className="font-medium text-slate-700">{stats.pairCount}</span> paren
          </div>
          <div>
            Gem. afstand: <span className="font-medium text-slate-700">{stats.averageDistance?.toFixed(3) ?? '-'}</span>
          </div>
        </div>

        <div className="min-h-[60px] space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {selected.map(country => (
              <span
                key={country}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700"
              >
                {country}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCountry(clusterId, country);
                  }}
                  className="ml-0.5 text-slate-400 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
            {selected.length === 0 && (
              <span className="text-[10px] italic text-slate-400 p-1">Leeg</span>
            )}
          </div>

          <div className="pt-2" onClick={e => e.stopPropagation()}>
            <CountrySearchInput
              availableCountries={availableForThis}
              onSelect={(c) => onAddCountry(clusterId, c)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      {/* Header & Presets */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Cluster Selectie</h3>
          <p className="text-xs text-slate-500">
            Selecteer landen voor vergelijking. Klik op een cluster om deze te activeren.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-1.5">
          <span className="text-[10px] font-medium uppercase text-slate-400 px-1">Snelkeuze:</span>
          <div className="flex gap-1">
            {Object.entries(GEOGRAPHIC_CLUSTERS).map(([label, countries]) => (
              <button
                key={label}
                onClick={() => onSetCluster(activeCluster, countries)}
                className="rounded px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white hover:text-[rgb(0,153,168)] hover:shadow-sm transition-all"
                title={`Vul ${CLUSTER_LABELS[activeCluster]} met ${label}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Columns */}
      <div className="grid gap-4 md:grid-cols-2">
        {renderClusterColumn('clusterA')}
        {renderClusterColumn('clusterB')}
      </div>

      {/* Comparison Stats Footer */}
      <div className="flex justify-center border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Afstand tussen clusters:</span>
          <span className="font-semibold text-slate-800">
            {clusterComparison.averageDistance !== null
              ? clusterComparison.averageDistance.toFixed(3)
              : 'n.v.t.'}
          </span>
          <span className="text-slate-400">({clusterComparison.pairCount} paren)</span>
        </div>
      </div>
    </div>
  );
};

type ClusterSummaryProps = {
  clusterId: ClusterId;
  label: string;
  countries: string[];
  color: string;
  stats: { averageDistance: number | null; pairCount: number };
  onClear: () => void;
  onRemove: (country: string) => void;
  onActive: () => void;
  isActive: boolean;
};

const ClusterSummary = ({
  label,
  countries,
  color,
  stats,
  onClear,
  onRemove,
  onActive,
  isActive,
}: ClusterSummaryProps) => (
  <div
    className={cn(
      'rounded-lg border border-slate-200 bg-white/70 p-3 transition',
      isActive && 'border-[rgb(0,153,168)] shadow-sm'
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={onActive} className="flex items-center gap-2 text-left">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </button>
      <div className="text-right text-[10px] uppercase tracking-wide text-slate-400">
        <div>{countries.length} landen</div>
        <div>
          Gem.:{' '}
          <span className="text-slate-600">
            {stats.averageDistance !== null ? stats.averageDistance.toFixed(3) : 'n.v.t.'}
          </span>
        </div>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {countries.length === 0 && (
        <span className="text-xs text-slate-400">Nog geen selectie</span>
      )}
      {countries.map((country) => (
        <button
          key={country}
          type="button"
          onClick={() => onRemove(country)}
          className="group flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 transition hover:text-red-600"
        >
          {country}
          <span className="text-slate-400 transition group-hover:text-red-500">×</span>
        </button>
      ))}
    </div>
    {countries.length > 0 && (
      <button
        type="button"
        onClick={onClear}
        className="mt-2 text-xs text-slate-500 transition hover:text-red-500"
      >
        Cluster legen
      </button>
    )}
  </div>
);

type ClusterInsightsSummaryProps = {
  state: ClusterInsightsState;
  filterContext: { label: string } | null;
};



const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type HoveredTooltip = {
  content: string;
  x: number;
  y: number;
  position: 'top' | 'bottom';
};

type ScatterNodeTooltipState = {
  country: string;
  xScore: number;
  yScore: number | null;
  x: number;
  y: number;
  position: 'top' | 'bottom';
};

const clampTooltipPosition = (x: number, width: number = 256) => {
  const halfWidth = width / 2;
  if (x < halfWidth) {
    return { left: 0, transform: 'translateX(0)' };
  }
  return { left: x, transform: 'translateX(-50%)' };
};

const TooltipBubble = ({ tooltip }: { tooltip: HoveredTooltip }) => {
  const horizontal = clampTooltipPosition(tooltip.x);
  const verticalTransform =
    tooltip.position === 'top'
      ? 'translateY(-100%) translateY(-8px)'
      : 'translateY(8px)';
  const arrowClass =
    tooltip.position === 'top' ? 'top-full border-t-white' : 'bottom-full border-b-white';

  return (
    <div
      className="absolute z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl pointer-events-none"
      style={{
        left: horizontal.left,
        top: tooltip.y,
        transform: `${horizontal.transform} ${verticalTransform}`,
      }}
    >
      <div className="whitespace-pre-wrap">{tooltip.content}</div>
      <div
        className={cn('absolute border-4 border-transparent', arrowClass)}
        style={{
          left: tooltip.x < 128 ? tooltip.x : '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
};

const ScatterNodeTooltip = ({
  tooltip,
  xLabel,
  yLabel,
}: {
  tooltip: ScatterNodeTooltipState;
  xLabel: string;
  yLabel: string | null;
}) => {
  const horizontal = clampTooltipPosition(tooltip.x);
  const verticalTransform =
    tooltip.position === 'top'
      ? 'translateY(-100%) translateY(-12px)'
      : 'translateY(12px)';

  const formatValue = (value: number | null) =>
    value === null || !Number.isFinite(value) ? 'n.v.t.' : value.toFixed(3);

  return (
    <div
      className="absolute z-50 w-64 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-xl backdrop-blur-sm"
      style={{
        left: horizontal.left,
        top: tooltip.y,
        transform: `${horizontal.transform} ${verticalTransform}`,
      }}
    >
      <strong className="text-slate-700">{tooltip.country}</strong>
      <div className="mt-1 space-y-0.5 text-slate-500">
        <div className="flex justify-between gap-4">
          <span>{xLabel}:</span>
          <span className="font-mono text-slate-700">{formatValue(tooltip.xScore)}</span>
        </div>
        {yLabel && (
          <div className="flex justify-between gap-4">
            <span>{yLabel}:</span>
            <span className="font-mono text-slate-700">{formatValue(tooltip.yScore)}</span>
          </div>
        )}
      </div>
      <div
        className={cn(
          'absolute border-4 border-transparent',
          tooltip.position === 'top' ? 'top-full border-t-white' : 'bottom-full border-b-white'
        )}
        style={{
          left: tooltip.x < 128 ? tooltip.x : '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
};

const DimensionScatterPlot = ({
  dimensions,
  positionsA,
  positionsB,
  selectedDimensions,
}: {
  dimensions: DimensionDefinition[];
  positionsA: CountryPosition[];
  positionsB: CountryPosition[];
  selectedDimensions: string[];
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const hasDimensions = selectedDimensions.length > 0;
  const xDim = hasDimensions ? dimensions.find((d) => d.short_name === selectedDimensions[0]) : null;
  const yDimensionKey = selectedDimensions.length > 1 ? selectedDimensions[1] : null;
  const yDim = yDimensionKey ? dimensions.find((d) => d.short_name === yDimensionKey) : null;

  const [hoveredLabel, setHoveredLabel] = useState<HoveredTooltip | null>(null);
  const [hoveredNodeTooltip, setHoveredNodeTooltip] = useState<ScatterNodeTooltipState | null>(null);

  const handleLabelEnter = (e: React.MouseEvent, content: string) => {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const container = target.closest('.relative');
    const containerRect = container?.getBoundingClientRect();

    if (!containerRect) return;

    const relativeY = rect.top - containerRect.top;
    const relativeX = rect.left - containerRect.left;
    const position = relativeY < 100 ? 'bottom' : 'top';

    setHoveredLabel({
      content,
      x: relativeX + rect.width / 2,
      y: relativeY + (position === 'bottom' ? rect.height : 0),
      position
    });
  };

  const handleLabelLeave = () => {
    setHoveredLabel(null);
  };

  useEffect(() => {
    setHoveredNodeTooltip(null);
  }, [xDim, yDim]);

  const handleNodeMouseMove = useCallback(
    (
      node: ScatterPlotNodeData<{ x: number; y: number; country: string }>,
      event: React.MouseEvent
    ) => {
      if (!chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const relativeY = event.clientY - rect.top;
      const position = relativeY < rect.height / 2 ? 'bottom' : 'top';

      setHoveredNodeTooltip({
        country: node.data.country as string,
        xScore: typeof node.data.x === 'number' ? node.data.x : Number(node.data.x),
        yScore:
          yDim && typeof node.data.y === 'number'
            ? node.data.y
            : yDim
              ? Number(node.data.y)
              : null,
        x: relativeX,
        y: relativeY,
        position,
      });
    },
    [yDim]
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeTooltip(null);
  }, []);

  if (!hasDimensions || !xDim) {
    return null;
  }

  const data = [
    {
      id: 'Cluster A',
      data: positionsA
        .filter((p) => p.dimension_scores)
        .map((p) => {
          const xScore = p.dimension_scores?.find((ds) => ds.dimension === xDim.short_name)?.score ?? 0;
          const yScore = yDim
            ? (p.dimension_scores?.find((ds) => ds.dimension === yDim.short_name)?.score ?? 0)
            : 0; // Default to 0 for 1D
          return { x: xScore, y: yScore, country: p.country };
        }),
    },
    {
      id: 'Cluster B',
      data: positionsB
        .filter((p) => p.dimension_scores)
        .map((p) => {
          const xScore = p.dimension_scores?.find((ds) => ds.dimension === xDim.short_name)?.score ?? 0;
          const yScore = yDim
            ? (p.dimension_scores?.find((ds) => ds.dimension === yDim.short_name)?.score ?? 0)
            : 0;
          return { x: xScore, y: yScore, country: p.country };
        }),
    },
  ];

  return (
    <div className="relative h-[500px] w-full rounded-xl border border-slate-200 bg-slate-50/50 p-6">
      {/* Quadrant Background & Axis Lines */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Match chart margins: top: 40, right: 40, bottom: 60, left: 60 */}
        <div className="absolute top-[40px] bottom-[60px] left-[60px] right-[40px]">
          {/* Center Lines */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
        </div>
      </div>

      {/* Scatter plot layer - between axis lines and labels */}
      <div ref={chartContainerRef} className="absolute inset-0 z-10">
        <ResponsiveScatterPlot
          data={data}
          margin={{ top: 40, right: 40, bottom: 60, left: 60 }}
          xScale={{ type: 'linear', min: -1.1, max: 1.1 }}
          yScale={yDim ? { type: 'linear', min: -1.1, max: 1.1 } : { type: 'linear', min: -0.5, max: 0.5 }}
          blendMode="normal"
          enableGridX={false}
          enableGridY={false}
          theme={{
            grid: {
              line: {
                stroke: '#f1f5f9', // slate-100, very subtle
                strokeWidth: 1,
              },
            },
          }}
          useMesh={false}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 15,
            tickRotation: 0,
            legend: undefined,
            format: () => '', // Hide Nivo labels
          }}
          axisLeft={
            yDim
              ? {
                tickSize: 0,
                tickPadding: 15,
                tickRotation: -90,
                legend: undefined,
                format: () => '', // Hide Nivo labels
              }
              : null
          }
          colors={[CLUSTER_STYLES.clusterA.color, CLUSTER_STYLES.clusterB.color]}
          nodeSize={14}
          tooltip={() => null}
          onMouseMove={handleNodeMouseMove}
          onMouseLeave={handleNodeMouseLeave}
        />
      </div>

      {/* Axis labels, gutters & tooltip overlay */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {/* Match chart margins for in-plot labels */}
        <div className="absolute top-[40px] bottom-[60px] left-[60px] right-[40px]">
          {/* X Negative (Left) */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-32 bg-slate-50 px-2 text-[10px] font-medium text-slate-400 text-left leading-tight opacity-80">
            {xDim.negative_pole}
          </div>
          {/* X Positive (Right) */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-32 bg-slate-50 px-2 text-[10px] font-medium text-slate-400 text-right leading-tight opacity-80">
            {xDim.positive_pole}
          </div>

          {yDim && (
            <>
              {/* Y Positive (Top) */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-56 bg-slate-50 px-2 text-center text-[10px] font-medium text-slate-400 leading-tight opacity-80">
                {yDim.positive_pole}
              </div>
              {/* Y Negative (Bottom) */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-56 bg-slate-50 px-2 text-center text-[10px] font-medium text-slate-400 leading-tight opacity-80">
                {yDim.negative_pole}
              </div>

              {/* Y Axis Labels & Title (Left Gutter) */}
              <div className="absolute left-[-60px] top-0 bottom-0 w-[60px] pointer-events-none">
                {/* Positive Label */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -rotate-90 text-[10px] font-medium text-slate-400 whitespace-nowrap origin-center translate-y-1/2">
                  Positive →
                </div>

                {/* Title */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 flex items-center justify-center origin-center">
                  <div
                    className="text-[11px] font-semibold text-slate-600 cursor-help whitespace-nowrap pointer-events-auto hover:text-[rgb(0,153,168)] transition-colors bg-slate-50/80 px-2"
                    onMouseEnter={(e) => handleLabelEnter(e, yDim.description)}
                    onMouseLeave={handleLabelLeave}
                  >
                    {yDim.short_name}
                  </div>
                </div>

                {/* Negative Label */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 -rotate-90 text-[10px] font-medium text-slate-400 whitespace-nowrap origin-center -translate-y-1/2">
                  ← Negative
                </div>
              </div>
            </>
          )}
        </div>

        {/* X Axis Labels & Title (Bottom Gutter) */}
        <div className="absolute bottom-[0px] left-[60px] right-[40px] h-[60px] pointer-events-none">
          {/* Positive Label */}
          <div className="absolute right-0 top-2 text-[10px] font-medium text-slate-400 whitespace-nowrap">
            Positive →
          </div>
          {/* Negative Label */}
          <div className="absolute left-0 top-2 text-[10px] font-medium text-slate-400 whitespace-nowrap">
            ← Negative
          </div>
          {/* Title */}
          <div className="absolute top-6 left-0 right-0 flex justify-center">
            <div
              className="text-[11px] font-semibold text-slate-600 cursor-help pointer-events-auto hover:text-[rgb(0,153,168)] transition-colors bg-slate-50/80 px-2"
              onMouseEnter={(e) => handleLabelEnter(e, xDim.description)}
              onMouseLeave={handleLabelLeave}
            >
              {xDim.short_name}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip overlay */}
      {(hoveredNodeTooltip || hoveredLabel) && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {hoveredNodeTooltip && (
            <ScatterNodeTooltip
              tooltip={hoveredNodeTooltip}
              xLabel={xDim.short_name}
              yLabel={yDim?.short_name ?? null}
            />
          )}
          {hoveredLabel && <TooltipBubble tooltip={hoveredLabel} />}
        </div>
      )}
    </div>
  );
};

const ClusterApprovalTrack = ({ result }: { result: DisagreementResult }) => {
  const [hovered, setHovered] = useState<{
    country: string;
    score: number;
    left: number;
    color: string;
  } | null>(null);

  const renderDots = (positions: CountryPosition[], color: string, cluster: ClusterId) =>
    positions
      .filter((position) => typeof position.approval === 'number' && Number.isFinite(position.approval))
      .map((position) => {
        const approval = clamp01(position.approval as number);
        const left = approval * 100;
        const label = `${position.country}: ${formatScore(approval)}`;
        return (
          <span
            key={`${result.proposal_id}-${cluster}-${position.country}`}
            className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border border-white shadow-lg transition duration-150 hover:scale-125 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            style={{
              transform: 'translate(-50%, -50%)',
              left: `${left}%`,
              backgroundColor: color,
            }}
            role="presentation"
            tabIndex={0}
            aria-label={label}
            onMouseEnter={() => setHovered({ country: position.country, score: approval, left, color })}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered({ country: position.country, score: approval, left, color })}
            onBlur={() => setHovered(null)}
          />
        );
      });

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>0 (meer voor)</span>
        <span>Approval schaal</span>
        <span>1 (meer tegen)</span>
      </div>
      <div className="relative h-12">
        <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-gradient-to-r from-slate-200 via-slate-50 to-slate-200 shadow-inner" />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-white/70 shadow" />
        {renderDots(result.set_a_positions, CLUSTER_STYLES.clusterA.color, 'clusterA')}
        {renderDots(result.set_b_positions, CLUSTER_STYLES.clusterB.color, 'clusterB')}
        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-lg"
            style={{ left: `${hovered.left}%`, top: '0' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: hovered.color }}
              />
              {hovered.country}
            </div>
            <div className="text-[10px] text-slate-500">Approval {formatScore(hovered.score)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-slate-500">
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full border border-white shadow"
            style={{ backgroundColor: CLUSTER_STYLES.clusterA.color }}
          />
          Cluster A
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full border border-white shadow"
            style={{ backgroundColor: CLUSTER_STYLES.clusterB.color }}
          />
          Cluster B
        </div>
      </div>
    </div>
  );
};

const DisagreementMasterList = ({
  results,
  selectedId,
  onSelect,
}: {
  results: DisagreementResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white/50">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Voorstellen ({results.length})
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {results.map((result) => (
            <button
              key={result.proposal_id}
              onClick={() => onSelect(result.proposal_id)}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left transition-all',
                selectedId === result.proposal_id
                  ? 'bg-white shadow-sm ring-1 ring-slate-200'
                  : 'hover:bg-white/60 hover:shadow-sm'
              )}
            >
              <div className="line-clamp-2 text-xs font-medium text-slate-700">
                {result.title}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{result.council}</span>
                <span className="text-[10px] font-semibold text-[rgb(0,153,168)]">
                  Δ {result.disagreement !== null ? result.disagreement.toFixed(2) : '-'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const DisagreementDetailView = ({ result }: { result: DisagreementResult }) => {
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'analysis' | 'justifications'>('analysis');
  const dimensionsTooltipContainerRef = useRef<HTMLDivElement | null>(null);
  const [dimensionTooltip, setDimensionTooltip] = useState<HoveredTooltip | null>(null);

  const handleDimensionLabelEnter = (
    event: React.SyntheticEvent<HTMLElement>,
    content?: string
  ) => {
    if (!content) return;
    const container = dimensionsTooltipContainerRef.current;
    if (!container) return;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relativeY = rect.top - containerRect.top;
    const relativeX = rect.left - containerRect.left;
    const position = relativeY < 100 ? 'bottom' : 'top';

    setDimensionTooltip({
      content,
      x: relativeX + rect.width / 2,
      y: relativeY + (position === 'bottom' ? rect.height : 0),
      position,
    });
  };

  const handleDimensionLabelLeave = () => setDimensionTooltip(null);

  // Auto-select first two dimensions on mount or when result changes
  useEffect(() => {
    if (result.dimensions && result.dimensions.length >= 2) {
      setSelectedDimensions([result.dimensions[0].short_name, result.dimensions[1].short_name]);
    } else if (result.dimensions && result.dimensions.length === 1) {
      setSelectedDimensions([result.dimensions[0].short_name]);
    } else {
      setSelectedDimensions([]);
    }
  }, [result]);

  const handleDimensionToggle = (dimName: string) => {
    setSelectedDimensions((prev) => {
      if (prev.includes(dimName)) {
        return prev.filter((d) => d !== dimName);
      }
      if (prev.length >= 2) {
        return [prev[1], dimName];
      }
      return [...prev, dimName];
    });
  };

  const renderJustifications = (positions: CountryPosition[], clusterId: ClusterId) => (
    <div className="space-y-2">
      {positions.map((position) => (
        <div key={`${result.proposal_id}-${clusterId}-${position.country}`} className="rounded-md border border-slate-200 bg-white/90 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CLUSTER_STYLES[clusterId].color }}
              />
              <span className="text-sm font-medium text-slate-700">{position.country}</span>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {position.approval !== null && Number.isFinite(position.approval)
                ? position.approval.toFixed(2)
                : 'n.v.t.'}
            </span>
          </div>
          {position.stance && (
            <div className="mt-1 text-xs font-semibold text-slate-600">{position.stance}</div>
          )}
          {position.rationale && (
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">{position.rationale}</p>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50/30">
      <div className="flex-none border-b border-slate-200 bg-white px-6 py-4">
        <h3 className="text-lg font-semibold text-slate-800">{result.title}</h3>
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-0.5">{result.council}</span>
          <span>{result.topic}</span>
          <span className="font-medium text-[rgb(0,153,168)]">
            Disagreement: {result.disagreement?.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        <button
          onClick={() => setActiveTab('analysis')}
          className={cn(
            'border-b-2 px-4 py-2 text-xs font-medium transition-colors',
            activeTab === 'analysis'
              ? 'border-[rgb(0,153,168)] text-[rgb(0,153,168)]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          Analyse
        </button>
        <button
          onClick={() => setActiveTab('justifications')}
          className={cn(
            'border-b-2 px-4 py-2 text-xs font-medium transition-colors',
            activeTab === 'justifications'
              ? 'border-[rgb(0,153,168)] text-[rgb(0,153,168)]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          Toelichtingen
        </button>
      </div>

      <div className="flex-1 overflow-hidden px-6 py-6">
        {activeTab === 'analysis' && (
          <div ref={dimensionsTooltipContainerRef} className="relative space-y-4">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Dimensies
              </h4>
              {result.dimensions && result.dimensions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.dimensions.map((dim) => (
                    <label
                      key={dim.short_name}
                      className={cn(
                        'cursor-pointer rounded-full border px-3 py-1 text-[10px] font-medium transition-all',
                        selectedDimensions.includes(dim.short_name)
                          ? 'border-[rgb(0,153,168)] bg-[rgb(0,153,168)] text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-[rgb(0,153,168)]'
                      )}
                      onMouseEnter={(e) => handleDimensionLabelEnter(e, dim.description)}
                      onMouseLeave={handleDimensionLabelLeave}
                      onFocus={(e) => handleDimensionLabelEnter(e, dim.description)}
                      onBlur={handleDimensionLabelLeave}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={selectedDimensions.includes(dim.short_name)}
                        onChange={() => handleDimensionToggle(dim.short_name)}
                      />
                      {dim.short_name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedDimensions.length > 0 ? (
              <div className="space-y-4">
                <DimensionScatterPlot
                  dimensions={result.dimensions}
                  positionsA={result.set_a_positions}
                  positionsB={result.set_b_positions}
                  selectedDimensions={selectedDimensions}
                />
              </div>
            ) : (

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <ClusterApprovalTrack result={result} />
              </div>
            )}

            {dimensionTooltip && <TooltipBubble tooltip={dimensionTooltip} />}
          </div>
        )}

        {activeTab === 'justifications' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cluster A ({CLUSTER_LABELS.clusterA})
              </h4>
              {renderJustifications(result.set_a_positions, 'clusterA')}
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cluster B ({CLUSTER_LABELS.clusterB})
              </h4>
              {renderJustifications(result.set_b_positions, 'clusterB')}
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

const ClusterInsightsSummary = ({
  state,
  filterContext,
}: ClusterInsightsSummaryProps) => {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'disagreement' | 'variance'>('disagreement');

  // Auto-select first proposal when data loads
  useEffect(() => {
    if (state.disagreement?.results?.length && !selectedProposalId) {
      setSelectedProposalId(state.disagreement.results[0].proposal_id);
    }
  }, [state.disagreement, selectedProposalId]);

  const renderContent = () => {
    if (!filterContext) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Selecteer een raad of thema om inzichten te bekijken.
        </div>
      );
    }
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Analyses laden…
        </div>
      );
    }
    if (state.status === 'unavailable') {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          {state.reason}
        </div>
      );
    }
    if (state.status === 'error') {
      return (
        <div className="flex h-full items-center justify-center text-sm text-red-600">
          Kan inzichten niet ophalen: {state.reason ?? 'Onbekende fout.'}
        </div>
      );
    }

    if (activeView === 'disagreement') {
      if (!state.disagreement?.results?.length) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Geen voorstellen met beide clusters voor deze selectie.
          </div>
        );
      }

      const selectedResult = state.disagreement.results.find(
        (r) => r.proposal_id === selectedProposalId
      );

      return (
        <div className="flex h-[700px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="w-1/3 min-w-[300px] max-w-[400px]">
            <DisagreementMasterList
              results={state.disagreement.results}
              selectedId={selectedProposalId}
              onSelect={setSelectedProposalId}
            />
          </div>
          <div className="flex-1 border-l border-slate-200">
            {selectedResult ? (
              <DisagreementDetailView result={selectedResult} />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">
                Selecteer een voorstel
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeView === 'variance') {
      // Placeholder for Variance View - can be expanded similarly if needed
      // For now, we can reuse the existing logic or just list them
      const renderVarianceList = (clusterId: ClusterId) => {
        const varianceData = state.variance?.[clusterId];
        if (!varianceData || !varianceData.results?.length) return <div className="text-sm text-slate-500">Geen data.</div>;

        return (
          <div className="space-y-2">
            {varianceData.results.slice(0, 5).map(r => (
              <div key={r.proposal_id} className="p-2 border rounded-md text-xs">
                <div className="font-semibold">{r.title}</div>
                <div className="text-slate-500">Variance: {r.variance?.toFixed(3)}</div>
              </div>
            ))}
          </div>
        )
      }

      return (
        <div className="grid gap-6 md:grid-cols-2">
          {CLUSTER_OPTIONS.map((option) => (
            <div key={option.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: CLUSTER_STYLES[option.id].color }}
                  aria-hidden
                />
                {option.label}
              </div>
              {renderVarianceList(option.id)}
            </div>
          ))}
        </div>
      )
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Inzichten</h2>
          <p className="text-sm text-slate-500">
            {filterContext ? filterContext.label : 'Geen filter geselecteerd'}
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setActiveView('disagreement')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              activeView === 'disagreement'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            Meningsverschillen
          </button>
          <button
            onClick={() => setActiveView('variance')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              activeView === 'variance'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            Interne Variatie
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  );
};

const preparePayload = (payload: ClustermapResponse): PreparedClustermapResponse => ({
  overall: withLabel(payload.overall, 'Alle onderwerpen en raden'),
  councils: payload.councils.map((entry) => withLabel(entry, entry.label ?? 'Onbekende raad')),
  topics: payload.topics.map((entry) => withLabel(entry, entry.label ?? 'Onbekend thema')),
});

const withLabel = (matrix: ClustermapMatrix, fallback: string): NamedMatrix => ({
  ...matrix,
  label: matrix.label ?? fallback,
});
