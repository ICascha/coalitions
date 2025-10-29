export type CountryCode = string;

export type CountryCoord = { code: CountryCode; name: string; lat: number; lon: number };

// Approximate geographic centers for plotting purposes
export const COUNTRY_COORDS: Record<string, CountryCoord> = {
  at: { code: 'at', name: 'Austria', lat: 47.5162, lon: 14.5501 },
  by: { code: 'by', name: 'Belarus', lat: 53.7098, lon: 27.9534 },
  be: { code: 'be', name: 'Belgium', lat: 50.5039, lon: 4.4699 },
  bg: { code: 'bg', name: 'Bulgaria', lat: 42.7339, lon: 25.4858 },
  cz: { code: 'cz', name: 'Czechia', lat: 49.8175, lon: 15.473 },
  dk: { code: 'dk', name: 'Denmark', lat: 56.2639, lon: 9.5018 },
  ee: { code: 'ee', name: 'Estonia', lat: 58.5953, lon: 25.0136 },
  fi: { code: 'fi', name: 'Finland', lat: 61.9241, lon: 25.7482 },
  fr: { code: 'fr', name: 'France', lat: 46.2276, lon: 2.2137 },
  de: { code: 'de', name: 'Germany', lat: 51.1657, lon: 10.4515 },
  gr: { code: 'gr', name: 'Greece', lat: 39.0742, lon: 21.8243 },
  hu: { code: 'hu', name: 'Hungary', lat: 47.1625, lon: 19.5033 },
  is: { code: 'is', name: 'Iceland', lat: 64.9631, lon: -19.0208 },
  ie: { code: 'ie', name: 'Ireland', lat: 53.1424, lon: -7.6921 },
  it: { code: 'it', name: 'Italy', lat: 41.8719, lon: 12.5674 },
  lv: { code: 'lv', name: 'Latvia', lat: 56.8796, lon: 24.6032 },
  lt: { code: 'lt', name: 'Lithuania', lat: 55.1694, lon: 23.8813 },
  lu: { code: 'lu', name: 'Luxembourg', lat: 49.8153, lon: 6.1296 },
  nl: { code: 'nl', name: 'Netherlands', lat: 52.1326, lon: 5.2913 },
  no: { code: 'no', name: 'Norway', lat: 60.472, lon: 8.4689 },
  pl: { code: 'pl', name: 'Poland', lat: 51.9194, lon: 19.1451 },
  pt: { code: 'pt', name: 'Portugal', lat: 39.3999, lon: -8.2245 },
  ro: { code: 'ro', name: 'Romania', lat: 45.9432, lon: 24.9668 },
  sk: { code: 'sk', name: 'Slovakia', lat: 48.669, lon: 19.699 },
  es: { code: 'es', name: 'Spain', lat: 40.4637, lon: -3.7492 },
  se: { code: 'se', name: 'Sweden', lat: 60.1282, lon: 18.6435 },
  ch: { code: 'ch', name: 'Switzerland', lat: 46.8182, lon: 8.2275 },
  ua: { code: 'ua', name: 'Ukraine', lat: 48.3794, lon: 31.1656 },
  gb: { code: 'gb', name: 'United Kingdom', lat: 55.3781, lon: -3.436 },
};

// Simple equirectangular projection bounds roughly covering Europe
const LON_MIN = -25; // includes Iceland, Portugal
const LON_MAX = 45;  // includes Ukraine, Greece
const LAT_MIN = 34;  // Mediterranean
const LAT_MAX = 72;  // Scandinavia

export type Projector = (lat: number, lon: number) => { x: number; y: number };

export const createProjector = (width: number, height: number): Projector => {
  return (lat: number, lon: number) => {
    const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * width;
    const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * height;
    return { x, y };
  };
};
