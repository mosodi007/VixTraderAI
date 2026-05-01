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
  /** Recent-range high — liquidity above; price often sweeps here before dropping (SELL SL must be ABOVE this, not on it) */
  manipulation_high: number;
  /** Recent-range low — liquidity below; price often sweeps here before rallying (BUY SL must be BELOW this, not on it) */
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
  const asNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const fmt = (v: unknown, dp = 2): string => {
    const n = asNum(v);
    return Number.isFinite(n) ? n.toFixed(dp) : 'n/a';
  };

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

  // Backward-compatible fallback if callers still send deprecated swing names.
  const manipHigh = Number.isFinite(asNum(manipulation_high)) ? manipulation_high : asNum(input.recentSwingHigh);
  const manipLow = Number.isFinite(asNum(manipulation_low)) ? manipulation_low : asNum(input.recentSwingLow);

  return `You are an expert ICT (Inner Circle Trader) trader. A ${direction} setup is CONFIRMED on ${symbol}. Refine entry and stop loss. Take profit will be set from risk by the system.

**Critical — stops vs liquidity sweeps**
Recent-range HIGH ${fmt(manipHigh)} and LOW ${fmt(manipLow)} mark where stops cluster. Price often **wicks through** those levels first, then moves in your direction. SL placed on or just inside those levels gets hunted. Place SL **past** the sweep (structural invalidation), not on the pool.

**Context**
- Direction: ${direction}, price: ${fmt(currentPrice)}, ATR: ${fmt(atr)}
- Support: ${supportLevels.slice(0, 5).map(s => fmt(s)).join(', ') || 'none'}
- Resistance: ${resistanceLevels.slice(0, 5).map(r => fmt(r)).join(', ') || 'none'}

**Detector reference**: Entry ${fmt(initialEntry)}, SL ${fmt(initialStopLoss)}, TP ${fmt(initialTp1)} | ${triggerSummary}

**Rules**
1. **BUY**: stop_loss must be **below** ${fmt(manipLow)} by at least **1.0–2.0× ATR** (never at/above that low).
2. **SELL**: stop_loss must be **above** ${fmt(manipHigh)} by at least **1.0–2.0× ATR** (never at/below that high).
3. Sensible entry between SL and profit side.

Respond with ONLY JSON:
{"entry_price": <number>, "stop_loss": <number>, "tp1": <number>, "tp2": <number>, "tp3": <number>, "entry_notes": "<short string>"}
(tp placeholders OK; TPs may be overwritten.)`;
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
