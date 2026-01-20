import { useEffect, useState } from 'react';

export function useScrollContainerProgress(scrollContainerRef: React.RefObject<HTMLElement>) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const clientHeight = el.clientHeight;
      const scrollHeight = el.scrollHeight;
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
      setScrollProgress(progress);
    };

    el.addEventListener('scroll', handleScroll);
    // initialize
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  return scrollProgress;
}



