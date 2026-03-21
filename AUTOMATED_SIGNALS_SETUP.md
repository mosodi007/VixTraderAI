# Automated Live Signals System Setup

## Overview

This system provides fully automated, real-time trading signal generation with the following features:

- **Event-Driven Signal Detection**: Signals appear when indicators confirm trade setups
- **Scheduled Scan Cycle**: Automated market scanning every 5 minutes
- **Multiple Signals Per Symbol**: New signals can be generated even when other signals for the same symbol are still active; `active_signal_registry` only stores the **latest** pointer per symbol (upsert), not a hard lock
- **High-Quality Signals Only**: Minimum 75% confidence, 2:1 risk-reward ratio, 3+ indicator confirmations
- **Multi-Timeframe Analysis**: Validates signals across M5, M15, M30, and H1 timeframes
- **Advanced Pattern Recognition**: Detects candlestick patterns (engulfing, hammer, morning/evening star, etc.)
- **Automatic Trade Lifecycle (user-specific)**: TP/SL outcomes use each user’s levels on **`trades`** (from `mt5_symbol_settings` / EA dispatch). Shared **`signals`** rows are mainly expired by **`expires_at`**; they are **not** closed globally when one user hits TP/SL

## System Architecture

### Edge Functions

1. **auto-generate-signals** (Deployed)
   - Scans configured symbols every 5 minutes (cron)
   - Does **not** skip a symbol just because another active signal exists; generation runs whenever the detector passes
   - Analyzes market data using advanced indicator-based detection
   - Generates signals only when quality thresholds are met
   - Optionally upserts **`active_signal_registry`** so the registry points at the latest signal per symbol (informational, not blocking)
   - Records signal triggers for transparency

2. **monitor-signal-outcomes** (Deployed)
   - Monitors **open `trades`** (per-user SL/TP on each row) against Deriv ticks
   - Closes **trades** when TP/SL is hit (does not close the shared **`signals`** row for everyone)
   - **Expires** overdue **`signals`** (`expires_at` past) via `update_signal_outcome` / `EXPIRED`
   - Updates **`price_monitor_schedule`** with current active signal count

### Database Tables

- **signals**: Main signals table with lifecycle tracking
- **active_signal_registry**: Tracks which symbols have active signals
- **signal_triggers**: Logs which indicators triggered each signal
- **signal_outcomes**: Legacy/global table (one row per signal); **user performance** should use **`trades`** (closed rows with `profit_loss` per user)

## Setup Instructions

### Step 1: Set Up Cron Jobs in Supabase

You need to configure two cron jobs in your Supabase dashboard:

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Extensions**
3. Enable the **pg_cron** extension if not already enabled
4. Navigate to **SQL Editor** and run the following SQL:

```sql
-- Schedule auto-generate-signals to run every 5 minutes
SELECT cron.schedule(
  'auto-generate-signals',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-signals',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule monitor-signal-outcomes to run every 5 minutes
SELECT cron.schedule(
  'monitor-signal-outcomes',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-signal-outcomes',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

**Replace the following:**
- `YOUR_PROJECT_REF` with your actual Supabase project reference (found in Project Settings)
- `YOUR_SERVICE_ROLE_KEY` with your actual service role key (found in Project Settings → API)

#### Option B: Using External Cron Service

If you prefer using an external cron service (like cron-job.org or EasyCron):

1. **For auto-generate-signals** (every 5 minutes):
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-signals`
   - Method: POST
   - Schedule: `*/5 * * * *` (every 5 minutes)
   - Headers: None required (verify_jwt is false)

2. **For monitor-signal-outcomes** (every 5 minutes):
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-signal-outcomes`
   - Method: POST
   - Schedule: `*/5 * * * *` (every 5 minutes)
   - Headers: None required (verify_jwt is false)

### Step 2: Verify Setup

Test that the cron jobs are working:

```bash
# Test signal generation manually
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-signals

# Test signal monitoring manually
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-signal-outcomes
```

### Step 2.5: Signal Email Notifications (Resend) [Optional]

When new signals are created (by **auto-generate-signals** or **check-pending-entry**), the app can email them to users with verified MT5 accounts using [Resend](https://resend.com).

1. **Get a Resend API key**
   - Sign up at [resend.com](https://resend.com)
   - Create an API key in the dashboard

2. **Add Edge Function secrets** (Supabase Dashboard → Edge Functions → Secrets, or CLI):
   - `RESEND_API_KEY` – your Resend API key (required to send)
   - `RESEND_FROM` – sender address, e.g. `VixTraderAI <signals@yourdomain.com>` (optional; defaults to Resend’s test sender if unset)

3. **Verify your domain** in Resend if you use a custom `RESEND_FROM` (e.g. `signals@yourdomain.com`).

4. **Who receives emails**  
   All users who have at least one **verified** MT5 account get signal emails (email comes from the `profiles` table).

If `RESEND_API_KEY` is not set, signal generation still runs; emails are simply skipped and a warning is logged.

### Step 3: Monitor Logs

Check the edge function logs in your Supabase dashboard:

1. Go to **Edge Functions**
2. Click on **auto-generate-signals** or **monitor-signal-outcomes**
3. View the **Logs** tab to see execution history

## How It Works

### Signal Generation Flow

1. Every 5 minutes, `auto-generate-signals` runs
2. For each configured symbol:
   - Fetch 200 historical ticks from Deriv API
   - Run advanced indicator analysis (RSI, MACD, Bollinger Bands, EMA crossovers, trends)
   - Detect candlestick patterns (engulfing, hammer, morning star, etc.)
   - Validate with multi-timeframe analysis
   - If 3+ indicators confirm AND confidence ≥75% AND risk-reward ≥2:1:
     - Generate signal and store in database
     - Register in active_signal_registry
     - Record trigger conditions in signal_triggers
3. New signals automatically appear on frontend via Realtime subscription

### Signal Monitoring Flow

1. Every 5 minutes, `monitor-signal-outcomes` runs
2. Fetch **open trades** (with linked signal for Deriv `symbol` code)
3. For each trade:
   - Get current market price from Deriv
   - Compare price to **that trade’s** `stop_loss` / `take_profit` (user-specific)
   - If TP or SL hit: close the **trade** row only (idempotent `status = open` update)
4. Check for **expired signals** (`expires_at` past) and mark those **`signals`** rows inactive via `update_signal_outcome` (`EXPIRED`)

**MT5 path:** When the EA reports a closed trade (`mt5-report-trade` / `mt5-report-positions`), only **`trades`** are updated — the shared **`signals`** row is not closed for all users.

## Signal Quality Thresholds

Signals must meet ALL of the following criteria to be generated:

- **Minimum 3 indicator confirmations**
- **Minimum 75% confidence score**
- **Minimum 2:1 risk-reward ratio**
- **Valid support/resistance levels identified**
- **No conflicting signals on same symbol**

## Indicator Triggers

The system checks for the following technical conditions:

### Bullish Triggers
- RSI < 30 (Oversold)
- MACD histogram positive (Bullish crossover)
- Price below lower Bollinger Band
- EMA12 > EMA26 (Bullish crossover)
- Overall trend is bullish
- Bullish candlestick patterns (Hammer, Bullish Engulfing, Morning Star)

### Bearish Triggers
- RSI > 70 (Overbought)
- MACD histogram negative (Bearish crossover)
- Price above upper Bollinger Band
- EMA12 < EMA26 (Bearish crossover)
- Overall trend is bearish
- Bearish candlestick patterns (Shooting Star, Bearish Engulfing, Evening Star)

## Frontend Features

The Live Signals page now shows:

- **Live Status Indicator**: Pulsing green dot showing system is active
- **Countdown Timer**: Shows time until next scan (1-minute cycle for real-time responsiveness)
- **Monitored Symbols**: Visual display of all 5 symbols being tracked
- **Real-time Updates**: New signals appear instantly via Supabase Realtime
- **Signal Details**: Click any signal to see full analysis, triggers, and patterns
- **No Manual Generation**: System runs fully automated

## Performance Monitoring

Track signal performance using the database:

```sql
-- View signal outcomes
SELECT
  outcome,
  COUNT(*) as count,
  AVG(profit_loss) as avg_pl,
  AVG(duration_minutes) as avg_duration
FROM signal_outcomes
GROUP BY outcome;

-- View trigger effectiveness
SELECT
  indicator_name,
  COUNT(*) as times_triggered,
  AVG(s.confidence) as avg_confidence
FROM signal_triggers st
JOIN signals s ON s.id = st.signal_id
GROUP BY indicator_name
ORDER BY times_triggered DESC;

-- View win rate by symbol
SELECT
  s.symbol,
  COUNT(*) as total_signals,
  SUM(CASE WHEN so.outcome LIKE 'TP%' THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN so.outcome = 'SL_HIT' THEN 1 ELSE 0 END) as losses
FROM signals s
LEFT JOIN signal_outcomes so ON so.signal_id = s.id
WHERE s.signal_status = 'CLOSED'
GROUP BY s.symbol;
```

## Troubleshooting

### No Signals Being Generated

1. Check cron job is running (view logs in Supabase)
2. Verify Deriv API token is configured
3. Check market conditions - signals only appear when quality thresholds are met
4. Ensure no existing active signals on symbols (check active_signal_registry)

### Signals Not Closing

1. Verify monitor-signal-outcomes cron is running
2. Check Deriv API connectivity
3. Review signal expiry times
4. Check edge function logs for errors

### Frontend Not Updating

1. Verify Realtime subscription is active (check browser console)
2. Refresh the page
3. Check Supabase Realtime is enabled in project settings

## Maintenance

### Cleanup Old Signals

Run periodically to clean up old closed signals:

```sql
DELETE FROM signals
WHERE signal_status = 'CLOSED'
AND closed_at < NOW() - INTERVAL '30 days';
```

### View Active Registry

Check which symbols currently have active signals:

```sql
SELECT * FROM active_signal_registry;
```

### Manual Signal Closure

If needed, manually close a signal:

```sql
SELECT close_signal_with_outcome(
  'SIGNAL_ID_HERE'::uuid,
  'MANUAL_CLOSE',
  NULL,
  NULL
);
```

## Support

For issues or questions:
1. Check edge function logs in Supabase dashboard
2. Review database tables for signal data
3. Test edge functions manually using curl commands above
