import { useEffect } from 'react';
import type { AlignmentMap } from '../ungaMapTypes';
import { easeInOut, lerp } from '../ungaMapMath';
import { getFillColor } from '../ungaMapColors';
import { resolveCountryKey } from '../ungaMapSvgCountry';

// Greenland (GRL) should inherit Denmark's (DNK) color
const COUNTRY_COLOR_INHERIT: Record<string, string> = {
  'GRL': 'DNK',
};

export function useUngAMapSvgStyling(options: {
  containerRef: React.RefObject<HTMLDivElement>;
  alignmentMap: AlignmentMap;
  selectedCountry: string | null;
  setSelectedCountry: (next: string | null) => void;
  hoveredCountry: string | null;
  interactionsEnabled: boolean;
  scrollProgress: number;
  europeAlpha3: ReadonlySet<string>;
  nonEuropeFade: { start: number; duration: number; minOpacity: number };
  coalition: { enabled: boolean; activeMembers: ReadonlySet<string>; deemphasizeOpacity: number };
  highlightColor?: string;
}) {
  const {
    containerRef,
    alignmentMap,
    selectedCountry,
    setSelectedCountry,
    hoveredCountry,
    interactionsEnabled,
    scrollProgress,
    europeAlpha3,
    nonEuropeFade,
    coalition,
    highlightColor,
  } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgElement = container.querySelector('svg');
    const countriesGroup = svgElement?.querySelector('#countries') ?? svgElement;

    const existingOverlay = svgElement?.querySelector('#selection-highlight-overlay');
    if (existingOverlay) existingOverlay.remove();

    const svgPaths = container.querySelectorAll<SVGPathElement>('path[id]');
    let selectedPathId: string | null = null;

    const nonEuropeT = easeInOut(
      Math.min(1, Math.max(0, (scrollProgress - nonEuropeFade.start) / nonEuropeFade.duration))
    );
    const nonEuropeOpacity = lerp(1, nonEuropeFade.minOpacity, nonEuropeT);

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

      // Check if this country should inherit another country's color (e.g., Greenland -> Denmark)
      const colorKey = COUNTRY_COLOR_INHERIT[key] ?? key;
      const alignment = alignmentMap[colorKey];
      // Disable interactions for countries without UN voting data (e.g., Taiwan, Kosovo, Somaliland)
      const hasData = !!alignment;
      path.style.pointerEvents = interactionsEnabled && hasData ? 'auto' : 'none';
      path.style.cursor = hasData ? 'pointer' : 'default';
      const newFill = getFillColor(alignment);
      // Only update fill if it actually changed to prevent transition flickering during animation
      // Use data attribute for comparison since browsers normalize color values differently
      const currentFill = path.getAttribute('data-unga-fill');
      if (currentFill !== newFill) {
        path.style.fill = newFill;
        path.setAttribute('data-unga-fill', newFill);
      }
      path.style.transition =
        'fill 0.2s ease-out, stroke 0.15s ease-out, stroke-width 0.15s ease-out, opacity 700ms ease, filter 700ms ease';

      if (selectedCountry) {
        const isSelected = selectedCountry === key;
        path.style.opacity = isSelected ? '1' : '0.35';
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.filter = 'none';
        if (isSelected) selectedPathId = path.id;
        return;
      }

      const isEurope = europeAlpha3.has(key);
      if (coalition.enabled && isEurope) {
        const isInCoalition = coalition.activeMembers.has(key);
        path.style.opacity = isInCoalition ? '1' : `${coalition.deemphasizeOpacity}`;
        path.style.stroke = isInCoalition ? (highlightColor ?? '#0f172a') : '';
        path.style.strokeWidth = isInCoalition ? '35000' : '';
        path.style.filter = isInCoalition ? 'drop-shadow(0 0 70000px rgba(15, 23, 42, 0.35))' : 'none';
        return;
      }

      if (isEurope) {
        path.style.opacity = '1';
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.filter = 'none';
        return;
      }

      path.style.opacity = `${nonEuropeOpacity}`;
      path.style.stroke = '';
      path.style.strokeWidth = '';
      path.style.filter = 'none';
    });

    if (selectedPathId && countriesGroup && svgElement) {
      const originalPath = svgElement.querySelector(`#${selectedPathId}`) as SVGPathElement | null;
      const pathData = originalPath?.getAttribute('d');
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
  }, [
    containerRef,
    alignmentMap,
    selectedCountry,
    setSelectedCountry,
    hoveredCountry,
    interactionsEnabled,
    scrollProgress,
    europeAlpha3,
    nonEuropeFade.start,
    nonEuropeFade.duration,
    nonEuropeFade.minOpacity,
    coalition.enabled,
    coalition.activeMembers,
    coalition.deemphasizeOpacity,
  ]);
}


