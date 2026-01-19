import { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useWindowSize } from '@/hooks/useWindowSize';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Monitor, X, Smartphone } from 'lucide-react';

// View Components
import UNGAMap from '@/components/unga/UNGAMap';

const NarrativeLayout = () => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
  const [isLogoVisible, setIsLogoVisible] = useState(true);
  const [isRotationAlertVisible, setIsRotationAlertVisible] = useState(true);
  const activeView = 'unga' as const;
  const { width, height } = useWindowSize();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Show mobile blocking screen for small screens (less than 768px)
  if (isClient && width !== null && width < 768) {
    return (
      <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 relative mb-8 opacity-90">
          <img
            src={`${import.meta.env.BASE_URL}denkwerk_logo.svg`}
            alt="DenkWerk Logo"
            className="w-full h-full object-contain"
          />
        </div>
        
        <h1 className="text-2xl font-serif text-slate-900 mb-4">
          Niet geschikt voor mobiele telefoons
        </h1>
        
        <p className="text-slate-600 mb-8 max-w-sm font-serif leading-relaxed">
          Deze interactieve data-analyse is geoptimaliseerd voor desktop, laptop en tablets. Voor de beste ervaring raden we aan een groter scherm te gebruiken.
        </p>

        <div className="w-48 mb-8 transform rotate-3 transition-transform hover:rotate-0 duration-500">
           <a 
            href="https://denkwerk.online/media/1160/markt-en-macht.pdf" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <img
              src={`${import.meta.env.BASE_URL}cover_image.webp`}
              alt="Rapport Cover"
              className="w-full h-auto mix-blend-multiply"
            />
          </a>
        </div>

        <a 
          href="https://denkwerk.online/media/1160/markt-en-macht.pdf" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-3 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors font-serif shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform duration-200"
        >
          Open PDF Rapport
        </a>
      </div>
    );
  }

  // Rotation Alert for non-mobile portrait devices (e.g. tablets in portrait)
  const showRotationAlert = isClient && width !== null && height !== null && 
                            width >= 768 && height > width && isRotationAlertVisible;

  const RotationAlert = () => {
    if (!showRotationAlert) return null;
    
    return (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 animate-in slide-in-from-top fade-in duration-500">
        <Alert className="bg-white/95 backdrop-blur-md border-slate-200 shadow-lg flex items-start gap-3">
          <Smartphone className="h-5 w-5 rotate-90 text-slate-900 mt-0.5" />
          <div className="flex-1">
            <AlertTitle className="text-slate-900 font-serif font-medium mb-1">Kantel uw scherm</AlertTitle>
            <AlertDescription className="text-slate-600 text-sm">
              Voor de beste ervaring raden we aan uw tablet te kantelen (landscape).
            </AlertDescription>
          </div>
          <button 
            onClick={() => setIsRotationAlertVisible(false)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      </div>
    );
  };


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
    <div className="p-6 md:p-8 max-h-[85vh] overflow-y-auto bg-white">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-6 mb-6">
        <div className="w-12 h-12 relative flex-shrink-0 opacity-90">
          <img
            src={`${import.meta.env.BASE_URL}denkwerk_logo.svg`}
            alt="DenkWerk Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <div>
          <h2 className="text-2xl font-serif text-slate-900 tracking-tight">DenkWerk</h2>
          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-0.5">Onafhankelijke denktank</p>
        </div>
      </div>

      <div className="text-slate-600 leading-relaxed font-serif text-base">
        <div className="float-right ml-6 mb-4 w-48 md:w-56 hidden md:block">
          <div className="relative transition-transform duration-700 hover:scale-[1.02]">
            <img
              src={`${import.meta.env.BASE_URL}cover_image.webp`}
              alt="Rapport Cover"
              className="w-full h-auto object-contain grayscale-[10%] hover:grayscale-0 transition-all duration-700 drop-shadow-xl"
            />
          </div>
        </div>

        <h3 className="text-lg font-serif text-slate-900 mb-2 mt-0">Over dit rapport</h3>
        <p className="mb-3">
          Precies een jaar na de inauguratie van Donald Trump moeten we constateren dat de Verenigde Staten niet langer een vertrouwde 'vriend' of 'ally' zijn, maar zijn veranderd in een harde geopolitieke concurrent.
        </p>
        <p className="mb-6">
          Dit rapport, <a href="https://denkwerk.online/media/1160/markt-en-macht.pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 underline-offset-2 transition-colors">'Markt en Macht'</a>, analyseert onze huidige positie vanuit een nuchter realisme. Hoeveel geopolitieke en geo-economische macht hebben wij werkelijk? Hoe hebben we deze kwetsbare positie laten ontstaan? En vooral: wat is er nu nodig om onze speelruimte terug te winnen?
        </p>
        
        <h3 className="text-lg font-serif text-slate-900 mb-2">Over DenkWerk</h3>
        <p>
          DenkWerk is een onafhankelijke denktank die met krachtige ideeën bij wil dragen aan een welvarend, inclusief en vooruitstrevend Nederland. Hiervoor brengt DenkWerk Nederlanders bij elkaar die hun rijke kennis, ervaring en creativiteit willen inzetten om richting te geven aan brede maatschappelijke vraagstukken die hen na aan het hart liggen.
        </p>

        <div className="pt-8 flex gap-3 clear-both">
          <a
            href="https://denkwerk.online"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-slate-900 text-white rounded-full text-xs font-medium hover:bg-slate-800 transition-colors font-serif"
          >
            Bezoek Website
          </a>
          <button
            onClick={() => setIsLogoDialogOpen(false)}
            className="px-6 py-2.5 border border-slate-200 rounded-full text-xs font-medium hover:bg-slate-50 transition-colors text-slate-600 font-serif"
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
      <RotationAlert />
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
          <DialogContent className="max-w-4xl bg-white p-0 overflow-hidden border-none shadow-none rounded-none block">
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
