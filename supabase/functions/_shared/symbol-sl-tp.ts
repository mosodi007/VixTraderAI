/**
 * Point-based SL and TP per symbol.
 * Deriv shows "points" as (price distance) / point_size. So price_distance = points × point_size.
 */

/**
 * Point size per symbol: Deriv displays "points" as (price distance) / point_size.
 * So to show N points on Deriv we use price_distance = N × point_size.
 * R_10/R_50/R_100: display uses 0.4 (so 4000 points = 1600 in price).
 * Others: 0.01 typical for 2-decimal quotes.
 */
export const SYMBOL_POINT_SIZE: Record<string, number> = {
  R_10: 0.4,
  R_50: 0.4,
  R_100: 0.4,
  stpRNG: 0.01,
  '1HZ10V': 0.01,
  '1HZ30V': 0.01,
  '1HZ50V': 0.01,
  '1HZ90V': 0.01,
  '1HZ100V': 0.01,
  JD25: 0.01,
  STPIDX: 0.01,
};

export function getPointSize(symbol: string): number {
  const key = symbol?.trim() || '';
  return SYMBOL_POINT_SIZE[key] ?? 0.01;
}

/** SL and TP in Deriv "points" (display units) per symbol; converted to price via point size. */
export const SYMBOL_SL_TP_POINTS: Record<string, { slPoints: number; tpPoints: number }> = {
  R_10: { slPoints: 4000, tpPoints: 8000 },
  R_50: { slPoints: 4000, tpPoints: 8000 },
  R_100: { slPoints: 400, tpPoints: 800 },
  stpRNG: { slPoints: 40, tpPoints: 80 },
  '1HZ10V': { slPoints: 400, tpPoints: 800 },
  '1HZ30V': { slPoints: 20000, tpPoints: 40000 },
  '1HZ50V': { slPoints: 200000, tpPoints: 400000 },
  '1HZ90V': { slPoints: 100000, tpPoints: 200000 },
  '1HZ100V': { slPoints: 2000, tpPoints: 4000 },
  JD25: { slPoints: 40000, tpPoints: 80000 },
  STPIDX: { slPoints: 40, tpPoints: 80 },
};

/**
 * Return SL and TP distances in price units for a symbol.
 * Converts Deriv "points" to price: price_distance = points × point_size.
 */
export function getSlTpDistanceInPrice(
  symbol: string,
  _entryPrice?: number
): { slDistance: number; tpDistance: number } {
  const key = symbol?.trim() || '';
  const points = SYMBOL_SL_TP_POINTS[key];
  const pointSize = getPointSize(symbol);
  if (points) {
    return {
      slDistance: points.slPoints * pointSize,
      tpDistance: points.tpPoints * pointSize,
    };
  }
  console.warn(`[symbol-sl-tp] Unknown symbol "${symbol}", using default 400/800 points. Add to SYMBOL_SL_TP_POINTS if needed.`);
  return { slDistance: 400 * pointSize, tpDistance: 800 * pointSize };
}

/**
 * Pip size derived from points (slPoints/30) for callers that still use pips × pipSize.
 * Prefer getSlTpDistanceInPrice for new code.
 */
export function getPipSize(symbol: string): number {
  const { slDistance } = getSlTpDistanceInPrice(symbol);
  return slDistance / 30;
}
