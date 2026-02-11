# PHANTOM NODE — Gap Analysis: What’s Missing (Necessary vs Crucial)

Based on the current codebase, strategy docs, and live algo flow, here’s what’s **missing**, split into **crucial** (safety & ops risk) vs **necessary** (proper quant-operator setup).

---

## CRUCIALLY missing

These can directly lose money, break risk rules, or prevent you from controlling the bot.

### 1. **Max daily loss circuit breaker** — **IMPLEMENTED**

- **Done:** Algo fetches OANDA account summary each loop. Daily PnL = `balance - balance_at_reset` (reset at midnight UTC). If `daily_pnl <= -MAX_DAILY_LOSS_USD` ($50): **flat all USD_JPY**, **skip new orders** until next session. Trip state persisted in status file (survives restarts). Dashboard shows **Daily PnL** and **Circuit breaker · No new trades** in the notification bar.

### 2. **Risk-based position sizing** — **IMPLEMENTED**

- **Done:** Algo uses **`calc_units_usdjpy`**: `units = risk_amount * entry / sl_distance`, with `risk_amount = balance * RISK_PER_TRADE` (default 1%). Balance from OANDA account summary; units clamped to 1–100k. Override via `RISK_PER_TRADE` env (e.g. `0.02` for 2%). `last_signal` includes `size` for traceability.

### 3. **Market-hours gating in the algo**

- **Current:** UI shows “Market Open / Closed,” but the **Python algo never checks**. It keeps scanning and can try to place orders when the market is closed.
- **Risk:** Wasted logic, failed orders, log noise; in edge cases, behavior around weekend open can be surprising.
- **Fix:** Use the same 24/5 rules as `marketHours` (e.g. Fri 22:00 UTC close → Sun 22:00 UTC open). **Skip signal generation and order placement** when market is closed; you can still run the loop for status/health checks.

### 4. **Manual kill switch (pause / stop from UI)**

- **Current:** Algo status is **read-only**. To stop the bot you must kill the process or restart the container.
- **Risk:** You can’t quickly stop trading from the command center (e.g. before news, or when you see something wrong).
- **Fix:** Add a **“Pause trading”** flag (e.g. in `.algo-status.json` or a small API):
  - **Pause:** Algo keeps running (scans, status updates) but **does not place or modify orders**.
  - **Stop:** Optional stronger “shut down scanning” mode.
  - Dashboard reads the flag and has a **Pause / Resume** (and optionally **Stop**) control.

---

## NECESSARILY missing

Important for a “true quant operator” setup, but not immediately catastrophic like the above.

### 5. **News / economic filter in live**

- **Current:** TS strategy has `isNewsSafe()` and economic calendar filtering. Python `generate_signal` accepts `calendar_df` but **live never passes it**; no news-awareness.
- **Risk:** Trading into major USD/JPY events (NFP, CPI, BoJ) without filtering.
- **Fix:** Pull economic calendar (e.g. from your existing FMP flow or similar). Pass it into `generate_signal` and **skip entries** within X minutes of high-impact USD/JPY events (or downgrade size), same logic as TS.

### 6. **Algo fetches account balance**

- **Current:** Dashboard fetches account via `/api/account`; **algo never fetches balance**.
- **Risk:** Can’t do proper position sizing or daily-loss logic without balance/PnL.
- **Fix:** Algo calls OANDA account summary (or your account API) at least once per loop (or every N loops). Use it for **sizing** and **circuit breaker**.

### 7. **Structured audit log**

- **Current:** Logging is prints + optional Discord. No persistent, queryable record of signals, orders, and errors.
- **Risk:** Hard to debug, review, or prove what the bot did.
- **Fix:** Append **structured log lines** (e.g. JSON) to a file or send to a log aggregator: timestamp, event type (e.g. `signal` / `order` / `fill` / `error`), payload (instrument, side, size, sl/tp, account snapshot, etc.).

### 8. **API failure handling & backoff**

- **Current:** OANDA failures are logged; loop continues. No backoff, no “pause trading” on repeated failures.
- **Risk:** Rate limits or outages can cause repeated errors; no clear “bot is unhealthy” state.
- **Fix:** Track consecutive OANDA errors. After N failures:
  - **Exponential backoff** before next request.
  - **Pause new orders** until next successful account/candles fetch.
  - Expose “degraded” or “paused due to API” in status and UI.

### 9. **Dashboard “Pause algo” control**

- **Current:** No UI control to pause/stop the algo.
- **Risk:** Operator can’t act quickly from the command center.
- **Fix:** Same as **#4** — add Pause/Resume (and optionally Stop) in the UI, backed by the kill-switch mechanism.

---

## Summary

| Priority | Item | Status |
|----------|------|--------|
| **Crucial** | Max daily loss circuit breaker | Implemented |
| **Crucial** | Risk-based position sizing | Implemented |
| **Crucial** | Market-hours gating in algo | Not implemented |
| **Crucial** | Manual kill switch (pause/stop from UI) | Not implemented |
| **Necessary** | News/economic filter in live | Not used (calendar never passed) |
| **Necessary** | Algo fetches account balance | Not implemented |
| **Necessary** | Structured audit log | Only print + Discord |
| **Necessary** | API failure handling & backoff | Minimal |
| **Necessary** | Dashboard “Pause algo” control | Not implemented |

---

**Recommended order of work**

1. **Circuit breaker** + **algo fetches balance** (needed for both daily cap and sizing).
2. **Risk-based sizing** (replace fixed 10k units).
3. **Market-hours gating** in the algo loop.
4. **Kill switch** (pause/stop) + **Dashboard control**.
5. **News filter** in live, then **audit log** and **API backoff** as you harden operations.
