import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

// View Components
import UNGAMap from '@/components/unga/UNGAMap';

const NarrativeLayout = () => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
  const [isLogoVisible, setIsLogoVisible] = useState(true);
  const activeView = 'unga' as const;

  const viewDetails = {
    unga: {
      title: 'Mondiale Verhoudingen (UNGA)',
      component: <UNGAMap onAnalysisModeChange={(isAnalyzing) => setIsLogoVisible(!isAnalyzing)} />,
    },
    // Fallbacks for other views to prevent crashes if state changes
    connections: {
      title: 'Markt en Macht',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    correlations: {
      title: 'Strategische Correlaties',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    approvals: {
      title: 'Europese Raadsposities',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    approvals_detailed: {
      title: 'Mondiale Publieke Opinie',
      component: <div className="p-4">Component niet beschikbaar</div>,
    },
    regression: {
      title: 'Strategische Regressie-analyse',
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

  const LogoContent = () => (
    <div className="p-8 md:p-12 max-h-[85vh] overflow-y-auto bg-white">
      <div className="flex items-center gap-6 border-b border-slate-100 pb-8 mb-8">
        <div className="w-16 h-16 relative flex-shrink-0 opacity-90">
          <img
            src={`${import.meta.env.BASE_URL}denkwerk_logo.svg`}
            alt="DenkWerk Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <div>
          <h2 className="text-3xl font-serif text-slate-900 tracking-tight">DenkWerk</h2>
          <p className="text-sm text-slate-500 font-medium tracking-wide uppercase mt-1">Onafhankelijke denktank</p>
        </div>
      </div>

      <div className="text-slate-600 leading-relaxed font-serif text-lg">
        <div className="float-right ml-8 mb-6 w-64 md:w-80 hidden md:block">
          <div className="relative transition-transform duration-700 hover:scale-[1.02]">
            <img
              src={`${import.meta.env.BASE_URL}cover_image.webp`}
              alt="Rapport Cover"
              className="w-full h-auto object-contain grayscale-[10%] hover:grayscale-0 transition-all duration-700 drop-shadow-xl"
            />
          </div>
        </div>

        <h3 className="text-xl font-serif text-slate-900 mb-3 mt-0">Over dit rapport</h3>
        <p className="mb-4">
          Precies een jaar na de inauguratie van Donald Trump moeten we constateren dat de Verenigde Staten niet langer een vertrouwde 'vriend' of 'ally' zijn, maar zijn veranderd in een harde geopolitieke concurrent.
        </p>
        <p className="mb-8">
          Dit rapport, <em className="text-slate-800">'Markt en Macht'</em>, analyseert onze huidige positie vanuit een nuchter realisme. Hoeveel geopolitieke en geo-economische macht hebben wij werkelijk? Hoe hebben we deze kwetsbare positie laten ontstaan? En vooral: wat is er nu nodig om onze speelruimte terug te winnen?
        </p>
        
        <h3 className="text-xl font-serif text-slate-900 mb-3">Over DenkWerk</h3>
        <p>
          DenkWerk is een onafhankelijke denktank die maatschappelijke thema's agendeert en analyseert. Wij duiden geopolitieke machtsverschuivingen en onderzoeken de architectuur van Europese coalities om Nederland en Europa weerbaar te maken in een veranderende wereld.
        </p>

        <div className="pt-10 flex gap-4 clear-both">
          <a
            href="https://denkwerk.online"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-8 py-3 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors font-serif"
          >
            Bezoek Website
          </a>
          <button
            onClick={() => setIsLogoDialogOpen(false)}
            className="px-8 py-3 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 transition-colors text-slate-600 font-serif"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      <style>{`${fadeInAnimation}${buttonAnimations}`}</style>
      {/* <ScreenAlert /> */}

      {/* Logo Button & Dialog */}
      <div className={`fixed top-6 left-6 z-50 mix-blend-multiply transition-opacity duration-300 ${isLogoVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
          <DialogTrigger asChild>
            <button
              className="group flex items-center justify-center bg-transparent p-2 transition-all duration-300 hover:bg-slate-50 rounded-lg"
              aria-label="Over DenkWerk"
            >
              <div className="w-12 h-12 relative flex items-center justify-center">
                <img
                  src={`${import.meta.env.BASE_URL}denkwerk_logo.svg`}
                  alt="DenkWerk Logo"
                  className="w-full h-full object-contain opacity-90 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100"
                />
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl bg-white p-0 overflow-hidden border-none shadow-none rounded-none block">
            <LogoContent />
          </DialogContent>
        </Dialog>
      </div>

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
