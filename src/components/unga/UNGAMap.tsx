import { useRef, useMemo, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
// Use the raw import for the interactive SVG
import worldMapSvg from '@/assets/world_map_interactive_t0.2.svg?raw';
import { POWER_BLOCS } from './ungaMapTypes';
import type { TooltipState } from './ungaMapTypes';
import {
  EUROPE_COUNTRY_NAMES,
  EUROPE_VIEWBOX_OVERRIDE,
  EU_COALITIONS,
  POWER_BLOC_COLORS,
  POWER_BLOC_LABELS,
} from './ungaMapConfig';
import { buildAlpha3SetFromNames, formatCountryName, getCountryDisplayName, resolveCountryKey } from './ungaMapSvgCountry';
import { blendWithWhite } from './ungaMapColors';
import { clamp01, easeInOut, lerp } from './ungaMapMath';
import { formatMetricValue } from './ungaMapFormat';
import { useScrollContainerProgress } from './hooks/useScrollContainerProgress';
import { useElementSize } from './hooks/useElementSize';
import { useUngAAlignment } from './hooks/useUngAAlignment';
import { useEuropeViewBoxZoom } from './hooks/useEuropeViewBoxZoom';
import { useCoalitionLoop } from './hooks/useCoalitionLoop';
import { useUngAMapSvgStyling } from './hooks/useUngAMapSvgStyling';
import { CoalitionOverlayCard } from './components/CoalitionOverlayCard';
import { useScrollScenes } from './hooks/useScrollScenes';

const UNGAMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const rawScrollProgress = useScrollContainerProgress(scrollContainerRef);
  const { sceneId, sceneProgress, effectiveProgress } = useScrollScenes(rawScrollProgress, [
    { id: 'intro', start: 0, end: 1 / 3 },
    { id: 'europe', start: 1 / 3, end: 2 / 3 },
    { id: 'viz', start: 2 / 3, end: 1 },
  ]);
  const mapViewport = useElementSize(containerRef);
  const { alignmentMap, loading: mapLoading, error: mapError } = useUngAAlignment();

  // Zoom is mapped across the first two "screens" (intro -> europe). Third screen transitions away from the map.
  const zoomProgress = clamp01(effectiveProgress / (2 / 3));
  const vizProgress = sceneId === 'viz' ? sceneProgress : 0;

  const interactionsEnabled = rawScrollProgress < 0.02;
  const isZoomComplete = zoomProgress >= 0.98;

  useEffect(() => {
    setTooltip(null);
    setSelectedCountry(null);
  }, []);

  // Once the user scrolls, disable interactions (the map becomes a background).
  useEffect(() => {
    if (!interactionsEnabled) {
      setTooltip(null);
      setSelectedCountry(null);
      setHoveredCountry(null);
    }
  }, [interactionsEnabled]);

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
  const europeAlpha3 = useMemo(() => buildAlpha3SetFromNames(EUROPE_COUNTRY_NAMES), []);

  useEuropeViewBoxZoom({
    containerRef,
    viewport: mapViewport,
    scrollProgress: zoomProgress,
    europeAlpha3,
    override: EUROPE_VIEWBOX_OVERRIDE,
  });

  const mapFadeStyle = useMemo(() => {
    const t = easeInOut(zoomProgress);
    // Fade/soften map as we zoom in; keep it interactive but visually backgrounded.
    const opacity = lerp(1, 0.8, t);
    const blurPx = lerp(0, 0, t);
    const saturate = lerp(1, 0.75, t);
    const contrast = lerp(1, 1.02, t);
    const brightness = lerp(1, 1.01, t);

    return {
      opacity,
      filter: `blur(${blurPx}px) saturate(${saturate}) contrast(${contrast}) brightness(${brightness})`,
      transition: 'opacity 0.05s linear, filter 0.05s linear',
      willChange: 'opacity, filter',
    } as const;
  }, [zoomProgress]);

  const mapExitStyle = useMemo(() => {
    const t = easeInOut(vizProgress);
    return {
      opacity: lerp(1, 0, t),
      transform: `translateY(${lerp(0, -24, t)}px) scale(${lerp(1, 0.985, t)})`,
      transition: 'opacity 600ms ease, transform 700ms ease',
      willChange: 'opacity, transform',
    } as const;
  }, [vizProgress]);

  const vizEnterStyle = useMemo(() => {
    const t = easeInOut(vizProgress);
    return {
      opacity: t,
      transform: `translateY(${lerp(12, 0, t)}px)`,
      transition: 'opacity 600ms ease, transform 700ms ease',
      willChange: 'opacity, transform',
    } as const;
  }, [vizProgress]);
  const { activeIndex: activeCoalitionIndex, loopEnabled: coalitionLoopEnabled } = useCoalitionLoop({
    enabled: sceneId === 'europe' && isZoomComplete,
    coalitionCount: EU_COALITIONS.length,
    startDelayMs: 3000,
    cycleMs: 2600,
  });
  const activeCoalition = EU_COALITIONS[activeCoalitionIndex] ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const handleClick = (event: Event) => {
      if (!interactionsEnabled) {
        return;
      }
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
  }, [alignmentMap, interactionsEnabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const handlePointerEnter = (event: Event) => {
      if (!interactionsEnabled) return;
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
      if (!interactionsEnabled) return;
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
  }, [interactionsEnabled]);

  // (data fetching moved to useUngAAlignment)

  useUngAMapSvgStyling({
    containerRef,
    alignmentMap,
    selectedCountry,
    setSelectedCountry,
    hoveredCountry,
    interactionsEnabled,
    scrollProgress: zoomProgress,
    europeAlpha3,
    nonEuropeFade: { start: 0.72, duration: 0.28, minOpacity: 0.06 },
    coalition: {
      enabled: coalitionLoopEnabled && sceneId === 'europe' && isZoomComplete,
      activeMembers: activeCoalition?.members ?? new Set<string>(),
      deemphasizeOpacity: lerp(1, 0.22, easeInOut(clamp01((zoomProgress - 0.9) / 0.1))),
    },
  });

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
              filter: blur(10px);
            }
            100% {
              opacity: 1;
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
        className="absolute inset-0 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]"
      >
        {/* Scroll track height - 300vh gives us 3 "screens" (intro -> europe -> viz) */}
        <div className="h-[300vh] w-full relative">

          {/* Sticky container for the map view */}
          <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col">

            <div
              className="flex flex-col items-center justify-center pt-8 pb-4 z-10 pointer-events-none relative transition-opacity duration-500"
              style={{ opacity: interactionsEnabled ? 1 - rawScrollProgress * 2 : 0 }}
            >
              <h1 className="text-3xl md:text-4xl font-light text-slate-800 tracking-tight text-center animate-[fadeIn_1s_ease-out_0.5s_both]">
                The world is more divided than ever before
              </h1>
              <p className="mt-2 text-slate-500 text-sm animate-[fadeIn_1s_ease-out_1s_both]">
                General Assembly Voting Alignment
              </p>
            </div>

            {interactionsEnabled && (
              <div className="flex flex-col gap-3 pb-4 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between opacity-0 animate-[fadeIn_1s_ease-out_1.5s_forwards] px-6 z-10 transition-opacity duration-500 relative">
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
            )}

            <div className="flex-1 w-full relative">
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  className="relative w-full h-full max-w-[1600px] unga-map-container-inner"
                  style={mapExitStyle}
                >
                  <div className="relative w-full h-full">
                  <div className="relative h-full w-full overflow-hidden rounded-xl bg-slate-50/0">
                    <div
                      ref={containerRef}
                      style={mapFadeStyle}
                      className={cn(
                        'w-full h-full unga-map',
                        '[&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-full',
                        '[&_path]:transition-[fill,stroke,stroke-width] [&_path]:duration-500 [&_path]:ease-out',
                        '[&_path]:cursor-pointer',
                        '[&_path:hover]:brightness-[1.05]'
                      )}
                      dangerouslySetInnerHTML={{ __html: svgMarkup }}
                    />
                    <CoalitionOverlayCard
                      isVisible={isZoomComplete && sceneId !== 'intro'}
                      coalitionLoopEnabled={coalitionLoopEnabled}
                      activeCoalition={activeCoalition}
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
                                    {formatMetricValue(alignmentData.value)})
                                  </span>
                                </div>
                                <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                                  {POWER_BLOCS.map((bloc) => (
                                    <div key={bloc} className="flex items-center justify-between gap-6">
                                      <span>{POWER_BLOC_LABELS[bloc]}</span>
                                      <span>
                                        {formatMetricValue(alignmentData.metrics[bloc] ?? null)}
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

              {/* Third screen: fullscreen visualization placeholder (map scrolls away) */}
              <div
                className="absolute inset-0 flex items-center justify-center bg-white"
                style={{
                  pointerEvents: sceneId === 'viz' ? 'auto' : 'none',
                  ...vizEnterStyle,
                }}
              >
                <div className="max-w-4xl w-full px-8">
                  <div className="text-xs uppercase tracking-widest text-slate-500">Next screen (placeholder)</div>
                  <div className="mt-3 text-4xl font-semibold text-slate-900">Fullscreen visualizations</div>
                  <div className="mt-3 text-base text-slate-600 leading-relaxed">
                    This is where we’ll render the next visualization full-bleed, once you scroll past the Europe map.
                  </div>
                </div>
              </div>
            </div>

            {/* Scroll Indicator */}
            <div
              className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 transition-opacity duration-500"
              style={{ opacity: rawScrollProgress > 0.1 ? 0 : 1 }}
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
