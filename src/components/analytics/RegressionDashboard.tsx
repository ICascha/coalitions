import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { METRIC_METADATA } from '@/components/music/EuropeConnections';

const TARGETS_AVERAGE_KEY = '__targets_average__';
const TARGETS_AVERAGE_LABEL = 'Targets (Average)';
const LOG_TRANSFORM_DATASETS = new Set(['dist_cepii', 'dist_cpii']);
const DATASET_LABEL_OVERRIDES: Record<string, string> = {
  dist_cepii: 'Dist CEPII (log)',
  dist_cpii: 'Dist CEPII (log)',
};

type RegressionDatasetsResponse = {
  targets: string[];
  features: string[];
  controls: string[];
  defaults?: Partial<Record<'targets' | 'features' | 'controls', string[]>>;
  all?: string[];
};

type RegressionCoefficient = {
  name: string;
  coef: number;
  std_err: number;
  t: number;
  p_value: number;
  ci_low: number;
  ci_high: number;
};

type RegressionSummary = {
  n_obs: number;
  r_squared: number | null;
  adj_r_squared: number | null;
  aic: number | null;
  bic: number | null;
  log_likelihood: number | null;
  df_model: number | null;
  df_resid: number | null;
  coefficients: RegressionCoefficient[];
};

type RegressionResponse = {
  formula: string;
  target_files: string[];
  feature_files: string[];
  control_files: string[];
  merged_rows: number | null;
  summary: RegressionSummary;
  data?: Array<Record<string, unknown>>;
};

type ScatterVariable = {
  name: string;
  label: string;
};

type DatasetOption = {
  id: string;
  label: string;
};

type DatasetState =
  | { status: 'loading' }
  | {
      status: 'ready';
      raw: Map<string, number>;
      quantiles: Map<string, number>;
      pairs: Map<string, { country1: string; country2: string }>;
    }
  | { status: 'error'; error: string };

type RawEntry = { country1: string; country2: string; metric: number };

const PAIR_KEY_SEPARATOR = '__';

const normalizeCode = (code: string) => code.trim().toLowerCase();

const makePairKey = (a: string, b: string) => {
  const [first, second] = [normalizeCode(a), normalizeCode(b)].sort();
  return `${first}${PAIR_KEY_SEPARATOR}${second}`;
};

const stripJsonExtension = (value: string) => value.replace(/\.json$/i, '');

const normalizeDatasetId = (value: string) => {
  const normalized = stripJsonExtension(value).trim().toLowerCase();
  if (normalized === 'dist_cpii') {
    return 'dist_cepii';
  }
  return normalized;
};

const METRIC_LABEL_LOOKUP = METRIC_METADATA.reduce<Record<string, string>>((acc, meta) => {
  const key = normalizeDatasetId(meta.id);
  acc[key] = meta.label;
  return acc;
}, {});

const computeQuantileMap = (
  entries: Array<{ key: string; value: number }>
): Map<string, number> => {
  const quantiles = new Map<string, number>();
  const n = entries.length;
  if (n === 0) {
    return quantiles;
  }

  const sorted = [...entries].sort((a, b) => a.value - b.value);
  let index = 0;

  while (index < n) {
    const start = index;
    const currentValue = sorted[index].value;
    while (index < n && sorted[index].value === currentValue) {
      index += 1;
    }
    const end = index - 1;
    const averageRank = (start + end) / 2 + 1; // 1-based average rank
    const quantile =
      n > 1 ? (averageRank - 1) / (n - 1) : 0.5;
    for (let pointer = start; pointer <= end; pointer += 1) {
      quantiles.set(sorted[pointer].key, quantile);
    }
  }

  return quantiles;
};

const rawRegressionBase =
  (import.meta.env.VITE_REGRESSION_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_CLUSTER_API_BASE_URL as string | undefined) ??
  '';
const resolvedRegressionBase =
  rawRegressionBase && rawRegressionBase.trim().length > 0
    ? rawRegressionBase.trim()
    : import.meta.env.PROD
      ? 'https://backendclustering-production.up.railway.app'
      : '';
const regressionApiBase = resolvedRegressionBase.replace(/\/+$/, '');
const regressionDatasetsEndpoint = regressionApiBase
  ? `${regressionApiBase}/regression/datasets`
  : '/regression/datasets';
const regressionRunEndpoint = regressionApiBase
  ? `${regressionApiBase}/regression`
  : '/regression';

const formatLabel = (id: string) => {
  const normalized = normalizeDatasetId(id);
  if (normalized === normalizeDatasetId(TARGETS_AVERAGE_KEY)) {
    return TARGETS_AVERAGE_LABEL;
  }
  const override = DATASET_LABEL_OVERRIDES[normalized];
  if (override) {
    return override;
  }
  const metaLabel = METRIC_LABEL_LOOKUP[normalized];
  if (metaLabel) {
    return metaLabel;
  }
  return id
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const METRIC_OPTIONS: DatasetOption[] = METRIC_METADATA.map((meta) => {
  const id = normalizeDatasetId(meta.id);
  return {
    id,
    label: meta.label,
  };
});

const CONTROL_OPTIONS: DatasetOption[] = [
  {
    id: normalizeDatasetId('dist_cepii'),
    label: formatLabel('dist_cepii'),
  },
];

const isFixedEffectCoefficient = (name: string) => {
  if (!name) return false;
  return (
    name.startsWith('fe_country_') ||
    name.startsWith('C(country')
  );
};

const formatCoefficientName = (name: string) => {
  if (!name) {
    return '';
  }
  if (name.startsWith('fe_country_')) {
    const iso = name.slice('fe_country_'.length).toUpperCase();
    return `FE Country ${iso}`;
  }
  const legacyMatch = name.match(/^C\(country\d\)\[(.+)\]$/);
  if (legacyMatch) {
    return `FE Country ${legacyMatch[1].toUpperCase()}`;
  }
  return name;
};

const formatNumber = (value: number | null, digits = 2) => {
  if (value === null || Number.isNaN(value)) {
    return '–';
  }
  return value.toFixed(digits);
};

const computePearson = (x: number[], y: number[]) => {
  if (x.length !== y.length || x.length === 0) {
    return null;
  }

  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const meanX = mean(x);
  const meanY = mean(y);

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  if (denomX === 0 || denomY === 0) {
    return null;
  }

  return numerator / Math.sqrt(denomX * denomY);
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const sanitizeSelection = (options: DatasetOption[], selected: string[]) => {
  const normalizedSelected = new Set(selected.map(normalizeDatasetId));
  return options
    .map((option) => option.id)
    .filter((id) => normalizedSelected.has(id));
};

const initialSelection = (
  options: DatasetOption[],
  defaults: string[] | undefined,
  fallbackToFirst = true
) => {
  const sanitizedDefaults = defaults && defaults.length > 0
    ? sanitizeSelection(options, defaults)
    : [];
  if (sanitizedDefaults.length > 0) {
    return sanitizedDefaults;
  }
  if (!fallbackToFirst) {
    return [];
  }
  return options.length ? [options[0].id] : [];
};

export default function RegressionDashboard() {
  const basePath = import.meta.env.BASE_URL;
  const mountedRef = useRef(false);
  const [, setDatasets] = useState<RegressionDatasetsResponse | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);

  const [includeData, setIncludeData] = useState(true);
  const [maxRows, setMaxRows] = useState(500);

  const [regressionResult, setRegressionResult] = useState<RegressionResponse | null>(null);
  const [regressionError, setRegressionError] = useState<string | null>(null);
  const [regressionLoading, setRegressionLoading] = useState(false);

  const [xVariable, setXVariable] = useState<string | null>(null);
  const [yVariable, setYVariable] = useState<string | null>(null);
  const [useQuantileX, setUseQuantileX] = useState(true);
  const [useQuantileY, setUseQuantileY] = useState(true);
  const [datasetStates, setDatasetStates] = useState<Record<string, DatasetState>>({});
  const datasetStatesRef = useRef<Record<string, DatasetState>>({});
  const defaultTargetsRef = useRef<string[]>([]);
  const defaultFeaturesRef = useRef<string[]>([]);
  const defaultControlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadDatasets = async () => {
      setDatasetLoading(true);
      setDatasetError(null);

      try {
        const res = await fetch(regressionDatasetsEndpoint, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Kon datasets niet ophalen (status ${res.status}).`);
        }
        const payload = (await res.json()) as RegressionDatasetsResponse;
        if (!cancelled) {
          setDatasets(payload);
          const defaultTargets = initialSelection(METRIC_OPTIONS, payload.defaults?.targets);
          let defaultFeatures = initialSelection(METRIC_OPTIONS, payload.defaults?.features)
            .filter((id) => !defaultTargets.includes(id));
          if (defaultFeatures.length === 0) {
            const fallbackFeature = METRIC_OPTIONS.find((option) => !defaultTargets.includes(option.id));
            if (fallbackFeature) {
              defaultFeatures = [fallbackFeature.id];
            }
          }
          const defaultControls = initialSelection(CONTROL_OPTIONS, payload.defaults?.controls, false);
          defaultTargetsRef.current = defaultTargets;
          defaultFeaturesRef.current = defaultFeatures;
          defaultControlsRef.current = defaultControls;

          if (!mountedRef.current) {
            setSelectedTargets(defaultTargets);
            setSelectedFeatures(defaultFeatures);
            setSelectedControls(defaultControls);
          } else {
            let nextTargets: string[] = [];
            setSelectedTargets((current) => {
              const sanitized = sanitizeSelection(METRIC_OPTIONS, current);
              nextTargets = sanitized;
              return sanitized;
            });
            setSelectedFeatures((current) => {
              const sanitized = sanitizeSelection(METRIC_OPTIONS, current);
              return sanitized.filter((id) => !nextTargets.includes(id));
            });
            setSelectedControls((current) =>
              sanitizeSelection(CONTROL_OPTIONS, current)
            );
          }
        }
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : 'Onbekende fout bij ophalen datasets.';
        setDatasetError(message);
        setDatasets(null);
      } finally {
        if (!cancelled) {
          setDatasetLoading(false);
          mountedRef.current = true;
        }
      }
    };

    loadDatasets();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  const handleResetSelections = () => {
    setSelectedTargets(defaultTargetsRef.current);
    setSelectedFeatures(
      defaultFeaturesRef.current.filter((id) => !defaultTargetsRef.current.includes(id))
    );
    setSelectedControls(defaultControlsRef.current);
  };

  const handleTargetsChange = (values: string[]) => {
    const sanitizedTargets = sanitizeSelection(METRIC_OPTIONS, values);
    setSelectedTargets(sanitizedTargets);
    setSelectedFeatures((current) => {
      const filtered = current.filter((id) => !sanitizedTargets.includes(id));
      return sanitizeSelection(METRIC_OPTIONS, filtered);
    });
  };

  const handleFeaturesChange = (values: string[]) => {
    const sanitizedFeatures = sanitizeSelection(METRIC_OPTIONS, values);
    setSelectedFeatures(sanitizedFeatures);
    setSelectedTargets((current) => {
      const filtered = current.filter((id) => !sanitizedFeatures.includes(id));
      return sanitizeSelection(METRIC_OPTIONS, filtered);
    });
  };

  const handleControlsChange = (values: string[]) => {
    const sanitizedControls = sanitizeSelection(CONTROL_OPTIONS, values);
    setSelectedControls(sanitizedControls);
  };

  useEffect(() => {
    datasetStatesRef.current = datasetStates;
  }, [datasetStates]);

  const canRunRegression =
    selectedTargets.length > 0 &&
    selectedFeatures.length > 0 &&
    !regressionLoading;

  const runRegression = async () => {
    if (!canRunRegression) return;

    setRegressionLoading(true);
    setRegressionError(null);

    const body: Record<string, unknown> = {
      include_data: includeData,
    };

    if (selectedTargets.length > 0) {
      body.target_files = selectedTargets;
    }
    if (selectedFeatures.length > 0) {
      body.feature_files = selectedFeatures;
    }
    if (selectedControls.length > 0) {
      body.control_files = selectedControls;
    }
    if (includeData) {
      body.max_rows = maxRows;
    }

    try {
      const res = await fetch(regressionRunEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Kon regressie niet uitvoeren (status ${res.status}).`);
      }

      const payload = (await res.json()) as RegressionResponse;
      setRegressionResult(payload);
      setRegressionError(null);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Onbekende fout bij regressie.';
      setRegressionError(message);
      setRegressionResult(null);
    } finally {
      setRegressionLoading(false);
    }
  };

  const scatterVariables = useMemo(() => {
    const names = new Set<string>();
    selectedTargets.forEach((name) => {
      if (name) names.add(name);
    });
    selectedFeatures.forEach((name) => {
      if (name) names.add(name);
    });
    selectedControls.forEach((name) => {
      if (name) names.add(name);
    });
    const baseVariables = Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        label: formatLabel(name),
      }));
    if (selectedTargets.length > 0) {
      baseVariables.push({
        name: TARGETS_AVERAGE_KEY,
        label: TARGETS_AVERAGE_LABEL,
      });
    }
    return baseVariables;
  }, [selectedTargets, selectedFeatures, selectedControls]);

  useEffect(() => {
    if (!scatterVariables.length) {
      setXVariable(null);
      setYVariable(null);
      return;
    }
    setXVariable((current) => {
      if (current && scatterVariables.some((variable) => variable.name === current)) {
        return current;
      }
      return scatterVariables[0]?.name ?? null;
    });
    setYVariable((current) => {
      if (current && scatterVariables.some((variable) => variable.name === current)) {
        return current;
      }
      if (scatterVariables.length > 1) {
        return scatterVariables[1].name;
      }
      return scatterVariables[0]?.name ?? null;
    });
  }, [scatterVariables]);

  useEffect(() => {
    setUseQuantileX(true);
  }, [xVariable]);

  useEffect(() => {
    setUseQuantileY(true);
  }, [yVariable]);

  useEffect(() => {
    if (!includeData) {
      return;
    }

    const controllers: AbortController[] = [];

    scatterVariables.forEach(({ name: datasetName }) => {
      if (!datasetName) return;
      if (datasetName === TARGETS_AVERAGE_KEY) return;
      const currentState = datasetStatesRef.current[datasetName];
      if (currentState && (currentState.status === 'loading' || currentState.status === 'ready')) {
        return;
      }

      const controller = new AbortController();
      controllers.push(controller);

      setDatasetStates((prev) => ({
        ...prev,
        [datasetName]: { status: 'loading' },
      }));

      const normalizedDatasetName = datasetName.toLowerCase();
      const shouldLogTransform = LOG_TRANSFORM_DATASETS.has(normalizedDatasetName);

      const fileName = datasetName.endsWith('.json')
        ? datasetName
        : `${datasetName}.json`;

      fetch(`${basePath}${fileName}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) {
            throw new Error(
              `Kon dataset ${datasetName} niet laden (status ${res.status}).`
            );
          }
          return res.json() as Promise<RawEntry[]>;
        })
        .then((entries) => {
          const raw = new Map<string, number>();
          const pairs = new Map<string, { country1: string; country2: string }>();

          entries.forEach(({ country1, country2, metric }) => {
            if (
              typeof country1 !== 'string' ||
              typeof country2 !== 'string' ||
              !isFiniteNumber(metric)
            ) {
              return;
            }
            let value = metric;
            if (shouldLogTransform) {
              if (metric <= 0) {
                return;
              }
              value = Math.log(metric);
            }
            const key = makePairKey(country1, country2);
            raw.set(key, value);
            const [first, second] = key.split(PAIR_KEY_SEPARATOR);
            pairs.set(key, {
              country1: first.toUpperCase(),
              country2: second.toUpperCase(),
            });
          });

          const quantiles = computeQuantileMap(
            Array.from(raw.entries()).map(([key, value]) => ({ key, value }))
          );

          console.debug('[RegressionDashboard] loaded scatter dataset', datasetName, {
            entries: entries.length,
            sample: entries.slice(0, 2),
          });

          setDatasetStates((prev) => ({
            ...prev,
            [datasetName]: { status: 'ready', raw, quantiles, pairs },
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : `Onbekende fout bij laden van ${datasetName}.`;
          console.debug('[RegressionDashboard] failed to load dataset', datasetName, message);
          setDatasetStates((prev) => ({
            ...prev,
            [datasetName]: { status: 'error', error: message },
          }));
        });
    });

    return () => {
      controllers.forEach((controller) => controller.abort());
    };
  }, [includeData, basePath, scatterVariables]);

  const aggregatedTargetsState = useMemo<DatasetState | undefined>(() => {
    if (selectedTargets.length === 0) {
      return undefined;
    }

    const states = selectedTargets.map((name) => datasetStates[name]);

    const errorState = states.find(
      (state): state is Extract<DatasetState, { status: 'error' }> =>
        state?.status === 'error'
    );
    if (errorState) {
      return { status: 'error', error: errorState.error };
    }

    const loading = states.some((state) => !state || state.status === 'loading');
    if (loading) {
      return { status: 'loading' };
    }

    const readyStates = states.filter(
      (state): state is Extract<DatasetState, { status: 'ready' }> =>
        state?.status === 'ready'
    );

    if (!readyStates.length) {
      return { status: 'loading' };
    }

    const baseState = readyStates[0];
    const overlappingKeys = Array.from(baseState.raw.keys()).filter((key) =>
      readyStates.every((state) => state.raw.has(key))
    );

    const raw = new Map<string, number>();
    const pairs = new Map<string, { country1: string; country2: string }>();

    overlappingKeys.forEach((key) => {
      const sum = readyStates.reduce((total, state) => {
        const value = state.raw.get(key);
        return total + (typeof value === 'number' ? value : 0);
      }, 0);
      raw.set(key, sum / readyStates.length);
      const pair =
        readyStates.find((state) => state.pairs.has(key))?.pairs.get(key) ?? null;
      if (pair) {
        pairs.set(key, pair);
      } else {
        const [first, second] = key.split(PAIR_KEY_SEPARATOR);
        pairs.set(key, {
          country1: first.toUpperCase(),
          country2: second.toUpperCase(),
        });
      }
    });

    const quantiles = computeQuantileMap(
      Array.from(raw.entries()).map(([key, value]) => ({ key, value }))
    );

    return {
      status: 'ready',
      raw,
      quantiles,
      pairs,
    };
  }, [datasetStates, selectedTargets]);

  useEffect(() => {
    if (!xVariable) return;
    const state =
      xVariable === TARGETS_AVERAGE_KEY
        ? aggregatedTargetsState
        : datasetStates[xVariable];
    if (state?.status !== 'ready') return;
    if (state.quantiles.size === 0 && useQuantileX) {
      setUseQuantileX(false);
    }
  }, [datasetStates, aggregatedTargetsState, xVariable, useQuantileX]);

  useEffect(() => {
    if (!yVariable) return;
    const state =
      yVariable === TARGETS_AVERAGE_KEY
        ? aggregatedTargetsState
        : datasetStates[yVariable];
    if (state?.status !== 'ready') return;
    if (state.quantiles.size === 0 && useQuantileY) {
      setUseQuantileY(false);
    }
  }, [datasetStates, aggregatedTargetsState, yVariable, useQuantileY]);

  const stateForX =
    xVariable === TARGETS_AVERAGE_KEY
      ? aggregatedTargetsState
      : xVariable
        ? datasetStates[xVariable]
        : undefined;
  const stateForY =
    yVariable === TARGETS_AVERAGE_KEY
      ? aggregatedTargetsState
      : yVariable
        ? datasetStates[yVariable]
        : undefined;

  const scatterData = useMemo(() => {
    if (
      !includeData ||
      !xVariable ||
      !yVariable
    ) {
      return null;
    }

    const stateX = stateForX;
    const stateY = stateForY;

    if (stateX?.status !== 'ready' || stateY?.status !== 'ready') {
      return null;
    }

    const sourceX =
      useQuantileX && stateX.quantiles.size > 0 ? stateX.quantiles : stateX.raw;
    const sourceY =
      useQuantileY && stateY.quantiles.size > 0 ? stateY.quantiles : stateY.raw;

    if (sourceX.size === 0 || sourceY.size === 0) {
      return null;
    }

    const iterateKeys =
      sourceX.size <= sourceY.size ? sourceX.keys() : sourceY.keys();

    const points: Array<{ x: number; y: number; id?: string }> = [];

    for (const key of iterateKeys) {
      if (!sourceX.has(key) || !sourceY.has(key)) continue;
      const xValue = sourceX.get(key);
      const yValue = sourceY.get(key);
      if (!isFiniteNumber(xValue) || !isFiniteNumber(yValue)) continue;
      const pair =
        stateX.pairs.get(key) ??
        stateY.pairs.get(key);
      const label = pair
        ? `${pair.country1.toUpperCase()}—${pair.country2.toUpperCase()}`
        : undefined;
      points.push({
        x: xValue as number,
        y: yValue as number,
        id: label,
      });
      if (points.length >= maxRows) {
        break;
      }
    }

    if (!points.length) {
      return null;
    }

    return {
      series: [
        {
          id: `${formatLabel(xVariable)} vs ${formatLabel(yVariable)}`,
          data: points.map((point) => ({
            x: point.x,
            y: point.y,
            label: point.id,
          })),
        },
      ],
      pearson: computePearson(
        points.map((point) => point.x),
        points.map((point) => point.y)
      ),
    };
  }, [
    includeData,
    stateForX,
    stateForY,
    xVariable,
    yVariable,
    useQuantileX,
    useQuantileY,
    maxRows,
  ]);

  const residualPoints = useMemo(() => {
    if (!includeData || !regressionResult?.data) {
      return null;
    }

    const points: Array<{ predicted: number; residual: number; label?: string }> = [];

    for (const row of regressionResult.data) {
      const predictedRaw = row['predicted'];
      const residualRaw = row['residual'];
      if (!isFiniteNumber(predictedRaw) || !isFiniteNumber(residualRaw)) {
        continue;
      }
      const actualValue = predictedRaw + residualRaw;
      const predicted = Math.min(Math.max(predictedRaw, 0), 1);
      const residual = actualValue - predicted;

      const country1 = typeof row['country1'] === 'string' ? row['country1'] : null;
      const country2 = typeof row['country2'] === 'string' ? row['country2'] : null;

      const label =
        country1 && country2 ? `${country1.toUpperCase()}—${country2.toUpperCase()}` : undefined;

      points.push({
        predicted,
        residual,
        label,
      });

      if (points.length >= maxRows) {
        break;
      }
    }

    if (!points.length) {
      return null;
    }

    return points;
  }, [includeData, regressionResult?.data, maxRows]);

  const nonFixedEffectsCoefficients = useMemo(() => {
    if (!regressionResult?.summary.coefficients) return [];
    return regressionResult.summary.coefficients.filter(
      (coef) => !isFixedEffectCoefficient(coef.name)
    );
  }, [regressionResult?.summary.coefficients]);

  const fixedEffectsCoefficients = useMemo(() => {
    if (!regressionResult?.summary.coefficients) return [];
    return regressionResult.summary.coefficients
      .filter((coef) => isFixedEffectCoefficient(coef.name))
      .sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));
  }, [regressionResult?.summary.coefficients]);

  return (
    <Card className="flex h-full flex-col gap-5 border border-gray-200/70 bg-white/95 p-5 shadow-md md:p-6">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-gray-800">
            Stel je regressie samen
          </h3>
          <p className="text-sm text-gray-600">
            Kies een doelvariabele, drivers en eventuele controles. De backend voegt
            automatisch land-based fixed effecten toe.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 shadow-sm">
          <p className="font-semibold text-gray-800">Het model</p>
          <p className="font-mono text-xs text-gray-600">
            y<sub>ij</sub> = &alpha; + &Sigma;<sub>k</sub> &beta;<sub>k</sub> x<sub>k,ij</sub> + &gamma;<sub>i</sub> + &gamma;<sub>j</sub> + &epsilon;<sub>ij</sub>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            x<sub>k,ij</sub> zijn de geselecteerde indicatoren voor een landpaar (onafhankelijk van volgorde); &gamma;<sub>i</sub> en &gamma;<sub>j</sub> vangen land-specifieke effecten voor beide landen in het paar.
          </p>
        </div>

        {datasetLoading ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-gray-300 bg-white/85 px-3.5 py-2.5 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-[rgb(0,153,168)]" />
            Beschikbare datasets worden geladen…
          </div>
        ) : datasetError ? (
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{datasetError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                mountedRef.current = false;
                setDatasets(null);
                setDatasetError(null);
                setDatasetLoading(true);
                setReloadKey((value) => value + 1);
              }}
            >
              <RefreshCcw className="h-4 w-4" />
              Opnieuw
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <DatasetChecklist
                label="Targets"
                description="Afhankelijke variabele(n)"
                options={METRIC_OPTIONS}
                selected={selectedTargets}
                defaults={defaultTargetsRef.current}
                onChange={handleTargetsChange}
              />
              <DatasetChecklist
                label="Drivers"
                description="Verklarende features"
                options={METRIC_OPTIONS}
                selected={selectedFeatures}
                defaults={defaultFeaturesRef.current}
                onChange={handleFeaturesChange}
              />
              <DatasetChecklist
                label="Controles"
                description="Optionele controls"
                options={CONTROL_OPTIONS}
                selected={selectedControls}
                defaults={defaultControlsRef.current}
                onChange={handleControlsChange}
              />
            </div>
            <div className="flex flex-col gap-2.5 rounded-lg border border-gray-200/80 bg-white/90 px-3.5 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[rgb(0,153,168)]"
                    checked={includeData}
                    onChange={(event) => setIncludeData(event.target.checked)}
                  />
                  Monsters toevoegen voor scatterplots
                </label>
                <label className="flex items-center gap-2">
                  Max. observaties:
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={maxRows}
                    className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[rgb(0,153,168)] focus:outline-none"
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(value)) return;
                      setMaxRows(Math.max(50, Math.min(5000, value)));
                    }}
                    disabled={!includeData}
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetSelections}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reset naar defaults
                </Button>
                <Button
                  type="button"
                  onClick={runRegression}
                  disabled={!canRunRegression}
                >
                  {regressionLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Regressie draaien…
                    </>
                  ) : (
                    'Regressie draaien'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {regressionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {regressionError}
        </div>
      )}

      {regressionResult && (
        <div className="space-y-5">
          <RegressionSummaryCard result={regressionResult} />
          <CoefficientsSection
            coefficients={nonFixedEffectsCoefficients}
            title="Belangrijkste schattingen"
            description="Klassieke output van de vaste-effecten regressie, exclusief landdummies."
          />
          {fixedEffectsCoefficients.length > 0 && (
            <CoefficientsSection
              coefficients={fixedEffectsCoefficients}
              title="Land-specifieke effecten"
              description="Dummy-coëfficiënten voor land-based fixed effects."
              collapsed
            />
          )}
          {includeData && scatterVariables.length >= 1 && (
            <ScatterSection
              variables={scatterVariables}
              scatter={scatterData}
              xSelection={xVariable}
              ySelection={yVariable}
              onChangeX={setXVariable}
              onChangeY={setYVariable}
              useQuantileX={useQuantileX}
              useQuantileY={useQuantileY}
              onToggleQuantileX={setUseQuantileX}
              onToggleQuantileY={setUseQuantileY}
              stateX={stateForX}
              stateY={stateForY}
            />
          )}
          {includeData && residualPoints && (
            <ResidualSection points={residualPoints} />
          )}
        </div>
      )}
    </Card>
  );
}

type DatasetChecklistProps = {
  label: string;
  description: string;
  options: DatasetOption[];
  selected: string[];
  defaults: string[];
  onChange: (values: string[]) => void;
};

function DatasetChecklist({
  label,
  description,
  options,
  selected,
  defaults,
  onChange,
}: DatasetChecklistProps) {
  const optionIds = options.map((option) => option.id);
  const allSelected = options.length > 0 && selected.length === options.length;

  const toggleValue = (value: string) => {
    const normalizedValue = normalizeDatasetId(value);
    const selectedSet = new Set(selected);
    if (selectedSet.has(normalizedValue)) {
      selectedSet.delete(normalizedValue);
    } else {
      selectedSet.add(normalizedValue);
    }
    const ordered = optionIds.filter((id) => selectedSet.has(id));
    onChange(ordered);
  };

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(optionIds);
    }
  };

  const selectedSet = new Set(selected.map(normalizeDatasetId));
  const defaultSet = new Set(defaults.map(normalizeDatasetId));

  const prioritizedOptions = options
    .map((option, index) => {
      let priority = 2;
      if (selectedSet.has(option.id)) {
        priority = 0;
      } else if (defaultSet.has(option.id)) {
        priority = 1;
      }
      return { option, index, priority };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.option);

  return (
    <div className="rounded-lg border border-gray-200/80 bg-white/90 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          <span className="text-xs text-gray-500">{description}</span>
        </div>
        {options.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-[rgb(0,153,168)] hover:text-[rgb(0,153,168)]"
            onClick={handleSelectAll}
          >
            {allSelected ? 'Deselecteer alles' : 'Selecteer alles'}
          </Button>
        )}
      </div>
      <div className="mt-2.5 flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1.5">
        {prioritizedOptions.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors hover:border-gray-200 hover:bg-gray-100"
            >
              <span className="text-gray-700">{option.label}</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(0,153,168)]"
                checked={checked}
                onChange={() => toggleValue(option.id)}
              />
            </label>
          );
        })}
        {options.length === 0 && (
          <p className="text-xs italic text-gray-400">Geen opties beschikbaar</p>
        )}
      </div>
    </div>
  );
}

type RegressionSummaryCardProps = {
  result: RegressionResponse;
};

function RegressionSummaryCard({ result }: RegressionSummaryCardProps) {
  const stats = [
    { label: 'Observaties', value: result.summary.n_obs, digits: 0 },
    { label: 'Aangepast R²', value: result.summary.adj_r_squared, digits: 3 },
  ];

  return (
    <div className="rounded-lg border border-gray-200/80 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-gray-800">Regressiesamenvatting</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-md border border-gray-200 bg-white px-3 py-3 text-center"
            >
              <div className="text-xs uppercase tracking-wide text-gray-500">{stat.label}</div>
              <div className="text-xl font-semibold text-gray-800">
                {formatNumber(typeof stat.value === 'number' ? stat.value : null, stat.digits)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type CoefficientsSectionProps = {
  title: string;
  description: string;
  coefficients: RegressionCoefficient[];
  collapsed?: boolean;
};

function CoefficientsSection({
  title,
  description,
  coefficients,
  collapsed = false,
}: CoefficientsSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  if (coefficients.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200/80 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="text-base font-semibold text-gray-800">{title}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsCollapsed((prev) => !prev)}
        >
          {isCollapsed ? 'Toon waarden' : 'Verberg'}
        </Button>
      </div>
      {!isCollapsed && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Coef.</TableHead>
                <TableHead>Std. fout</TableHead>
                <TableHead>p-waarde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coefficients.map((coef) => (
                <TableRow key={coef.name}>
                  <TableCell className="font-medium text-gray-800">
                    {formatCoefficientName(coef.name)}
                  </TableCell>
                  <TableCell>{formatNumber(coef.coef, 3)}</TableCell>
                  <TableCell>{formatNumber(coef.std_err, 3)}</TableCell>
                  <TableCell>{formatNumber(coef.p_value, 4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type ScatterSectionProps = {
  variables: ScatterVariable[];
  scatter: {
    series: Array<{ id: string; data: Array<{ x: number; y: number; label?: string }> }>;
    pearson: number | null;
  } | null;
  xSelection: string | null;
  ySelection: string | null;
  onChangeX: (base: string | null) => void;
  onChangeY: (base: string | null) => void;
  useQuantileX: boolean;
  useQuantileY: boolean;
  onToggleQuantileX: (value: boolean) => void;
  onToggleQuantileY: (value: boolean) => void;
  stateX: DatasetState | undefined;
  stateY: DatasetState | undefined;
};

function ScatterSection({
  variables,
  scatter,
  xSelection,
  ySelection,
  onChangeX,
  onChangeY,
  useQuantileX,
  useQuantileY,
  onToggleQuantileX,
  onToggleQuantileY,
  stateX,
  stateY,
}: ScatterSectionProps) {
  if (!variables.length) {
    return null;
  }

  const xReadyState = stateX?.status === 'ready' ? stateX : undefined;
  const yReadyState = stateY?.status === 'ready' ? stateY : undefined;
  const xReady = Boolean(xReadyState);
  const yReady = Boolean(yReadyState);
  const loading = stateX?.status === 'loading' || stateY?.status === 'loading';
  const errorMessage =
    stateX?.status === 'error'
      ? stateX.error
      : stateY?.status === 'error'
        ? stateY.error
        : null;

  const quantileAvailableX =
    xReadyState ? xReadyState.quantiles.size > 0 : false;
  const quantileAvailableY =
    yReadyState ? yReadyState.quantiles.size > 0 : false;

  const quantileToggleDisabledX = !quantileAvailableX;
  const quantileToggleDisabledY = !quantileAvailableY;

  let statusMessage: string | null = null;
  let statusClassNames = 'text-xs text-gray-500 italic';

  if (errorMessage) {
    statusMessage = `Kon datasets niet laden: ${errorMessage}`;
    statusClassNames = 'text-xs text-red-500';
  } else if (loading) {
    statusMessage = 'Datasets voor de scatterplot worden geladen…';
    statusClassNames = 'text-xs text-gray-500';
  } else if (!xSelection || !ySelection) {
    statusMessage = 'Kies twee variabelen om te vergelijken.';
  } else if (!xReady || !yReady) {
    statusMessage = 'Wacht tot beide datasets geladen zijn om het plot te zien.';
  } else if (!scatter || scatter.series.every((serie) => serie.data.length === 0)) {
    statusMessage = 'Geen overlappende observaties gevonden voor deze combinatie.';
  }

  const chartData = scatter?.series ?? [
    { id: 'placeholder', data: [] as Array<{ x: number; y: number; label?: string }> },
  ];

  const pearsonLabel = `X: ${useQuantileX ? 'quantile' : 'ruwe'}, Y: ${
    useQuantileY ? 'quantile' : 'ruwe'
  }`;

  const labelForSelection = (selection: string | null) => {
    if (!selection) return '';
    return (
      variables.find((variable) => variable.name === selection)?.label ??
      formatLabel(selection)
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200/80 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h4 className="text-base font-semibold text-gray-800">
          Scatterplot van geselecteerde variabelen
        </h4>
        <p className="text-sm text-gray-600">
          Vergelijk twee indicatoren rechtstreeks. Gebruik de quantile-schaal per as om ranges te normaliseren.
        </p>
        {statusMessage && <p className={statusClassNames}>{statusMessage}</p>}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-2.5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <ColumnSelector
              id="scatter-x"
              label="X-as"
              selection={xSelection}
              options={variables}
              onChange={onChangeX}
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(0,153,168)]"
                checked={useQuantileX && quantileAvailableX}
                disabled={quantileToggleDisabledX || !xSelection}
                onChange={(event) => onToggleQuantileX(event.target.checked)}
              />
              Quantile-normalisatie voor X
              {!quantileAvailableX && xReady && (
                <span className="text-xs italic text-gray-400">
                  Geen quantile-data beschikbaar; ruwe waarden worden gebruikt.
                </span>
              )}
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <ColumnSelector
              id="scatter-y"
              label="Y-as"
              selection={ySelection}
              options={variables}
              onChange={onChangeY}
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(0,153,168)]"
                checked={useQuantileY && quantileAvailableY}
                disabled={quantileToggleDisabledY || !ySelection}
                onChange={(event) => onToggleQuantileY(event.target.checked)}
              />
              Quantile-normalisatie voor Y
              {!quantileAvailableY && yReady && (
                <span className="text-xs italic text-gray-400">
                  Geen quantile-data beschikbaar; ruwe waarden worden gebruikt.
                </span>
              )}
            </label>
          </div>
        </div>
      </div>
      <div className="aspect-[4/3] w-full max-h-[22rem] rounded-lg border border-gray-200/80 bg-white">
        {scatter && xSelection && ySelection ? (
          <ResponsiveScatterPlot
            data={chartData}
            margin={{ top: 20, right: 60, bottom: 60, left: 80 }}
            xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            axisBottom={{
              legend: labelForSelection(xSelection),
              legendPosition: 'middle',
              legendOffset: 40,
              tickSize: 5,
              tickPadding: 8,
            }}
            axisLeft={{
              legend: labelForSelection(ySelection),
              legendPosition: 'middle',
              legendOffset: -60,
              tickSize: 5,
              tickPadding: 8,
            }}
            colors={['rgb(0,153,168)']}
            blendMode="multiply"
            nodeSize={9}
            enableGridX
            enableGridY
            tooltip={({ node }) => (
              <div className="rounded bg-white px-3 py-2 text-xs shadow">
                <div className="font-semibold text-gray-800">
                  {node.data.label ?? 'Observatie'}
                </div>
                <div className="text-gray-600">
                  {labelForSelection(xSelection)}: {formatNumber(node.data.x, 3)}
                </div>
                <div className="text-gray-600">
                  {labelForSelection(ySelection)}: {formatNumber(node.data.y, 3)}
                </div>
              </div>
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {statusMessage ?? 'Geen data beschikbaar'}
          </div>
        )}
      </div>
      {scatter && scatter.pearson !== null && (
        <p className="text-sm text-gray-700">
          Pearson-correlatie ({pearsonLabel} waarden):{' '}
          <span className="font-semibold">
            {formatNumber(scatter.pearson, 3)}
          </span>
        </p>
      )}
    </div>
  );
}

type ColumnSelectorProps = {
  id: string;
  label: string;
  selection: string | null;
  options: ScatterVariable[];
  onChange: (value: string | null) => void;
};

function ColumnSelector({
  id,
  label,
  selection,
  options,
  onChange,
}: ColumnSelectorProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="font-semibold text-gray-700">{label}</span>
      <select
        id={id}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[rgb(0,153,168)] focus:outline-none"
        value={selection ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value ? value : null);
        }}
      >
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type ResidualSectionProps = {
  points: Array<{ predicted: number; residual: number; label?: string }>;
};

function ResidualSection({ points }: ResidualSectionProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    points.forEach((point) => {
      if (point.label?.includes('—')) {
        point.label
          .split('—')
          .forEach((country) => set.add(country.trim().toUpperCase()));
      }
    });
    return Array.from(set).sort();
  }, [points]);

  const filteredPoints = useMemo(() => {
    if (selectedCountry === 'ALL') {
      return points;
    }
    return points.filter((point) => {
      if (!point.label) return false;
      const [c1, c2] = point.label.split('—').map((value) => value.trim().toUpperCase());
      return c1 === selectedCountry || c2 === selectedCountry;
    });
  }, [points, selectedCountry]);

  const pearson = useMemo(() => {
    if (filteredPoints.length < 2) return null;
    return computePearson(
      filteredPoints.map((point) => point.predicted),
      filteredPoints.map((point) => point.residual)
    );
  }, [filteredPoints]);

  const scatterData = useMemo(() => {
    return [
      {
        id: 'Residuals',
        data: filteredPoints.map((point) => ({
          x: point.predicted,
          y: point.residual,
          label: point.label,
        })),
      },
    ];
  }, [filteredPoints]);

  useEffect(() => {
    if (selectedCountry !== 'ALL' && !countryOptions.includes(selectedCountry)) {
      setSelectedCountry('ALL');
    }
  }, [countryOptions, selectedCountry]);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200/80 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h4 className="text-base font-semibold text-gray-800">Residualanalyse</h4>
          <p className="text-sm text-gray-600">
            Controleer of residuen willekeurig rond nul liggen; klustering kan wijzen op misspecificatie.
          </p>
        </div>
      </div>

      {countryOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span className="font-semibold text-gray-700">Filter land:</span>
          <select
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[rgb(0,153,168)] focus:outline-none"
            value={selectedCountry}
            onChange={(event) => setSelectedCountry(event.target.value)}
          >
            <option value="ALL">Alle landen</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="aspect-[4/3] w-full max-h-[20rem] rounded-lg border border-gray-200/80 bg-white">
        <ResponsiveScatterPlot
          data={scatterData}
          margin={{ top: 20, right: 60, bottom: 60, left: 80 }}
          xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
          axisBottom={{
            legend: 'Voorspelde waarde',
            legendPosition: 'middle',
            legendOffset: 40,
            tickSize: 5,
            tickPadding: 8,
          }}
          axisLeft={{
            legend: 'Residuen',
            legendPosition: 'middle',
            legendOffset: -60,
            tickSize: 5,
            tickPadding: 8,
          }}
          colors={['#ef4444']}
          blendMode="multiply"
          nodeSize={8}
          enableGridX
          enableGridY
          markers={[
            {
              axis: 'y',
              value: 0,
              lineStyle: {
                stroke: '#9ca3af',
                strokeWidth: 1,
                strokeDasharray: '6 6',
              },
            },
          ]}
          tooltip={({ node }) => (
            <div className="rounded bg-white px-3 py-2 text-xs shadow">
              <div className="font-semibold text-gray-800">
                {node.data.label ?? 'Observatie'}
              </div>
              <div className="text-gray-600">
                Voorspeld: {formatNumber(node.data.x, 3)}
              </div>
              <div className="text-gray-600">
                Residueel: {formatNumber(node.data.y, 3)}
              </div>
            </div>
          )}
        />
      </div>
      {pearson !== null && (
        <p className="text-sm text-gray-700">
          Correlatie residuen vs. voorspeld:{' '}
          <span className="font-semibold">{formatNumber(pearson, 3)}</span>
        </p>
      )}
    </div>
  );
}
