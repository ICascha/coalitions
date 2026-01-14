import { useEffect, useRef, useCallback } from 'react';

export type DiscreteScrollOptions = {
  sectionCount: number;
  transitionDurationMs?: number;
  onSectionChange?: (sectionIndex: number) => void;
};

/**
 * Forces scroll to happen in discrete "chunks" - one section at a time.
 * Prevents continuous scrolling from section 0 to section 2 directly.
 * Uses wheel event interception to control navigation.
 */
export function useDiscreteScroll(
  scrollContainerRef: React.RefObject<HTMLElement>,
  options: DiscreteScrollOptions
) {
  const { sectionCount, transitionDurationMs = 400, onSectionChange } = options;

  const currentSectionRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const accumulatedDeltaRef = useRef(0);

  const scrollToSection = useCallback(
    (sectionIndex: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const targetIndex = Math.max(0, Math.min(sectionCount - 1, sectionIndex));
      if (targetIndex === currentSectionRef.current && isAnimatingRef.current) return;

      currentSectionRef.current = targetIndex;
      isAnimatingRef.current = true;

      const sectionHeight = el.clientHeight;
      const targetScroll = targetIndex * sectionHeight;

      el.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      });

      onSectionChange?.(targetIndex);

      // Release animation lock after transition
      setTimeout(() => {
        isAnimatingRef.current = false;
        accumulatedDeltaRef.current = 0;
      }, transitionDurationMs);
    },
    [scrollContainerRef, sectionCount, transitionDurationMs, onSectionChange]
  );

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Threshold for triggering scroll (lower = more sensitive)
    const SCROLL_THRESHOLD = 50;
    // Cooldown between scroll triggers
    const COOLDOWN_MS = transitionDurationMs + 100;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const now = Date.now();

      // If we're animating or in cooldown, ignore
      if (isAnimatingRef.current || now - lastScrollTimeRef.current < COOLDOWN_MS) {
        return;
      }

      // Accumulate delta for trackpad users who scroll slowly
      accumulatedDeltaRef.current += e.deltaY;

      if (Math.abs(accumulatedDeltaRef.current) >= SCROLL_THRESHOLD) {
        const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
        const nextSection = currentSectionRef.current + direction;

        if (nextSection >= 0 && nextSection < sectionCount) {
          lastScrollTimeRef.current = now;
          scrollToSection(nextSection);
        }

        accumulatedDeltaRef.current = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      if (isAnimatingRef.current || now - lastScrollTimeRef.current < COOLDOWN_MS) {
        return;
      }

      let direction = 0;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        direction = 1;
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        direction = -1;
      }

      if (direction !== 0) {
        e.preventDefault();
        const nextSection = currentSectionRef.current + direction;
        if (nextSection >= 0 && nextSection < sectionCount) {
          lastScrollTimeRef.current = now;
          scrollToSection(nextSection);
        }
      }
    };

    // Touch handling for mobile
    let touchStartY = 0;
    const TOUCH_THRESHOLD = 50;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default scrolling
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (isAnimatingRef.current || now - lastScrollTimeRef.current < COOLDOWN_MS) {
        return;
      }

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY - touchEndY;

      if (Math.abs(deltaY) >= TOUCH_THRESHOLD) {
        const direction = deltaY > 0 ? 1 : -1;
        const nextSection = currentSectionRef.current + direction;

        if (nextSection >= 0 && nextSection < sectionCount) {
          lastScrollTimeRef.current = now;
          scrollToSection(nextSection);
        }
      }
    };

    // Sync current section from actual scroll position (e.g., on resize)
    const syncSectionFromScroll = () => {
      if (isAnimatingRef.current) return;
      const sectionHeight = el.clientHeight;
      const currentScroll = el.scrollTop;
      const nearestSection = Math.round(currentScroll / sectionHeight);
      currentSectionRef.current = Math.max(0, Math.min(sectionCount - 1, nearestSection));
    };

    syncSectionFromScroll();

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [scrollContainerRef, sectionCount, transitionDurationMs, scrollToSection]);

  return {
    scrollToSection,
    getCurrentSection: () => currentSectionRef.current,
  };
}

