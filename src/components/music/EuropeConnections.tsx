import { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { createProjector, COUNTRY_COORDS, CountryCode } from './countryCoords';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type RawEdge = { country1: CountryCode; country2: CountryCode; metric: number };

export type MetricMetadata = {
  id: string;
  label: string;
  description: string;
  source: {
    label: string;
    url: string;
  };
};

type EdgeKey = string; // `${minCode}-${maxCode}`

type AggregatedEdge = {
  a: CountryCode;
  b: CountryCode;
  weight: number; // combined normalized weight 0..1
};

type LoadedMetric = {
  name: string;
  edges: RawEdge[];
};

type MetricCategory = {
  id: string;
  label: string;
  description?: string;
  metrics: string[];
};

const uniqueEdgeKey = (a: CountryCode, b: CountryCode): EdgeKey => {
  return [a, b].sort().join('-');
};

export const METRIC_METADATA: MetricMetadata[] = [
  {
    id: 'trade_gdp_weighted.json',
    label: 'Handelsintensiteit',
    description:
      'Zet de bilaterale goederenexport om naar een aandeel van het bbp per land en combineert beide richtingen met een harmonisch gemiddelde voor een symmetrische handelsintensiteit.',
    source: {
      label: 'UN Comtrade',
      url: 'https://comtradeplus.un.org',
    },
  },
  {
    id: 'goods_and_services.json',
    label: 'Digitale dienstenhandel',
    description:
      'Gebruikt het WTO-OESO BATIS-bestand voor bilaterale handel in goederen en diensten, normaliseert elke stroom op het bbp van beide landen en combineert ze via het harmonisch gemiddelde tot één symmetrische intensiteitsscore.',
    source: {
      label: 'WTO-OESO Balanced Trade in Services (BATIS)',
      url: 'https://www.wto.org/english/res_e/statis_e/gstdh_batis_e.htm',
    },
  },
  {
    id: 'energy_grid.json',
    label: 'Energieverbindingen',
    description:
      'Gebaseerd op Ember-data over netto overdrachtcapaciteit (NTC) en piekvraag 2024; directional capaciteit wordt geschaald op de vraag van de importeur en daarna samengevoegd met een harmonisch gemiddelde.',
    source: {
      label: 'Ember Electricity Interconnection',
      url: 'https://ember-energy.org/data/europe-electricity-interconnection-data/',
    },
  },
  {
    id: 'investments_gdp.json',
    label: 'Investeringen',
    description:
      'Gebruikt IMF-CDIS outward posities, drukt elke stroom uit als aandeel van het bbp van de investerende economie en neemt het harmonisch gemiddelde om de FDI-band wederkerig te maken.',
    source: {
      label: 'IMF Direct Investment Positions',
      url: 'https://data.imf.org/en/datasets/IMF.STA%3ADIP',
    },
  },
  {
    id: 'migration.json',
    label: 'Migratieverbindingen',
    description:
      'Somt mannelijke en vrouwelijke migranten uit UN DESA 2024 op, normaliseert per herkomst op het totaal aan emigranten en combineert de twee richtingen harmonisch tot één migratieband.',
    source: {
      label: 'UN DESA International Migrant Stock',
      url: 'https://www.un.org/development/desa/pd/content/international-migrant-stock',
    },
  },
  {
    id: 'tourism_total.json',
    label: 'Reizen',
    description:
      'Gebaseerd op Eurostat-reisdata (minimaal één overnachting, alle motieven); deelt elke vertrekstroom door het totaal van het herkomstland en gebruikt het harmonisch gemiddelde voor een symmetrische reisintensiteit.',
    source: {
      label: 'Eurostat – Vakantiereizen',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/tour_dem_ttw/default/table',
    },
  },
  {
    id: 'spotify.json',
    label: 'Spotify-overlap',
    description:
      'Telt gedeelde tracks in de dagelijkse Top 50-lijsten van beide landen, normaliseert op basis van de lijstdichtheid en slaat het harmonisch gemiddelde van de overlap op als cultureel signaal.',
    source: {
      label: 'Kaggle – Top Spotify songs',
      url: 'https://www.kaggle.com/datasets/asaniczka/top-spotify-songs-in-73-countries-daily-updated',
    },
  },
  {
    id: 'ches_similarity_correlation.json',
    label: 'Politieke overeenstemming',
    description:
      'Voorlopige correlatiescore tussen landen op basis van partijposities uit de Chapel Hill Expert Survey (CHES).',
    source: {
      label: 'Chapel Hill Expert Survey',
      url: 'https://www.chesdata.eu/',
    },
  },
  {
    id: 'eu_council_votes.json',
    label: 'Raadsstemmen',
    description:
      'Telt voor elke Raadsbeslissing de gedeelde deelname en stemcategorieën en slaat op hoe vaak landen dezelfde stempositie delen ten opzichte van hun gezamenlijke deelname.',
    source: {
      label: 'SWP EU Council Monitor',
      url: 'https://www.swp-berlin.org/publikation/eu-council-monitor',
    },
  },
  {
    id: 'multinational_similarity_gdp.json',
    label: 'Multinationals',
    description:
      'Somt de bruto output van buitenlandse dochterbedrijven uit de OECD-AAMNE dataset, zet die om naar een aandeel van het gast-bbp en harmoniseert beide richtingen tot een symmetrische multinational-intensiteit.',
    source: {
      label: 'OECD – Multinational Enterprises',
      url: 'https://www.oecd.org/en/data/datasets/multinational-enterprises-and-global-value-chains.html',
    },
  },
  {
    id: 'wvs_similarity_distribution.json',
    label: 'Waardenprofiel',
    description:
      'Bouwt voor elke vraag een gewogen antwoordverdeling per land, gebruikt Jensen–Shannon-overeenkomst over de gedeelde vraagset en filtert op voldoende dekking zodat de score robuust blijft.',
    source: {
      label: 'World Values Survey',
      url: 'https://www.worldvaluessurvey.org/',
    },
  },
  {
    id: 'religion_similarity.json',
    label: 'Religieuze overeenstemming',
    description:
      'Neemt de meest recente religieuze bevolkingssamenstelling uit Pew/WCD, zet die om naar kansvectoren en berekent een overlapscore als 1 − ½·L1-afstand.',
    source: {
      label: 'Pew Research / World Religion Database',
      url: 'https://www.pewresearch.org/',
    },
  },
  {
    id: 'language_similarity.json',
    label: 'Taalverwantschap',
    description:
      'Combineert Eurobarometer 540-aandelen voor moedertaal en gesproken talen, normaliseert op totaal aantal sprekers per land en neemt de overlap (som van minima) tussen landen.',
    source: {
      label: 'Eurobarometer 540',
      url: 'https://europa.eu/eurobarometer/surveys/detail/2991',
    },
  },
  {
    id: 'social_connectedness.json',
    label: 'Sociale verbondenheid',
    description:
      'Gebaseerd op de Facebook Social Connectedness Index; meet de sterkte van vriendschapsbanden tussen landen en geeft zo inzicht in sociale netwerken met gevolgen voor economie, mobiliteit en gezondheid.',
    source: {
      label: 'Facebook Social Connectedness Index',
      url: 'https://data.humdata.org/dataset/social-connectedness-index',
    },
  },
  {
    id: 'borders_enforcements.json',
    label: 'Grensdoorlatendheid',
    description:
      'Gebaseerd op de Border Permeability Dataset; gebruikt de gewogen permeabiliteitsscore met handhaving (BPI_weighted_cr_c250_e1) per dyade voor Europese buurparen.',
    source: {
      label: 'Border Permeability Dataset',
      url: 'https://www.borderpermeability.org/',
    },
  },
  {
    id: 'flights_travelers.json',
    label: 'Passagiersvluchten',
    description:
      'Gebruikt de Eurostat-statistiek voor 2024 passagiers (CAF_PAS), normaliseert per herkomst op het totaal aan vertrekkende reizigers en combineert beide richtingen harmonisch.',
    source: {
      label: 'Eurostat – Air passenger transport',
      url: 'https://ec.europa.eu/eurostat',
    },
  },
  {
    id: 'flights_freight.json',
    label: 'Vrachtvluchten',
    description:
      'Maakt gebruik van Eurostat-luchtvracht (CAF_FRM, 2024), deelt elke stroom door het totale uitgaande tonnage van het herkomstland en maakt de verbinding symmetrisch via een harmonisch gemiddelde.',
    source: {
      label: 'Eurostat – Air freight transport',
      url: 'https://ec.europa.eu/eurostat',
    },
  },
];

const METRIC_INFO = METRIC_METADATA.reduce<Record<string, MetricMetadata>>((acc, meta) => {
  acc[meta.id] = meta;
  return acc;
}, {});

const METRIC_CATEGORIES: MetricCategory[] = [
  {
    id: 'physical',
    label: 'Fysieke infrastructuur',
    description: 'Energie- en grensverbindingen die fysieke koppelingen laten zien.',
    metrics: ['energy_grid.json', 'borders_enforcements.json'],
  },
  {
    id: 'economic',
    label: 'Economische banden',
    description: 'Handel, investeringen en gedeelde bedrijven die economische verwevenheid tonen.',
    metrics: ['trade_gdp_weighted.json', 'goods_and_services.json', 'investments_gdp.json', 'multinational_similarity_gdp.json', 'flights_freight.json'],
  },
  {
    id: 'mobility',
    label: 'Mobiliteit & bezoek',
    description: 'Bewegingen van mensen via migratie en toerisme.',
    metrics: ['migration.json', 'tourism_total.json', 'flights_travelers.json'],
  },
  {
    id: 'culture',
    label: 'Cultuur',
    description: 'Culturele overlap in taal, muziek, religie en sociale netwerken.',
    metrics: ['language_similarity.json', 'spotify.json', 'religion_similarity.json', 'social_connectedness.json'],
  },
  {
    id: 'values',
    label: 'Waarden & politiek',
    description: 'Politieke en maatschappelijke voorkeuren en overeenkomsten.',
    metrics: ['ches_similarity_correlation.json', 'wvs_similarity_distribution.json', 'eu_council_votes.json'],
  },
];

const METRIC_CATEGORY_LOOKUP = METRIC_CATEGORIES.reduce<Record<string, string>>((acc, category) => {
  category.metrics.forEach((metricId) => {
    acc[metricId] = category.id;
  });
  return acc;
}, {});

const BUILT_IN_METRICS = METRIC_METADATA.map((meta) => meta.id);

const brand = 'rgb(0,153,168)';
const rawClusterBase = import.meta.env.VITE_CLUSTER_API_BASE_URL as string | undefined;
const resolvedClusterBase =
  rawClusterBase && rawClusterBase.trim().length > 0
    ? rawClusterBase.trim()
    : (import.meta.env.PROD ? 'https://backendclustering-production.up.railway.app' : '');
const clusterApiBase = resolvedClusterBase.replace(/\/+$/, '');
const clusterEndpoint = clusterApiBase ? `${clusterApiBase}/leiden` : '/leiden';
const fallbackClusterPalette = ['#2563eb', '#f97316', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#facc15', '#ef4444'];

export default function EuropeConnections() {
  const basePath = import.meta.env.BASE_URL;

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => [...BUILT_IN_METRICS]);
  const [cutoff, setCutoff] = useState<number>(0.6);
  const [loaded, setLoaded] = useState<Record<string, LoadedMetric | { error: string }>>({});
  const [clusterData, setClusterData] = useState<Record<string, CountryCode[]> | null>(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusterError, setClusterError] = useState<string | null>(null);
  const [categoryRawWeights, setCategoryRawWeights] = useState<Record<string, number>>(() => (
    METRIC_CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
      acc[cat.id] = 1;
      return acc;
    }, {})
  ));
  const [infoMetricId, setInfoMetricId] = useState<string | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  // Load selected metric files from public
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results: Record<string, LoadedMetric | { error: string }> = {};
      for (const file of selectedMetrics) {
        try {
          const res = await fetch(`${basePath}${file}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as RawEdge[];
          results[file] = { name: file, edges: data };
        } catch (e: any) {
          results[file] = { error: e?.message || 'Failed to load' };
        }
      }
      if (!cancelled) setLoaded(results);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMetrics, basePath]);

  useEffect(() => {
    setClusterData(null);
    setClusterError(null);
  }, [selectedMetrics]);

  const selectedMetricsByCategory = useMemo(() => {
    const selectedSet = new Set(selectedMetrics);
    const map = new Map<string, string[]>();
    METRIC_CATEGORIES.forEach((category) => {
      const metrics = category.metrics.filter((metricId) => selectedSet.has(metricId));
      if (metrics.length > 0) {
        map.set(category.id, metrics);
      }
    });
    return map;
  }, [selectedMetrics]);

  const normalizedCategoryWeights = useMemo(() => {
    const entries = Array.from(selectedMetricsByCategory.entries()).map(([categoryId, metrics]) => ({
      categoryId,
      rawWeight: Math.max(0, categoryRawWeights[categoryId] ?? 0),
      metrics,
    })).filter((entry) => entry.metrics.length > 0);

    if (entries.length === 0) {
      return new Map<string, number>();
    }

    const rawSum = entries.reduce((sum, entry) => sum + entry.rawWeight, 0);
    if (rawSum <= 0) {
      const equalWeight = 1 / entries.length;
      return new Map(entries.map((entry) => [entry.categoryId, equalWeight]));
    }

    return new Map(entries.map((entry) => [entry.categoryId, entry.rawWeight / rawSum]));
  }, [selectedMetricsByCategory, categoryRawWeights]);

  // Aggregate across metrics into combined normalized weights 0..1
  const aggregated = useMemo<AggregatedEdge[]>(() => {
    const metricEntries = Object.entries(loaded).filter(([, v]) => 'name' in v) as [string, LoadedMetric][];
    if (metricEntries.length === 0) return [];

    // Precompute quantile normalization per metric
    const normalizedByMetric: Record<string, Map<EdgeKey, number>> = {};
    for (const [name, m] of metricEntries) {
      const pairs = m.edges.map(edge => ({
        key: uniqueEdgeKey(edge.country1, edge.country2),
        value: edge.metric,
      }));
      const sorted = [...pairs].sort((a, b) => a.value - b.value);
      const n = sorted.length;
      const mMap = new Map<EdgeKey, number>();
      if (n === 1) {
        mMap.set(sorted[0].key, 1);
      } else if (n > 1) {
        let i = 0;
        while (i < n) {
          const start = i;
          const currentValue = sorted[i].value;
          while (i < n && sorted[i].value === currentValue) {
            i++;
          }
          const end = i - 1;
          const avgRank = (start + end) / 2;
          const quantile = (n === 1) ? 1 : avgRank / (n - 1);
          for (let j = start; j <= end; j++) {
            mMap.set(sorted[j].key, quantile);
          }
        }
      }
      normalizedByMetric[name] = mMap;
    }

    // Gather all unique pairs
    const keys = new Set<EdgeKey>();
    for (const [, m] of metricEntries) {
      for (const e of m.edges) keys.add(uniqueEdgeKey(e.country1, e.country2));
    }

    // Determine metric weights based on selected category weights
    const metricsByCategoryWithData = new Map<string, string[]>();
    for (const [name] of metricEntries) {
      const categoryId = METRIC_CATEGORY_LOOKUP[name];
      if (!categoryId) continue;
      const list = metricsByCategoryWithData.get(categoryId);
      if (list) list.push(name);
      else metricsByCategoryWithData.set(categoryId, [name]);
    }

    const categoryWeightEntries = Array.from(metricsByCategoryWithData.entries()).map(([categoryId, metrics]) => ({
      categoryId,
      metrics,
      weight: normalizedCategoryWeights.get(categoryId) ?? 0,
    }));

    const metricWeightMap = new Map<string, number>();

    if (categoryWeightEntries.length === 0) {
      const equalWeight = 1 / metricEntries.length;
      metricEntries.forEach(([name]) => {
        metricWeightMap.set(name, equalWeight);
      });
    } else {
      let categoryWeightSum = categoryWeightEntries.reduce((sum, entry) => sum + entry.weight, 0);
      if (categoryWeightSum <= 0) {
        const fallback = 1 / categoryWeightEntries.length;
        categoryWeightEntries.forEach((entry) => {
          entry.weight = fallback;
        });
        categoryWeightSum = 1;
      } else if (Math.abs(categoryWeightSum - 1) > 1e-6) {
        categoryWeightEntries.forEach((entry) => {
          entry.weight = entry.weight / categoryWeightSum;
        });
        categoryWeightSum = 1;
      }

      categoryWeightEntries.forEach(({ metrics, weight }) => {
        if (metrics.length === 0 || weight <= 0) return;
        const perMetric = weight / metrics.length;
        metrics.forEach((metricId) => {
          metricWeightMap.set(metricId, perMetric);
        });
      });

      let metricWeightSum = 0;
      metricEntries.forEach(([name]) => {
        metricWeightSum += metricWeightMap.get(name) ?? 0;
      });

      if (metricWeightSum <= 0) {
        const equal = 1 / metricEntries.length;
        metricEntries.forEach(([name]) => {
          metricWeightMap.set(name, equal);
        });
      } else if (Math.abs(metricWeightSum - 1) > 1e-6) {
        metricEntries.forEach(([name]) => {
          const current = metricWeightMap.get(name) ?? 0;
          metricWeightMap.set(name, current / metricWeightSum);
        });
      }
    }

    const result: AggregatedEdge[] = [];
    for (const key of keys) {
      const [a, b] = key.split('-') as [CountryCode, CountryCode];
      let weightedSum = 0;
      let totalWeight = 0;
      for (const [name] of metricEntries) {
        const v = normalizedByMetric[name].get(key);
        if (typeof v !== 'number') continue;
        const weight = metricWeightMap.get(name) ?? 0;
        if (weight <= 0) continue;
        weightedSum += v * weight;
        totalWeight += weight;
      }
      if (totalWeight <= 0) continue;
      const weight = weightedSum / totalWeight;
      result.push({ a, b, weight });
    }
    return result;
  }, [loaded, normalizedCategoryWeights]);

  // Collect countries present
  const countries = useMemo<CountryCode[]>(() => {
    const set = new Set<CountryCode>();
    aggregated.forEach(e => { set.add(e.a); set.add(e.b); });
    return Array.from(set);
  }, [aggregated]);

  // Map dimensions (from europe.svg) and projector fallback
  const [mapWidth, setMapWidth] = useState(1000);
  const [mapHeight, setMapHeight] = useState(684);
  const project = useMemo(() => createProjector(mapWidth, mapHeight), [mapWidth, mapHeight]);

  // Hidden SVG container to compute country centroids from europe.svg
  const hiddenContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadSvg = async () => {
      try {
        const res = await fetch(`${basePath}europe.svg`);
        const svgText = await res.text();
        if (cancelled) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const root = doc.documentElement as unknown as SVGSVGElement;
        // Extract dimensions
        const vb = root.getAttribute('viewBox') || root.getAttribute('viewbox');
        if (vb) {
          const parts = vb.split(/\s+/).map(Number).filter((n) => !isNaN(n));
          if (parts.length === 4) {
            setMapWidth(parts[2]);
            setMapHeight(parts[3]);
          }
        } else {
          const w = Number(root.getAttribute('width'));
          const h = Number(root.getAttribute('height'));
          if (w && h) {
            setMapWidth(w);
            setMapHeight(h);
          }
        }

        // Inject into hidden container so getBBox works
        if (hiddenContainerRef.current) {
          const container = hiddenContainerRef.current;
          container.innerHTML = '';
          const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          // Copy viewBox and size
          const vbAttr = root.getAttribute('viewBox') || root.getAttribute('viewbox') || `0 0 ${mapWidth} ${mapHeight}`;
          host.setAttribute('viewBox', vbAttr);
          host.setAttribute('width', String(mapWidth));
          host.setAttribute('height', String(mapHeight));
          host.innerHTML = root.innerHTML;
          container.appendChild(host);
          setMapReady(true);
        }
      } catch (e) {
        // Fallback: keep projector approach
        setMapReady(false);
      }
    };
    loadSvg();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  // Build positions: prefer centroids from europe.svg; fallback to projector
  const [svgPositions, setSvgPositions] = useState<Map<CountryCode, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!mapReady || !hiddenContainerRef.current) return;
    const container = hiddenContainerRef.current;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const pos = new Map<CountryCode, { x: number; y: number }>();

    // Helper: compute an internal label position using farthest-inside sampling
    const computeVisualCenter = (element: SVGGraphicsElement): { x: number; y: number } | null => {
      if (!('getBBox' in element)) return null;
      let box: DOMRect;
      try { box = element.getBBox(); } catch { return null; }
      const geom = element as unknown as SVGGeometryElement;

      // If API available, use point-in-fill; otherwise fallback to bbox center
      const hasPointInFill = typeof (geom as any).isPointInFill === 'function';
      const hasGetPointAtLength = typeof (geom as any).getPointAtLength === 'function' && typeof (geom as any).getTotalLength === 'function';
      if (!hasPointInFill) {
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }

      // Prepare boundary samples for distance (optional but improves placement for thin/concave shapes)
      let boundary: Array<{ x: number; y: number }> = [];
      if (hasGetPointAtLength) {
        try {
          const total = (geom as any).getTotalLength() as number;
          const samples = Math.max(80, Math.min(400, Math.floor(total / 4)));
          for (let i = 0; i <= samples; i++) {
            const p = (geom as any).getPointAtLength((i / samples) * total) as DOMPoint;
            boundary.push({ x: p.x, y: p.y });
          }
        } catch {
          boundary = [];
        }
      }

      const svgRoot = svg as unknown as SVGSVGElement;
      const pt = (svgRoot as any).createSVGPoint ? (svgRoot as any).createSVGPoint() : { x: 0, y: 0 };
      const step = Math.max(3, Math.floor(Math.min(box.width, box.height) / 25));
      let best: { x: number; y: number; score: number } | null = null;
      let sumX = 0, sumY = 0, count = 0;

      for (let y = box.y; y <= box.y + box.height; y += step) {
        for (let x = box.x; x <= box.x + box.width; x += step) {
          if ('matrixTransform' in pt) {
            pt.x = x; pt.y = y;
            if (!(geom as any).isPointInFill(pt)) continue;
          } else {
            // If createSVGPoint is not supported, skip precise check
            continue;
          }
          sumX += x; sumY += y; count++;
          // Score by distance to boundary (maximize min distance)
          let score = 0;
          if (boundary.length) {
            let minD2 = Infinity;
            for (let i = 0; i < boundary.length; i++) {
              const dx = boundary[i].x - x; const dy = boundary[i].y - y;
              const d2 = dx * dx + dy * dy;
              if (d2 < minD2) minD2 = d2;
            }
            score = Math.sqrt(minD2);
          }
          if (!best || score > best.score) best = { x, y, score };
        }
      }

      if (best) return { x: best.x, y: best.y };
      if (count > 0) return { x: sumX / count, y: sumY / count };
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    for (const c of countries) {
      const code = c.toUpperCase();
      const el = svg.querySelector(`#${CSS.escape(code)}`) as unknown as SVGGraphicsElement | null;
      if (el) {
        const vc = computeVisualCenter(el);
        if (vc) pos.set(c, vc);
      }
    }

    setSvgPositions(pos);
  }, [mapReady, countries]);

  const positions = useMemo(() => {
    if (svgPositions.size > 0) return svgPositions;
    const map = new Map<CountryCode, { x: number; y: number }>();
    for (const c of countries) {
      const info = COUNTRY_COORDS[c];
      if (!info) continue;
      map.set(c, project(info.lat, info.lon));
    }
    return map;
  }, [svgPositions, countries, project]);

  const edgesToRender = useMemo(() => aggregated.filter(e => e.weight > cutoff), [aggregated, cutoff]);

  // Toggle built-in metrics that should contribute to the combined view
  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics(prev => (
      prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
    ));
  };

  const handleCategoryWeightChange = (categoryId: string, weight: number) => {
    setCategoryRawWeights((prev) => ({
      ...prev,
      [categoryId]: Math.max(0, weight),
    }));
  };

  const handleOpenMetricInfo = (metricId: string) => {
    setInfoMetricId(metricId);
    setInfoDialogOpen(true);
  };

  const handleMetricDoubleClick = (metricId: string) => {
    if (!METRIC_INFO[metricId]) return;
    const isExclusiveSelection = selectedMetrics.length === 1 && selectedMetrics[0] === metricId;
    if (isExclusiveSelection) {
      setSelectedMetrics([...BUILT_IN_METRICS]);
    } else {
      setSelectedMetrics([metricId]);
    }
  };

  const clusterColorMap = useMemo(() => {
    if (!clusterData) return new Map<string, string>();
    const ids = Object.keys(clusterData).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const map = new Map<string, string>();
    ids.forEach((id, index) => {
      const paletteColor = fallbackClusterPalette[index % fallbackClusterPalette.length];
      if (!map.has(id)) {
        if (index < fallbackClusterPalette.length) {
          map.set(id, paletteColor);
        } else {
          const hue = (index * 137.508) % 360;
          map.set(id, `hsl(${hue}, 65%, 45%)`);
        }
      }
    });
    return map;
  }, [clusterData]);

  const countryClusterMembership = useMemo(() => {
    const map = new Map<CountryCode, { clusterId: string; color: string }>();
    if (!clusterData) return map;
    for (const [clusterId, members] of Object.entries(clusterData)) {
      const color = clusterColorMap.get(clusterId) ?? brand;
      members.forEach((country) => {
        map.set(country, { clusterId, color });
      });
    }
    return map;
  }, [clusterData, clusterColorMap]);
  const hasClusterStyling = countryClusterMembership.size > 0;
  const infoMetadata = infoMetricId ? METRIC_INFO[infoMetricId] : null;

  const handleFindClusters = async () => {
    if (selectedMetrics.length === 0) return;
    setClusterLoading(true);
    setClusterError(null);
    try {
      const files = selectedMetrics.map((m) => m.replace(/\.json$/i, ''));
      const res = await fetch(clusterEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json() as { clusters?: Record<string, CountryCode[]> };
      if (!payload || typeof payload !== 'object' || !payload.clusters) {
        throw new Error('Response missing clusters');
      }
      setClusterData(payload.clusters);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kon clustering niet ophalen';
      setClusterData(null);
      setClusterError(message);
    } finally {
      setClusterLoading(false);
    }
  };

  return (
    <Card className="flex h-full min-h-0 max-h-full flex-col gap-6 border border-gray-200/60 bg-white/80 p-6 shadow-lg backdrop-blur-sm md:p-8">
      <div className="flex h-full min-h-0 flex-col gap-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start shrink-0">
          <div className="w-full lg:max-w-sm shrink-0">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Cutoff (0–1)</label>
            <div className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3 shadow-inner">
              <Slider
                value={[cutoff]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(v) => setCutoff(v[0])}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Filter zwakkere verbindingen weg</span>
                <span className="font-medium text-gray-700">{cutoff.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-inner">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Categoriegewichten</h2>
                <p className="text-xs text-gray-500">
                  Stel de relatieve bijdrage van elke categorie in; we normaliseren automatisch zodat de som 1 blijft.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleFindClusters}
                  disabled={clusterLoading || selectedMetrics.length === 0}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    clusterLoading || selectedMetrics.length === 0
                      ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                      : 'border border-[rgba(0,153,168,0.6)] bg-white text-[rgb(0,153,168)] hover:bg-[rgba(0,153,168,0.08)] focus:ring-[rgba(0,153,168,0.4)]'
                  }`}
                >
                  {clusterLoading ? 'Zoeken...' : 'Find clusters'}
                </button>
                {clusterError ? <span className="text-xs text-red-500">{clusterError}</span> : null}
                <span className="text-xs text-gray-500">
                  {selectedMetrics.length} datasets actief
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col gap-6 lg:flex-row">
          <div className="relative flex flex-1 min-h-[260px] sm:min-h-[320px] lg:min-h-0 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white/90 via-white to-[rgba(0,153,168,0.06)] shadow-inner">
            <div className="relative flex-1 overflow-hidden">
              <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="h-full w-full">
                <image
                  href={`${basePath}europe.svg`}
                  x={0}
                  y={0}
                  width={mapWidth}
                  height={mapHeight}
                  opacity={0.55}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ pointerEvents: 'none' }}
                />
                {edgesToRender.map((e, idx) => {
                  const a = positions.get(e.a);
                  const b = positions.get(e.b);
                  if (!a || !b) return null;
                  const clamped = Math.min(1, Math.max(0, e.weight));
                  const opacity = Math.pow(clamped, 4);
                  const width = 0.5 + clamped * 3.5;
                  const aCluster = countryClusterMembership.get(e.a);
                  const bCluster = countryClusterMembership.get(e.b);
                  const sameCluster = aCluster && bCluster && aCluster.clusterId === bCluster.clusterId;
                  const strokeColor = hasClusterStyling
                    ? (sameCluster ? aCluster?.color ?? brand : '#D1D5DB')
                    : brand;
                  return (
                    <line
                      key={`${e.a}-${e.b}-${idx}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={strokeColor}
                      strokeOpacity={opacity}
                      strokeWidth={width}
                    />
                  );
                })}

                {countries.map((c) => {
                  const pos = positions.get(c);
                  if (!pos) return null;
                  const membership = countryClusterMembership.get(c);
                  const fillColor = membership?.color ?? brand;
                  return (
                    <g key={c} transform={`translate(${pos.x},${pos.y})`}>
                      <circle r={5} fill={fillColor} stroke="#fff" strokeWidth={1.5} />
                      <text
                        x={8}
                        y={4}
                        fontSize={12}
                        fill="#111827"
                        stroke="#ffffff"
                        strokeWidth={0.6}
                      >
                        {c.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <aside className="flex max-h-[65vh] sm:max-h-[70vh] lg:max-h-[78vh] xl:max-h-[82vh] flex-col rounded-2xl border border-gray-200 bg-white/85 p-4 shadow-inner lg:w-80 xl:w-96 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                Categorieën
              </h3>
              <span className="text-xs text-gray-500">{selectedMetrics.length} actief</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Schakel datasets per categorie en stel het gewicht af. Klik op het info-icoon voor een korte toelichting.
            </p>
            <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1 sm:pr-2">
              {METRIC_CATEGORIES.map((category) => {
                const metrics = category.metrics.filter((metricId) => METRIC_INFO[metricId]);
                const activeCount = metrics.filter((metricId) => selectedMetrics.includes(metricId)).length;
                const normalizedWeight = normalizedCategoryWeights.get(category.id) ?? 0;
                const rawWeight = categoryRawWeights[category.id] ?? 0;
                const totalMetrics = metrics.length;
                const activeSummary = totalMetrics > 0 ? `${activeCount}/${totalMetrics}` : '0';
                return (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{category.label}</p>
                        {category.description ? (
                          <p className="mt-1 text-xs text-gray-500">{category.description}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">Gewicht</span>
                        <p className="text-sm font-semibold text-gray-700">{normalizedWeight.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Slider
                        value={[rawWeight]}
                        min={0}
                        max={2}
                        step={0.05}
                        onValueChange={(value) => handleCategoryWeightChange(category.id, value[0] ?? 0)}
                      />
                      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-400">
                        <span>Ruw: {rawWeight.toFixed(2)}</span>
                        <span>{activeSummary} actief</span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {metrics.map((metricId) => {
                        const meta = METRIC_INFO[metricId];
                        if (!meta) return null;
                        const selected = selectedMetrics.includes(metricId);
                        return (
                          <div key={metricId} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleMetricToggle(metricId)}
                              onDoubleClick={(event) => {
                                event.preventDefault();
                                handleMetricDoubleClick(metricId);
                              }}
                              className={`flex-1 rounded-xl border px-3 py-2 text-left text-sm transition ${
                                selected
                                  ? 'border-transparent bg-[rgb(0,153,168)]/90 text-white shadow'
                                  : 'border border-gray-200/80 bg-white text-gray-700 hover:border-[rgba(0,153,168,0.35)] hover:text-[rgb(0,153,168)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">{meta.label}</span>
                                <span
                                  className={`inline-flex h-2.5 w-2.5 rounded-full transition ${
                                    selected ? 'bg-white/90' : 'bg-[rgba(0,153,168,0.35)]'
                                  }`}
                                />
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenMetricInfo(metricId);
                              }}
                              className="rounded-full border border-gray-200 bg-white/90 p-2 text-gray-500 transition hover:border-[rgba(0,153,168,0.4)] hover:text-[rgb(0,153,168)]"
                              aria-label={`Meer info over ${meta.label}`}
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        <div className="shrink-0 text-xs text-gray-500">
          Lijnen worden dikker en minder transparant naarmate de genormaliseerde verbinding sterker is.
          Voor elke dataset zetten we de ruwe waarden om naar een quantielscore (0–1) en middelen we de
          scores voor elk landenpaar. De cutoff legt de lat hoger voor zwakkere relaties.
        </div>
      </div>
      <Dialog
        open={infoDialogOpen}
        onOpenChange={(open) => {
          setInfoDialogOpen(open);
          if (!open) {
            setInfoMetricId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-md">
          {infoMetadata ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-gray-900">{infoMetadata.label}</DialogTitle>
                <DialogDescription className="text-sm text-gray-600">
                  {infoMetadata.description}
                </DialogDescription>
              </DialogHeader>
              {infoMetadata.source ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white/90 px-4 py-3 text-sm">
                  <span className="font-medium text-gray-600">Bron</span>
                  <a
                    href={infoMetadata.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[rgb(0,153,168)] hover:underline"
                  >
                    {infoMetadata.source.label}
                  </a>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <div
        ref={hiddenContainerRef}
        style={{ position: 'absolute', left: -10000, top: -10000, width: mapWidth, height: mapHeight, opacity: 0, pointerEvents: 'none' }}
        aria-hidden
      />
    </Card>
  );
}
