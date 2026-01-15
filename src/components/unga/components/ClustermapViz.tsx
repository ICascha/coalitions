import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { ResponsiveHeatMapCanvas, type ComputedCell, type HeatMapSerie } from '@nivo/heatmap';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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

// Convert distance matrix to nivo heatmap format
function matrixToHeatmapData(
  countries: string[],
  matrix: number[][]
): HeatMapSerie<HeatmapCellData, Record<string, unknown>>[] {
  return countries.map((country, rowIndex) => ({
    id: country,
    data: countries.map((otherCountry, colIndex) => ({
      x: otherCountry,
      y: matrix[rowIndex]?.[colIndex] ?? null,
    })),
  }));
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

  // Transform data for heatmap
  const heatmapData = useMemo(() => {
    if (!data) return [];
    return matrixToHeatmapData(data.data.countries, data.data.distance_matrix);
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

  const countryCount = data?.data.countries.length ?? 0;

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
      <div className="flex-1 min-h-0 relative">
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
        
        {!loading && !error && heatmapData.length > 0 && (
          <div className="w-full h-full p-4">
            <ResponsiveHeatMapCanvas
              data={heatmapData}
              margin={{ top: 90, right: 60, bottom: 60, left: 90 }}
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
        )}

        {/* Legend */}
        {!loading && !error && data && (
          <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 p-3 shadow-sm">
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
        )}

        {/* Stats badge */}
        {!loading && !error && data && (
          <div className="absolute top-4 left-4 bg-slate-100/90 backdrop-blur-sm rounded-md px-3 py-1.5 text-xs text-slate-600">
            {countryCount} EU Member States
          </div>
        )}
      </div>
    </div>
  );
}

export default ClustermapViz;

