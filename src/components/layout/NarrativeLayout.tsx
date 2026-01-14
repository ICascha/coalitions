import { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useWindowSize } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/button';
import { Info, X, Menu } from 'lucide-react';

// View Components
import UNGAMap from '@/components/unga/UNGAMap';

const MOBILE_BREAKPOINT = 768; // md breakpoint

const NarrativeLayout = () => {
  const introRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoDialog, setShowLogoDialog] = useState(true);
  const [isMainContentVisible, setIsMainContentVisible] = useState(false);
  const [activeView, setActiveView] = useState<
    'connections' | 'correlations' | 'unga' | 'approvals' | 'approvals_detailed' | 'regression'
  >('unga');

  const windowWidth = useWindowSize();
  const isMobile = windowWidth !== null && windowWidth < MOBILE_BREAKPOINT;

  // Preload images for faster viewing
  useEffect(() => {
    // Optional: Preload critical assets if any
  }, []);

  const viewDetails = {
    unga: {
      title: 'De Nieuwe Wereldkaart (UNGA)',
      component: <UNGAMap />,
    },
    // Fallbacks for other views to prevent crashes if state changes
    connections: {
      title: 'Netwerk (Connections)',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    correlations: {
      title: 'Correlaties',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    approvals: {
      title: 'Raadsposities',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    approvals_detailed: {
      title: 'Publieke Opinie',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    regression: {
      title: 'Regressie',
      component: <div className="p-4">Component niet beschikbaar</div>,
    }
  }[activeView];

  // Animation styles
  const fadeInAnimation = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  // Button hover animations
  const buttonAnimations = `
    .nav-button {
      transition: all 0.2s ease-in-out;
    }
    .nav-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 153, 168, 0.15);
    }
    .nav-button:active {
      transform: translateY(0);
    }
  `;

  const getAnimationStyle = (delay: number) => ({
    animation: `fadeIn 0.8s ease-out ${delay}ms forwards`,
    opacity: 0,
  });

  const LogoContent = () => (
    <div className="flex flex-col items-center text-center p-8 bg-white h-full justify-center">
      <div className="relative w-48 h-48 mb-8 animate-[fadeIn_1s_ease-out]">
        <div className="absolute inset-0 bg-blue-100 rounded-full opacity-20 animate-pulse" />
        <img
          src="/hcss-logo.png"
          alt="HCSS Logo"
          className="relative z-10 w-full h-full object-contain p-4"
        />
      </div>
      <h2
        className="text-3xl font-bold text-[rgb(0,153,168)] mb-4"
        style={getAnimationStyle(200)}
      >
        The Hague Centre for Strategic Studies
      </h2>
      <p className="text-gray-600 mb-8 max-w-lg" style={getAnimationStyle(400)}>
        Data-driven inzichten in mondiale geopolitieke verhoudingen en strategische veiligheidsvraagstukken.
      </p>
      <div className="flex gap-4" style={getAnimationStyle(600)}>
        <a
          href="https://hcss.nl"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2 bg-[rgb(0,153,168)] text-white rounded-full font-medium hover:bg-[rgb(0,123,138)] transition-colors"
        >
          Bezoek Website
        </a>
        <button
          onClick={() => setIsLogoDialogOpen(false)}
          className="px-6 py-2 border border-gray-300 rounded-full font-medium hover:bg-gray-50 transition-colors text-gray-700"
        >
          Sluiten
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-50/50">
      <style>{`${fadeInAnimation}${buttonAnimations}`}</style>
      {/* <ScreenAlert /> */}

      {/* Intro section and tabs temporarily hidden */}
      {/*
      <div className="fixed top-4 left-4 md:top-8 md:left-8 z-50">
        <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
          <DialogTrigger asChild>
            <button
              className="group flex flex-col items-center bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-100"
              aria-label="Over HCSS"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 relative flex items-center justify-center">
                <img
                  src="/hcss-logo.png"
                  alt="HCSS Logo"
                  className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:w-[90vw] max-w-2xl bg-white/95 backdrop-blur-sm p-0">
            <LogoContent />
          </DialogContent>
        </Dialog>
      </div>
      */}

      {/*
      <section
        ref={introRef}
        className="relative flex h-[40vh] w-full flex-col justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-white px-6 md:px-12"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center text-center z-10">
          <h1
            className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-6xl lg:text-7xl"
            style={{
              animation: 'fadeIn 1s ease-out forwards',
              opacity: 0,
            }}
          >
            Subjectieve Waarheden
          </h1>
          <p
            className="mb-8 max-w-2xl text-lg text-slate-600 md:text-xl leading-relaxed"
            style={getAnimationStyle(300)}
          >
            Een interactieve verkenning van hoe mondiale machten en allianties verschuiven in een steeds complexere wereld.
          </p>

          <Button
            size="lg"
            onClick={() => {
              textRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="rounded-full bg-slate-900 px-8 py-6 text-lg font-medium text-white shadow-xl transition-all hover:translate-y-[-2px] hover:bg-slate-800 hover:shadow-2xl"
            style={getAnimationStyle(600)}
          >
            Start Analyse
          </Button>
        </div>
      </section>
      */}

      <section
        ref={textRef}
        className="h-full w-full bg-white"
      >
        <div className="relative flex h-full w-full flex-col">
          {/* Tabs temporarily hidden
          <div
            className="flex flex-col gap-4 px-6 pt-8 pb-4 md:flex-row md:items-end md:justify-between md:pt-10 md:pb-6"
            style={getAnimationStyle(600)}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
                {viewDetails?.title}
              </h2>
              <div className="h-1 w-20 rounded-full bg-[rgb(0,153,168)] opacity-60"></div>
            </div>

            <div className={`
              ${isMobile ? 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-md p-2 rounded-full shadow-lg border border-slate-200' : 'bg-slate-100/50 p-1.5 rounded-full border border-slate-200'}
            `}>
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView('connections')}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    activeView === 'connections'
                      ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                      : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                  }`}
                >
                  Netwerk
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('unga')}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    activeView === 'unga'
                      ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                      : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                  }`}
                >
                  UNGA
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('approvals_detailed')}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    activeView === 'approvals_detailed'
                      ? 'bg-[rgb(0,153,168)] text-white border-[rgb(0,153,168)]'
                      : 'bg-white text-[rgb(0,153,168)] border-[rgb(0,153,168)] hover:bg-[rgb(0,153,168)] hover:text-white'
                  }`}
                >
                  Publieke Opinie
                </button>
              </div>
            </div>
          </div>
          */}

          <div className="flex-1 min-h-0 w-full h-full">
            {viewDetails.component}
          </div>
        </div>
      </section>
    </div>
  );
};

export { NarrativeLayout };
