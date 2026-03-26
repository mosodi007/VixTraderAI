-- Gate signals to swinging / mean-reversion friendly conditions (not clean trends).

ALTER TABLE signal_filters_config
  ADD COLUMN IF NOT EXISTS require_swing_market boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_chop_ratio numeric(8,4) DEFAULT 1.7500,
  ADD COLUMN IF NOT EXISTS min_swing_reversals integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS swing_lookback_candles integer DEFAULT 40;

COMMENT ON COLUMN signal_filters_config.require_swing_market IS 'Only emit signals when price shows zig-zag (chop), not efficient trends';
COMMENT ON COLUMN signal_filters_config.min_chop_ratio IS 'sum(|dclose|)/|net move| on lookback; higher = more swingy';
COMMENT ON COLUMN signal_filters_config.min_swing_reversals IS 'Min close-to-close direction changes in lookback';
COMMENT ON COLUMN signal_filters_config.swing_lookback_candles IS '1m candles used for chop/reversal metrics';

UPDATE signal_filters_config
SET
  require_swing_market = COALESCE(require_swing_market, true),
  min_chop_ratio = COALESCE(min_chop_ratio, 1.75),
  min_swing_reversals = COALESCE(min_swing_reversals, 7),
  swing_lookback_candles = COALESCE(swing_lookback_candles, 40),
  updated_at = now()
WHERE id = 'global';
