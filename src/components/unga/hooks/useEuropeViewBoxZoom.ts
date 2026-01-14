import { useEffect, useRef } from 'react';
import type { ViewBox } from '../ungaMapTypes';
import { clamp01, easeInOut, lerp, mad, median } from '../ungaMapMath';
import { resolveCountryKey } from '../ungaMapSvgCountry';

const parseViewBox = (raw: string | null): ViewBox | null => {
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
};

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

export function useEuropeViewBoxZoom(options: {
  containerRef: React.RefObject<HTMLDivElement>;
  viewport: { width: number; height: number };
  scrollProgress: number;
  europeAlpha3: ReadonlySet<string>;
  override: ViewBox | null;
}) {
  const { containerRef, viewport, scrollProgress, europeAlpha3, override } = options;

  const baseViewBoxRef = useRef<ViewBox | null>(null);
  const europeViewBoxRef = useRef<ViewBox | null>(null);

  // Compute target viewBox from SVG geometry when viewport changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg') as SVGSVGElement | null;
    if (!svgElement) return;

    if (!baseViewBoxRef.current) {
      baseViewBoxRef.current = parseViewBox(svgElement.getAttribute('viewBox'));
    }
    const base = baseViewBoxRef.current;
    if (!base) return;

    if (viewport.width <= 0 || viewport.height <= 0) return;
    const aspect = viewport.width / viewport.height;

    const raf = requestAnimationFrame(() => {
      if (override) {
        europeViewBoxRef.current = fitViewBoxToAspect(override, aspect);
        return;
      }

      const paths = container.querySelectorAll<SVGPathElement>('path[id]');
      const candidates: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number }> = [];

      paths.forEach((path) => {
        const key = resolveCountryKey(path.id);
        if (!key || !europeAlpha3.has(key)) return;
        try {
          const bb = path.getBBox();
          if (!Number.isFinite(bb.x) || !Number.isFinite(bb.y) || !Number.isFinite(bb.width) || !Number.isFinite(bb.height)) return;
          const cx = bb.x + bb.width / 2;
          const cy = bb.y + bb.height / 2;
          candidates.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height, cx, cy });
        } catch {
          // ignore
        }
      });

      if (candidates.length < 5) return;

      const xs = candidates.map((c) => c.cx);
      const ys = candidates.map((c) => c.cy);
      const medX = median(xs);
      const medY = median(ys);

      const dists = candidates.map((c) => Math.hypot(c.cx - medX, c.cy - medY));
      const distMed = median(dists);
      const distMad = mad(dists, distMed);
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
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;

      const bboxW = maxX - minX;
      const bboxH = maxY - minY;
      const cx = minX + bboxW / 2;
      const cy = minY + bboxH / 2;

      const pad = 1.35;
      let targetW = bboxW * pad;
      let targetH = bboxH * pad;

      if (targetW / targetH < aspect) {
        targetW = targetH * aspect;
      } else {
        targetH = targetW / aspect;
      }

      europeViewBoxRef.current = { x: cx - targetW / 2, y: cy - targetH / 2, w: targetW, h: targetH };
    });

    return () => cancelAnimationFrame(raf);
  }, [containerRef, viewport.width, viewport.height, europeAlpha3, override]);

  // Apply viewBox interpolation on scroll.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgElement = container.querySelector('svg') as SVGSVGElement | null;
    if (!svgElement) return;
    const base = baseViewBoxRef.current;
    const target = europeViewBoxRef.current;
    if (!base || !target) return;

    const t = easeInOut(clamp01(scrollProgress));
    const next = {
      x: lerp(base.x, target.x, t),
      y: lerp(base.y, target.y, t),
      w: lerp(base.w, target.w, t),
      h: lerp(base.h, target.h, t),
    };
    svgElement.setAttribute('viewBox', `${next.x} ${next.y} ${next.w} ${next.h}`);
  }, [containerRef, scrollProgress]);
}


