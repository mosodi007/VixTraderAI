/**
 * ICT (Inner Circle Trader) signal refiner using OpenAI.
 * After a setup is confirmed by the indicator engine, this module asks an expert ICT trader (LLM)
 * to suggest: better entry (price action), stop loss beyond liquidity to avoid sweeps, and TP targets
 * aimed at 70-80% win rate.
 */

export interface ICTRefinerInput {
  symbol: string;
  direction: 'BUY' | 'SELL';
  currentPrice: number;
  atr: number;
  supportLevels: number[];
  resistanceLevels: number[];
  /** Manipulation phase high (use for SELL stop loss: place SL at or just above this) */
  manipulation_high: number;
  /** Manipulation phase low (use for BUY stop loss: place SL at or just below this) */
  manipulation_low: number;
  /** @deprecated use manipulation_high */
  recentSwingHigh?: number;
  /** @deprecated use manipulation_low */
  recentSwingLow?: number;
  /** Initial levels from indicator-based detector */
  initialEntry: number;
  initialStopLoss: number;
  initialTp1: number;
  initialTp2: number;
  initialTp3: number;
  triggerSummary: string;
}

export interface ICTRefinerOutput {
  entry_price: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  entry_notes: string;
}

const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 400;

function buildPrompt(input: ICTRefinerInput): string {
  const {
    symbol,
    direction,
    currentPrice,
    atr,
    supportLevels,
    resistanceLevels,
    manipulation_high,
    manipulation_low,
    initialEntry,
    initialStopLoss,
    initialTp1,
    initialTp2,
    initialTp3,
    triggerSummary,
  } = input;

  return `You are an expert ICT (Inner Circle Trader) trader. A ${direction} setup is CONFIRMED on ${symbol}. Your job is to refine entry and stop loss. Place stop loss at the manipulation phase high/low so there is enough room; the system will set take profit at 1:2 risk-reward.

**Current context**
- Direction: ${direction}
- Current price: ${currentPrice.toFixed(2)}
- ATR: ${atr.toFixed(2)}
- Support levels (nearest first): ${supportLevels.slice(0, 5).map(s => s.toFixed(2)).join(', ') || 'none'}
- Resistance levels (nearest first): ${resistanceLevels.slice(0, 5).map(r => r.toFixed(2)).join(', ') || 'none'}
- Manipulation phase HIGH (liquidity above; for SELL place SL at or just above this): ${manipulation_high.toFixed(2)}
- Manipulation phase LOW (liquidity below; for BUY place SL at or just below this): ${manipulation_low.toFixed(2)}

**Indicator engine suggested (use only as reference)**
- Entry: ${initialEntry.toFixed(2)}, SL: ${initialStopLoss.toFixed(2)}, TP1: ${initialTp1.toFixed(2)}
- Triggers: ${triggerSummary}

**ICT rules you must follow**
1. **Stop loss**: Set SL at the manipulation phase level so we are not swept and there is enough room.
   - For BUY: SL must be at or just beyond the manipulation LOW (e.g. at ${manipulation_low.toFixed(2)} or 0.5-1 ATR below it). Do not place SL above entry.
   - For SELL: SL must be at or just beyond the manipulation HIGH (e.g. at ${manipulation_high.toFixed(2)} or 0.5-1 ATR above it). Do not place SL below entry.
2. **Entry**: Suggest the best entry using price action: e.g. pullback to support (BUY) or resistance (SELL), or current price if it is already at a valid level. Entry must be between SL and TP (TP will be set at 1:2 R:R by the system).

Respond with ONLY a single JSON object, no markdown or extra text:
{"entry_price": <number>, "stop_loss": <number>, "tp1": <number>, "tp2": <number>, "tp3": <number>, "entry_notes": "<short string>"}
(tp1/tp2/tp3 will be overwritten to enforce 1:2; you may set tp1 to entry + 2*risk for BUY or entry - 2*risk for SELL as a placeholder.)`;
}

function parseRefinerResponse(text: string): ICTRefinerOutput | null {
  const trimmed = text.trim().replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '');
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const entry_price = Number(parsed.entry_price);
    const stop_loss = Number(parsed.stop_loss);
    const tp1 = Number(parsed.tp1);
    const tp2 = Number(parsed.tp2);
    const tp3 = Number(parsed.tp3);
    const entry_notes = typeof parsed.entry_notes === 'string' ? parsed.entry_notes : '';
    if (
      !Number.isFinite(entry_price) ||
      !Number.isFinite(stop_loss) ||
      !Number.isFinite(tp1) ||
      !Number.isFinite(tp2) ||
      !Number.isFinite(tp3)
    ) {
      return null;
    }
    return { entry_price, stop_loss, tp1, tp2, tp3, entry_notes };
  } catch {
    return null;
  }
}

/** Validate refined levels are sane (within ~20% of current price for synthetics) */
function validateRefined(
  input: ICTRefinerInput,
  refined: ICTRefinerOutput
): boolean {
  const { direction, currentPrice } = input;
  const margin = currentPrice * 0.2;
  if (direction === 'BUY') {
    if (refined.stop_loss >= refined.entry_price) return false;
    if (refined.tp1 <= refined.entry_price) return false;
    if (refined.entry_price < refined.stop_loss || refined.entry_price > refined.tp1) return false;
    if (Math.abs(refined.entry_price - currentPrice) > margin) return false;
  } else {
    if (refined.stop_loss <= refined.entry_price) return false;
    if (refined.tp1 >= refined.entry_price) return false;
    if (Math.abs(refined.entry_price - currentPrice) > margin) return false;
  }
  return true;
}

/**
 * Call OpenAI as an expert ICT trader to refine entry, SL, and TPs.
 * Returns refined levels or null on failure (caller should use detector levels).
 */
export async function refineSignalWithICT(
  openaiApiKey: string,
  input: ICTRefinerInput
): Promise<{ refined: ICTRefinerOutput; reasoning: string } | null> {
  const prompt = buildPrompt(input);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert ICT (Inner Circle Trader) trader. You output only valid JSON with keys: entry_price, stop_loss, tp1, tp2, tp3, entry_notes. No other text.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      console.error('[ICT-Refiner] OpenAI error:', await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const refined = parseRefinerResponse(content);
    if (!refined || !validateRefined(input, refined)) {
      console.warn('[ICT-Refiner] Invalid or out-of-range refined levels, using detector levels');
      return null;
    }

    return {
      refined: {
        ...refined,
        entry_price: parseFloat(refined.entry_price.toFixed(2)),
        stop_loss: parseFloat(refined.stop_loss.toFixed(2)),
        tp1: parseFloat(refined.tp1.toFixed(2)),
        tp2: parseFloat(refined.tp2.toFixed(2)),
        tp3: parseFloat(refined.tp3.toFixed(2)),
      },
      reasoning: refined.entry_notes || 'ICT-refined entry and levels.',
    };
  } catch (err) {
    console.error('[ICT-Refiner] Error:', err);
    return null;
  }
}
