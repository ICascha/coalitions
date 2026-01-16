import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { ResponsiveHeatMapCanvas, type ComputedCell, type HeatMapSerie } from '@nivo/heatmap';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Hook to get element size and compute square dimension
function useSquareSize(ref: React.RefObject<HTMLDivElement | null>, maxSize?: number) {
  const [size, setSize] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect();
      let squareSize = Math.min(width, height);
      if (maxSize) squareSize = Math.min(squareSize, maxSize);
      setSize(squareSize);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, maxSize]);

  return size;
}

// Types
type ClustermapData = {
  label: string;
  category: string;
  data: {
    countries: string[];
    distance_matrix: number[][];
  };
};

type TopicOption = {
  id: string;
  path: string;
  label: string;
};

type HeatmapCellData = {
  x: string;
  y: number | null;
};

type ClusterNode = {
  indices: number[];
  left?: ClusterNode;
  right?: ClusterNode;
  mergeDistance?: number;
};

type ClusterGroup = {
  id: number;
  countries: string[];
  indices: number[]; // indices in the ordered array
  avgDistance: number;
};

// Hierarchical clustering utilities
const sanitizeMatrix = (matrix: (number | null)[][]) =>
  matrix.map((row, rowIndex) =>
    row.map((value, columnIndex) => {
      if (rowIndex === columnIndex) return 0;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
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

const computeHierarchicalClustering = (distanceMatrix: (number | null)[][]) => {
  const sanitized = sanitizeMatrix(distanceMatrix);
  const size = sanitized.length;

  if (size === 0) return { order: [], root: undefined, mergeHistory: [] };
  if (size === 1) return { order: [0], root: { indices: [0] } as ClusterNode, mergeHistory: [] };

  const nodes: ClusterNode[] = Array.from({ length: size }, (_, index) => ({
    indices: [index],
  }));

  const mergeHistory: { distance: number; leftSize: number; rightSize: number }[] = [];

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
      mergeDistance: minDistance,
    };

    mergeHistory.push({
      distance: minDistance,
      leftSize: left.indices.length,
      rightSize: right.indices.length,
    });

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
  return { order, root: nodes[0], mergeHistory };
};

// Cut dendrogram at a threshold to get clusters
const cutDendrogram = (
  root: ClusterNode | undefined,
  threshold: number,
  countries: string[],
  orderedIndices: number[]
): ClusterGroup[] => {
  if (!root) return [];

  const clusters: number[][] = [];

  const collectClusters = (node: ClusterNode) => {
    // If this node's merge distance is above threshold, or it's a leaf, it's a cluster
    if (!node.left || !node.right || (node.mergeDistance && node.mergeDistance > threshold)) {
      // Collect all leaf indices under this node
      if (node.left && node.right && node.mergeDistance && node.mergeDistance > threshold) {
        // Split into children
        collectClusters(node.left);
        collectClusters(node.right);
      } else {
        clusters.push(node.indices);
      }
    } else {
      collectClusters(node.left);
      collectClusters(node.right);
    }
  };

  // Simpler approach: just cut at threshold
  const simpleCut = (node: ClusterNode): number[][] => {
    if (!node.left || !node.right) {
      return [node.indices];
    }
    if (node.mergeDistance !== undefined && node.mergeDistance > threshold) {
      return [...simpleCut(node.left), ...simpleCut(node.right)];
    }
    return [node.indices];
  };

  const rawClusters = simpleCut(root);

  // Map original indices to ordered positions
  const originalToOrdered = new Map<number, number>();
  orderedIndices.forEach((origIdx, orderedIdx) => {
    originalToOrdered.set(origIdx, orderedIdx);
  });

  // Convert to ClusterGroup with ordered indices
  return rawClusters.map((indices, id) => {
    const orderedIdxs = indices
      .map((i) => originalToOrdered.get(i)!)
      .sort((a, b) => a - b);
    
    return {
      id,
      countries: indices.map((i) => countries[i]),
      indices: orderedIdxs,
      avgDistance: 0, // Will compute later if needed
    };
  }).sort((a, b) => a.indices[0] - b.indices[0]);
};

// Color interpolation for heatmap
const interpolateColor = (t: number): string => {
  // Cool teal to warm coral gradient
  const r = Math.round(0 + t * 249);
  const g = Math.round(153 - t * 38);
  const b = Math.round(168 - t * 146);
  return `rgb(${r}, ${g}, ${b})`;
};

// Build topic options from manifest
const TOPIC_OPTIONS: TopicOption[] = [
  { id: 'overall', path: 'overall.json', label: 'Overkoepelend' },
  { id: 'climate_environment', path: 'topics/climate_environment.json', label: 'Klimaat & Milieu' },
  { id: 'energy_infrastructure', path: 'topics/energy_infrastructure.json', label: 'Energie & Infrastructuur' },
  { id: 'trade_industrial_policy', path: 'topics/trade_industrial_policy.json', label: 'Handel & Industriebeleid' },
  { id: 'economic_financial', path: 'topics/economic_financial.json', label: 'Economie & Financiën' },
  { id: 'digital_innovation', path: 'topics/digital_innovation.json', label: 'Digitaal & Innovatie' },
  { id: 'social_health_employment', path: 'topics/social_health_employment.json', label: 'Sociaal & Volksgezondheid' },
  { id: 'justice_home_affairs', path: 'topics/justice_home_affairs.json', label: 'Justitie & Veiligheid' },
  { id: 'agriculture_food_systems', path: 'topics/agriculture_food_systems.json', label: 'Landbouw & Voedselzekerheid' },
  { id: 'institutional_governance', path: 'topics/institutional_governance.json', label: 'Institutionele Structuur' },
];

// Cluster colors
const CLUSTER_COLORS = [
  { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgb(239, 68, 68)', text: 'text-red-600' },
  { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgb(59, 130, 246)', text: 'text-blue-600' },
  { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgb(34, 197, 94)', text: 'text-green-600' },
  { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgb(168, 85, 247)', text: 'text-purple-600' },
  { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgb(249, 115, 22)', text: 'text-orange-600' },
  { bg: 'rgba(236, 72, 153, 0.15)', border: 'rgb(236, 72, 153)', text: 'text-pink-600' },
];

// Custom tooltip component
const HeatmapTooltip = memo(function HeatmapTooltip({
  cell,
}: {
  cell: ComputedCell<HeatmapCellData>;
}) {
  const distance = cell.data.y;
  if (distance === null) return null;

  return (
    <div className="bg-slate-900/95 backdrop-blur-sm text-white px-3 py-2 rounded-lg shadow-xl border border-white/10">
      <div className="text-xs text-slate-400 mb-1">Stemafstand</div>
      <div className="font-medium">
        {cell.serieId} ↔ {cell.data.x}
      </div>
      <div className="text-lg font-semibold mt-1" style={{ color: cell.color }}>
        {distance.toFixed(3)}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        Lager = meer vergelijkbaar stemgedrag
      </div>
    </div>
  );
});

// Heatmap margins
const HEATMAP_MARGIN = { top: 90, right: 20, bottom: 20, left: 90 };

export function ClustermapViz() {
  const [selectedTopic, setSelectedTopic] = useState('overall');
  const [data, setData] = useState<ClustermapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClusters, setShowClusters] = useState(false);
  
  // Ref and size for square aspect ratio
  const containerRef = useRef<HTMLDivElement>(null);
  const squareSize = useSquareSize(containerRef);

  // Find current topic option
  const currentTopic = TOPIC_OPTIONS.find((t) => t.id === selectedTopic) ?? TOPIC_OPTIONS[0];

  // Load clustermap data
  useEffect(() => {
    const controller = new AbortController();
    
    async function loadData() {
      setLoading(true);
      setError(null);
      setShowClusters(false);
      
      try {
        const response = await fetch(`/country_clustermaps/${currentTopic.path}`, {
          signal: controller.signal,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load data (${response.status})`);
        }
        
        const json = await response.json();
        setData(json);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load clustermap data');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    
    loadData();
    return () => controller.abort();
  }, [currentTopic.path]);

  // Compute hierarchical clustering and derive clusters
  const { heatmapData, columnKeys, clusters, avgDistance } = useMemo(() => {
    if (!data) return { heatmapData: [], columnKeys: [], clusters: [], avgDistance: 0 };
    
    const { countries, distance_matrix } = data.data;
    const { order, root, mergeHistory } = computeHierarchicalClustering(distance_matrix);
    
    // Reorder countries based on clustering
    const orderedCountries = order.map((i) => countries[i]);
    
    // Build heatmap data in clustered order
    const heatmapData = order.map((rowIndex) => ({
      id: countries[rowIndex],
      data: order.map((colIndex) => ({
        x: countries[colIndex],
        y: distance_matrix[rowIndex]?.[colIndex] ?? null,
      })),
    }));

    // Compute average distance (excluding diagonal)
    let sum = 0;
    let count = 0;
    for (let i = 0; i < distance_matrix.length; i++) {
      for (let j = i + 1; j < distance_matrix.length; j++) {
        const val = distance_matrix[i][j];
        if (val !== null && Number.isFinite(val)) {
          sum += val;
          count++;
        }
      }
    }
    const avgDistance = count > 0 ? sum / count : 0;

    // Determine threshold for cutting dendrogram
    const sortedMerges = [...mergeHistory].sort((a, b) => a.distance - b.distance);
    const medianIdx = Math.floor(sortedMerges.length * 0.6); // Cut at 60th percentile
    const threshold = sortedMerges[medianIdx]?.distance ?? 0.2;

    // Cut dendrogram to get clusters, filter out single-country clusters
    const allClusters = cutDendrogram(root, threshold, countries, order);
    const clusters = allClusters.filter((c) => c.countries.length >= 2);
    
    return { heatmapData, columnKeys: orderedCountries, clusters, avgDistance };
  }, [data]);

  // Compute color scale range
  const { minDistance, maxDistance } = useMemo(() => {
    if (!data) return { minDistance: 0, maxDistance: 1 };
    
    let min = Infinity;
    let max = -Infinity;
    
    for (const row of data.data.distance_matrix) {
      for (const val of row) {
        if (val !== null && val > 0) {
          min = Math.min(min, val);
          max = Math.max(max, val);
        }
      }
    }
    
    return {
      minDistance: min === Infinity ? 0 : min,
      maxDistance: max === -Infinity ? 1 : max,
    };
  }, [data]);

  // Color scale function
  const getColor = useCallback(
    (cell: Omit<ComputedCell<HeatmapCellData>, 'color' | 'opacity' | 'borderColor'>) => {
      const value = cell.data.y;
      if (value === null || value === 0) return 'rgb(240, 240, 240)';
      const t = (value - minDistance) / (maxDistance - minDistance || 1);
      return interpolateColor(Math.min(1, Math.max(0, t)));
    },
    [minDistance, maxDistance]
  );

  // Compute cluster overlay positions
  const clusterOverlays = useMemo(() => {
    if (!showClusters || !squareSize || clusters.length === 0) return [];
    
    const chartWidth = squareSize - HEATMAP_MARGIN.left - HEATMAP_MARGIN.right;
    const chartHeight = squareSize - HEATMAP_MARGIN.top - HEATMAP_MARGIN.bottom;
    const cellWidth = chartWidth / columnKeys.length;
    const cellHeight = chartHeight / columnKeys.length;

    return clusters.map((cluster) => {
      const startIdx = cluster.indices[0];
      const endIdx = cluster.indices[cluster.indices.length - 1];
      const colorIdx = cluster.id % CLUSTER_COLORS.length;
      const color = CLUSTER_COLORS[colorIdx];

      return {
        id: cluster.id,
        x: HEATMAP_MARGIN.left + startIdx * cellWidth,
        y: HEATMAP_MARGIN.top + startIdx * cellHeight,
        width: (endIdx - startIdx + 1) * cellWidth,
        height: (endIdx - startIdx + 1) * cellHeight,
        color,
        countries: cluster.countries,
      };
    });
  }, [showClusters, squareSize, clusters, columnKeys.length]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with topic selector */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            Analyse Raad van Ministers
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Onderzoek naar stemafstand en coalitievorming binnen de Europese Unie
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-slate-400">Strategisch Domein</span>
          <Select value={selectedTopic} onValueChange={setSelectedTopic}>
            <SelectTrigger className="w-[220px] bg-white border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPIC_OPTIONS.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main content: clustermap on left, info panel on right */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: Clustermap */}
        <div ref={containerRef} className="flex-1 min-w-0 relative flex items-center justify-center p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <div className="flex items-center gap-3 text-slate-500">
                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                <span>Clustermap laden...</span>
              </div>
            </div>
          )}
          
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            </div>
          )}
          
          {!loading && !error && heatmapData.length > 0 && squareSize > 0 && (
            <div
              className="relative flex-shrink-0"
              style={{
                width: squareSize,
                height: squareSize,
              }}
            >
              <ResponsiveHeatMapCanvas
                data={heatmapData}
                keys={columnKeys}
                margin={HEATMAP_MARGIN}
                axisTop={{
                  tickSize: 0,
                  tickPadding: 8,
                  tickRotation: -45,
                  legend: '',
                }}
                axisLeft={{
                  tickSize: 0,
                  tickPadding: 8,
                  tickRotation: 0,
                  legend: '',
                }}
                axisRight={null}
                axisBottom={null}
                colors={getColor}
                borderWidth={0.5}
                borderColor="rgba(255,255,255,0.3)"
                enableLabels={false}
                hoverTarget="cell"
                tooltip={HeatmapTooltip}
                animate={false}
              />
              
              {/* Cluster overlay boxes */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={squareSize}
                height={squareSize}
              >
                {clusterOverlays.map((overlay) => (
                  <g key={overlay.id}>
                    {/* Background fill */}
                    <rect
                      x={overlay.x}
                      y={overlay.y}
                      width={overlay.width}
                      height={overlay.height}
                      fill={overlay.color.bg}
                      rx={4}
                    />
                    {/* Border */}
                    <rect
                      x={overlay.x}
                      y={overlay.y}
                      width={overlay.width}
                      height={overlay.height}
                      fill="none"
                      stroke={overlay.color.border}
                      strokeWidth={2.5}
                      rx={4}
                      style={{
                        filter: `drop-shadow(0 0 4px ${overlay.color.border})`,
                      }}
                    />
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Right: Info panel */}
        <div className="w-72 border-l border-slate-200/50 bg-slate-50/50 p-5 flex flex-col gap-5">
          {/* Methodology */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-3">Uitleg</h3>
            <div className="text-[13px] leading-relaxed text-slate-600 font-serif">
              Deze kaart toont de mate van overeenstemming in stemgedrag tussen EU-lidstaten. 
              Landen die vaak hetzelfde stemmen staan dichter bij elkaar en vormen clusters.
            </div>
          </div>

          {/* Stats */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-3">Kerncijfers</h3>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-sm text-slate-600">Gemiddelde stemafstand</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">
                {avgDistance.toFixed(3)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Over alle lidstaten heen
              </div>
            </div>
          </div>

          {/* Color scale legend */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-3">Stemafstand</h3>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">{minDistance.toFixed(2)}</span>
                <div 
                  className="flex-1 h-3 rounded-sm"
                  style={{
                    background: `linear-gradient(to right, ${interpolateColor(0)}, ${interpolateColor(0.5)}, ${interpolateColor(1)})`,
                  }}
                />
                <span className="text-xs text-slate-600">{maxDistance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>Kleine afstand</span>
                <span>Grote afstand</span>
              </div>
            </div>
          </div>

          {/* Cluster highlighting toggle */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-3">
              Coalitie-clusters
            </h3>
            <button
              onClick={() => setShowClusters(!showClusters)}
              className={`
                w-full px-4 py-3 rounded-lg border-2 transition-all font-medium
                ${showClusters 
                  ? 'bg-slate-800 border-slate-800 text-white shadow-lg' 
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                <svg 
                  className={`w-5 h-5 transition-transform ${showClusters ? 'scale-110' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" 
                  />
                </svg>
                <span>{showClusters ? 'Visualisatie Verbergen' : 'Clusters Visualiseren'}</span>
              </div>
            </button>
            {showClusters && clusters.length > 0 && (
              <div className="mt-3 text-xs text-slate-500 text-center">
                {clusters.length} clusters gedetecteerd
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClustermapViz;
