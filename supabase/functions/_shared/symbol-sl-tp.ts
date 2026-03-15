/**
 * Pip-based SL and TP: one rule for all symbols.
 * Price distance = pips × getPipSize(symbol).
 * Pip size = price movement for 1 pip (or 1 point). Values should match Deriv contract
 * specs or observed minimum tick movement; verify and update as needed.
 */

export const SL_PIPS = 30;
export const TP_PIPS = 60;

/** Explicit pip size (price per pip) per symbol. From Deriv contract specs (Digits/Point/Pip). */
export const SYMBOL_PIP_SIZE: Record<string, number> = {
  R_10: 0.01,
  R_50: 0.01,
  R_100: 0.01,
  '1HZ10V': 0.01,
  '1HZ30V': 0.01,
  '1HZ50V': 0.01,
  '1HZ90V': 0.01,
  '1HZ100V': 0.01,
  STPIDX: 0.01,
  stpRNG: 0.01,
  JD25: 0.01,
};

export function getPipSize(symbol: string): number {
  const key = symbol?.trim() || '';
  const value = SYMBOL_PIP_SIZE[key];
  if (value !== undefined) return value;
  console.warn(`[symbol-sl-tp] Unknown symbol "${symbol}", using default pip size 0.01. Add to SYMBOL_PIP_SIZE if needed.`);
  return 0.01;
}

/**
 * Return SL and TP distances in price units for a symbol.
 * Single TP rule: 30 pips SL, 60 pips TP.
 */
export function getSlTpDistanceInPrice(
  symbol: string,
  _entryPrice: number
): { slDistance: number; tpDistance: number } {
  const pipSize = getPipSize(symbol);
  return {
    slDistance: SL_PIPS * pipSize,
    tpDistance: TP_PIPS * pipSize,
  };
}
