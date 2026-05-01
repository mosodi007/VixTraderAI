-- Synthetic index quotes (e.g. 1HZ50V, 1HZ100V) can exceed numeric(10,5) (~99,999.99999),
-- causing "numeric field overflow" on insert/update.

ALTER TABLE public.signals
  ALTER COLUMN entry_price TYPE numeric(18, 6),
  ALTER COLUMN stop_loss TYPE numeric(18, 6),
  ALTER COLUMN take_profit TYPE numeric(18, 6);

ALTER TABLE public.signals
  ALTER COLUMN tp1 TYPE numeric(18, 6),
  ALTER COLUMN tp2 TYPE numeric(18, 6),
  ALTER COLUMN tp3 TYPE numeric(18, 6);

ALTER TABLE public.signals
  ALTER COLUMN pip_stop_loss TYPE numeric(18, 6),
  ALTER COLUMN pip_take_profit TYPE numeric(18, 6),
  ALTER COLUMN risk_reward_ratio TYPE numeric(18, 6);

ALTER TABLE public.signals
  ALTER COLUMN actual_close_price TYPE numeric(18, 6),
  ALTER COLUMN profit_loss TYPE numeric(18, 6);

ALTER TABLE public.trades
  ALTER COLUMN entry_price TYPE numeric(18, 6),
  ALTER COLUMN exit_price TYPE numeric(18, 6),
  ALTER COLUMN stop_loss TYPE numeric(18, 6),
  ALTER COLUMN take_profit TYPE numeric(18, 6);
