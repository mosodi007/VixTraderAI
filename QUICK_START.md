# Quick Start Guide - Automated Live Signals

## 🚀 Get Started in 3 Steps

### Step 1: Set Up Cron Jobs (5 minutes)

Your automated signal system needs two cron jobs to run:

1. **Go to Supabase Dashboard** → **SQL Editor**

2. **Copy and paste this SQL** (replace YOUR_PROJECT with your actual project reference):

```sql
-- Signal Generation (every 15 minutes)
SELECT cron.schedule(
  'auto-generate-signals',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/auto-generate-signals',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

-- Signal Monitoring (every 5 minutes)
SELECT cron.schedule(
  'monitor-signal-outcomes',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/monitor-signal-outcomes',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

3. **Click Run** ✅

**Find your project reference:**
- Supabase Dashboard → Settings → API
- Look for "Project URL" - it looks like `https://abcdefgh.supabase.co`
- Your project reference is the part before `.supabase.co`

---

### Step 2: Test the System (2 minutes)

**Option A: Open Test Page**
1. Open `test-auto-signals.html` in your browser
2. Enter your Supabase URL and Anon Key when prompted
3. Click "Generate Signals Now" to test
4. View results

**Option B: Manual Test via Terminal**
```bash
# Test signal generation
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/auto-generate-signals

# Test signal monitoring
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/monitor-signal-outcomes
```

---

### Step 3: Open Your App (1 minute)

1. **Navigate to Live Signals page** in your app
2. **You should see:**
   - ✅ Live status indicator (pulsing green dot)
   - ✅ Countdown timer showing next scan
   - ✅ Monitored symbols (R_10, R_25, R_50, R_75, R_100)
   - ✅ Any active signals will appear automatically

**That's it!** Your system is now running fully automated.

---

## 🎯 What Happens Next

### Every 15 Minutes
- System scans all 5 symbols
- Generates signals only when quality thresholds are met:
  - ✓ 3+ indicator confirmations
  - ✓ 75%+ confidence
  - ✓ 2:1+ risk-reward ratio
- New signals appear on your screen instantly

### Every 5 Minutes
- Monitors all active signals
- Checks if TP or SL has been hit
- Automatically closes signals and records results

---

## 📊 Expected Results

**First 15 minutes:**
- Wait for first scan to complete
- May generate 0-5 signals (depends on market conditions)
- High-quality signals only - it's normal to see no signals if market conditions aren't ideal

**After 1 hour:**
- Should have completed 4 scans
- Likely to see at least 1-3 signals if markets are active
- Closed signals will show outcomes (TP hit or SL hit)

---

## 🎨 What You'll See on Frontend

### Live Status Card
```
🟢 Live Analysis Active
Automatically scanning 5 symbols every 15 minutes

Next Scan In: 14:23

Monitoring: [R_10] [R_25] [R_50] [R_75] [R_100]
```

### Active Signals
When signals are generated, you'll see cards showing:
- Symbol and direction (BUY/SELL)
- Entry price, TP1/TP2/TP3, and SL
- Confidence percentage
- Risk-reward ratio
- Technical triggers that confirmed the signal

---

## ✅ Verify It's Working

### Check #1: Cron Jobs Running
```sql
-- View scheduled jobs in Supabase SQL Editor
SELECT * FROM cron.job;
```

You should see:
- `auto-generate-signals` with schedule `*/15 * * * *`
- `monitor-signal-outcomes` with schedule `*/5 * * * *`

### Check #2: View Logs
1. Supabase Dashboard → Edge Functions
2. Click `auto-generate-signals`
3. Check Logs tab
4. You should see execution logs every 15 minutes

### Check #3: Database Records
```sql
-- View recent signals
SELECT * FROM signals ORDER BY created_at DESC LIMIT 5;

-- View active signal registry
SELECT * FROM active_signal_registry;

-- View signal triggers
SELECT * FROM signal_triggers ORDER BY triggered_at DESC LIMIT 10;
```

---

## 🐛 Common Issues

### Issue: "No signals appearing after 1 hour"

**This is normal!** The system only generates signals when:
- 3+ indicators confirm the setup
- Confidence is 75% or higher
- Risk-reward is 2:1 or better
- No existing active signal on that symbol
- Higher timeframes don't contradict the signal

**Solution:** Be patient. Quality over quantity. The system will generate signals when conditions are right.

---

### Issue: "Cron jobs not running"

**Check pg_cron extension is enabled:**
1. Supabase Dashboard → Database → Extensions
2. Find `pg_cron` and enable it
3. Re-run the cron setup SQL

---

### Issue: "Frontend countdown not updating"

**Solution:** Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

---

## 📚 Learn More

- **Full Setup Guide:** See `AUTOMATED_SIGNALS_SETUP.md`
- **Implementation Details:** See `IMPLEMENTATION_SUMMARY.md`
- **Test Interface:** Open `test-auto-signals.html`

---

## 🎉 You're All Set!

Your automated trading signal system is now:
- ✅ Scanning markets every 15 minutes
- ✅ Generating high-quality signals automatically
- ✅ Monitoring and closing signals when TP/SL hit
- ✅ Updating your frontend in real-time
- ✅ Tracking performance metrics

**No manual intervention needed - just watch the signals appear!**

---

## 💡 Pro Tips

1. **Enable Browser Notifications:** Allow notifications when prompted to get alerts for new signals
2. **Check Test Page Regularly:** Use `test-auto-signals.html` to view analytics and outcomes
3. **Monitor Performance:** After a few days, check which indicators and timeframes perform best
4. **Trust the System:** It's designed to be selective - quality over quantity

**Questions?** Check the troubleshooting sections in `AUTOMATED_SIGNALS_SETUP.md`
