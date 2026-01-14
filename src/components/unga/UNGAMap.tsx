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
  return (alpha3ToCountryName as Record<string, string>)[key] ?? defaultName;
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

const formatMetricValue = (value: number | null): string => {
  if (value === null) return '-';
  return value.toFixed(3);
};

const EUROPE_COUNTRY_NAMES = [
  'Austria',
  'Belarus',
  'Belgium',
  'Bulgaria',
  // SVG uses "CZECH"
  'Czech',
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Iceland',
  'Ireland',
  'Italy',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Spain',
  'Sweden',
  'Switzerland',
  'Ukraine',
  // SVG uses "BRITAIN" and also contains overseas territories; we filter by bbox region below.
  'Britain',
] as const;

const EUROPE_ALPHA3 = new Set(
  EUROPE_COUNTRY_NAMES.map((name) => resolveCountryKey(name)).filter(Boolean) as string[]
);

type ViewBox = { x: number; y: number; w: number; h: number };

type Coalition = { id: string; label: string; members: ReadonlySet<string> };

// Simple rotating "within-EU" coalitions (ISO3 codes).
// Tweak/extend these sets to match your narrative.
const EU_COALITIONS: Coalition[] = [
  {
    id: 'nordics',
    label: 'Nordics',
    members: new Set(['DNK', 'SWE', 'FIN']),
  },
  {
    id: 'western',
    label: 'Western Europe',
    members: new Set(['NLD', 'BEL', 'LUX', 'FRA', 'DEU', 'AUT']),
  },
  {
    id: 'southern',
    label: 'Southern Europe',
    members: new Set(['ESP', 'PRT', 'ITA', 'GRC']),
  },
  {
    id: 'eastern',
    label: 'Central & Eastern Europe',
    members: new Set(['POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'HRV', 'SVN']),
  },
];

// --- Manual override ---
// If you want to hardcode where the scroll zoom lands, set this to a viewBox in SVG coordinates.
// IMPORTANT: this SVG uses *very large* coordinates (see the SVG's viewBox; it's ~ ±20,000,000).
// So overrides like { x: 15, y: 95, w: 100, h: 100 } will effectively point at the *center* of the world.
//
// Also note: the map paths live inside `<g transform="scale(1, -1)">`, so visually "north" corresponds to
// *more negative* y values in this coordinate system.
//
// Rough Europe-ish starting point (tweak from here):
// { x: -3500000, y: -8500000, w: 11000000, h: 7000000 }
// Set to null to use the auto-detected Europe bbox.
const EUROPE_VIEWBOX_OVERRIDE: ViewBox | null = { x: -5000000, y: -8500000, w: 10000000/1.4, h: 7000000/1.4 };

const parseViewBox = (raw: string | null): ViewBox | null => {
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const easeInOut = (t: number) => t * t * (3 - 2 * t); // smoothstep

const fitViewBoxToAspect = (vb: ViewBox, aspect: number): ViewBox => {
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  let w = vb.w;
  let h = vb.h;
  if (w / h < aspect) {
    w = h * aspect;
  } else {
    h = w / aspect;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const mad = (values: number[], med: number) => {
  const absDevs = values.map((v) => Math.abs(v - med));
  return median(absDevs);
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
  const [mapViewport, setMapViewport] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [overallAlignment, setOverallAlignment] = useState<AlignmentMap>({});
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const baseViewBoxRef = useRef<ViewBox | null>(null);
  const europeViewBoxRef = useRef<ViewBox | null>(null);
  const coalitionDelayTimeoutRef = useRef<number | null>(null);
  const coalitionIntervalRef = useRef<number | null>(null);

  const interactionsEnabled = scrollProgress < 0.02;

  /* Scroll logic fixed to ensure full zoom */
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const clientHeight = scrollContainer.clientHeight;
      const scrollHeight = scrollContainer.scrollHeight;

      // Calculate progress: 0 at top, 1 when we've scrolled the full available distance
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;

      setScrollProgress(progress);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Once the user scrolls, disable interactions (the map becomes a background).
  useEffect(() => {
    if (!interactionsEnabled) {
      setTooltip(null);
      setSelectedCountry(null);
      setHoveredCountry(null);
    }
  }, [interactionsEnabled]);

  // Track the map viewport size so we can keep the Europe viewBox centered regardless of screen shape
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      setMapViewport({ width: rect.width, height: rect.height });
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

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

  // Compute base + Europe-target viewBoxes from the rendered SVG paths (in SVG coordinate space).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg') as SVGSVGElement | null;
    if (!svgElement) return;

    // Base viewBox is stable; capture once.
    if (!baseViewBoxRef.current) {
      baseViewBoxRef.current = parseViewBox(svgElement.getAttribute('viewBox'));
    }

    // Recompute Europe viewBox when viewport aspect changes (keeps framing consistent across view windows).
    if (mapViewport.width <= 0 || mapViewport.height <= 0) return;
    const base = baseViewBoxRef.current;
    if (!base) return;
    const aspect = mapViewport.width / mapViewport.height;

    const raf = requestAnimationFrame(() => {
      // If overridden, use it (still fit to current viewport aspect).
      if (EUROPE_VIEWBOX_OVERRIDE) {
        europeViewBoxRef.current = fitViewBoxToAspect(EUROPE_VIEWBOX_OVERRIDE, aspect);
        return;
      }

      const paths = container.querySelectorAll<SVGPathElement>('path[id]');
      const candidates: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; area: number }> =
        [];

      paths.forEach((path) => {
        const key = resolveCountryKey(path.id);
        if (!key || !EUROPE_ALPHA3.has(key)) return;
        try {
          const bb = path.getBBox();
          if (!Number.isFinite(bb.x) || !Number.isFinite(bb.y) || !Number.isFinite(bb.width) || !Number.isFinite(bb.height)) {
            return;
          }
          const cx = bb.x + bb.width / 2;
          const cy = bb.y + bb.height / 2;
          const area = bb.width * bb.height;
          candidates.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height, cx, cy, area });
        } catch {
          // ignore
        }
      });

      if (candidates.length < 5) {
        return;
      }

      // Robustly select the "mainland Europe" cluster by removing outliers based on centroid distance.
      // This avoids overseas territories (e.g. far-away islands) hijacking the bbox.
      const xs = candidates.map((c) => c.cx);
      const ys = candidates.map((c) => c.cy);
      const medX = median(xs);
      const medY = median(ys);

      const dists = candidates.map((c) => Math.hypot(c.cx - medX, c.cy - medY));
      const distMed = median(dists);
      const distMad = mad(dists, distMed);

      // Threshold: allow a generous radius; if MAD collapses to ~0, fall back to a relative threshold.
      const threshold = distMad > 0 ? distMed + 6 * distMad : distMed * 3 + 1;
      const filtered = candidates.filter((_, idx) => dists[idx] <= threshold);
      const finalSet = filtered.length >= 5 ? filtered : candidates;

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      finalSet.forEach((c) => {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.w);
        maxY = Math.max(maxY, c.y + c.h);
      });

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return;
      }

      const bboxW = maxX - minX;
      const bboxH = maxY - minY;
      const cx = minX + bboxW / 2;
      const cy = minY + bboxH / 2;

      // Pad Europe bounds a bit to avoid feeling "too tight"
      const pad = 1.35;
      let targetW = bboxW * pad;
      let targetH = bboxH * pad;

      // Match the viewport aspect ratio to avoid letterboxing changing the perceived center.
      if (targetW / targetH < aspect) {
        targetW = targetH * aspect;
      } else {
        targetH = targetW / aspect;
      }

      europeViewBoxRef.current = {
        x: cx - targetW / 2,
        y: cy - targetH / 2,
        w: targetW,
        h: targetH,
      };
    });

    return () => cancelAnimationFrame(raf);
  }, [mapViewport.width, mapViewport.height, svgMarkup]);

  // Scroll-driven viewBox interpolation (stable centering across viewport sizes).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg') as SVGSVGElement | null;
    if (!svgElement) return;
    const base = baseViewBoxRef.current;
    const aspect = mapViewport.width > 0 && mapViewport.height > 0 ? mapViewport.width / mapViewport.height : null;
    const target =
      EUROPE_VIEWBOX_OVERRIDE && aspect
        ? fitViewBoxToAspect(EUROPE_VIEWBOX_OVERRIDE, aspect)
        : europeViewBoxRef.current;
    if (!base || !target) return;

    const t = easeInOut(Math.min(1, Math.max(0, scrollProgress)));
    const next = {
      x: lerp(base.x, target.x, t),
      y: lerp(base.y, target.y, t),
      w: lerp(base.w, target.w, t),
      h: lerp(base.h, target.h, t),
    };

    svgElement.setAttribute('viewBox', `${next.x} ${next.y} ${next.w} ${next.h}`);
  }, [scrollProgress, mapViewport.width, mapViewport.height]);

  const mapFadeStyle = useMemo(() => {
    const t = easeInOut(Math.min(1, Math.max(0, scrollProgress)));
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
  }, [scrollProgress]);

  const isScrollComplete = scrollProgress >= 0.98;
  const [activeCoalitionIndex, setActiveCoalitionIndex] = useState(0);
  const [coalitionLoopEnabled, setCoalitionLoopEnabled] = useState(false);

  // Cycle coalition highlights once the zoom completes.
  useEffect(() => {
    if (!isScrollComplete) {
      setActiveCoalitionIndex(0);
      setCoalitionLoopEnabled(false);
      if (coalitionDelayTimeoutRef.current !== null) {
        window.clearTimeout(coalitionDelayTimeoutRef.current);
        coalitionDelayTimeoutRef.current = null;
      }
      if (coalitionIntervalRef.current !== null) {
        window.clearInterval(coalitionIntervalRef.current);
        coalitionIntervalRef.current = null;
      }
      return;
    }

    const startDelayMs = 3000;
    const cycleMs = 2600;

    coalitionDelayTimeoutRef.current = window.setTimeout(() => {
      // Only start highlighting after the delay (prevents an "instant" highlight at scroll completion).
      setCoalitionLoopEnabled(true);
      setActiveCoalitionIndex(0);

      coalitionIntervalRef.current = window.setInterval(() => {
        setActiveCoalitionIndex((prev) => (prev + 1) % EU_COALITIONS.length);
      }, cycleMs);
    }, startDelayMs);

    return () => {
      if (coalitionDelayTimeoutRef.current !== null) {
        window.clearTimeout(coalitionDelayTimeoutRef.current);
        coalitionDelayTimeoutRef.current = null;
      }
      if (coalitionIntervalRef.current !== null) {
        window.clearInterval(coalitionIntervalRef.current);
        coalitionIntervalRef.current = null;
      }
      setCoalitionLoopEnabled(false);
    };
  }, [isScrollComplete]);

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

    // Fade non-Europe countries out near the end of the scroll (map becomes a subtle background).
    const nonEuropeT = easeInOut(Math.min(1, Math.max(0, (scrollProgress - 0.72) / 0.28)));
    const nonEuropeOpacity = lerp(1, 0.06, nonEuropeT);

    const activeCoalition = EU_COALITIONS[activeCoalitionIndex] ?? EU_COALITIONS[0];
    const coalitionT = easeInOut(Math.min(1, Math.max(0, (scrollProgress - 0.9) / 0.1))); // ramp in near completion
    const europeDeemphasizedOpacity = lerp(1, 0.22, coalitionT);

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
      path.style.pointerEvents = interactionsEnabled ? 'auto' : 'none';
      const alignment = alignmentMap[key];
      const fill = getFillColor(alignment);
      path.style.fill = fill;
      path.style.transition =
        'fill 0.2s ease-out, stroke 0.15s ease-out, stroke-width 0.15s ease-out, opacity 700ms ease, filter 700ms ease';

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
        // If no selection is active, apply end-of-scroll fade to non-Europe shapes.
        const isEurope = EUROPE_ALPHA3.has(key);

        // After a short settle delay: loop-highlight coalition groups within Europe.
        if (coalitionLoopEnabled && isEurope) {
          const isInCoalition = activeCoalition.members.has(key);
          path.style.opacity = isInCoalition ? '1' : `${europeDeemphasizedOpacity}`;
          path.style.stroke = isInCoalition ? '#0f172a' : '';
          path.style.strokeWidth = isInCoalition ? '35000' : '';
          path.style.filter = isInCoalition ? 'drop-shadow(0 0 70000px rgba(15, 23, 42, 0.35))' : 'none';
        } else if (isEurope) {
          path.style.opacity = '1';
          path.style.stroke = '';
          path.style.strokeWidth = '';
          path.style.filter = 'none';
        } else {
          path.style.opacity = `${nonEuropeOpacity}`;
          path.style.stroke = '';
          path.style.strokeWidth = '';
          path.style.filter = 'none';
        }
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
  }, [alignmentMap, selectedCountry, scrollProgress, interactionsEnabled, coalitionLoopEnabled, activeCoalitionIndex]);

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
        {/* Scroll track height - 200vh ensures we have room to scroll and zoom */}
        <div className="h-[200vh] w-full relative">

          {/* Sticky container for the map view */}
          <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col">

            <div
              className="flex flex-col items-center justify-center pt-8 pb-4 z-10 pointer-events-none relative transition-opacity duration-500"
              style={{ opacity: interactionsEnabled ? 1 - scrollProgress * 2 : 0 }}
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
                    {/* Placeholder foreground elements that appear once scrolling completes */}
                    <div
                      className="absolute inset-0 flex items-center justify-start p-6 md:p-10 pointer-events-none"
                      style={{
                        opacity: isScrollComplete ? 1 : 0,
                        transform: `translateY(${isScrollComplete ? 0 : 10}px)`,
                        transition: 'opacity 400ms ease, transform 500ms ease',
                      }}
                    >
                      <div className="w-full max-w-xl">
                        <div className="rounded-2xl bg-white/85 backdrop-blur-md border border-white/60 shadow-xl px-6 py-6">
                          <div className="text-xs uppercase tracking-widest text-slate-500">
                            Coalitions within the EU (placeholder)
                          </div>
                          <div className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900">
                            {coalitionLoopEnabled ? (EU_COALITIONS[activeCoalitionIndex]?.label ?? '—') : '—'}
                          </div>
                          <div className="mt-2 text-sm md:text-base text-slate-600 leading-relaxed">
                            Every few seconds, a different coalition is highlighted on the map.
                          </div>

                          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                              <div className="text-xs text-slate-500">Placeholder metric</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">42</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                              <div className="text-xs text-slate-500">Placeholder metric</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">0.73</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                              <div className="text-xs text-slate-500">Placeholder metric</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">+18%</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
