import { svgNameToAlpha3 } from '@/data/svgCountryAlpha3';
import { alpha3ToCountryName } from '@/data/alpha3ToCountryName';

export const formatCountryName = (rawId: string) =>
  rawId
    .replace(/[_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const normalizeSvgId = (rawId: string) => formatCountryName(rawId).toUpperCase();

// logic to resolve country key using definition data
export const resolveCountryKey = (rawId: string): string | null => {
  const normalized = normalizeSvgId(rawId);
  if (!normalized || normalized === 'SVG2') {
    return null;
  }
  return svgNameToAlpha3[normalized] ?? normalized;
};

export const getCountryDisplayName = (key: string, defaultName: string): string => {
  return (alpha3ToCountryName as Record<string, string>)[key] ?? defaultName;
};

export const buildAlpha3SetFromNames = (names: readonly string[]) =>
  new Set(names.map((n) => resolveCountryKey(n)).filter(Boolean) as string[]);



