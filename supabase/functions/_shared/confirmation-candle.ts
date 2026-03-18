/**
 * Confirmation: last fully closed bar must be an **engulfing** candle vs the prior closed bar.
 * - BUY: bullish engulfing (bullish candle whose body fully engulfs prior bearish body).
 * - SELL: bearish engulfing (bearish candle whose body fully engulfs prior bullish body).
 *
 * Used by auto-generate-signals before creating a signal or pending setup.
 *
 * Env:
 * - REQUIRE_CONFIRMATION_CANDLE: "false" to disable (default: on)
 * - CONFIRMATION_CANDLE_INTERVAL_SEC: bar size in seconds (default: 60)
 * - CONFIRMATION_MIN_BODY_RATIO: min body/range on the engulfing candle (default: 0.08)
 */

export interface ConfCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function buildCandlesFromTicks(
  ticks: { epoch: number; quote: number }[],
  intervalSec: number,
): ConfCandle[] {
  if (!ticks.length || intervalSec <= 0) return [];
  const candles: ConfCandle[] = [];
  let cur: ConfCandle | null = null;

  for (const t of ticks) {
    const bucket = Math.floor(t.epoch / intervalSec) * intervalSec;
    if (!cur || cur.time !== bucket) {
      if (cur) candles.push(cur);
      cur = {
        time: bucket,
        open: t.quote,
        high: t.quote,
        low: t.quote,
        close: t.quote,
      };
    } else {
      cur.high = Math.max(cur.high, t.quote);
      cur.low = Math.min(cur.low, t.quote);
      cur.close = t.quote;
    }
  }
  if (cur) candles.push(cur);
  return candles;
}

/** Last two fully closed bars: [prior, current] — current is the most recent closed bar. */
export function getLastTwoClosedCandles(
  candles: ConfCandle[],
  lastTickEpoch: number,
  intervalSec: number,
): [ConfCandle, ConfCandle] | null {
  if (!candles.length || lastTickEpoch <= 0) return null;
  const currentBarStart = Math.floor(lastTickEpoch / intervalSec) * intervalSec;
  const closed = candles
    .filter((c) => c.time < currentBarStart)
    .sort((a, b) => a.time - b.time);
  if (closed.length < 2) return null;
  return [closed[closed.length - 2], closed[closed.length - 1]];
}

function bodyRatio(c: ConfCandle): number {
  const range = c.high - c.low;
  const eps = Math.max(Math.abs(c.close) * 1e-9, 1e-12);
  if (range < eps) return 0;
  return Math.abs(c.close - c.open) / range;
}

/** Prior bearish; current bullish; current real body engulfs prior real body. */
export function isBullishEngulfing(
  prior: ConfCandle,
  curr: ConfCandle,
  minBodyRatioCurr: number,
): boolean {
  if (prior.close >= prior.open) return false;
  if (curr.close <= curr.open) return false;
  if (bodyRatio(curr) < minBodyRatioCurr) return false;
  return curr.open <= prior.close && curr.close >= prior.open;
}

/** Prior bullish; current bearish; current real body engulfs prior real body. */
export function isBearishEngulfing(
  prior: ConfCandle,
  curr: ConfCandle,
  minBodyRatioCurr: number,
): boolean {
  if (prior.close <= prior.open) return false;
  if (curr.close >= curr.open) return false;
  if (bodyRatio(curr) < minBodyRatioCurr) return false;
  return curr.open >= prior.close && curr.close <= prior.open;
}

export function lastClosedCandleConfirms(
  direction: "BUY" | "SELL",
  ticks: { epoch: number; quote: number }[],
  intervalSec: number,
  minBodyToRangeRatio: number,
): { ok: boolean; detail: string } {
  if (!ticks.length) return { ok: false, detail: "no_ticks" };
  const lastEpoch = ticks[ticks.length - 1].epoch;
  const candles = buildCandlesFromTicks(ticks, intervalSec);
  const pair = getLastTwoClosedCandles(candles, lastEpoch, intervalSec);
  if (!pair) {
    return { ok: false, detail: "need_two_closed_bars_for_engulfing" };
  }
  const [prior, curr] = pair;
  const minR = Number.isFinite(minBodyToRangeRatio) ? Math.max(0.02, minBodyToRangeRatio) : 0.08;

  if (direction === "BUY") {
    const ok = isBullishEngulfing(prior, curr, minR);
    return {
      ok,
      detail: ok
        ? `bullish_engulfing prior=${prior.open.toFixed(2)}/${prior.close.toFixed(2)} curr=${curr.open.toFixed(2)}/${curr.close.toFixed(2)}`
        : `no_bullish_engulfing prior_O=${prior.open.toFixed(2)}_C=${prior.close.toFixed(2)} curr_O=${curr.open.toFixed(2)}_C=${curr.close.toFixed(2)}`,
    };
  }
  const ok = isBearishEngulfing(prior, curr, minR);
  return {
    ok,
    detail: ok
      ? `bearish_engulfing prior=${prior.open.toFixed(2)}/${prior.close.toFixed(2)} curr=${curr.open.toFixed(2)}/${curr.close.toFixed(2)}`
      : `no_bearish_engulfing prior_O=${prior.open.toFixed(2)}_C=${prior.close.toFixed(2)} curr_O=${curr.open.toFixed(2)}_C=${curr.close.toFixed(2)}`,
  };
}
