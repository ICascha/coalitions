export const formatMetricValue = (value: number | null): string => {
  if (value === null) return '-';
  return value.toFixed(3);
};


