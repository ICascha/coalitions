import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ScreenAlert from '@/components/ui/ScreenAlert';
import { useWindowSize, MOBILE_BREAKPOINT } from '@/hooks/useWindowSize';
import EuropeConnections from '@/components/music/EuropeConnections';
import IndicatorCorrelationHeatmap from '@/components/analytics/IndicatorCorrelationHeatmap';
import RegressionDashboard from '@/components/analytics/RegressionDashboard';
import CountryApprovalHeatmap from '@/components/analytics/CountryApprovalHeatmap';

const brandColorRgb = '0, 153, 168';
const ANIMATION_DURATION = 1000;

const fadeInAnimation = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const buttonAnimations = `
  @keyframes buttonFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 0.85; transform: translateY(0px); }
  }

  @keyframes subtleGlowPulse {
    0%, 100% {
      opacity: 0.85;
      filter: drop-shadow(0 0 2px rgba(${brandColorRgb}, 0.2));
    }
    50% {
      opacity: 1;
      filter: drop-shadow(0 0 8px rgba(${brandColorRgb}, 0.5));
    }
  }
`;

export const NarrativeLayout = () => {
  const introRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const basePath = import.meta.env.BASE_URL;

  const [mounted, setMounted] = useState(false);
  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
  const [isMainContentVisible, setIsMainContentVisible] = useState(false);
  const [activeView, setActiveView] = useState<'connections' | 'correlations' | 'approvals' | 'regression'>('connections');

  const windowWidth = useWindowSize();
  const isMobile = windowWidth !== null && windowWidth < MOBILE_BREAKPOINT;

  useEffect(() => {
    const setDynamicViewportHeight = () => {
      document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
    };

    setDynamicViewportHeight();
    window.addEventListener('resize', setDynamicViewportHeight);

    return () => {
      window.removeEventListener('resize', setDynamicViewportHeight);
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsMainContentVisible(entry.isIntersecting);
      },
      { threshold: 0.4 }
    );

    const current = textRef.current;
    if (current) {
      observer.observe(current);
    }

    return () => {
      if (current) {
        observer.unobserve(current);
      }
    };
  }, []);

  const handleTopLeftButtonClick = () => {
    if (isMainContentVisible) {
      introRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (isMobile) {
      setIsLogoDialogOpen(true);
      return;
    }

    scrollToNarrativeText();
  };

  const scrollToNarrativeText = () => {
    textRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getAnimationStyle = (delay: number) => ({
    opacity: 0,
    animation: mounted ? `fadeIn ${ANIMATION_DURATION}ms ease-out forwards ${delay}ms` : 'none',
  });

  const viewDetails = (() => {
    switch (activeView) {
      case 'connections':
        return {
          title: 'Verbindingen',
          description: 'Verken hoe Europese landen met elkaar verweven zijn.',
          component: <EuropeConnections />,
        };
      case 'correlations':
        return {
          title: 'Indicatorcorrelaties',
          description:
            'Onderzoek hoe sterk de indicatoren met elkaar samenhangen. Scores zijn Spearman-correlaties op gedeelde landparen.',
          component: <IndicatorCorrelationHeatmap />,
        };
      case 'approvals':
        return {
          title: 'Raadsposities',
          description:
            'Bekijk hoe landen op verschillende raden en thema’s met elkaar in lijn stemmen. Klik op een vakje voor het aantal gedeelde besluiten.',
          component: <CountryApprovalHeatmap />,
        };
      case 'regression':
      default:
        return {
          title: 'Determinanten van coalities',
          description:
            'Voer vaste-effecten regressies uit om te zien welke indicatoren coalities verklaren en vergelijk indicatoren visueel.',
          component: <RegressionDashboard />,
        };
    }
  })();

  return (
    <div className="w-full h-screen-dynamic overflow-y-scroll scroll-snap-type-y-mandatory">
      <style>{`${fadeInAnimation}${buttonAnimations}`}</style>
      <ScreenAlert />

      <div className="fixed top-4 left-4 md:top-8 md:left-8 z-50">
        <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
          <DialogContent className="w-[95vw] sm:w-[90vw] max-w-2xl bg-white/95 backdrop-blur-sm p-0">
            <DialogHeader className="p-6 pb-4">
              <DialogTitle className="text-xl">Over het Rapport</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-gray-700 leading-relaxed text-left">
                Dit analyse-instrument is ontwikkeld door{' '}
                <a
                  href="https://denkwerk.online/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgb(0,153,168)] hover:underline"
                >
                  DenkWerk
                </a>{' '}
                in samenwerking met{' '}
                <a
                  href="https://kickstart.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgb(0,153,168)] hover:underline"
                >
                  KickstartAI
                </a>{' '}
                als onderdeel van het DenkWerk rapport &apos;Weerbaarheid by Design&apos;.
              </p>
              <p className="text-gray-700 leading-relaxed text-left">
                DenkWerk is een onafhankelijke denktank die met krachtige ideeën bijdraagt aan een
                welvarend, inclusief en vooruitstrevend Nederland.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <button
          onClick={handleTopLeftButtonClick}
          aria-label={isMainContentVisible ? 'Terug naar banner' : "Open 'Over het Rapport' dialoog"}
          className={`
            group flex items-center justify-center h-14 md:h-16 bg-[rgb(0,153,168)] shadow-lg hover:scale-105
            transition-all duration-500 ease-in-out rounded-full px-4
            ${mounted ? 'animate-[buttonFadeIn_800ms_ease-in-out]' : ''}
          `}
        >
          <div className="flex items-center space-x-3 text-white">
            <img
              src={`${basePath}denkwerk_logo.svg`}
              alt="Denkwerk Logo"
              className="h-6 md:h-7 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <span className="text-sm md:text-base font-medium whitespace-nowrap">
              {isMainContentVisible ? 'Naar banner' : 'Over het rapport'}
            </span>
            <ArrowUp className="h-4 w-4 md:h-5 md:w-5 text-white" />
          </div>
        </button>
      </div>

      <section
        ref={introRef}
        className="relative w-full bg-slate-50 scroll-snap-align-start overflow-hidden"
      >
        <div className="relative w-full h-[220px] md:h-[280px] lg:h-[320px]">
          <img
            src={`${basePath}europe_from_above.jpg`}
            alt="Nederland in de nacht vanuit de ruimte"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">
            Foto: ©ESA/NASA - André Kuipers
          </div>
          <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center text-white text-center px-4">
            <h1
              className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4"
              style={getAnimationStyle(0)}
            >
              Netwerkanalyse (Placeholder)
            </h1>
            <p
              className="text-base md:text-lg max-w-3xl"
              style={getAnimationStyle(200)}
            >
              Ontdek de onderlinge verbondenheid van Europese landen
            </p>
          </div>
        </div>
      </section>

      <section
        ref={textRef}
        className="scroll-snap-align-start bg-white min-h-screen"
      >
        <div className="relative flex h-full w-full flex-col">
          <div
            className="flex flex-col gap-4 px-6 pt-8 pb-4 md:flex-row md:items-end md:justify-between md:pt-10 md:pb-6"
            style={getAnimationStyle(600)}
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl md:text-3xl font-semibold text-[rgb(0,153,168)]">
                {viewDetails.title}
              </h2>
              <p className="text-sm md:text-base text-gray-600 max-w-2xl">
                {viewDetails.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveView('connections')}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === 'connections'
                    ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                    : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                }`}
              >
                Verbindingen
              </button>
              <button
                type="button"
                onClick={() => setActiveView('correlations')}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === 'correlations'
                    ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                    : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                }`}
              >
                Correlaties
              </button>
              <button
                type="button"
                onClick={() => setActiveView('approvals')}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === 'approvals'
                    ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                    : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                }`}
              >
                Raadsposities
              </button>
              <button
                type="button"
                onClick={() => setActiveView('regression')}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === 'regression'
                    ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                    : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                }`}
              >
                Regressie
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 px-4 pb-6 md:px-6">
            {viewDetails.component}
          </div>
        </div>
      </section>
    </div>
  );
};
