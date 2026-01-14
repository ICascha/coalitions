import type { Coalition } from '../ungaMapTypes';

export function CoalitionOverlayCard(props: {
  isVisible: boolean;
  coalitionLoopEnabled: boolean;
  activeCoalition: Coalition | null;
}) {
  const { isVisible, coalitionLoopEnabled, activeCoalition } = props;

  return (
    <div
      className="absolute inset-0 flex items-center justify-start p-6 md:p-10 pointer-events-none"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `translateY(${isVisible ? 0 : 10}px)`,
        transition: 'opacity 400ms ease, transform 500ms ease',
      }}
    >
      <div className="w-full max-w-xl">
        <div className="rounded-2xl bg-white/85 backdrop-blur-md border border-white/60 shadow-xl px-6 py-6">
          <div className="text-xs uppercase tracking-widest text-slate-500">Coalitions within the EU (placeholder)</div>
          <div className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900">
            {coalitionLoopEnabled ? activeCoalition?.label ?? '—' : '—'}
          </div>
          <div className="mt-2 text-sm md:text-base text-slate-600 leading-relaxed">
            Every few seconds, a different coalition is highlighted on the map.
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-xs text-slate-500">Placeholder metric</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">42</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-xs text-slate-500">Placeholder metric</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">0.73</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-xs text-slate-500">Placeholder metric</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">+18%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


