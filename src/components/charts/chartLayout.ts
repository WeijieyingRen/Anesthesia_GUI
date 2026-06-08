export const CHART_LEGEND_WIDTH = 220;
export const CHART_AXIS_WIDTH = 42;
export const CHART_RIGHT_MARGIN = 20;

// 恢复原来的 15-min spacing
export const CHART_PX_PER_15_MIN = 64;

export type TimeResolution = 15 | 5;

export function getChartPxPerMinute(timeResolution: TimeResolution) {
  return timeResolution === 5
    ? CHART_PX_PER_15_MIN / 5
    : CHART_PX_PER_15_MIN / 15;
}

export function getChartMajorStep(timeResolution: TimeResolution) {
  return timeResolution === 5 ? 5 : 15;
}

export function getChartMinorStep(timeResolution: TimeResolution) {
  return timeResolution === 5 ? 1 : 5;
}

export function getSharedChartGeometry(
  xEnd: number,
  timeResolution: TimeResolution
) {
  const pxPerMin = getChartPxPerMinute(timeResolution);

  const contentPlotWidth =
    !Number.isFinite(xEnd) || xEnd <= 0
      ? 800
      : Math.max(800, Math.ceil(xEnd * pxPerMin));

  return {
    pxPerMin,
    contentPlotWidth,
    contentWidth: contentPlotWidth + CHART_RIGHT_MARGIN,
    plotWidth: contentPlotWidth,
  };
}

export function minuteToX(minute: number, xEnd: number, plotWidth: number) {
  if (!Number.isFinite(minute)) return 0;
  if (!Number.isFinite(xEnd) || xEnd <= 0 || plotWidth <= 0) return 0;

  return (minute / xEnd) * plotWidth;
}

export function buildChartTicks(end: number, step: number) {
  if (!Number.isFinite(end) || end <= 0) return [];
  if (!Number.isFinite(step) || step <= 0) return [];

  const ticks: number[] = [];

  for (let t = 0; t <= end; t += step) {
    ticks.push(t);
  }

  if (ticks.length === 0 || ticks[ticks.length - 1] !== end) {
    ticks.push(end);
  }

  return ticks;
}