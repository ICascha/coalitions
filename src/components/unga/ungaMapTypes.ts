export const POWER_BLOCS = ['EU', 'USA', 'CHINA', 'RUSSIA'] as const;
export type PowerBloc = (typeof POWER_BLOCS)[number];

export type CountryAlignment = {
  bloc: PowerBloc;
  value: number | null;
  strength: number;
  metrics: Partial<Record<PowerBloc, number | null>>;
};

export type TopicInfo = {
  disagreements: string[];
  agreements: string[];
};

export type TooltipAlignmentState = {
  type: 'alignment';
  name: string;
  countryCode: string;
  alignment: CountryAlignment | null;
  topics: TopicInfo | null;
  x: number;
  y: number;
};

export type TooltipState = TooltipAlignmentState;

export type BlocDistance = {
  bloc: string;
  average_distance: number | null;
  observations: number;
};

export type CountryDistanceRecord = {
  country: string;
  blocs: BlocDistance[];
};

export type OverallDistanceResponse = {
  available_blocs: string[];
  total_countries: number;
  countries: CountryDistanceRecord[];
};

export type AlignmentMap = Record<string, CountryAlignment>;

export type ViewBox = { x: number; y: number; w: number; h: number };

export type Coalition = { id: string; label: string; members: ReadonlySet<string> };


