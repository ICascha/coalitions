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

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'overall', label: 'Alle onderwerpen' },
  { id: 'council', label: 'Per Raad' },
  { id: 'topic', label: 'Per Thema' },
];

const COUNTRY_CLUSTERMAP_DIR = 'country_clustermaps/';
const COUNTRY_CLUSTERMAP_MANIFEST = `${COUNTRY_CLUSTERMAP_DIR}index.json`;
const HEATMAP_MARGIN = { top: 120, right: 80, bottom: 60, left: 140 };
const CLUSTER_OPTIONS: { id: ClusterId; label: string }[] = [
  { id: 'clusterA', label: 'Cluster A' },
  { id: 'clusterB', label: 'Cluster B' },
];
const CLUSTER_COLORS: Record<ClusterId, string> = {
  clusterA: 'rgb(0,153,168)',
  clusterB: '#f97316',
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

type ClusterNode = {
  indices: number[];
  left?: ClusterNode;
  right?: ClusterNode;
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

const normalizeDistance = (value: number | null, maxDistance: number) => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (maxDistance <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, 1 - value / maxDistance));
};

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`);
const sanitizeRelativePath = (path: string) => path.replace(/^\/+/, '');
const joinPublicPath = (basePath: string, relativePath: string) =>
  `${ensureTrailingSlash(basePath)}${sanitizeRelativePath(relativePath)}`;

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
    const order = computeHierarchicalOrder(distanceMatrix);
    const normalizationBase = globalMaxDistance > 0 ? globalMaxDistance : 1;

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
          y: normalizeDistance(typeof distance === 'number' ? distance : null, normalizationBase),
          distance: typeof distance === 'number' ? distance : null,
          count: getPairCount(typeof count === 'number' ? count : null),
        };
      }),
    }));
    if (IS_DEV) {
      console.timeEnd(`[CountryApprovalHeatmap] build rows (${selectedMatrix.label})`);
    }
    return result;
  }, [selectedMatrix, globalMaxDistance]);

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

  const addCountriesToCluster = useCallback(
    (clusterId: ClusterId, countries: string[]) => {
      if (!selectedMatrix) return;
      const allowed = new Set(selectedMatrix.countries);
      setClusterSelections((prev) => {
        const current = new Set(prev[clusterId]);
        for (const country of countries) {
          if (allowed.has(country)) {
            current.add(country);
          }
        }
        return {
          ...prev,
          [clusterId]: Array.from(current),
        };
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
      />

      <div className="flex-1 min-h-0">
        <HeatmapViewport
          rows={rows}
          tooltip={renderTooltip}
          onCellClick={handleCellClick}
          hoveredCell={hoveredCell}
        />
      </div>
    </Card>
  );
}

type HeatmapViewportProps = {
  rows: HeatMapSerie<HeatmapCellData, {}>[];
  tooltip: TooltipComponent<HeatmapCellData>;
  onCellClick: (cell: ComputedCell<HeatmapCellData>) => void;
  hoveredCell: HoveredCell | null;
};

const MIN_SIDE = 480;
const MAX_SIDE = 1040;

type HoveredCell = {
  rowIndex: number;
  columnIndex: number;
};

const HeatmapViewport = ({ rows, tooltip, onCellClick, hoveredCell }: HeatmapViewportProps) => {
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
  if (!hoveredCell || rowCount === 0 || columnCount === 0) {
    return null;
  }

  const innerWidth = Math.max(0, side - HEATMAP_MARGIN.left - HEATMAP_MARGIN.right);
  const innerHeight = Math.max(0, side - HEATMAP_MARGIN.top - HEATMAP_MARGIN.bottom);
  if (innerWidth === 0 || innerHeight === 0) {
    return null;
  }

  const cellSize = Math.min(innerWidth / columnCount, innerHeight / rowCount);
  const chartWidth = cellSize * columnCount;
  const chartHeight = cellSize * rowCount;
  const offsetX = HEATMAP_MARGIN.left + (innerWidth - chartWidth) / 2;
  const offsetY = HEATMAP_MARGIN.top + (innerHeight - chartHeight) / 2;
  if (chartWidth === 0 || chartHeight === 0) {
    return null;
  }

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

type ClusterSelectionPanelProps = {
  selections: ClusterSelections;
  activeCluster: ClusterId;
  onActiveClusterChange: (cluster: ClusterId) => void;
  availableCountries: string[];
  onAddCountry: (cluster: ClusterId, country: string) => void;
  onRemoveCountry: (cluster: ClusterId, country: string) => void;
  onClearCluster: (cluster: ClusterId) => void;
};

const ClusterSelectionPanel = ({
  selections,
  activeCluster,
  onActiveClusterChange,
  availableCountries,
  onAddCountry,
  onRemoveCountry,
  onClearCluster,
}: ClusterSelectionPanelProps) => {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Clusterselectie
          </div>
          <p className="text-sm text-slate-600">
            Kies landen voor twee clusters en klik op heatmap-cellen om snel landen toe te voegen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CLUSTER_OPTIONS.map((option) => {
            const isActive = activeCluster === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onActiveClusterChange(option.id)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-[rgb(0,153,168)] bg-[rgb(0,153,168)] text-white'
                    : 'border-slate-300 text-slate-700 hover:border-[rgb(0,153,168)] hover:text-[rgb(0,153,168)]'
                )}
              >
                {option.label} actief
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
}: ClusterCardProps) => {
  const [pendingCountry, setPendingCountry] = useState<string | undefined>(undefined);
  const color = CLUSTER_COLORS[clusterId];

  const handleValueChange = useCallback(
    (value: string) => {
      onAddCountry(clusterId, value);
      setPendingCountry(undefined);
    },
    [clusterId, onAddCountry]
  );

  return (
    <div
      className={cn(
        'rounded-md border bg-white/80 p-4 shadow-sm transition-colors',
        isActive ? 'border-[rgb(0,153,168)]' : 'border-slate-200'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-sm text-slate-600">Bevat {countries.length} landen</div>
        </div>
        <button
          type="button"
          onClick={() => onSetActive(clusterId)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            isActive ? 'bg-[rgb(0,153,168)] text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          )}
        >
          {isActive ? 'Actief' : 'Activeren'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {countries.length === 0 && (
          <span className="text-xs text-slate-500">Nog geen landen toegevoegd.</span>
        )}
        {countries.map((country) => (
          <button
            key={country}
            type="button"
            onClick={() => onRemoveCountry(clusterId, country)}
            className="group flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm transition hover:border-red-400 hover:text-red-600"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            {country}
            <span className="text-slate-400 transition group-hover:text-red-500">×</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Select value={pendingCountry} onValueChange={handleValueChange}>
          <SelectTrigger className="text-sm">
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
          className="mt-2 text-xs text-red-500 hover:text-red-600"
        >
          Cluster legen
        </button>
      </div>
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
