import type { PowerBloc } from './ungaMapTypes';
import { POWER_BLOC_COLORS } from './ungaMapConfig';

export const blendWithWhite = (color: string, alpha: number): string => {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const blendedR = Math.round(r * alpha + 255 * (1 - alpha));
  const blendedG = Math.round(g * alpha + 255 * (1 - alpha));
  const blendedB = Math.round(b * alpha + 255 * (1 - alpha));

  return `rgb(${blendedR},${blendedG},${blendedB})`;
};

export const getFillColor = (alignment: { bloc: PowerBloc; strength: number } | undefined | null) => {
  if (!alignment) {
    return '#f1f5f9'; // slate-100
  }
  return blendWithWhite(POWER_BLOC_COLORS[alignment.bloc], Math.max(alignment.strength, 0.45));
};


