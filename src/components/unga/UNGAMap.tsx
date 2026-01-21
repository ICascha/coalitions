import { useRef, useMemo, useState, useEffect } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// Use the raw import for the interactive SVG
import worldMapSvg from '@/assets/world_map_interactive_110m.svg?raw';
import { POWER_BLOCS } from './ungaMapTypes';
import type { TooltipState } from './ungaMapTypes';
import {
  EUROPE_COUNTRY_NAMES,
  EUROPE_VIEWBOX_OVERRIDE,
  POWER_BLOC_COLORS,
  POWER_BLOC_LABELS,
} from './ungaMapConfig';
import { buildAlpha3SetFromNames, formatCountryName, getCountryDisplayName, resolveCountryKey } from './ungaMapSvgCountry';
import { clamp01, easeInOut, lerp } from './ungaMapMath';
import { formatMetricValue } from './ungaMapFormat';
import { useWindowSize } from '@/hooks/useWindowSize';
import { useScrollContainerProgress } from './hooks/useScrollContainerProgress';
import { useElementSize } from './hooks/useElementSize';
import { useUngAAlignment } from './hooks/useUngAAlignment';
import { useEuropeViewBoxZoom } from './hooks/useEuropeViewBoxZoom';
import { useCoalitionLoop } from './hooks/useCoalitionLoop';
import { useUngAMapSvgStyling } from './hooks/useUngAMapSvgStyling';
import { useTopicsData, getTopicLabel } from './hooks/useTopicsData';
import { ClustermapViz, AnalysisStats, interpolateColor, MANUAL_CLUSTERS } from './components/ClustermapViz';

const HOVER_COOLDOWN_MS = 400; // Cooldown before re-enabling hover after scroll animation

const UNGAMap = ({ onAnalysisModeChange }: { onAnalysisModeChange?: (isAnalyzing: boolean) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeClusterCountries, setActiveClusterCountries] = useState<ReadonlySet<string>>(new Set());
  const [analysisStats, setAnalysisStats] = useState<AnalysisStats | null>(null);
  
  // Track scroll activity to prevent hover flickering during animations
  const lastScrollProgressRef = useRef(0);
  const scrollCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrollCooldown, setIsScrollCooldown] = useState(false);
  
  const { width } = useWindowSize();
  const isMobile = width !== null && width < 768;

  // Continuous scroll progress
  const rawScrollProgress = useScrollContainerProgress(scrollContainerRef);
  
  // Detect scroll activity and manage cooldown
  useEffect(() => {
    // Skip if analyzing
    if (isAnalyzing) return;

    const progressChanged = Math.abs(rawScrollProgress - lastScrollProgressRef.current) > 0.001;
    lastScrollProgressRef.current = rawScrollProgress;
    
    if (progressChanged) {
      setIsScrollCooldown(true);
      setHoveredCountry(null);
      
      if (scrollCooldownRef.current) {
        clearTimeout(scrollCooldownRef.current);
      }
      
      scrollCooldownRef.current = setTimeout(() => {
        setIsScrollCooldown(false);
      }, HOVER_COOLDOWN_MS);
    }
    
    return () => {
      if (scrollCooldownRef.current) {
        clearTimeout(scrollCooldownRef.current);
      }
    };
  }, [rawScrollProgress, isAnalyzing]);

  // Lock scroll and reset position when analyzing
  useEffect(() => {
    if (isAnalyzing && scrollContainerRef.current) {
      // Force scroll to top immediately
      scrollContainerRef.current.scrollTop = 0;
      // Disable scroll via overflow style directly to ensure it takes precedence
      scrollContainerRef.current.style.overflowY = 'hidden';
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowY = '';
    }
  }, [isAnalyzing]);
  
  // Map logic mapping
  // We have a long scroll container with a split view followed by a viz section.
  // The split view is roughly 75% of the total height (300vh / 400vh).
  // Zoom should happen while the map is sticky in view.
  
  const zoomStart = 0.225;
  const zoomEnd = 0.9; // Finish zoom before we scroll past the split view

  // Zoom progress: 0 before zoomStart, 1 after zoomEnd
  const scrollZoomProgress = clamp01((rawScrollProgress - zoomStart) / (zoomEnd - zoomStart));
  const zoomProgress = isAnalyzing ? 1 : scrollZoomProgress;
  
  const isZoomComplete = zoomProgress >= 0.98;

  // Handle cluster selection from ClustermapViz
  const handleClusterHover = (countries: string[] | null) => {
    if (!countries) {
      setActiveClusterCountries(new Set());
      return;
    }
    const codes = buildAlpha3SetFromNames(countries);
    setActiveClusterCountries(codes);
  };

  const mapViewport = useElementSize(containerRef);
  const { alignmentMap } = useUngAAlignment();
  const { topicsMap } = useTopicsData();

  const manualCoalitions = useMemo(() => {
    const coalitions = [];
    let idCounter = 0;
    for (const [, clusters] of Object.entries(MANUAL_CLUSTERS)) {
      for (const clusterCountries of clusters) {
        // Filter out large coalitions (> 22 members) as requested
        if (clusterCountries.length > 22) continue;

        coalitions.push({
          id: `manual-${idCounter++}`,
          label: '', // No text required
          members: buildAlpha3SetFromNames(clusterCountries)
        });
      }
    }
    
    // Shuffle the coalitions to have a random fixed order on mount
    for (let i = coalitions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [coalitions[i], coalitions[j]] = [coalitions[j], coalitions[i]];
    }
    
    return coalitions;
  }, []);

  // Hover enabled when not scrolling and not at the final section
  const interactionsEnabled = !isZoomComplete;
  const hoverEnabled = interactionsEnabled && !isScrollCooldown;

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
    // Slight fade when fully zoomed
    const opacity = lerp(1, 0.9, t);
    
    return {
      opacity,
      filter: t > 0.1 ? 'grayscale(20%)' : 'none', // Sombre look
      transition: 'opacity 0.05s linear, filter 0.05s linear',
      willChange: 'opacity, filter',
    } as const;
  }, [zoomProgress]);

  const { activeIndex: activeCoalitionIndex, loopEnabled: coalitionLoopEnabled } = useCoalitionLoop({
    enabled: isZoomComplete,
    coalitionCount: manualCoalitions.length,
    startDelayMs: 1000,
    cycleMs: 3000,
  });
  const activeCoalition = manualCoalitions[activeCoalitionIndex] ?? null;

  // Event handlers for map interaction
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const handleClick = (event: Event) => {
      if (!interactionsEnabled) return;
      const target = event.target as SVGElement | null;
      if (!target) {
        setTooltip(null);
        return;
      }

      event.stopPropagation();
      const countryId = target.id ?? target.getAttribute('data-name');
      if (!countryId) {
        setTooltip(null);
        setSelectedCountry(null);
        return;
      }

      const bounds = container.getBoundingClientRect();
      const mouseEvent = event as MouseEvent;
      const key = resolveCountryKey(countryId);
      if (!key) return;

      const alignment = alignmentMap[key];
      if (!alignment) {
        setTooltip(null);
        setSelectedCountry(null);
        return;
      }

      const displayName = getCountryDisplayName(key, formatCountryName(countryId));
      const countryTopics = topicsMap?.[key];
      setTooltip({
        type: 'alignment',
        name: displayName,
        countryCode: key,
        alignment: alignment,
        topics: countryTopics ? {
          disagreements: countryTopics.disagreements,
          agreements: countryTopics.agreements,
        } : null,
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
  }, [alignmentMap, interactionsEnabled, topicsMap]);

  // Hover handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const handlePointerEnter = (event: Event) => {
      if (!hoverEnabled) return;
      const target = event.target as SVGElement | null;
      if (!target || target.id === 'selection-highlight-overlay' || target.id === 'hover-highlight-overlay') {
        return;
      }
      const key = resolveCountryKey(target.id);
      if (key && alignmentMap[key]) {
        setHoveredCountry(key);
      }
    };

    const handlePointerLeave = (event: Event) => {
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

  useUngAMapSvgStyling({
    containerRef,
    alignmentMap,
    selectedCountry,
    setSelectedCountry,
    hoveredCountry,
    interactionsEnabled,
    scrollProgress: zoomProgress,
    europeAlpha3,
    nonEuropeFade: isAnalyzing 
      ? { start: 0, duration: 0.1, minOpacity: 0 } // Hide immediately in analysis mode
      : { start: 0.72, duration: 0.28, minOpacity: 0.06 },
    coalition: {
      enabled: (coalitionLoopEnabled && isZoomComplete && !isAnalyzing) || (isAnalyzing && activeClusterCountries.size > 0),
      activeMembers: isAnalyzing ? activeClusterCountries : (activeCoalition?.members ?? new Set<string>()),
      deemphasizeOpacity: isAnalyzing ? 0.1 : lerp(1, 0.22, easeInOut(clamp01((zoomProgress - 0.9) / 0.1))),
    },
    highlightColor: '#e62159',
  });

  // Handle Hover Overlay
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

  const startAnalysis = () => {
    setIsAnalyzing(true);
    onAnalysisModeChange?.(true);
  };

  const stopAnalysis = () => {
    setIsAnalyzing(false);
    setActiveClusterCountries(new Set());
    setAnalysisStats(null);
    onAnalysisModeChange?.(false);
  };

  return (
    <Card className="h-full flex-1 min-h-0 overflow-hidden flex flex-col bg-white border-none shadow-none relative">
        <style>
        {`
          @keyframes mapReveal {
            0% { opacity: 0; filter: blur(10px); }
            100% { opacity: 1; filter: blur(0); }
          }
          .unga-map-container-inner {
            animation: mapReveal 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}
      </style>
      
      <div 
        ref={scrollContainerRef}
        className={cn(
          "absolute overflow-y-auto overflow-x-hidden transition-all duration-500",
          isMobile && !isAnalyzing ? "top-0 left-0 right-0 bottom-[40%]" : "inset-0",
          // When analyzing, we lock scroll via style, but this class is good to keep
          isAnalyzing && "overflow-hidden"
        )}
      >
        <div className={cn(
            "w-full flex flex-col md:flex-row relative",
            !isAnalyzing && "min-h-[200vh]"
        )}>
            
            {/* Left Column: Narrative Content */}
            <div 
              className={cn(
                "w-full flex flex-col relative z-20 transition-all duration-700 ease-in-out",
                isAnalyzing ? "md:w-[55%] lg:w-[60%]" : "md:w-[45%] lg:w-[40%]"
              )}
            >
                {/* Spacer to push content down if needed, or stick to sections */}
                
                {/* Section 1: Introduction */}
                <div 
                  className={cn(
                    "min-h-screen flex flex-col justify-center p-8 md:p-16 pointer-events-auto bg-white/5 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none transition-opacity duration-500",
                    isAnalyzing && "hidden"
                  )}
                >
                    <div className="max-w-md">
                        <div className="mb-6 h-1 w-12 bg-slate-900" />
                        <h1 className="text-4xl md:text-5xl font-serif text-slate-900 mb-6 leading-tight">
                            Speler of speelveld
                        </h1>
                        <p className="text-lg text-slate-600 leading-relaxed font-serif">
                            Europa is in de strijd om hegemonie tussen de VS en China veranderd van speler in een speelveld. 
                            Wie speelveld is wordt gebruikt; wie speler is bepaalt de kaders. 
                            De keuze is simpel: accepteren we onze rol als toeschouwer, of bouwen we opnieuw aan ons strategisch vermogen?
                        </p>
                        <div className="mt-12 text-sm uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            Scroll om te verkennen <ChevronDown className="w-4 h-4 animate-bounce" />
                        </div>
                    </div>
                </div>

                {/* Section 2: Europe Focus */}
                <div 
                  className={cn(
                    "min-h-[80vh] flex flex-col justify-center p-8 md:p-16 pointer-events-auto transition-opacity duration-500",
                    isAnalyzing && "hidden"
                  )}
                >
                    <div className="max-w-md bg-white/80 p-6 md:p-0 md:bg-transparent rounded-xl backdrop-blur-md md:backdrop-blur-none">
                        <h2 className="text-3xl font-serif text-slate-900 mb-4">
                            Onze uitgangspositie
                        </h2>
                        <p className="text-slate-600 leading-relaxed mb-6 font-serif">
                            Om ons strategisch vermogen te herstellen, moeten we kijken naar onze huidige uitgangspositie. 
                            VN-stemgedrag laat zien dat China structureel nauwer aansluit bij het mondiale zuiden. 
                            De EU staat echter vaak dichter bij het wereldgemiddelde dan de VS, zeker bij partners als Japan en Canada.
                        </p>
                        <div className="space-y-2 text-sm text-slate-500 font-serif">
                             <p>
                                De kleur op de kaart geeft aan bij welk machtsblok een land het dichtst ligt. 
                                Hoe dieper de kleur, hoe sterker de overeenstemming in stemgedrag.
                             </p>
                        </div>
                        
                        {/* Interactive hint */}
                        <div className="mt-6 flex items-center gap-2 text-xs text-slate-400 bg-slate-100/60 rounded-lg px-3 py-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                            </svg>
                            <span className="font-serif italic">Klik op een land om te zien op welke onderwerpen het verschilt van de EU</span>
                        </div>
                    </div>
                </div>

                {/* Section 3: Call to Action OR Analysis View */}
                <div className={cn(
                  "flex flex-col justify-center pointer-events-auto",
                  isAnalyzing ? "min-h-screen pb-0 h-screen" : "min-h-[60vh] pb-12"
                )}>
                     {isAnalyzing ? (
                       <div className="w-full h-full p-0 md:p-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                         <ClustermapViz 
                            onClusterHover={handleClusterHover} 
                            onBack={stopAnalysis}
                            onStatsChange={setAnalysisStats} 
                         />
                       </div>
                     ) : (
                       <div className="p-8 md:p-16 max-w-md">
                        <h2 className="text-3xl font-serif text-slate-900 mb-6">
                            Verdeeldheid en Coalities
                        </h2>
                        <p className="text-slate-600 leading-relaxed mb-8 font-serif">
                            De interne schaal van de EU is groot genoeg om industriële ketens te dragen, maar besluitvorming met 27 lidstaten is voor strategische dossiers vaak te traag. 
                            Hier manifesteert zich de grote verscheidenheid aan belangen en het gebrek aan uitvoeringsmacht op Europees niveau.
                        </p>
                        <p className="text-slate-600 leading-relaxed mb-8 font-serif">
                            Data over het stemgedrag binnen de Raad laat zien dat voor beladen onderwerpen (landbouw, klimaat, financiën) er een grote afstand is tussen de posities, met duidelijke 'blokken' van landen. 
                            Dit vereist 'coalitions of the willing' op deze gepolariseerde dossiers. 
                            Tegelijkertijd is er bij Energie, Infrastructuur en Digitaal nauwelijks sprake van polarisatie, dit biedt juist kansen voor een EU-brede aanpak, zoals bij een onafhankelijke EU cloud.
                        </p>
                        <Button 
                            onClick={startAnalysis}
                            className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-5 py-4 text-base md:px-8 md:py-6 md:text-lg transition-all shadow-xl hover:shadow-2xl flex items-center gap-2 md:gap-3 group font-serif"
                        >
                            <span>Ga naar Analyse Raad van Ministers</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                     </div>
                     )}
                </div>
            </div>

            {/* Right Column: Sticky Map */}
            <div className={cn(
              "w-full overflow-hidden bg-slate-50/50 border-l border-slate-100 transition-all duration-700 ease-in-out",
              isMobile ? (
                // Mobile: Fixed at bottom
                "fixed bottom-0 left-0 right-0 h-[40%] border-t z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
              ) : (
                // Desktop: Sticky on right
                isAnalyzing 
                  ? "md:w-[45%] lg:w-[40%] h-screen sticky top-0 right-0" 
                  : "md:w-[55%] lg:w-[60%] h-screen sticky top-0 right-0"
              ),
              // Hide map when explorer is open on mobile to give space to Viz
              isMobile && isAnalyzing && "translate-y-full opacity-0 pointer-events-none"
            )}>
                <div className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-500",
                    isAnalyzing ? "p-0 md:p-2" : "p-4 md:p-12"
                )}>
                     <div className="relative w-full h-full max-w-[1200px]">
                        <div 
                            ref={containerRef}
                            className={cn(
                                'w-full h-full unga-map unga-map-container-inner',
                                '[&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-full',
                                '[&_path]:cursor-pointer'
                            )}
                            style={mapFadeStyle}
                            dangerouslySetInnerHTML={{ __html: svgMarkup }}
                        />
                        
                        {/* Map Legend - Only show when interactive/zoomed out somewhat - and NOT in analysis mode */}
                        {!isAnalyzing && (
                            <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur p-4 rounded-lg shadow-sm border border-slate-100 text-xs text-slate-600 max-w-[200px]">
                                <div className="font-semibold mb-2 text-slate-900">Machtblokken</div>
                                <div className="space-y-1.5">
                                    {POWER_BLOCS.map(bloc => (
                                        <div key={bloc} className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: POWER_BLOC_COLORS[bloc] }} />
                                            <span>{POWER_BLOC_LABELS[bloc]}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Analysis Info Panel - Overlay in analysis mode */}
                        {isAnalyzing && analysisStats && (
                            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur p-4 rounded-xl border border-slate-100 shadow-sm max-w-[280px] space-y-4">
                                {/* Color Scale */}
                                <div>
                                    <h3 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Stemafstand</h3>
                                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[9px] text-slate-500 font-mono">0</span>
                                            <div 
                                                className="flex-1 h-2 rounded-sm"
                                                style={{
                                                    background: `linear-gradient(to right, ${interpolateColor(0)}, ${interpolateColor(0.25)}, ${interpolateColor(0.5)}, ${interpolateColor(0.75)}, ${interpolateColor(1)})`,
                                                }}
                                            />
                                            <span className="text-[9px] text-slate-500 font-mono">1</span>
                                        </div>
                                        <div className="flex justify-between text-[8px] text-slate-400">
                                            <span>Gelijk</span>
                                            <span>Verschillend</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Cluster Info */}
                                <div>
                                    <h3 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Coalitie-clusters</h3>
                                    <p className="text-[10px] leading-snug text-slate-500 font-serif">
                                        Groepen met sterk overeenkomstig stemgedrag.
                                        <span className="italic opacity-80 block mt-0.5">Beweeg over clusters voor details.</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {tooltip && (() => {
                          // Position tooltip to the left if cursor is on right side of container
                          const containerWidth = containerRef.current?.offsetWidth ?? 800;
                          const containerHeight = containerRef.current?.offsetHeight ?? 600;
                          const tooltipWidth = 280;
                          const isRightSide = tooltip.x > containerWidth * 0.6;
                          const isBottomSide = tooltip.y > containerHeight * 0.6;
                          
                          const left = isRightSide ? tooltip.x - tooltipWidth - 16 : tooltip.x + 20;
                          
                          // Helper to get qualitative interpretation of distance
                          const getDistanceLabel = (distance: number | null | undefined): { label: string; color: string } => {
                            if (distance === null || distance === undefined) return { label: '-', color: 'text-slate-400' };
                            if (distance <= 0.5) return { label: 'Laag', color: 'text-emerald-600' };
                            if (distance <= 1.0) return { label: 'Middel', color: 'text-amber-600' };
                            return { label: 'Hoog', color: 'text-rose-600' };
                          };
                          
                          return (
                             <div
                                key={tooltip.countryCode}
                                className="absolute rounded-lg bg-white/95 backdrop-blur-sm px-4 py-3 text-sm text-slate-800 shadow-lg border border-slate-200/60 pointer-events-none z-50 w-[280px]"
                                style={{ 
                                    left, 
                                    ...(isBottomSide 
                                        ? { bottom: (containerHeight - tooltip.y) + 20, top: 'auto' } 
                                        : { top: tooltip.y - 20 }
                                    )
                                }}
                              >
                                <div className="font-serif text-base text-slate-900 mb-2">{tooltip.name}</div>
                                {tooltip.type === 'alignment' && tooltip.alignment && (
                                    <div className="text-xs text-slate-500 mb-3 pb-3 border-b border-slate-100">
                                        <div className="text-[11px] text-slate-400 mb-2 font-serif italic">
                                            Stemafstand tot machtsblokken
                                        </div>
                                        <div className="space-y-1.5">
                                            {POWER_BLOCS.map(bloc => {
                                                const distance = tooltip.alignment?.metrics[bloc];
                                                const distanceInfo = getDistanceLabel(distance);
                                                const isClosest = bloc === tooltip.alignment?.bloc;
                                                return (
                                                    <div key={bloc} className={cn(
                                                        "flex items-center gap-2 py-1 px-2 rounded",
                                                        isClosest && "bg-slate-50"
                                                    )}>
                                                        <span 
                                                            className="w-2 h-2 rounded-full flex-shrink-0" 
                                                            style={{ backgroundColor: POWER_BLOC_COLORS[bloc] }} 
                                                        />
                                                        <span className="text-slate-600 flex-1">{POWER_BLOC_LABELS[bloc]}</span>
                                                        <span className={cn("text-[10px] font-medium", distanceInfo.color)}>
                                                            {distanceInfo.label}
                                                        </span>
                                                        <span className="font-mono text-slate-400 text-[10px] w-8 text-right">
                                                            {formatMetricValue(distance)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-4">
                                            <span className="flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ≤0.5
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> ≤1.0
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> &gt;1.0
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {tooltip.topics && (
                                    <div className="text-xs space-y-3">
                                        {tooltip.topics.disagreements.length > 0 && (
                                            <div>
                                                <div className="text-[11px] text-slate-400 mb-1.5 font-serif italic">
                                                    Onenigheid met EU
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tooltip.topics.disagreements.slice(0, 3).map((topic, i) => (
                                                        <span key={i} className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px]">
                                                            {getTopicLabel(topic as Parameters<typeof getTopicLabel>[0])}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {tooltip.topics.agreements.length > 0 && (
                                            <div>
                                                <div className="text-[11px] text-slate-400 mb-1.5 font-serif italic">
                                                    Overeenstemming met EU
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tooltip.topics.agreements.slice(0, 3).map((topic, i) => (
                                                        <span key={i} className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px]">
                                                            {getTopicLabel(topic as Parameters<typeof getTopicLabel>[0])}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                              </div>
                          );
                        })()}
                     </div>
                </div>
            </div>

        </div>

        {/* Final Full-Screen Visualization Section - Removed in favor of inline transition */}
      </div>
    </Card>
  );
};

export default UNGAMap;
