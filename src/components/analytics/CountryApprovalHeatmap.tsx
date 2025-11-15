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

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'overall', label: 'Alle onderwerpen' },
  { id: 'council', label: 'Per Raad' },
  { id: 'topic', label: 'Per Thema' },
];

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

export default function CountryApprovalHeatmap() {
  const basePath = import.meta.env.BASE_URL;
  const [data, setData] = useState<PreparedClustermapResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('topic');
  const [selectedCouncil, setSelectedCouncil] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [globalMaxDistance, setGlobalMaxDistance] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${basePath}country_approval_clustermap.json`);
        if (!response.ok) {
          throw new Error(`Kon country_approval_clustermap.json niet laden (status ${response.status}).`);
        }
        const payload = (await response.json()) as ClustermapResponse;
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

  const renderTooltip = useCallback<TooltipComponent<HeatmapCellData>>(
    ({ cell }) => (
      <div className="rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-md">
        <div className="font-semibold text-[rgb(0,153,168)]">
          {cell.serieId} ↔ {cell.data.x}
        </div>
        <div>Afstemmingsscore: {formatScore(cell.data.y)}</div>
        <div>Gemiddelde afstand: {formatDistance(cell.data.distance)}</div>
        <div>Pair count: {cell.data.count}</div>
      </div>
    ),
    []
  );

  const handleCellClick = useCallback(
    (cell: ComputedCell<HeatmapCellData>) => {
      console.info('[CountryApprovalHeatmap] cell click', {
        countries: [String(cell.serieId), String(cell.data.x)],
        closeness: cell.data.y,
        distance: cell.data.distance,
        count: cell.data.count,
      });
    },
    []
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

      <div className="flex-1 min-h-0">
        <HeatmapViewport rows={rows} tooltip={renderTooltip} onCellClick={handleCellClick} />
      </div>
    </Card>
  );
}

type HeatmapProps = {
  rows: HeatMapSerie<HeatmapCellData, {}>[];
  tooltip: TooltipComponent<HeatmapCellData>;
  onCellClick: (cell: ComputedCell<HeatmapCellData>) => void;
};

const MIN_SIDE = 480;
const MAX_SIDE = 1040;

const HeatmapViewport = ({ rows, tooltip, onCellClick }: HeatmapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState<number>(() => MIN_SIDE);

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
        className="mx-auto w-full"
        style={{
          maxWidth: MAX_SIDE,
          height: side,
          transition: 'height 120ms ease',
        }}
      >
        <MemoizedHeatmap rows={rows} tooltip={tooltip} onCellClick={onCellClick} />
      </div>
    </div>
  );
};

const MemoizedHeatmap = memo(function Heatmap({
  rows,
  tooltip,
  onCellClick,
}: HeatmapProps) {
  const pixelRatio =
    typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

  return (
    <ResponsiveHeatMapCanvas<HeatmapCellData, {}>
      data={rows}
      margin={{ top: 120, right: 80, bottom: 60, left: 140 }}
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

const preparePayload = (payload: ClustermapResponse): PreparedClustermapResponse => ({
  overall: withLabel(payload.overall, 'Alle onderwerpen en raden'),
  councils: payload.councils.map((entry) => withLabel(entry, entry.label ?? 'Onbekende raad')),
  topics: payload.topics.map((entry) => withLabel(entry, entry.label ?? 'Onbekend thema')),
});

const withLabel = (matrix: ClustermapMatrix, fallback: string): NamedMatrix => ({
  ...matrix,
  label: matrix.label ?? fallback,
});
