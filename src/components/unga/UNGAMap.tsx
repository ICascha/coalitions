import { useRef, useMemo, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
// Use the raw import for the interactive SVG
import worldMapSvg from '@/assets/world_map_interactive_t0.2.svg?raw';
import { svgNameToAlpha3 } from '@/data/svgCountryAlpha3';
import { alpha3ToCountryName } from '@/data/alpha3ToCountryName';

// --- Constants & Types ---

const POWER_BLOCS = ['EU', 'USA', 'CHINA', 'RUSSIA'] as const;
type PowerBloc = (typeof POWER_BLOCS)[number];

// Sombre palette
const POWER_BLOC_COLORS: Record<PowerBloc, string> = {
  EU: '#004494',
  USA: '#059669',
  CHINA: '#991B1B',
  RUSSIA: '#EA580C',
};

const POWER_BLOC_LABELS: Record<PowerBloc, string> = {
  EU: 'Europese Unie',
  USA: 'Verenigde Staten',
  CHINA: 'China',
  RUSSIA: 'Rusland',
};

const UNGA_API_BASE = import.meta.env.VITE_UNGA_DISTANCE_API?.replace(/\/+$/, '') ??
  (import.meta.env.PROD ? 'https://backendclustering-production.up.railway.app' : 'http://localhost:8000');

type CountryAlignment = {
  bloc: PowerBloc;
  value: number | null;
  strength: number;
  metrics: Partial<Record<PowerBloc, number | null>>;
};

type TooltipAlignmentState = {
  type: 'alignment';
  name: string;
  alignment: CountryAlignment | null;
  x: number;
  y: number;
};

type TooltipState = TooltipAlignmentState;

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

type AlignmentMap = Record<string, CountryAlignment>;

// --- Helper Functions ---

const formatCountryName = (rawId: string) =>
  rawId
    .replace(/[_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeSvgId = (rawId: string) => formatCountryName(rawId).toUpperCase();

// logic to resolve country key using definition data
const resolveCountryKey = (rawId: string): string | null => {
  const normalized = normalizeSvgId(rawId);
  if (!normalized || normalized === 'SVG2') {
    return null;
  }
  return svgNameToAlpha3[normalized] ?? normalized;
};

const getCountryDisplayName = (key: string, defaultName: string): string => {
  // Use alpha3 map if available
  return alpha3ToCountryName[key] ?? defaultName;
};

const blendWithWhite = (color: string, alpha: number): string => {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const blendedR = Math.round(r * alpha + 255 * (1 - alpha));
  const blendedG = Math.round(g * alpha + 255 * (1 - alpha));
  const blendedB = Math.round(b * alpha + 255 * (1 - alpha));

  return `rgb(${blendedR},${blendedG},${blendedB})`;
};

const getFillColor = (alignment: { bloc: PowerBloc; strength: number } | undefined | null) => {
  if (!alignment) {
    return '#f1f5f9'; // slate-100
  }
  return blendWithWhite(POWER_BLOC_COLORS[alignment.bloc], Math.max(alignment.strength, 0.45));
};

const formatMetricValue = (value: number | null, source: string): string => {
  if (value === null) return '-';
  return value.toFixed(3);
};

const buildAlignmentMap = (
  countries: any[],
  getValue: (blocRow: any) => number | null,
  options: { preferLower: boolean; treatEuMembersAsAligned?: boolean }
): AlignmentMap => {
  const map: AlignmentMap = {};
  const { preferLower } = options;

  countries.forEach((countryEntry) => {
    // Use the resolve logic compatible with the API response country names
    // Note: API returns names like "United States", "Netherlands".
    // We need to match these to our Alpha3 keys if we want to align with SVG.
    // Let's try to derive key from countryEntry.country

    // In strict sense, we should clean this up, but for now let's hope resolveCountryKey handles names roughly.
    // Actually, resolveCountryKey handles SVG IDs.
    // We need a way to link API country names to SVG keys. 
    // Usually the API names are close enough to be normalized or we map them.
    // For now, let's use resolveCountryKey on the API name too.
    const countryKey = resolveCountryKey(countryEntry.country);
    if (!countryKey) return;

    let bestBloc: PowerBloc | null = null;
    let bestValue: number | null = null;
    const metrics: Partial<Record<PowerBloc, number | null>> = {};

    countryEntry.blocs.forEach((blocRow: any) => {
      const bloc = blocRow.bloc.toUpperCase() as PowerBloc;
      if (POWER_BLOC_COLORS[bloc]) {
        const val = getValue(blocRow);
        metrics[bloc] = val;

        if (val !== null) {
          let isBetter = false;
          if (bestValue === null) {
            isBetter = true;
          } else {
            isBetter = options.preferLower ? val < bestValue : val > bestValue;
          }

          if (isBetter) {
            bestValue = val;
            bestBloc = bloc;
          }
        }
      }
    });

    if (bestBloc && bestValue !== null) {
      let strength = 0;
      if (bestValue !== null) {
        // Assuming distances roughly 0-4
        strength = preferLower ? Math.max(0, 1 - bestValue / 4) : Math.min(1, bestValue);
      }

      map[countryKey] = {
        bloc: bestBloc,
        strength,
        value: bestValue,
        metrics,
      };
    }
  });

  return map;
};

const UNGAMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [overallAlignment, setOverallAlignment] = useState<AlignmentMap>({});
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  const dataSource = 'UNGA';

  // Handle scroll for zoom effect
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const clientHeight = scrollContainer.clientHeight;
      const scrollHeight = scrollContainer.scrollHeight;

      // Calculate progress roughly: 0 at top, 1 when we've scrolled 1 viewport height
      // We want the zoom to complete after scrolling 100vh
      const maxScroll = clientHeight * 1.5; // Use slightly more than 1 screen to make it feel smoother
      const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));

      setScrollProgress(progress);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const zoomStyle = useMemo(() => {
    // Zoom into Europe target
    const scale = 1 + (scrollProgress * 2.5); // 1 -> 3.5

    // Transform Origin: 53% 35% works for 'world_map_svg',
    // For 'world_map_interactive_t0.2.svg' it should be broadly similar if the viewbox is the world.
    return {
      transform: `scale(${scale})`,
      transformOrigin: '53% 35%',
    };
  }, [scrollProgress]);

  const alignmentMap = useMemo(() => {
    return overallAlignment;
  }, [overallAlignment]);

  useEffect(() => {
    setTooltip(null);
    setSelectedCountry(null);
  }, []);

  const svgMarkup = useMemo(() => {
    return worldMapSvg
      .replace(
        /<svg([^>]+)>/,
        '<svg$1 preserveAspectRatio="xMidYMid meet">'
      )
      .replace(
        /transition:\s*all[^;]*;/g,
        'transition: fill 0.2s ease-out, stroke 0.15s ease-out, stroke-width 0.15s ease-out;'
      );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const handleClick = (event: Event) => {
      const target = event.target as SVGElement | null;
      if (!target) {
        setTooltip(null);
        return;
      }

      event.stopPropagation();

      // Adaptation for interactive map structure
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
      setTooltip({
        type: 'alignment',
        name: displayName,
        alignment: alignmentMap[key] ?? null,
        x: mouseEvent.clientX - bounds.left,
        y: mouseEvent.clientY - bounds.top,
      });
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
  }, [alignmentMap]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const handlePointerEnter = (event: Event) => {
      const target = event.target as SVGElement | null;
      if (!target || target.id === 'selection-highlight-overlay' || target.id === 'hover-highlight-overlay') {
        return;
      }
      const key = resolveCountryKey(target.id);
      if (key) {
        setHoveredCountry(key);
      }
    };

    const handlePointerLeave = (event: Event) => {
      const target = event.target as SVGElement | null;
      if (!target || target.id === 'selection-highlight-overlay' || target.id === 'hover-highlight-overlay') {
        return;
      }
      setHoveredCountry(null);
    };

    svgElement.addEventListener('pointerenter', handlePointerEnter, true);
    svgElement.addEventListener('pointerleave', handlePointerLeave, true);

    return () => {
      svgElement.removeEventListener('pointerenter', handlePointerEnter, true);
      svgElement.removeEventListener('pointerleave', handlePointerLeave, true);
    };
  }, []);

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
          setMapLoading(false);
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
    const container = containerRef.current;
    if (!container) return;

    const svgElement = container.querySelector('svg');
    const countriesGroup = svgElement?.querySelector('#countries') ?? svgElement;

    const existingOverlay = svgElement?.querySelector('#selection-highlight-overlay');
    if (existingOverlay) existingOverlay.remove();

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
      const fill = getFillColor(alignment);
      path.style.fill = fill;

      if (selectedCountry) {
        const isSelected = selectedCountry === key;
        path.style.opacity = isSelected ? '1' : '0.35';
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

    if (selectedPathId && countriesGroup && svgElement) {
      const originalPath = svgElement.querySelector(`#${selectedPathId}`) as SVGPathElement | null;
      if (originalPath) {
        const pathData = originalPath.getAttribute('d');
        if (pathData) {
          const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          overlay.setAttribute('id', 'selection-highlight-overlay');
          overlay.setAttribute('d', pathData);
          overlay.style.fill = 'none';
          overlay.style.stroke = '#0f172a';
          overlay.style.strokeWidth = '1.5';
          overlay.style.strokeLinejoin = 'round';
          overlay.style.pointerEvents = 'none';
          overlay.style.filter = 'drop-shadow(0 0 2px rgba(15, 23, 42, 0.4))';
          overlay.style.opacity = '1';
          overlay.style.transition = 'none';
          countriesGroup.appendChild(overlay);
        }
      }
    }
  }, [alignmentMap, selectedCountry]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgElement = container.querySelector('svg');
    const countriesGroup = svgElement?.querySelector('#countries') ?? svgElement;

    const existingHoverOverlay = svgElement?.querySelector('#hover-highlight-overlay');
    if (existingHoverOverlay) existingHoverOverlay.remove();

    if (!hoveredCountry || hoveredCountry === selectedCountry || !countriesGroup || !svgElement) {
      return;
    }

    const svgPaths = container.querySelectorAll<SVGPathElement>('path[id]');
    let hoveredPathId: string | null = null;
    svgPaths.forEach((path) => {
      const key = resolveCountryKey(path.id);
      if (key === hoveredCountry) {
        hoveredPathId = path.id;
      }
    });

    if (hoveredPathId) {
      const originalPath = svgElement.querySelector(`#${hoveredPathId}`) as SVGPathElement | null;
      if (originalPath) {
        const pathData = originalPath.getAttribute('d');
        if (pathData) {
          const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          overlay.setAttribute('id', 'hover-highlight-overlay');
          overlay.setAttribute('d', pathData);
          overlay.style.fill = 'none';
          overlay.style.stroke = '#1e293b';
          overlay.style.strokeWidth = '1';
          overlay.style.strokeLinejoin = 'round';
          overlay.style.pointerEvents = 'none';
          overlay.style.filter = 'drop-shadow(0 0 2px rgba(30, 41, 59, 0.25))';
          overlay.style.opacity = '1';
          overlay.style.transition = 'none';
          countriesGroup.appendChild(overlay);
        }
      }
    }
  }, [hoveredCountry, selectedCountry]);

  const blocLegend = POWER_BLOCS.map((bloc) => ({
    bloc,
    label: POWER_BLOC_LABELS[bloc],
    color: blendWithWhite(POWER_BLOC_COLORS[bloc], 0.85),
  }));

  return (
    <Card className="h-full flex-1 min-h-0 overflow-hidden flex flex-col bg-[#f8f9fa] border-none shadow-none relative">
      <style>
        {`
          @keyframes mapReveal {
            0% {
              opacity: 0;
              transform: scale(0.98) translateY(15px);
              filter: blur(10px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
              filter: blur(0);
            }
          }
          .unga-map-container-inner {
            animation: mapReveal 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}
      </style>

      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-y-auto scroll-smooth"
      >
        {/* Scroll track height - 200vh ensures we have room to scroll and zoom */}
        <div className="h-[200vh] w-full relative">

          {/* Sticky container for the map view */}
          <div className="sticky top-0 h-full max-h-screen w-full overflow-hidden flex flex-col">

            <div className="flex flex-col items-center justify-center pt-8 pb-4 z-10 pointer-events-none relative transition-opacity duration-500"
              style={{ opacity: 1 - scrollProgress * 2 }}>
              <h1 className="text-3xl md:text-4xl font-light text-slate-800 tracking-tight text-center animate-[fadeIn_1s_ease-out_0.5s_both]">
                The world is more divided than ever before
              </h1>
              <p className="mt-2 text-slate-500 text-sm animate-[fadeIn_1s_ease-out_1s_both]">
                General Assembly Voting Alignment
              </p>
            </div>

            <div className={`flex flex-col gap-3 pb-4 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between opacity-0 animate-[fadeIn_1s_ease-out_1.5s_forwards] px-6 z-10 transition-opacity duration-500 relative`}
              style={{ opacity: scrollProgress > 0.1 ? 0 : undefined }}>
              <div className="flex flex-wrap gap-4 justify-center w-full lg:w-auto mx-auto">
                {blocLegend.map((entry) => (
                  <div key={entry.bloc} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-6 rounded"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 w-full relative">
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  className="relative w-full h-full max-w-[1600px] unga-map-container-inner"
                  style={{
                    willChange: 'transform',
                    transition: 'transform 0.1s linear',
                    ...zoomStyle
                  }}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-xl bg-slate-50/0">
                    <div
                      ref={containerRef}
                      className={cn(
                        'w-full h-full unga-map',
                        '[&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-full',
                        '[&_path]:transition-[fill,stroke,stroke-width] [&_path]:duration-500 [&_path]:ease-out',
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
                        className="absolute rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-lg border border-gray-200 pointer-events-none z-50 transform-none"
                        style={{ left: tooltip.x, top: tooltip.y }}
                      >
                        <div className="font-semibold">{tooltip.name}</div>
                        {tooltip.type === 'alignment' && (
                          (() => {
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
                                    Dichtst bij {POWER_BLOC_LABELS[alignmentData.bloc]} (
                                    {formatMetricValue(alignmentData.value, dataSource)})
                                  </span>
                                </div>
                                <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                                  {POWER_BLOCS.map((bloc) => (
                                    <div key={bloc} className="flex items-center justify-between gap-6">
                                      <span>{POWER_BLOC_LABELS[bloc]}</span>
                                      <span>
                                        {formatMetricValue(alignmentData.metrics[bloc] ?? null, dataSource)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            );
                          })()
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Scroll Indicator */}
            <div
              className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 transition-opacity duration-500"
              style={{ opacity: scrollProgress > 0.1 ? 0 : 1 }}
            >
              <span className="text-xs uppercase tracking-widest text-slate-400 font-medium">
                Scroll to explore
              </span>
              <ChevronDown className="h-6 w-6 text-slate-400 animate-bounce" />
            </div>

          </div>
        </div>
      </div>
    </Card>
  );
};

export default UNGAMap;
