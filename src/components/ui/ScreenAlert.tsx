import { useState } from 'react';
import { Monitor, X } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useWindowSize, MOBILE_BREAKPOINT } from '@/hooks/useWindowSize';

const ScreenAlert = () => {
  const [isVisible, setIsVisible] = useState(true);
  const windowWidth = useWindowSize();

  // Don't render anything during SSR or on desktop
  if (!windowWidth || windowWidth >= MOBILE_BREAKPOINT || !isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] p-2">
      <Alert 
        className={`
          mx-auto max-w-lg bg-white/95 backdrop-blur-sm border-cyan-600 p-3
          animate-in fade-in slide-in-from-bottom duration-700
        `}
      >
        <div className="flex gap-2 items-start">
          <Monitor className="h-4 w-4 text-cyan-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0 mr-2">
            <AlertTitle className="text-cyan-600 text-sm font-medium">
              Schermgrootte melding
            </AlertTitle>
            <AlertDescription className="text-xs text-gray-600">
            Deze website komt het beste tot zijn recht op een groter scherm (laptop, tablet in landschapsmodus of desktop).
            </AlertDescription>
          </div>
          <button 
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Sluiten"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </Alert>
    </div>
  );
};

export default ScreenAlert;
