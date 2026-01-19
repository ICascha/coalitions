import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { ResponsiveHeatMapCanvas, type ComputedCell } from '@nivo/heatmap';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// Dutch translations for EU country names in Raad van Ministers
const COUNTRY_NAME_NL: Record<string, string> = {
  'Austria': 'Oostenrijk',
  'Belgium': 'België',
  'Bulgaria': 'Bulgarije',
  'Croatia': 'Kroatië',
  'Cyprus': 'Cyprus',
  'Czechia': 'Tsjechië',
  'Czech Republic': 'Tsjechië',
  'Denmark': 'Denemarken',
  'Estonia': 'Estland',
  'Finland': 'Finland',
  'France': 'Frankrijk',
  'Germany': 'Duitsland',
  'Greece': 'Griekenland',
  'Hungary': 'Hongarije',
  'Ireland': 'Ierland',
  'Italy': 'Italië',
  'Latvia': 'Letland',
  'Lithuania': 'Litouwen',
  'Luxembourg': 'Luxemburg',
  'Malta': 'Malta',
  'Netherlands': 'Nederland',
  'Poland': 'Polen',
  'Portugal': 'Portugal',
  'Romania': 'Roemenië',
  'Slovakia': 'Slowakije',
  'Slovenia': 'Slovenië',
  'Spain': 'Spanje',
  'Sweden': 'Zweden',
};

// Get Dutch country name or return original
const getDutchCountryName = (name: string): string => {
  return COUNTRY_NAME_NL[name] ?? name;
};

// Manual cluster definitions per category
// Structure: { [topicId]: string[][] } where each inner array is a list of country names (English) forming a cluster
// All clusters use the same border color #e62159
type ManualClusterConfig = Record<string, string[][]>;

const MANUAL_CLUSTERS: ManualClusterConfig = {
  'energy_infrastructure': [
    [
      'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia',
      'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece',
      'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta',
      'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia',
      'Slovenia', 'Spain', 'Sweden'
    ],
  ],
  'climate_environment': [
    [
      'Czechia', 'Slovakia', 'Italy', 'Hungary', 'Poland', 'Bulgaria',
      'Greece', 'Romania', 'Latvia', 'Malta', 'Croatia', 'Cyprus'
    ],
  ],
  'economic_financial': [
    ['Croatia', 'Estonia', 'Slovenia'],
    ['Austria', 'Sweden', 'Netherlands', 'Finland', 'Germany'],
    [
      'Slovakia', 'Italy', 'Portugal', 'Bulgaria', 'Latvia', 'Luxembourg',
      'Lithuania', 'Denmark', 'Greece', 'Cyprus', 'Ireland', 'Malta',
      'Romania', 'Poland'
    ],
  ],
  'digital_innovation': [
    [
      'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia',
      'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece',
      'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg',
      'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia',
      'Slovenia', 'Spain', 'Sweden'
    ],
  ],
  'strategic_raw_materials_circular_supply_chains': [
    [
      'Luxembourg', 'Germany', 'Romania', 'Spain', 'Austria', 'Slovenia',
      'Finland', 'Lithuania', 'Portugal', 'Poland', 'Estonia', 'Latvia',
      'Ireland', 'Belgium', 'Netherlands', 'France', 'Denmark', 'Sweden'
    ],
    [
      'Czechia', 'Slovakia', 'Greece', 'Italy', 'Bulgaria', 'Cyprus',
      'Malta', 'Croatia', 'Hungary'
    ],
  ],
};

// Types
type ClustermapData = {
  label: string;
  category: string;
  data: {
    countries: string[];
    distance_matrix: number[][];
  };
};

export type AnalysisStats = {
  avgDistance: number;
  clusters: ClusterGroup[];
  minDistance: number;
  maxDistance: number;
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

// Mako colormap stops from the report palette
const MAKO_STOPS = [
  { pos: 0.0, color: [222, 244, 228] },   // #DEF4E4
  { pos: 0.125, color: [150, 220, 181] }, // #96DCB5
  { pos: 0.25, color: [73, 193, 173] },   // #49C1AD
  { pos: 0.375, color: [52, 157, 170] },  // #349DAA
  { pos: 0.5, color: [52, 121, 162] },    // #3479A2
  { pos: 0.625, color: [59, 84, 151] },   // #3B5497
  { pos: 0.75, color: [61, 51, 105] },    // #3D3369
  { pos: 0.875, color: [42, 26, 50] },    // #2A1A32
  { pos: 1.0, color: [11, 3, 5] },        // #0B0305
];

// Color interpolation for heatmap using mako colormap
export const interpolateColor = (t: number): string => {
  // Clamp t to [0, 1]
  const clampedT = Math.max(0, Math.min(1, t));
  
  // Find the two stops to interpolate between
  let lowerIdx = 0;
  for (let i = 0; i < MAKO_STOPS.length - 1; i++) {
    if (MAKO_STOPS[i + 1].pos >= clampedT) {
      lowerIdx = i;
      break;
    }
  }
  
  const lower = MAKO_STOPS[lowerIdx];
  const upper = MAKO_STOPS[Math.min(lowerIdx + 1, MAKO_STOPS.length - 1)];
  
  // Interpolate between the two stops
  const range = upper.pos - lower.pos;
  const localT = range > 0 ? (clampedT - lower.pos) / range : 0;
  
  const r = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * localT);
  const g = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * localT);
  const b = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * localT);
  
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
  { id: 'strategic_raw_materials_circular_supply_chains', path: 'topics/strategic_raw_materials_circular_supply_chains.json', label: 'Circulaire ketens van kritieke materialen' },
];

// Single cluster color as per report specifications (#e62159)
const CLUSTER_COLOR = {
  bg: 'rgba(230, 33, 89, 0.12)',
  border: '#e62159',
  text: 'text-rose-600',
};

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

export function ClustermapViz({ 
  onClusterHover,
  onBack,
  onStatsChange
}: { 
  onClusterHover?: (countries: string[] | null) => void;
  onBack?: () => void;
  onStatsChange?: (stats: AnalysisStats) => void;
}) {
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
      // Always notify parent that clusters are cleared when topic changes
      if (onClusterHover) onClusterHover(null);
      
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}country_clustermaps/${currentTopic.path}`, {
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
  const { heatmapData, columnKeys, clusters, minDistance, maxDistance } = useMemo(() => {
    if (!data) return { heatmapData: [], columnKeys: [], clusters: [], avgDistance: 0, minDistance: 0, maxDistance: 1 };
    
    const { countries, distance_matrix } = data.data;
    const { order, root, mergeHistory } = computeHierarchicalClustering(distance_matrix);
    
    // Reorder countries based on clustering, translate to Dutch
    const orderedCountries = order.map((i) => getDutchCountryName(countries[i]));
    
    // Build heatmap data in clustered order with Dutch country names
    const heatmapData = order.map((rowIndex) => ({
      id: getDutchCountryName(countries[rowIndex]),
      data: order.map((colIndex) => ({
        x: getDutchCountryName(countries[colIndex]),
        y: distance_matrix[rowIndex]?.[colIndex] ?? null,
      })),
    }));

    // Compute average distance and find min/max (excluding diagonal)
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < distance_matrix.length; i++) {
      for (let j = i + 1; j < distance_matrix.length; j++) {
        const val = distance_matrix[i][j];
        if (val !== null && Number.isFinite(val)) {
          sum += val;
          count++;
          if (val > 0) {
            min = Math.min(min, val);
            max = Math.max(max, val);
          }
        }
      }
    }
    const avgDistance = count > 0 ? sum / count : 0;
    const minDistance = min === Infinity ? 0 : min;
    const maxDistance = max === -Infinity ? 1 : max;

    // Check if there are manual clusters defined for this topic
    const manualClusterDef = MANUAL_CLUSTERS[selectedTopic];
    let clusters: ClusterGroup[];
    
    if (manualClusterDef && manualClusterDef.length > 0) {
      // Use manual cluster definitions
      // Map English country names to their indices in the ordered array
      const countryToOrderedIdx = new Map<string, number>();
      order.forEach((origIdx, orderedIdx) => {
        countryToOrderedIdx.set(countries[origIdx], orderedIdx);
      });
      
      clusters = manualClusterDef.map((clusterCountries, id) => {
        const indices = clusterCountries
          .map(name => countryToOrderedIdx.get(name))
          .filter((idx): idx is number => idx !== undefined)
          .sort((a, b) => a - b);
        
        return {
          id,
          countries: clusterCountries,
          indices,
          avgDistance: 0,
        };
      }).filter(c => c.indices.length >= 2);
    } else {
      // Use automatic clustering
      const sortedMerges = [...mergeHistory].sort((a, b) => a.distance - b.distance);
      const medianIdx = Math.floor(sortedMerges.length * 0.6); // Cut at 60th percentile
      const threshold = sortedMerges[medianIdx]?.distance ?? 0.2;

      // Cut dendrogram to get clusters, filter out single-country clusters
      const allClusters = cutDendrogram(root, threshold, countries, order);
      clusters = allClusters.filter((c) => c.countries.length >= 2);
    }
    
    const result = { heatmapData, columnKeys: orderedCountries, clusters, avgDistance, minDistance, maxDistance };
    
    // Notify parent of stats
    if (onStatsChange) {
      // Defer to avoid render loop
      setTimeout(() => onStatsChange(result), 0);
    }
    
    return result;
  }, [data, selectedTopic]); // Removed onStatsChange from dependency to avoid loop if it's not memoized

  // Color scale function - uses fixed global scale (0 to 0.5) for cross-figure comparability
  // 0 = identical voting, 0.5 = maximum realistic divergence
  const GLOBAL_MIN_DISTANCE = 0;
  const GLOBAL_MAX_DISTANCE = 0.5;
  
  const getColor = useCallback(
    (cell: Omit<ComputedCell<HeatmapCellData>, 'color' | 'opacity' | 'borderColor' | 'labelTextColor'>) => {
      const value = cell.data.y;
      if (value === null || value === 0) return 'rgb(240, 240, 240)';
      // Normalize to 0-1 using fixed global scale for cross-figure comparability
      const t = (value - GLOBAL_MIN_DISTANCE) / (GLOBAL_MAX_DISTANCE - GLOBAL_MIN_DISTANCE);
      return interpolateColor(Math.min(1, Math.max(0, t)));
    },
    []
  );

  // Compute cluster overlay positions
  const clusterOverlays = useMemo(() => {
    if (!squareSize || clusters.length === 0) return [];
    
    const chartWidth = squareSize - HEATMAP_MARGIN.left - HEATMAP_MARGIN.right;
    const chartHeight = squareSize - HEATMAP_MARGIN.top - HEATMAP_MARGIN.bottom;
    const cellWidth = chartWidth / columnKeys.length;
    const cellHeight = chartHeight / columnKeys.length;

    return clusters.map((cluster) => {
      const startIdx = cluster.indices[0];
      const endIdx = cluster.indices[cluster.indices.length - 1];

      return {
        id: cluster.id,
        x: HEATMAP_MARGIN.left + startIdx * cellWidth,
        y: HEATMAP_MARGIN.top + startIdx * cellHeight,
        width: (endIdx - startIdx + 1) * cellWidth,
        height: (endIdx - startIdx + 1) * cellHeight,
        color: CLUSTER_COLOR, // All clusters use the same #e62159 color
        countries: cluster.countries,
      };
    });
  }, [squareSize, clusters, columnKeys.length]);

  return (
    <div className="w-full h-full flex flex-col pt-8 md:pt-12">
      {/* Header with topic selector */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              title="Terug naar overzicht"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              Analyse Raad van Ministers
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Onderzoek naar stemafstand en coalitievorming binnen de Europese Unie
            </p>
          </div>
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

      {/* Main content: clustermap only */}
      <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
        {/* Clustermap Section - full height */}
        <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
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
                className="absolute inset-0"
                width={squareSize}
                height={squareSize}
                style={{ pointerEvents: 'none' }}
              >
                {clusterOverlays.map((overlay) => (
                  <g 
                    key={overlay.id} 
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onMouseEnter={() => onClusterHover?.(overlay.countries)}
                    onMouseLeave={() => onClusterHover?.(null)}
                    onClick={() => onClusterHover?.(overlay.countries)}
                  >
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
      </div>
    </div>
  );
}

export default ClustermapViz;
