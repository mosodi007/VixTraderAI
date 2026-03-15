/**
 * Pip-based SL and TP: one rule for all symbols.
 * Price distance = pips × getPipSize(symbol).
 * Pip size = price movement for 1 pip (or 1 point). Values should match Deriv contract
 * specs or observed minimum tick movement; verify and update as needed.
 */

export const SL_PIPS = 30;
export const TP1_PIPS = 60;
export const TP2_PIPS = 90;
export const TP3_PIPS = 120;

/** Explicit pip size (price per pip) per symbol. Validate against Deriv specs or tick data. */
export const SYMBOL_PIP_SIZE: Record<string, number> = {
  R_10: 1,
  R_50: 1,
  R_100: 1,
  '1HZ10V': 1,
  '1HZ30V': 1,
  '1HZ50V': 1,
  '1HZ90V': 1,
  '1HZ100V': 1,
  STPIDX: 10,
  stpRNG: 10,
  JD25: 1,
};

export function getPipSize(symbol: string): number {
  const key = symbol?.trim() || '';
  const value = SYMBOL_PIP_SIZE[key];
  if (value !== undefined) return value;
  console.warn(`[symbol-sl-tp] Unknown symbol "${symbol}", using default pip size 1. Add to SYMBOL_PIP_SIZE if needed.`);
  return 1;
}

/**
 * Return SL and TP distances in price units for a symbol.
 * Same pip rule (30 / 60 / 90 / 120) for all symbols; dynamic via pip size.
 */
export function getSlTpDistanceInPrice(
  symbol: string,
  _entryPrice: number
): { slDistance: number; tp1Distance: number; tp2Distance: number; tp3Distance: number } {
  const pipSize = getPipSize(symbol);
  return {
    slDistance: SL_PIPS * pipSize,
    tp1Distance: TP1_PIPS * pipSize,
    tp2Distance: TP2_PIPS * pipSize,
    tp3Distance: TP3_PIPS * pipSize,
  };
}
