/**
 * Confirmation candle: last fully closed bar must align with trade direction
 * (bullish close for BUY, bearish for SELL) with a minimum body vs range.
 *
 * Used by auto-generate-signals before creating a signal or pending setup.
 *
 * Env (auto-generate-signals):
 * - REQUIRE_CONFIRMATION_CANDLE: set to "false" to disable (default: on)
 * - CONFIRMATION_CANDLE_INTERVAL_SEC: bar size in seconds (default: 60)
 * - CONFIRMATION_MIN_BODY_RATIO: min |close-open| / (high-low), default 0.08
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

/**
 * The last candle that has fully closed before the current in-progress bar.
 * `lastTickEpoch`: seconds of latest tick.
 */
export function getLastClosedCandle(
  candles: ConfCandle[],
  lastTickEpoch: number,
  intervalSec: number,
): ConfCandle | null {
  if (!candles.length || lastTickEpoch <= 0) return null;
  const currentBarStart = Math.floor(lastTickEpoch / intervalSec) * intervalSec;
  const closedEnd = currentBarStart - intervalSec;

  let best: ConfCandle | null = null;
  for (const c of candles) {
    if (c.time <= closedEnd && (!best || c.time > best.time)) best = c;
  }
  return best;
}

export function closedCandleConfirmsDirection(
  direction: "BUY" | "SELL",
  candle: ConfCandle,
  minBodyToRangeRatio: number,
): boolean {
  const range = candle.high - candle.low;
  const eps = Math.max(Math.abs(candle.close) * 1e-9, 1e-12);
  if (range < eps) return false;
  const body = Math.abs(candle.close - candle.open);
  if (body / range < minBodyToRangeRatio) return false;
  if (direction === "BUY") return candle.close > candle.open;
  return candle.close < candle.open;
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
  const closed = getLastClosedCandle(candles, lastEpoch, intervalSec);
  if (!closed) {
    return { ok: false, detail: "no_closed_bar" };
  }
  const ok = closedCandleConfirmsDirection(direction, closed, minBodyToRangeRatio);
  return {
    ok,
    detail: ok
      ? `confirm_${direction}_O=${closed.open.toFixed(4)}_C=${closed.close.toFixed(4)}`
      : `last_close_rejects_${direction}_O=${closed.open.toFixed(4)}_C=${closed.close.toFixed(4)}`,
  };
}
