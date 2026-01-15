import { useRef, useMemo, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
// Use the raw import for the interactive SVG
import worldMapSvg from '@/assets/world_map_interactive_110m.svg?raw';
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
import { useDiscreteScroll } from './hooks/useDiscreteScroll';
import { ClustermapViz } from './components/ClustermapViz';

const SECTION_COUNT = 4;
const SCROLL_TRANSITION_MS = 300; // Fast transition
const LOCK_IN_DURATION_MS = 200; // Cooldown after landing on a section
const HOVER_COOLDOWN_MS = 400; // Cooldown before re-enabling hover after scroll animation

const UNGAMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  
  // Track scroll activity to prevent hover flickering during animations
  const lastScrollProgressRef = useRef(0);
  const scrollCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrollCooldown, setIsScrollCooldown] = useState(false);
  
  // Continuous scroll progress for smooth visual transitions
  const rawScrollProgress = useScrollContainerProgress(scrollContainerRef);
  
  // Detect scroll activity and manage cooldown
  useEffect(() => {
    const progressChanged = Math.abs(rawScrollProgress - lastScrollProgressRef.current) > 0.001;
    lastScrollProgressRef.current = rawScrollProgress;
    
    if (progressChanged) {
      // Scrolling is happening - enter cooldown mode
      setIsScrollCooldown(true);
      
      // Clear hover state immediately when scrolling starts
      setHoveredCountry(null);
      
      // Clear any existing cooldown timer
      if (scrollCooldownRef.current) {
        clearTimeout(scrollCooldownRef.current);
      }
      
      // Set a new cooldown timer
      scrollCooldownRef.current = setTimeout(() => {
        setIsScrollCooldown(false);
      }, HOVER_COOLDOWN_MS);
    }
    
    return () => {
      if (scrollCooldownRef.current) {
        clearTimeout(scrollCooldownRef.current);
      }
    };
  }, [rawScrollProgress]);
  
  // Discrete scroll: enforces one-section-at-a-time navigation with lock-in period
  const { currentSection, goToNextSection, scrollToSection } = useDiscreteScroll(scrollContainerRef, {
    sectionCount: SECTION_COUNT,
    transitionDurationMs: SCROLL_TRANSITION_MS,
    lockInDurationMs: LOCK_IN_DURATION_MS,
  });
  
  // Map current section to scene ID
  const sceneId = currentSection === 0 ? 'context' : currentSection === 1 ? 'intro' : currentSection === 2 ? 'europe' : 'viz';
  const mapViewport = useElementSize(containerRef);
  const { alignmentMap, loading: mapLoading, error: mapError } = useUngAAlignment();

  // Use scroll progress for smooth visual transitions
  // rawScrollProgress: 0 = section 0 (context), 0.33 = section 1 (intro), 0.66 = section 2 (europe), 1 = section 3 (viz)
  
  // introProgress: maps 0-0.33 to 0-1 (context fades out, map fades in)
  const introProgress = clamp01(rawScrollProgress * 3);
  
  // zoomProgress: maps 0.33-0.66 to 0-1 (zoom completes at section 2)
  const zoomProgress = clamp01((rawScrollProgress - 1/3) * 3);
  
  // vizProgress: maps 0.66-1 to 0-1 (viz transition happens going to section 3)
  const vizProgress = clamp01((rawScrollProgress - 2/3) * 3);

  // Hover is only enabled when at section 1 (intro) AND not in scroll cooldown
  const interactionsEnabled = Math.abs(rawScrollProgress - 1/3) < 0.05;
  const hoverEnabled = interactionsEnabled && !isScrollCooldown;
  const isZoomComplete = zoomProgress >= 0.98;

  useEffect(() => {
    setTooltip(null);
    setSelectedCountry(null);
  }, []);

  // Once the user scrolls, disable interactions (the map becomes a background).
  // Note: hoveredCountry is now cleared by the scroll cooldown effect above
  useEffect(() => {
    if (!interactionsEnabled) {
      setTooltip(null);
      setSelectedCountry(null);
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

    // Also consider intro transition for opacity
    const introT = easeInOut(introProgress);
    const finalOpacity = opacity * introT;

    return {
      opacity: finalOpacity,
      filter: `blur(${blurPx}px) saturate(${saturate}) contrast(${contrast}) brightness(${brightness})`,
      transition: 'opacity 0.05s linear, filter 0.05s linear',
      willChange: 'opacity, filter',
    } as const;
  }, [zoomProgress, introProgress]);

  const introTextStyle = useMemo(() => {
    const t = easeInOut(introProgress);
    return {
      opacity: 1 - t,
      transform: `translateY(${lerp(0, -50, t)}px)`,
      pointerEvents: t > 0.9 ? 'none' : 'auto',
      transition: 'opacity 300ms ease, transform 300ms ease',
    } as const;
  }, [introProgress]);
  
  const mapOverlayTextStyle = useMemo(() => {
    const t = easeInOut(introProgress);
    return {
      opacity: (interactionsEnabled ? 1 - zoomProgress * 4 : 0) * t, // Fade in as intro fades out, then fade out on zoom
      transform: `translateY(${lerp(20, 0, t)}px)`,
      transition: 'opacity 300ms ease, transform 300ms ease',
    } as const;
  }, [introProgress, interactionsEnabled, zoomProgress]);

  const mapExitStyle = useMemo(() => {
    const t = easeInOut(vizProgress);
    return {
      opacity: lerp(1, 0, t),
      transform: `translateY(${lerp(0, -24, t)}px) scale(${lerp(1, 0.985, t)})`,
      transition: 'opacity 350ms ease, transform 450ms ease',
      willChange: 'opacity, transform',
    } as const;
  }, [vizProgress]);

  const vizEnterStyle = useMemo(() => {
    const t = easeInOut(vizProgress);
    return {
      opacity: t,
      transform: `translateY(${lerp(12, 0, t)}px)`,
      transition: 'opacity 350ms ease, transform 450ms ease',
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

      // Skip countries without UN voting data (e.g., Taiwan, Kosovo, Somaliland)
      const alignment = alignmentMap[key];
      if (!alignment) {
        setTooltip(null);
        setSelectedCountry(null);
        return;
      }

      const displayName = getCountryDisplayName(key, formatCountryName(countryId));
      setTooltip({
        type: 'alignment',
        name: displayName,
        alignment: alignment,
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
      // Use hoverEnabled to prevent hover during scroll cooldown
      if (!hoverEnabled) return;
      const target = event.target as SVGElement | null;
      if (!target || target.id === 'selection-highlight-overlay' || target.id === 'hover-highlight-overlay') {
        return;
      }
      const key = resolveCountryKey(target.id);
      // Skip countries without UN voting data (e.g., Taiwan, Kosovo, Somaliland)
      if (key && alignmentMap[key]) {
        setHoveredCountry(key);
      }
    };

    const handlePointerLeave = (event: Event) => {
      // Use hoverEnabled to prevent hover during scroll cooldown
      if (!hoverEnabled) return;
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
  }, [hoverEnabled, alignmentMap]);

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
          @keyframes gentleBounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(3px);
            }
          }
        `}
      </style>

      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-y-scroll overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]"
      >
        {/* Scroll track: 3 discrete sections (intro -> europe -> viz).
            JS-controlled discrete scroll prevents skipping sections. */}
        <div className="w-full relative">

          {/* Sticky container for the map view. */}
            <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col">

            {/* Logo - top left */}
            <div className="absolute top-5 left-5 z-20">
              <img 
                src="/denkwerk_logo.svg" 
                alt="Denkwerk" 
                className="h-8 w-auto opacity-40 grayscale"
              />
            </div>

            {/* Section 0: Context Text */}
            <div 
              className="absolute inset-0 flex flex-col z-30 bg-white"
              style={introTextStyle as any}
            >
              {/* Hero Banner (Top 35%) */}
              <div className="relative w-full h-[35%] min-h-[250px] overflow-hidden">
                <div 
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: 'url(/europe_from_above.jpg)' }}
                />
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent" />
                
                {/* Hero Title Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white">
                  <h1 className="text-3xl md:text-5xl font-light tracking-tight drop-shadow-md mb-2">
                    Context & Achtergrond
                  </h1>
                  <p className="text-base md:text-xl font-light text-slate-100 drop-shadow-sm max-w-2xl">
                    Een diepere blik op de geopolitieke verhoudingen
                  </p>
                </div>
              </div>

              {/* Content Area (Bottom 65%) */}
              <div className="flex-1 w-full max-w-4xl mx-auto p-8 md:p-12 flex flex-col items-center">
                 <div className="flex-1 space-y-6 text-center text-slate-600 leading-relaxed overflow-y-auto pr-2 custom-scrollbar">
                   <p className="text-lg font-medium text-slate-800">
                     Hier is ruimte voor extra context aan het begin van het verhaal.
                   </p>
                   <p>
                     De Verenigde Naties vormen een complex toneel waar landen niet alleen individueel stemmen, 
                     maar vaak opereren binnen vaste blokken en coalities. Deze visualisatie toont hoe deze dynamiek 
                     zich in de afgelopen jaren heeft ontwikkeld.
                   </p>
                   <p className="text-sm text-slate-500 italic">
                     (Plaats hier uw verdere introductietekst...)
                   </p>
                 </div>

                 {/* Jump Navigation Buttons */}
                 <div className="mt-8 flex flex-wrap gap-4 justify-center w-full">
                    <button
                      onClick={() => scrollToSection(1)}
                      className="px-6 py-3 rounded-full bg-slate-100 text-slate-700 font-medium text-sm hover:bg-slate-200 transition-colors flex items-center gap-2 group"
                    >
                      <span>Naar de kaart</span>
                      <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                    </button>
                    <button
                      onClick={() => scrollToSection(3)}
                      className="px-6 py-3 rounded-full bg-slate-800 text-white font-medium text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 group shadow-sm hover:shadow-md"
                    >
                      <span>Direct naar EU Coalities</span>
                      <div className="w-2 h-2 rounded-full bg-blue-400 group-hover:bg-blue-300 transition-colors" />
                    </button>
                 </div>
              </div>
            </div>

            <div
              className="flex flex-col items-center justify-center pt-8 pb-4 z-10 pointer-events-none relative transition-opacity duration-500"
              style={mapOverlayTextStyle as any}
            >
              <h1 className="text-3xl md:text-4xl font-light text-slate-800 tracking-tight text-center animate-[fadeIn_1s_ease-out_0.5s_both]">
                De wereld als geopolitieke arena
              </h1>
              <p className="mt-2 text-slate-500 text-sm animate-[fadeIn_1s_ease-out_1s_both]">
                Stemgedrag in de VN: van internationale samenwerking naar strategische competitie
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

              {/* Third screen: Clustermap visualization (map scrolls away) */}
              <div
                className="absolute inset-0 bg-[#fafbfc]"
                style={{
                  pointerEvents: sceneId === 'viz' ? 'auto' : 'none',
                  ...vizEnterStyle,
                }}
              >
                <ClustermapViz />
              </div>
            </div>

            {/* Scroll Indicator - shows on section 0, 1 and 2, hidden on section 3 */}
            <button
              onClick={goToNextSection}
              className={cn(
                'absolute bottom-8 left-1/2 -translate-x-1/2 z-20',
                'flex flex-col items-center gap-2 group cursor-pointer',
                'transition-all duration-300',
                currentSection >= 3 ? 'opacity-0 pointer-events-none' : 'opacity-100'
              )}
              aria-label="Scroll to next section"
            >
              <span className={cn(
                "text-[10px] uppercase tracking-[0.15em] transition-colors drop-shadow-sm",
                currentSection === 0 ? "text-slate-400 group-hover:text-slate-600" : "text-slate-400 group-hover:text-slate-600"
              )}>
                {currentSection === 0 ? 'Start' : 'Verder'}
              </span>
              <div className={cn(
                "w-8 h-8 rounded-full border flex items-center justify-center transition-all backdrop-blur-sm",
                currentSection === 0 ? "border-slate-300 group-hover:border-slate-400 bg-white/50" : "border-slate-300 group-hover:border-slate-400 group-hover:bg-slate-50"
              )}>
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors animate-[gentleBounce_2.5s_ease-in-out_infinite]" />
              </div>
            </button>

          </div>

          {/* Extra sections below the sticky view for scroll height calculation. */}
          <div className="h-screen" aria-hidden="true" />
          <div className="h-screen" aria-hidden="true" />
          <div className="h-screen" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
};

export default UNGAMap;
