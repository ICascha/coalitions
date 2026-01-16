import { Suspense, useEffect, useState } from 'react';
import { GlobeScene } from './GlobeScene';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntroSectionProps {
  morphProgress: number; // 0 = pure globe, 1 = flattened map
  onScrollDown: () => void;
  textureUrl: string | null;
  isVisible: boolean;
}

export const IntroSection = ({ 
  morphProgress, 
  onScrollDown,
  textureUrl,
  isVisible
}: IntroSectionProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);
  
  // Stagger animations
  const getAnimationDelay = (index: number) => ({
    transitionDelay: `${index * 150}ms`,
  });
  
  // Text content fades out as we scroll (morph)
  const textOpacity = Math.max(0, 1 - morphProgress * 3);
  const textTranslate = -morphProgress * 50;
  
  // Globe container transforms
  const globeScale = 1 + morphProgress * 0.2;
  const globeOpacity = 1;
  
  return (
    <div className={cn(
      "absolute inset-0 flex flex-col lg:flex-row items-center justify-center overflow-hidden",
      "transition-opacity duration-500",
      !isVisible && "opacity-0 pointer-events-none"
    )}>
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 30%, rgba(0, 68, 148, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 80% 70%, rgba(153, 27, 27, 0.06) 0%, transparent 50%),
              radial-gradient(circle at 50% 50%, rgba(5, 150, 105, 0.04) 0%, transparent 60%)
            `,
          }}
        />
      </div>
      
      {/* Left side - Text content */}
      <div 
        className={cn(
          "relative z-10 flex-1 flex flex-col justify-center px-8 lg:px-16 max-w-2xl",
          "transition-all duration-700 ease-out"
        )}
        style={{
          opacity: textOpacity,
          transform: `translateX(${textTranslate}px)`,
        }}
      >
        {/* Logo */}
        <div 
          className={cn(
            "mb-8 transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={getAnimationDelay(0)}
        >
          <img 
            src="/denkwerk_logo.svg" 
            alt="DenkWerk" 
            className="h-8 w-auto opacity-60 grayscale"
          />
        </div>
        
        {/* Report badge */}
        <div 
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
            "bg-slate-100 border border-slate-200 w-fit mb-6",
            "transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={getAnimationDelay(1)}
        >
          <span className="w-2 h-2 rounded-full bg-[#004494] animate-pulse" />
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">
            Rapport 15
          </span>
        </div>
        
        {/* Main title */}
        <h1 
          className={cn(
            "text-4xl lg:text-5xl xl:text-6xl font-light text-slate-900 tracking-tight leading-tight mb-6",
            "transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={getAnimationDelay(2)}
        >
          Asymmetrische{' '}
          <span className="font-medium bg-gradient-to-r from-[#004494] to-[#991B1B] bg-clip-text text-transparent">
            Afhankelijkheden
          </span>
        </h1>
        
        {/* Subtitle */}
        <p 
          className={cn(
            "text-lg lg:text-xl text-slate-600 leading-relaxed mb-8",
            "transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={getAnimationDelay(3)}
        >
          Een interactieve analyse van Europa's geopolitieke positie in een wereld 
          waar internationale samenwerking plaatsmaakt voor strategische competitie.
        </p>
        
        {/* Key points */}
        <div 
          className={cn(
            "space-y-3 text-sm text-slate-500",
            "transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={getAnimationDelay(4)}
        >
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#004494] mt-2 shrink-0" />
            <span>Stemgedrag in de Verenigde Naties als spiegel van geopolitieke allianties</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#059669] mt-2 shrink-0" />
            <span>Strategische clusters en coalitiepotentieel binnen de EU</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#991B1B] mt-2 shrink-0" />
            <span>Van efficiëntiedenken naar weerbaarheid en autonomie</span>
          </div>
        </div>
        
        {/* CTA hint */}
        <div 
          className={cn(
            "mt-12 flex items-center gap-2 text-sm text-slate-400",
            "transition-all duration-700 ease-out",
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={getAnimationDelay(5)}
        >
          <span className="hidden lg:inline">Scroll om te beginnen</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </div>
      </div>
      
      {/* Right side - Globe */}
      <div 
        className={cn(
          "relative flex-1 h-full min-h-[400px] lg:min-h-0 w-full lg:w-auto",
          "flex items-center justify-center",
          "transition-all duration-500 ease-out",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        style={{
          transform: `scale(${globeScale})`,
        }}
      >
        {/* Glow effect behind globe */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0, 68, 148, 0.15) 0%, transparent 70%)
            `,
            filter: 'blur(40px)',
          }}
        />
        
        {/* Globe canvas */}
        {textureUrl ? (
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-48 h-48 rounded-full border-2 border-dashed border-slate-300 animate-pulse" />
            </div>
          }>
            <GlobeScene 
              morphProgress={morphProgress}
              textureUrl={textureUrl}
              className="w-full h-full"
              opacity={globeOpacity}
            />
          </Suspense>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-48 h-48 rounded-full border-2 border-dashed border-slate-300 animate-pulse flex items-center justify-center text-slate-400 text-sm">
              Laden...
            </div>
          </div>
        )}
      </div>
      
      {/* Scroll indicator at bottom */}
      <button
        onClick={onScrollDown}
        className={cn(
          "absolute bottom-8 left-1/2 -translate-x-1/2 z-20",
          "flex flex-col items-center gap-2 group cursor-pointer",
          "transition-all duration-500",
          morphProgress > 0.1 ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
        aria-label="Scroll om te beginnen"
      >
        <span className="text-[10px] uppercase tracking-[0.15em] text-slate-400 group-hover:text-slate-600 transition-colors">
          Start
        </span>
        <div className="w-10 h-10 rounded-full border border-slate-300 flex items-center justify-center group-hover:border-slate-400 group-hover:bg-slate-50 transition-all">
          <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors animate-bounce" />
        </div>
      </button>
    </div>
  );
};

export default IntroSection;

