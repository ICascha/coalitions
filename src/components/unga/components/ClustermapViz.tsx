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
function useSquareSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect();
      // Use the smaller of width/height to ensure square fits
      const squareSize = Math.min(width, height);
      setSize(squareSize);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

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
  { id: 'overall', path: 'overall.json', label: 'All Topics' },
  { id: 'climate_environment', path: 'topics/climate_environment.json', label: 'Climate & Environment' },
  { id: 'energy_infrastructure', path: 'topics/energy_infrastructure.json', label: 'Energy & Infrastructure' },
  { id: 'trade_industrial_policy', path: 'topics/trade_industrial_policy.json', label: 'Trade & Industrial Policy' },
  { id: 'economic_financial', path: 'topics/economic_financial.json', label: 'Economic & Financial' },
  { id: 'digital_innovation', path: 'topics/digital_innovation.json', label: 'Digital & Innovation' },
  { id: 'social_health_employment', path: 'topics/social_health_employment.json', label: 'Social, Health & Employment' },
  { id: 'justice_home_affairs', path: 'topics/justice_home_affairs.json', label: 'Justice & Home Affairs' },
  { id: 'agriculture_food_systems', path: 'topics/agriculture_food_systems.json', label: 'Agriculture & Food Systems' },
  { id: 'institutional_governance', path: 'topics/institutional_governance.json', label: 'Institutional Governance' },
];

// Convert distance matrix to nivo heatmap format with hierarchical ordering
function matrixToHeatmapData(
  countries: string[],
  matrix: number[][]
): { data: HeatMapSerie<HeatmapCellData, Record<string, unknown>>[]; orderedCountries: string[] } {
  // Compute hierarchical clustering order
  const order = computeHierarchicalOrder(matrix);
  
  // Reorder countries based on clustering
  const orderedCountries = order.map((i) => countries[i]);
  
  // Build heatmap data in clustered order
  const data = order.map((rowIndex) => ({
    id: countries[rowIndex],
    data: order.map((colIndex) => ({
      x: countries[colIndex],
      y: matrix[rowIndex]?.[colIndex] ?? null,
    })),
  }));
  
  return { data, orderedCountries };
}

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
      <div className="text-xs text-slate-400 mb-1">Voting Distance</div>
      <div className="font-medium">
        {cell.serieId} ↔ {cell.data.x}
      </div>
      <div className="text-lg font-semibold mt-1" style={{ color: cell.color }}>
        {distance.toFixed(3)}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        Lower = more similar voting
      </div>
    </div>
  );
});

export function ClustermapViz() {
  const [selectedTopic, setSelectedTopic] = useState('overall');
  const [data, setData] = useState<ClustermapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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

  // Transform data for heatmap with hierarchical clustering
  const { heatmapData, columnKeys } = useMemo(() => {
    if (!data) return { heatmapData: [], columnKeys: [] };
    const { data: heatmapData, orderedCountries } = matrixToHeatmapData(
      data.data.countries,
      data.data.distance_matrix
    );
    return { heatmapData, columnKeys: orderedCountries };
  }, [data]);

  // Compute color scale range
  const { minDistance, maxDistance } = useMemo(() => {
    if (!data) return { minDistance: 0, maxDistance: 1 };
    
    let min = Infinity;
    let max = -Infinity;
    
    for (const row of data.data.distance_matrix) {
      for (const val of row) {
        if (val !== null && val > 0) { // Exclude diagonal (0s)
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
      if (value === null || value === 0) return 'rgb(240, 240, 240)'; // Diagonal/null
      
      // Normalize to 0-1 range based on data range
      const t = (value - minDistance) / (maxDistance - minDistance || 1);
      return interpolateColor(Math.min(1, Math.max(0, t)));
    },
    [minDistance, maxDistance]
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with topic selector */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            EU Council Voting Patterns
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Pairwise voting distances between member states
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-slate-400">Topic</span>
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

      {/* Main visualization area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative flex items-center justify-center p-4">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex items-center gap-3 text-slate-500">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              <span>Loading clustermap...</span>
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
          <div className="flex items-center gap-6">
            {/* Square heatmap container */}
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
                margin={{ top: 90, right: 20, bottom: 20, left: 90 }}
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
            </div>
            
            {/* Legend - positioned outside the square */}
            <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 p-4 shadow-sm self-end mb-6">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                Voting Distance
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">{minDistance.toFixed(2)}</span>
                <div 
                  className="w-24 h-3 rounded-sm"
                  style={{
                    background: `linear-gradient(to right, ${interpolateColor(0)}, ${interpolateColor(0.5)}, ${interpolateColor(1)})`,
                  }}
                />
                <span className="text-xs text-slate-600">{maxDistance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-6">
                <span>Similar</span>
                <span>Different</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClustermapViz;

