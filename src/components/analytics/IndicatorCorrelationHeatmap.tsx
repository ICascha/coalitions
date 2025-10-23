import { useEffect, useMemo, useState } from 'react';
import { ResponsiveHeatMap, type TooltipComponent } from '@nivo/heatmap';
import { Card } from '@/components/ui/card';
import type { MetricMetadata } from '@/components/music/EuropeConnections';
import { METRIC_METADATA } from '@/components/music/EuropeConnections';

type RawEdge = { country1: string; country2: string; metric: number };

type IndicatorDataset = {
  meta: MetricMetadata;
  values: Map<string, number>;
};

type HeatmapCellData = {
  x: string;
  y: number | null;
  count: number;
  pairId: string;
  description?: string;
  sources?: MetricMetadata['source'][];
};

type HeatmapRow = {
  id: string;
  data: HeatmapCellData[];
};

const EDGE_KEY_SEPARATOR = '-';
const MIN_SAMPLE_SIZE = 3;

const makeEdgeKey = (a: string, b: string) => {
  return [a, b].sort().join(EDGE_KEY_SEPARATOR);
};

const rankValues = (values: number[]) => {
  const entries = values.map((value, index) => ({ value, index }));
  entries.sort((a, b) => a.value - b.value);

  const ranks = new Array(values.length);
  let i = 0;

  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1].value === entries[i].value) {
      j++;
    }

    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[entries[k].index] = averageRank;
    }
    i = j + 1;
  }

  return ranks;
};

const spearmanCorrelation = (x: number[], y: number[]) => {
  if (x.length !== y.length || x.length < MIN_SAMPLE_SIZE) {
    return null;
  }

  const rankX = rankValues(x);
  const rankY = rankValues(y);

  const mean = (arr: number[]) => arr.reduce((sum, value) => sum + value, 0) / arr.length;

  const meanX = mean(rankX);
  const meanY = mean(rankY);

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let i = 0; i < rankX.length; i++) {
    const dx = rankX[i] - meanX;
    const dy = rankY[i] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }

  if (denominatorX === 0 || denominatorY === 0) {
    return null;
  }

  return numerator / Math.sqrt(denominatorX * denominatorY);
};

const formatTooltipValue = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return 'n.v.t.';
  }
  return value.toFixed(2);
};

const buildPairId = (a: string, b: string) => `${a}__${b}`;

type ClusterNode = {
  indices: number[];
  left?: ClusterNode;
  right?: ClusterNode;
};

const averageLinkageDistance = (
  a: ClusterNode,
  b: ClusterNode,
  distanceMatrix: number[][]
) => {
  let sum = 0;
  let count = 0;

  for (const i of a.indices) {
    for (const j of b.indices) {
      const distance = distanceMatrix[i][j];
      sum += Number.isFinite(distance) ? distance : 1;
      count++;
    }
  }

  return count > 0 ? sum / count : 1;
};

const computeHierarchicalOrder = (distanceMatrix: number[][]) => {
  const size = distanceMatrix.length;

  if (size <= 1) {
    return size === 1 ? [0] : [];
  }

  const nodes: ClusterNode[] = Array.from({ length: size }, (_, index) => ({
    indices: [index],
  }));

  while (nodes.length > 1) {
    let minDistance = Number.POSITIVE_INFINITY;
    let minI = 0;
    let minJ = 1;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = averageLinkageDistance(nodes[i], nodes[j], distanceMatrix);

        if (distance < minDistance) {
          minDistance = distance;
          minI = i;
          minJ = j;
        }
      }
    }

    const right = nodes[minJ];
    const left = nodes[minI];
    const merged: ClusterNode = {
      indices: [...left.indices, ...right.indices],
      left,
      right,
    };

    nodes.splice(minJ, 1);
    nodes.splice(minI, 1);
    nodes.push(merged);
  }

  const resultOrder: number[] = [];

  const traverse = (node: ClusterNode | undefined) => {
    if (!node) return;
    if (!node.left && !node.right) {
      resultOrder.push(node.indices[0]);
      return;
    }
    traverse(node.left);
    traverse(node.right);
  };

  traverse(nodes[0]);

  return resultOrder;
};

export default function IndicatorCorrelationHeatmap() {
  const basePath = import.meta.env.BASE_URL;
  const [datasets, setDatasets] = useState<IndicatorDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadDatasets = async () => {
      setLoading(true);
      setError(null);

      try {
        const loaded = await Promise.all(
          METRIC_METADATA.map(async (meta) => {
            const response = await fetch(`${basePath}${meta.id}`);
            if (!response.ok) {
              throw new Error(`Kon dataset ${meta.id} niet laden (status ${response.status}).`);
            }

            const edges = (await response.json()) as RawEdge[];
            const values = new Map<string, number>();

            for (const { country1, country2, metric } of edges) {
              if (Number.isFinite(metric)) {
                values.set(makeEdgeKey(country1, country2), metric);
              }
            }

            return { meta, values };
          })
        );

        if (!cancelled) {
          setDatasets(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Onbekende fout bij het laden van datasets.');
          setDatasets(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDatasets();

    return () => {
      cancelled = true;
    };
  }, [basePath]);

  const { rows } = useMemo(() => {
    if (!datasets) {
      return { rows: [] as HeatmapRow[] };
    }

    const size = datasets.length;
    const correlations: (number | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null)
    );
    const counts: number[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 0)
    );

    for (let i = 0; i < size; i++) {
      const datasetA = datasets[i];

      for (let j = i; j < size; j++) {
        const datasetB = datasets[j];

        if (i === j) {
          correlations[i][j] = 1;
          counts[i][j] = datasetA.values.size;
          continue;
        }

        const overlappingKeys: string[] = [];

        for (const key of datasetA.values.keys()) {
          if (datasetB.values.has(key)) {
            overlappingKeys.push(key);
          }
        }

        const xValues: number[] = [];
        const yValues: number[] = [];

        for (const key of overlappingKeys) {
          const valueA = datasetA.values.get(key);
          const valueB = datasetB.values.get(key);

          if (typeof valueA === 'number' && typeof valueB === 'number') {
            xValues.push(valueA);
            yValues.push(valueB);
          }
        }

        const correlation = spearmanCorrelation(xValues, yValues);

        correlations[i][j] = correlation;
        correlations[j][i] = correlation;
        counts[i][j] = xValues.length;
        counts[j][i] = xValues.length;
      }
    }

    const distanceMatrix: number[][] = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => {
        if (i === j) return 0;
        const correlation = correlations[i][j];
        if (correlation === null) return 1;
        return 1 - correlation;
      })
    );

    const order = computeHierarchicalOrder(distanceMatrix);
    const orderedRows = order.map((rowIndex) => {
      const datasetA = datasets[rowIndex];
      return {
        id: datasetA.meta.label,
        data: order.map((columnIndex) => {
          const datasetB = datasets[columnIndex];
          const correlation = correlations[rowIndex][columnIndex];

          return {
            x: datasetB.meta.label,
            y: correlation,
            count: counts[rowIndex][columnIndex],
            pairId: buildPairId(datasetA.meta.id, datasetB.meta.id),
            description: datasetB.meta.description,
            sources: [datasetA.meta.source, datasetB.meta.source],
          };
        }),
      };
    });

    return { rows: orderedRows };
  }, [datasets]);

  const renderTooltip: TooltipComponent<HeatmapCellData> = ({ cell }) => {
    const { data } = cell;
    const [sourceA, sourceB] = data.sources ?? [];

    return (
      <div className="rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-md">
        <div className="font-semibold text-[rgb(0,153,168)]">
          {cell.serieId} ↔ {cell.data.x}
        </div>
        <div>Spearman: {formatTooltipValue(data.y)}</div>
        <div>Observaties gedeeld: {data.count}</div>
        {sourceA && (
          <div className="mt-1 text-xs text-slate-500">
            Bron(nen): {sourceB && sourceB.label !== sourceA.label ? `${sourceA.label}, ${sourceB.label}` : sourceA.label}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="flex h-[620px] items-center justify-center bg-white/70 text-slate-500">
        Indicaties laden…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex h-[620px] items-center justify-center bg-red-50 text-sm text-red-700">
        {error}
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card className="flex h-[620px] items-center justify-center bg-white/70 text-slate-500">
        Geen gegevens beschikbaar om correlaties te berekenen.
      </Card>
    );
  }

  return (
    <Card className="h-[620px] bg-white/90 p-4">
      <div className="h-full">
        <ResponsiveHeatMap
          data={rows}
          margin={{ top: 80, right: 80, bottom: 60, left: 140 }}
          valueFormat={(value) => formatTooltipValue(Number.isFinite(value) ? value : null)}
          colors={{
            type: 'diverging',
            scheme: 'red_yellow_blue',
            minValue: -1,
            maxValue: 1,
          }}
          axisTop={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: -45,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
          }}
          axisRight={null}
          axisBottom={null}
          inactiveOpacity={0.3}
          hoverTarget="cell"
          opacity={1}
          borderWidth={1}
          borderColor={{ from: 'color', modifiers: [['brighter', 0.6]] }}
          emptyColor="#e2e8f0"
          legends={[
            {
              anchor: 'bottom',
              direction: 'row',
              translateY: 40,
              length: 220,
              thickness: 12,
              tickSize: 0,
              title: 'Spearman correlatie',
              titleAlign: 'middle',
              titleOffset: 12,
            },
          ]}
          tooltip={renderTooltip}
          animate
          motionConfig="gentle"
        />
      </div>
    </Card>
  );
}
