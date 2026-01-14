export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Smoothstep
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export const mad = (values: number[], med: number) => {
  const absDevs = values.map((v) => Math.abs(v - med));
  return median(absDevs);
};


