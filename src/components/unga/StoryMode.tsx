import { useMemo, useState, useEffect, useRef } from 'react';
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
import { Card } from '@/components/ui/card';
import worldMapSvg from '@/assets/world_map_interactive_t0.2.svg?raw';

// Reusing constants/types where possible or defining local mocks
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

// Mock data generation
const generateMockMapData = (year: number) => {
  // Simple mock: in 2000, EU is strong. In 2024, EU is weaker.
  // We'll return a map of country ID -> color
  // We don't have the full list of IDs easily accessible without parsing the SVG or importing the data files.
  // For this mock, we'll just randomly assign colors based on probabilities that shift with the year.
  
  // Note: In a real implementation, we would iterate over the actual country keys.
  // Here we will rely on the map component to iterate the paths and ask for a color.
  return (countryId: string) => {
    // Pseudo-random determinism based on countryId + year
    let hash = 0;
    for (let i = 0; i < countryId.length; i++) {
      hash = countryId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const rand = Math.abs(Math.sin(hash + year) * 10000) % 1;
    
    // Shift probabilities
    let euProb = year === 2000 ? 0.4 : 0.2;
    let usaProb = year === 2000 ? 0.3 : 0.25;
    let chinaProb = year === 2000 ? 0.1 : 0.3;
    // russia gets the rest
    
    if (rand < euProb) return POWER_BLOC_COLORS.EU;
    if (rand < euProb + usaProb) return POWER_BLOC_COLORS.USA;
    if (rand < euProb + usaProb + chinaProb) return POWER_BLOC_COLORS.CHINA;
    return POWER_BLOC_COLORS.RUSSIA;
  };
};

const generateTimeSeriesData = () => {
  const data = [];
  for (let year = 2000; year <= 2024; year++) {
    const progress = (year - 2000) / 24;
    data.push({
      year,
      EU: 0.8 - (progress * 0.4) + (Math.random() * 0.05),
      USA: 0.7 - (progress * 0.1) + (Math.random() * 0.05),
      CHINA: 0.2 + (progress * 0.5) + (Math.random() * 0.05),
      RUSSIA: 0.3 + (Math.random() * 0.1),
    });
  }
  return data;
};

const StoryMap = ({ year }: { year: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const getColor = useMemo(() => generateMockMapData(year), [year]);

  const svgMarkup = useMemo(() => {
    return worldMapSvg.replace(
      /<svg([^>]+)>/,
      '<svg$1 preserveAspectRatio="xMidYMid meet">'
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bringToFront = (el: SVGElement | null) => {
      if (!el) return;
      const parent = el.parentNode;
      if (!parent) return;
      parent.appendChild(el);
    };

    const svgElement = container.querySelector('svg');
    const handlePointerOver = (event: Event) => {
      const target = event.target as SVGElement | null;
      if (!target) return;
      const path = target.closest?.('path[id]') as SVGPathElement | null;
      if (!path) return;
      bringToFront(path);
    };
    svgElement?.addEventListener('pointerover', handlePointerOver);

    const svgPaths = container.querySelectorAll<SVGPathElement>('path[id]');
    svgPaths.forEach((path) => {
      // In a real app we would resolve the country key properly
      // Here we just use the ID directly for the mock
      path.style.fill = getColor(path.id);
      // Keep SVG-defined stroke styling (the map uses a large viewBox)
      path.style.stroke = '';
      path.style.strokeWidth = '';
      path.style.transition = 'fill 1s ease-in-out'; // Smooth transition for year change
    });

    return () => {
      svgElement?.removeEventListener('pointerover', handlePointerOver);
    };
  }, [year, getColor]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full [&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-[60vh]"
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
};

const ComparisonMap = () => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percent = (x / rect.width) * 100;
      setSliderPosition(percent);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[1.6] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 cursor-col-resize select-none group"
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
    >
      {/* Background: 2024 (Right side) */}
      <div className="absolute inset-0">
        <StoryMap year={2024} />
        <div className="absolute top-4 right-4 bg-white/90 p-2 rounded shadow text-xs font-bold z-10 pointer-events-none text-slate-700">
          2024
        </div>
      </div>

      {/* Foreground: 2000 (Left side) - Clipped */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <StoryMap year={2000} />
        <div className="absolute top-4 left-4 bg-white/90 p-2 rounded shadow text-xs font-bold z-10 pointer-events-none text-slate-700">
          2000
        </div>
      </div>

      {/* Slider Line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white cursor-col-resize z-20 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-400">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18-6-6 6-6" />
            <path d="m15 6 6 6-6 6" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export const StoryMode = () => {
  const [selectedCountry, setSelectedCountry] = useState<string>('Overall');
  const timeSeriesData = useMemo(() => generateTimeSeriesData(), []);

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      {/* Header Section */}
      <div className="space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          De verschuivende machtsbalans
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Een interactief verhaal over hoe de invloed van de EU in de afgelopen twee decennia is veranderd op het wereldtoneel.
        </p>
      </div>

      {/* Lorum Ipsum Text 1 */}
      <div className="prose prose-slate mx-auto text-justify">
        <p className="lead first-letter:text-7xl first-letter:font-bold first-letter:text-slate-900 first-letter:mr-3 first-letter:float-left">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </p>
        <p>
          Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
        </p>
      </div>

      {/* Comparison Map Section */}
      <Card className="p-6 bg-slate-50 border-slate-200 shadow-md overflow-hidden">
        <div className="flex flex-col items-center space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-semibold text-slate-800">Wereldwijde Invloed: 2000 vs 2024</h3>
            <p className="text-sm text-slate-500">Beweeg de muis over de kaart om het verschil te zien</p>
          </div>
          
          <ComparisonMap />
          
          <div className="flex flex-wrap justify-center gap-4 text-sm">
             {Object.entries(POWER_BLOC_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: POWER_BLOC_COLORS[key as PowerBloc] }}></span>
                  <span>{label}</span>
                </div>
             ))}
          </div>
        </div>
      </Card>

      {/* Lorum Ipsum Text 2 */}
      <div className="prose prose-slate mx-auto text-justify">
        <p>
          At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.
        </p>
        <p>
          Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.
        </p>
      </div>

      {/* Time Series Section */}
      <Card className="p-6 bg-white border-slate-200 shadow-md">
        <div className="space-y-6">
           <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
             <div>
               <h3 className="text-xl font-semibold text-slate-800">Historische Trendanalyse</h3>
               <p className="text-sm text-slate-500">Ontwikkeling van stemgedrag alignement</p>
             </div>
             <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecteer land/regio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Overall">Wereldwijd Gemiddelde</SelectItem>
                  <SelectItem value="Africa">Afrika</SelectItem>
                  <SelectItem value="Asia">Azië</SelectItem>
                  <SelectItem value="Latam">Latijns Amerika</SelectItem>
                </SelectContent>
             </Select>
           </div>

           <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="year" 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val.toFixed(1)}
                  />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" />
                  {POWER_BLOCS.map(bloc => (
                    <Line
                      key={bloc}
                      type="monotone"
                      dataKey={bloc}
                      name={POWER_BLOC_LABELS[bloc]}
                      stroke={POWER_BLOC_COLORS[bloc]}
                      strokeWidth={3}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
           </div>
        </div>
      </Card>

      {/* Final Text */}
      <div className="prose prose-slate mx-auto text-justify">
        <p>
          Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.
        </p>
      </div>
      
      {/* Optional Footer Map */}
      <div className="rounded-xl bg-slate-900 p-8 text-center text-slate-400">
         <p className="italic">Meer data en inzichten worden binnenkort toegevoegd.</p>
      </div>
    </div>
  );
};

