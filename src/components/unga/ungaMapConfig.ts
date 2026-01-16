import type { Coalition, PowerBloc, ViewBox } from './ungaMapTypes';

// Sombre palette
export const POWER_BLOC_COLORS: Record<PowerBloc, string> = {
  EU: '#004494',
  USA: '#059669',
  CHINA: '#991B1B',
  RUSSIA: '#EA580C',
};

export const POWER_BLOC_LABELS: Record<PowerBloc, string> = {
  EU: 'Europese Unie',
  USA: 'Verenigde Staten',
  CHINA: 'China',
  RUSSIA: 'Rusland',
};

export const UNGA_API_BASE =
  import.meta.env.VITE_UNGA_DISTANCE_API?.replace(/\/+$/, '') ??
  (import.meta.env.PROD
    ? 'https://backendclustering-production.up.railway.app'
    : 'http://localhost:8000');

// EU-27 member states for Europe zoom and coalition highlighting
// Note: Malta (MLT) is not in the SVG due to size at this map resolution
export const EUROPE_COUNTRY_NAMES = [
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech',      // SVG uses "CZECH" for Czechia
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Ireland',
  'Italy',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Netherlands',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
] as const;

// Simple rotating "within-EU" coalitions (ISO3 codes).
// Tweak/extend these sets to match your narrative.
export const EU_COALITIONS: Coalition[] = [
  {
    id: 'coalition-1',
    label: 'Coalitie voor Digitale Infrastructuur',
    members: new Set(['DNK', 'SWE', 'FIN']),
  },
  {
    id: 'coalition-2',
    label: 'Coalitie voor Energiezekerheid',
    members: new Set(['NLD', 'BEL', 'LUX', 'FRA', 'DEU', 'AUT']),
  },
  {
    id: 'coalition-3',
    label: 'Coalitie voor Defensiesamenwerking',
    members: new Set(['ESP', 'PRT', 'ITA', 'GRC']),
  },
  {
    id: 'coalition-4',
    label: 'Coalitie voor Kritieke Grondstoffen',
    members: new Set(['POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'HRV', 'SVN']),
  },
  {
    id: 'coalition-eu',
    label: 'De Europese Unie',
    members: new Set([
      'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
      'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
      'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'
    ]),
  },
];

// --- Manual override ---
// If you want to hardcode where the scroll zoom lands, set this to a viewBox in SVG coordinates.
// IMPORTANT: this SVG uses *very large* coordinates (see the SVG's viewBox; it's ~ ±20,000,000).
// So overrides like { x: 15, y: 95, w: 100, h: 100 } will effectively point at the *center* of the world.
//
// Also note: the map paths live inside `<g transform="scale(1, -1)">`, so visually "north" corresponds to
// *more negative* y values in this coordinate system.
//
// Rough Europe-ish starting point (tweak from here):
// { x: -3500000, y: -8500000, w: 11000000, h: 7000000 }
export const EUROPE_VIEWBOX_OVERRIDE: ViewBox | null = { x: -2500000, y: -8500000, w: 10000000 / 1.4, h: 7000000 / 1.4 };


