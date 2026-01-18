import { useEffect, useState, useRef } from 'react';
import UNGAMap from './UNGAMap';

export const UNGAFullscreen = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger initial animation
    const timer1 = setTimeout(() => setIsLoaded(true), 100);
    const timer2 = setTimeout(() => setShowMap(true), 600);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-[#0a0a1a]"
    >
      {/* Animated background layers */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Base gradient */}
        <div 
          className={`
            absolute inset-0 transition-opacity duration-[2000ms] ease-out
            ${isLoaded ? 'opacity-100' : 'opacity-0'}
          `}
          style={{
            background: `
              radial-gradient(ellipse 120% 80% at 50% 100%, rgba(6, 78, 96, 0.4) 0%, transparent 60%),
              radial-gradient(ellipse 80% 60% at 20% 20%, rgba(0, 153, 168, 0.15) 0%, transparent 50%),
              radial-gradient(ellipse 60% 50% at 80% 30%, rgba(79, 70, 229, 0.12) 0%, transparent 50%),
              linear-gradient(180deg, #0a0a1a 0%, #0d1526 50%, #0f172a 100%)
            `,
          }}
        />
        
        {/* Animated aurora effect */}
        <div 
          className={`
            absolute inset-0 transition-all duration-[3000ms] ease-out
            ${isLoaded ? 'opacity-60 scale-100' : 'opacity-0 scale-110'}
          `}
          style={{
            background: `
              radial-gradient(ellipse 100% 40% at 50% 0%, rgba(0, 153, 168, 0.2) 0%, transparent 70%)
            `,
            animation: isLoaded ? 'auroraShift 20s ease-in-out infinite' : 'none',
          }}
        />

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className={`
                absolute rounded-full bg-cyan-400/30 blur-sm
                transition-all duration-[3000ms] ease-out
                ${isLoaded ? 'opacity-100' : 'opacity-0'}
              `}
              style={{
                width: `${Math.random() * 4 + 2}px`,
                height: `${Math.random() * 4 + 2}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animation: isLoaded ? `floatParticle ${15 + Math.random() * 20}s ease-in-out infinite` : 'none',
                transitionDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>

        {/* Grid lines overlay */}
        <div 
          className={`
            absolute inset-0 transition-opacity duration-[2500ms] ease-out
            ${isLoaded ? 'opacity-20' : 'opacity-0'}
          `}
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 153, 168, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 153, 168, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            mask: 'radial-gradient(ellipse 100% 100% at 50% 50%, black 0%, transparent 70%)',
            WebkitMask: 'radial-gradient(ellipse 100% 100% at 50% 50%, black 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Main content container */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {/* Header area with title */}
        <header 
          className={`
            relative px-6 py-6 md:px-10 md:py-8
            transition-all duration-1000 ease-out
            ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div 
                className={`
                  w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 
                  backdrop-blur-sm border border-white/10
                  flex items-center justify-center
                  transition-all duration-700 ease-out
                  ${isLoaded ? 'scale-100 rotate-0' : 'scale-50 rotate-12'}
                `}
                style={{ transitionDelay: '200ms' }}
              >
                <svg 
                  viewBox="0 0 24 24" 
                  className="w-6 h-6 text-cyan-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  <path d="M2 12h20" />
                </svg>
              </div>
              <div>
                <h1 
                  className={`
                    text-2xl md:text-3xl font-semibold tracking-tight
                    bg-gradient-to-r from-white via-cyan-100 to-cyan-200 bg-clip-text text-transparent
                    transition-all duration-700 ease-out
                    ${isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
                  `}
                  style={{ transitionDelay: '300ms' }}
                >
                  Global Alignment
                </h1>
                <p 
                  className={`
                    text-sm md:text-base text-slate-400 mt-0.5
                    transition-all duration-700 ease-out
                    ${isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
                  `}
                  style={{ transitionDelay: '400ms' }}
                >
                  UN General Assembly Voting Patterns
                </p>
              </div>
            </div>
            
            {/* Subtle badge */}
            <div 
              className={`
                hidden md:flex items-center gap-2 px-4 py-2 
                rounded-full bg-white/5 backdrop-blur-sm border border-white/10
                transition-all duration-700 ease-out
                ${isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
              `}
              style={{ transitionDelay: '500ms' }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400 font-medium">Live Data</span>
            </div>
          </div>
        </header>

        {/* Map container */}
        <div 
          className={`
            flex-1 relative px-4 pb-4 md:px-6 md:pb-6
            transition-all duration-1200 ease-out
            ${showMap ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]'}
          `}
          style={{ transitionDelay: '100ms' }}
        >
          {/* Glow behind the map */}
          <div 
            className={`
              absolute inset-4 md:inset-6 rounded-2xl
              transition-opacity duration-[2000ms]
              ${showMap ? 'opacity-100' : 'opacity-0'}
            `}
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0, 153, 168, 0.15) 0%, transparent 70%)',
              filter: 'blur(40px)',
            }}
          />
          
          {/* Map wrapper with glass morphism */}
          <div 
            className={`
              relative h-full w-full rounded-2xl overflow-hidden
              bg-slate-900/40 backdrop-blur-sm
              border border-white/10
              shadow-2xl shadow-cyan-900/20
              transition-all duration-1000 ease-out
              ${showMap ? 'opacity-100' : 'opacity-0'}
            `}
          >
            {/* Inner glow border */}
            <div 
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
              }}
            />
            
            {/* Actual map component */}
            <div className="relative h-full w-full unga-fullscreen-map">
              <UNGAMap />
            </div>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes auroraShift {
          0%, 100% {
            transform: translateX(0%) translateY(0%);
            opacity: 0.6;
          }
          25% {
            transform: translateX(5%) translateY(-5%);
            opacity: 0.4;
          }
          50% {
            transform: translateX(0%) translateY(-3%);
            opacity: 0.7;
          }
          75% {
            transform: translateX(-5%) translateY(-2%);
            opacity: 0.5;
          }
        }

        @keyframes floatParticle {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          25% {
            transform: translateY(-30px) translateX(10px);
          }
          50% {
            transform: translateY(-50px) translateX(-5px);
          }
          75% {
            transform: translateY(-20px) translateX(-10px);
          }
        }

        /* Override UNGAMap card styling for fullscreen mode */
        .unga-fullscreen-map > div {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 1rem !important;
        }

        .unga-fullscreen-map .text-\\[rgb\\(0\\,153\\,168\\)\\] {
          color: rgb(103, 232, 249) !important;
        }

        .unga-fullscreen-map .text-gray-600,
        .unga-fullscreen-map .text-slate-500,
        .unga-fullscreen-map .text-slate-400 {
          color: rgb(148, 163, 184) !important;
        }

        .unga-fullscreen-map .bg-slate-50,
        .unga-fullscreen-map .bg-slate-100 {
          background: rgba(15, 23, 42, 0.5) !important;
        }

        .unga-fullscreen-map .border-slate-200 {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .unga-fullscreen-map .bg-white {
          background: rgba(15, 23, 42, 0.6) !important;
          backdrop-filter: blur(8px);
        }

        .unga-fullscreen-map .shadow-sm {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
        }

        .unga-fullscreen-map .text-slate-900,
        .unga-fullscreen-map .text-slate-800,
        .unga-fullscreen-map .text-slate-700 {
          color: rgb(226, 232, 240) !important;
        }

        .unga-fullscreen-map .text-slate-600 {
          color: rgb(148, 163, 184) !important;
        }

        /* Tooltip styling */
        .unga-fullscreen-map .bg-white.shadow-lg {
          background: rgba(15, 23, 42, 0.95) !important;
          border-color: rgba(0, 153, 168, 0.3) !important;
        }

        /* Select dropdown styling */
        .unga-fullscreen-map [data-radix-select-trigger] {
          background: rgba(15, 23, 42, 0.6) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          color: rgb(226, 232, 240) !important;
        }

        .unga-fullscreen-map [data-radix-select-content] {
          background: rgba(15, 23, 42, 0.95) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        /* Map container background override */
        .unga-fullscreen-map .bg-gradient-to-br {
          background: rgba(15, 23, 42, 0.3) !important;
        }

        .unga-fullscreen-map .shadow-\\[inset_0_2px_20px_rgba\\(148\\,163\\,184\\,0\\.12\\)\\] {
          box-shadow: inset 0 2px 30px rgba(0, 153, 168, 0.1) !important;
        }
      `}</style>
    </div>
  );
};

export default UNGAFullscreen;


