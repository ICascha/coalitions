import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveHeatMapCanvas,
  type ComputedCell,
  type HeatMapSerie,
  type TooltipComponent,
} from '@nivo/heatmap';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
const HEATMAP_MARGIN = { top: 120, right: 80, bottom: 60, left: 140 };
const API_BASE = (import.meta.env.VITE_COUNTRY_POSITIONS_API ?? '').replace(/\/+$/, '');
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
};

type DisagreementResult = {
  proposal_id: string;
  title: string;
  council: string;
  topic: string;
  disagreement: number | null;
  average_set_a: number | null;
  average_set_b: number | null;
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

export default function CountryApprovalHeatmap() {
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

        const payload: ClustermapResponse = {
          overall: overallMatrix,
          councils: councilsMatrices,
          topics: topicsMatrices,
        };

        if (!cancelled) {
          const prepared = preparePayload(payload);
          setData(prepared);
          setGlobalMaxDistance(getGlobalMaxDistance(prepared));
          setSelectedCouncil((prev) => prev || prepared.councils[0]?.label || '');
          setSelectedTopic((prev) => prev || prepared.topics[0]?.label || '');
          if (IS_DEV) {
            console.info(
              '[CountryApprovalHeatmap] datasets loaded',
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

  const selectedMatrix: NamedMatrix | null = (() => {
    if (!data) return null;
    if (viewMode === 'overall') {
      return data.overall;
    }
    if (viewMode === 'council') {
      return data.councils.find((entry) => entry.label === selectedCouncil) ?? data.councils[0] ?? null;
    }
    return data.topics.find((entry) => entry.label === selectedTopic) ?? data.topics[0] ?? null;
  })();

  const filterContext = useMemo(() => {
    if (viewMode === 'topic' && selectedTopic) {
      return { topic: selectedTopic, label: `Thema: ${selectedTopic}` };
    }
    if (viewMode === 'council' && selectedCouncil) {
      return { council: selectedCouncil, label: `Raad: ${selectedCouncil}` };
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
      console.info('[CountryApprovalHeatmap] switched dataset', selectedMatrix.label);
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
      console.time(`[CountryApprovalHeatmap] build rows (${selectedMatrix.label})`);
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
      console.timeEnd(`[CountryApprovalHeatmap] build rows (${selectedMatrix.label})`);
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
        postJson<DisagreementResponse>('country-positions/disagreement', payload, signal).then((data) => {
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
        postJson<VarianceResponse>('country-positions/variance', payload, signal).then((data) => {
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
      console.info('[CountryApprovalHeatmap] cell click', {
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
          </div>
          {viewMode !== 'overall' && (
            <div className="w-full min-w-0 lg:w-72">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Selecteer {viewMode === 'council' ? 'raad' : 'thema'}
              </div>
              <Select
                value={viewMode === 'council' ? selectedCouncil : selectedTopic}
                onValueChange={(value) =>
                  viewMode === 'council' ? setSelectedCouncil(value) : setSelectedTopic(value)
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Maak een keuze" />
                </SelectTrigger>
                <SelectContent>
                  {(viewMode === 'council' ? data?.councils : data?.topics)?.map((entry) => (
                    <SelectItem key={entry.label} value={entry.label ?? 'Onbekend'}>
                      {entry.label ?? 'Onbekend'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
        clusterSelections={clusterSelections}
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
  clusterStats: ClusterStats;
  clusterComparison: ClusterComparison;
};

const ClusterSelectionPanel = ({
  selections,
  activeCluster,
  onActiveClusterChange,
  availableCountries,
  onAddCountry,
  onRemoveCountry,
  onClearCluster,
  clusterStats,
  clusterComparison,
}: ClusterSelectionPanelProps) => {
  const [countrySearch, setCountrySearch] = useState('');
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return availableCountries;
    const query = countrySearch.trim().toLowerCase();
    return availableCountries.filter((country) => country.toLowerCase().includes(query));
  }, [availableCountries, countrySearch]);
  const assignCountry = (clusterId: ClusterId, country: string) => {
    const alreadyInCluster = selections[clusterId].includes(country);
    if (alreadyInCluster) {
      onRemoveCountry(clusterId, country);
      return;
    }
    onAddCountry(clusterId, country);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Clusters
          </div>
          <p className="text-xs text-slate-500">Klik in de heatmap of kies handmatig.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          {CLUSTER_OPTIONS.map((option) => {
            const stats = clusterStats[option.id];
            const style = CLUSTER_STYLES[option.id];
            return (
              <div key={option.id} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: style.color }}
                  aria-hidden
                />
                <div>
                  <div className="font-semibold text-slate-800">
                    {option.label}:{' '}
                    <span className="text-[rgb(0,153,168)]">
                      {stats.averageDistance !== null ? stats.averageDistance.toFixed(3) : 'n.v.t.'}
                    </span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    {stats.pairCount} paren
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">A vs B</div>
            <div className="text-xs font-semibold text-slate-800">
              {clusterComparison.averageDistance !== null
                ? clusterComparison.averageDistance.toFixed(3)
                : 'n.v.t.'}
            </div>
            <div className="text-[10px] text-slate-400">{clusterComparison.pairCount} paren</div>
          </div>
        </div>
        <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-medium">
          {CLUSTER_OPTIONS.map((option) => {
            const isActive = activeCluster === option.id;
            const style = CLUSTER_STYLES[option.id];
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onActiveClusterChange(option.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1 transition-colors',
                  isActive
                    ? 'bg-white text-slate-900 shadow'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: style.color }}
                  aria-hidden
                />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Land snel toevoegen
        </label>
        <div className="mt-2 flex gap-3">
          <input
            type="search"
            value={countrySearch}
            onChange={(event) => setCountrySearch(event.target.value)}
            placeholder="Zoek land…"
            className="h-9 flex-1 rounded-md border border-slate-300 px-3 text-sm shadow-sm focus:border-[rgb(0,153,168)] focus:outline-none"
          />
          <div className="hidden text-xs text-slate-500 sm:flex sm:items-center">
            Gebruik de knoppen per land om toe te wijzen.
          </div>
        </div>
        <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {filteredCountries.length ? (
            filteredCountries.map((country) => (
              <div
                key={country}
                className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{country}</span>
                <div className="flex gap-2">
                  {CLUSTER_OPTIONS.map((option) => {
                    const isActive = selections[option.id].includes(country);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => assignCountry(option.id, country)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-semibold transition',
                          isActive
                            ? 'text-white shadow-sm'
                            : 'border border-slate-200 text-slate-500 hover:text-slate-800'
                        )}
                        style={{
                          backgroundColor: isActive ? CLUSTER_STYLES[option.id].color : undefined,
                        }}
                      >
                        {option.label.replace('Cluster ', '')}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-xs text-slate-500">Geen landen gevonden.</div>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {CLUSTER_OPTIONS.map((option) => (
          <ClusterCard
            key={option.id}
            clusterId={option.id}
            label={option.label}
            countries={selections[option.id]}
            isActive={activeCluster === option.id}
            availableCountries={availableCountries}
            onSetActive={onActiveClusterChange}
            onAddCountry={onAddCountry}
            onRemoveCountry={onRemoveCountry}
            onClearCluster={onClearCluster}
            stats={clusterStats[option.id]}
          />
        ))}
      </div>
    </div>
  );
};

type ClusterCardProps = {
  clusterId: ClusterId;
  label: string;
  countries: string[];
  isActive: boolean;
  availableCountries: string[];
  onSetActive: (cluster: ClusterId) => void;
  onAddCountry: (cluster: ClusterId, country: string) => void;
  onRemoveCountry: (cluster: ClusterId, country: string) => void;
  onClearCluster: (cluster: ClusterId) => void;
  stats: { averageDistance: number | null; pairCount: number };
};

const ClusterCard = ({
  clusterId,
  label,
  countries,
  isActive,
  availableCountries,
  onSetActive,
  onAddCountry,
  onRemoveCountry,
  onClearCluster,
  stats,
}: ClusterCardProps) => {
  const color = CLUSTER_STYLES[clusterId].color;

  const handleValueChange = useCallback(
    (value: string) => {
      onAddCountry(clusterId, value);
    },
    [clusterId, onAddCountry]
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-slate-50/60 p-3 transition-colors',
        isActive && 'border-[rgb(0,153,168)] bg-white'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSetActive(clusterId)}
          className="flex items-center gap-2 text-left"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
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
            onClick={() => onRemoveCountry(clusterId, country)}
            className="group flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 transition hover:text-red-600"
          >
            {country}
            <span className="text-slate-400 transition group-hover:text-red-500">×</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Select onValueChange={handleValueChange}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Land toevoegen" />
          </SelectTrigger>
          <SelectContent>
            {availableCountries.map((country) => (
              <SelectItem
                key={country}
                value={country}
                disabled={countries.includes(country)}
              >
                {country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => onClearCluster(clusterId)}
          className="text-xs text-slate-500 transition hover:text-red-500"
        >
          Wissen
        </button>
      </div>
    </div>
  );
};

type ClusterInsightsSummaryProps = {
  state: ClusterInsightsState;
  filterContext: { label: string } | null;
  clusterSelections: ClusterSelections;
};

const MAX_VARIANCE_ROWS = 2;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const DisagreementCard = ({ result }: { result: DisagreementResult }) => {
  const [expanded, setExpanded] = useState(false);
  const handleToggle = () => setExpanded((prev) => !prev);

  const renderJustifications = (positions: CountryPosition[], clusterId: ClusterId) => (
    <div className="space-y-2">
      {positions.map((position) => (
        <div key={`${result.proposal_id}-${clusterId}-${position.country}`} className="rounded-md border border-slate-200 bg-white/90 p-2 shadow-sm">
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
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm transition hover:border-slate-300">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left focus:outline-none"
      >
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="line-clamp-2 pr-2">{result.title}</span>
          <div className="text-right">
            <div className="text-[rgb(0,153,168)]">
              Δ {result.disagreement !== null ? result.disagreement.toFixed(3) : 'n.v.t.'}
            </div>
            <div className="text-[10px] font-normal uppercase tracking-wide text-slate-400">
              A {formatDistance(result.average_set_a)} · B {formatDistance(result.average_set_b)}
            </div>
          </div>
        </div>
        <ClusterApprovalTrack result={result} />
      </button>
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cluster A: toelichtingen
            </div>
            <div className="mt-2">{renderJustifications(result.set_a_positions, 'clusterA')}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cluster B: toelichtingen
            </div>
            <div className="mt-2">{renderJustifications(result.set_b_positions, 'clusterB')}</div>
          </div>
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

const ClusterInsightsSummary = ({
  state,
  filterContext,
  clusterSelections,
}: ClusterInsightsSummaryProps) => {
  const renderDisagreement = () => {
    if (!state.disagreement || !state.disagreement.results?.length) {
      return (
        <div className="text-xs text-slate-500">
          Geen voorstellen met beide clusters voor deze selectie.
        </div>
      );
    }
    const items = state.disagreement.results;
    return (
      <div className="space-y-3 max-h-[800px] overflow-y-auto pr-1">
        {items.map((result) => (
          <DisagreementCard key={result.proposal_id} result={result} />
        ))}
      </div>
    );
  };

  const renderVariance = (clusterId: ClusterId) => {
    if (clusterSelections[clusterId].length < 2) {
      return (
        <div className="text-xs text-slate-500">
          Selecteer minstens twee landen voor {CLUSTER_LABELS[clusterId]} om variatie te zien.
        </div>
      );
    }
    const varianceData = state.variance?.[clusterId];
    if (!varianceData || !varianceData.results?.length) {
      return (
        <div className="text-xs text-slate-500">
          Geen voorstellen met waarnemingen voor deze selectie.
        </div>
      );
    }
    const items = varianceData.results.slice(0, MAX_VARIANCE_ROWS);
    return (
      <div className="space-y-2">
        {items.map((result) => (
          <div key={result.proposal_id} className="rounded-md border border-slate-200 p-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="line-clamp-2 pr-2">{result.title}</span>
              <span className="text-[rgb(0,153,168)]">
                σ² {result.variance !== null ? result.variance.toFixed(3) : 'n.v.t.'}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Gemiddelde approval: {formatDistance(result.mean_approval)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    if (!filterContext) {
      return <div className="text-sm text-slate-500">Selecteer een raad of thema om inzichten te bekijken.</div>;
    }
    if (state.status === 'loading' || state.status === 'idle') {
      return <div className="text-sm text-slate-500">Analyses laden…</div>;
    }
    if (state.status === 'unavailable') {
      return <div className="text-sm text-slate-500">{state.reason}</div>;
    }
    if (state.status === 'error') {
      return (
        <div className="text-sm text-red-600">
          Kan inzichten niet ophalen: {state.reason ?? 'Onbekende fout.'}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Grootste meningsverschillen
          </div>
          <div className="mt-2">{renderDisagreement()}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Variatie per cluster
          </div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {CLUSTER_OPTIONS.map((option) => (
              <div key={option.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: CLUSTER_STYLES[option.id].color }}
                    aria-hidden
                  />
                  {option.label}
                </div>
                <div className="mt-2">{renderVariance(option.id)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white/85 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Country Position Insights
          </div>
          <div className="text-sm text-slate-600">
            {filterContext ? filterContext.label : 'Geen filter geselecteerd'}
          </div>
        </div>
      </div>
      <div className="mt-4">{renderContent()}</div>
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
