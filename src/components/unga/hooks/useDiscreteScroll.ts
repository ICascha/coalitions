import { useEffect, useRef, useCallback, useState } from 'react';

export type DiscreteScrollOptions = {
  sectionCount: number;
  transitionDurationMs?: number;
  onSectionChange?: (sectionIndex: number) => void;
};

/**
 * Forces scroll to happen in discrete "chunks" - one section at a time.
 * Prevents continuous scrolling from section 0 to section 2 directly.
 * Completely takes over scroll control - no native scrolling allowed.
 */
export function useDiscreteScroll(
  scrollContainerRef: React.RefObject<HTMLElement>,
  options: DiscreteScrollOptions
) {
  const { sectionCount, transitionDurationMs = 300, onSectionChange } = options;

  const [currentSection, setCurrentSection] = useState(0);
  const currentSectionRef = useRef(0);
  const isLockedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Animate scroll position using easeOutCubic for snappy feel
  const animateToSection = useCallback(
    (targetSection: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const clampedTarget = Math.max(0, Math.min(sectionCount - 1, targetSection));
      
      // Don't animate if already at target or locked
      if (clampedTarget === currentSectionRef.current || isLockedRef.current) {
        return;
      }

      // Lock immediately
      isLockedRef.current = true;

      const startScroll = el.scrollTop;
      const sectionHeight = el.clientHeight;
      const targetScroll = clampedTarget * sectionHeight;
      const distance = targetScroll - startScroll;
      const startTime = performance.now();

      // Cancel any existing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / transitionDurationMs);
        const easedProgress = easeOutCubic(progress);

        el.scrollTop = startScroll + distance * easedProgress;

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Ensure we land exactly on target
          el.scrollTop = targetScroll;
          currentSectionRef.current = clampedTarget;
          setCurrentSection(clampedTarget);
          onSectionChange?.(clampedTarget);
          
          // Keep locked for a brief moment to prevent immediate re-trigger
          setTimeout(() => {
            isLockedRef.current = false;
          }, 50);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [scrollContainerRef, sectionCount, transitionDurationMs, onSectionChange]
  );

  const goToNextSection = useCallback(() => {
    if (isLockedRef.current) return;
    const next = currentSectionRef.current + 1;
    if (next < sectionCount) {
      animateToSection(next);
    }
  }, [sectionCount, animateToSection]);

  const goToPrevSection = useCallback(() => {
    if (isLockedRef.current) return;
    const prev = currentSectionRef.current - 1;
    if (prev >= 0) {
      animateToSection(prev);
    }
  }, [animateToSection]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // We need overflow-y for scrollTop to work, but we control it completely via JS
    el.style.overflowY = 'scroll';
    el.style.overflowX = 'hidden';

    // Track wheel events - use a single trigger approach
    let hasTriggeredThisGesture = false;
    let gestureResetTimeout: ReturnType<typeof setTimeout> | null = null;
    const WHEEL_THRESHOLD = 50; // Threshold to trigger navigation

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Completely ignore if locked (animating)
      if (isLockedRef.current) {
        return;
      }

      // Reset gesture flag after scroll inactivity
      if (gestureResetTimeout) clearTimeout(gestureResetTimeout);
      gestureResetTimeout = setTimeout(() => {
        hasTriggeredThisGesture = false;
      }, 200);

      // Only trigger once per scroll gesture
      if (hasTriggeredThisGesture) {
        return;
      }

      // Check if this single event is strong enough to trigger
      if (Math.abs(e.deltaY) >= WHEEL_THRESHOLD) {
        hasTriggeredThisGesture = true;
        if (e.deltaY > 0) {
          goToNextSection();
        } else {
          goToPrevSection();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLockedRef.current) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goToNextSection();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrevSection();
      }
    };

    // Touch handling
    let touchStartY = 0;
    let touchStartTime = 0;
    const TOUCH_THRESHOLD = 30;

    const handleTouchStart = (e: TouchEvent) => {
      if (isLockedRef.current) return;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Prevent native scroll
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isLockedRef.current) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY - touchEndY;
      const deltaTime = Date.now() - touchStartTime;

      // Check for swipe (fast enough and far enough)
      if (deltaTime < 500 && Math.abs(deltaY) > TOUCH_THRESHOLD) {
        if (deltaY > 0) {
          goToNextSection();
        } else {
          goToPrevSection();
        }
      }
    };

    // Prevent any scroll events
    const handleScroll = (e: Event) => {
      if (isLockedRef.current) return;
      // Snap to nearest section if somehow scrolled
      const sectionHeight = el.clientHeight;
      const nearestSection = Math.round(el.scrollTop / sectionHeight);
      if (nearestSection !== currentSectionRef.current) {
        el.scrollTop = currentSectionRef.current * sectionHeight;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('scroll', handleScroll);
      document.removeEventListener('keydown', handleKeyDown);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (gestureResetTimeout) clearTimeout(gestureResetTimeout);
    };
  }, [scrollContainerRef, goToNextSection, goToPrevSection]);

  return {
    currentSection,
    scrollToSection: animateToSection,
    goToNextSection,
    goToPrevSection,
  };
}
