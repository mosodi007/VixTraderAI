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
  R_25: 0.4,
  R_50: 0.4,
  R_75: 0.4,
  R_100: 0.4,
  stpRNG: 0.01,
  '1HZ10V': 0.01,
  '1HZ30V': 0.01,
  '1HZ75V': 0.01,
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

/**
 * SL/TP price levels from Deriv point config (same math as signal detector with fixed points).
 * Used after ICT refinement so stored signals and EA instructions match symbol_sl_tp_config.
 */
export function priceLevelsFromPoints(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  symbol: string,
  slPoints: number,
  tpPoints: number,
): { stopLoss: number; tp1: number } {
  const pt = getPointSize(symbol);
  const slDist = Math.max(1, Number(slPoints)) * pt;
  const tpDist = Math.max(1, Number(tpPoints)) * pt;
  const dir = String(direction).toUpperCase();
  if (dir === 'BUY') {
    const stopLoss = Math.max(0.01, entryPrice - slDist);
    const tp1 = entryPrice + tpDist;
    return { stopLoss: parseFloat(stopLoss.toFixed(2)), tp1: parseFloat(tp1.toFixed(2)) };
  }
  const stopLoss = entryPrice + slDist;
  const tp1 = Math.max(0.01, entryPrice - tpDist);
  return { stopLoss: parseFloat(stopLoss.toFixed(2)), tp1: parseFloat(tp1.toFixed(2)) };
}

/** SL and TP in Deriv "points"; TP is always 3× SL (1:3 R:R in price). */
export const SYMBOL_SL_TP_POINTS: Record<string, { slPoints: number; tpPoints: number }> = {
  R_10: { slPoints: 8000, tpPoints: 24000 },
  R_25: { slPoints: 8000, tpPoints: 24000 },
  R_50: { slPoints: 8000, tpPoints: 24000 },
  R_75: { slPoints: 8000, tpPoints: 24000 },
  R_100: { slPoints: 800, tpPoints: 2400 },
  stpRNG: { slPoints: 80, tpPoints: 240 },
  '1HZ10V': { slPoints: 800, tpPoints: 2400 },
  '1HZ30V': { slPoints: 40000, tpPoints: 120000 },
  '1HZ75V': { slPoints: 40000, tpPoints: 120000 },
  '1HZ50V': { slPoints: 400000, tpPoints: 1200000 },
  '1HZ90V': { slPoints: 200000, tpPoints: 600000 },
  '1HZ100V': { slPoints: 4000, tpPoints: 12000 },
  JD25: { slPoints: 80000, tpPoints: 240000 },
  STPIDX: { slPoints: 80, tpPoints: 240 },
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
  console.warn(`[symbol-sl-tp] Unknown symbol "${symbol}", using default 800/2400 points (1:3). Add to SYMBOL_SL_TP_POINTS if needed.`);
  return { slDistance: 800 * pointSize, tpDistance: 2400 * pointSize };
}

/**
 * Pip size derived from points (slPoints/30) for callers that still use pips × pipSize.
 * Prefer getSlTpDistanceInPrice for new code.
 */
export function getPipSize(symbol: string): number {
  const { slDistance } = getSlTpDistanceInPrice(symbol);
  return slDistance / 30;
}
