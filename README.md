# ⚡ PHANTOM NODE

**Autonomous USD/JPY Quant Trading System & Command Center**

Phantom Node is a sophisticated algorithmic trading engine designed for the USD/JPY forex pair. It combines technical analysis, macro-economic data (FRED), and news sentiment (FMP) to execute high-probability trades with institutional-grade risk management.

The system includes a real-time **Next.js Command Center** for monitoring performance, visualizing signals, and managing risk exposure.

---

## 🚀 Key Features

### 🧠 The Core Engine (Python)
*   **Multi-Factor Confluence:** Signals are generated only when key technicals align (EMA trends, RSI regime, ADX strength).
*   **Macro-Aware:** Integrates real-time US Treasury yields (10Y/2Y) and inflation data to determine directional bias.
*   **News Sentiment Analysis:** Filters trades based on high-impact economic events and market sentiment via Financial Modeling Prep API.
*   **Dynamic Risk Management:**
    *   ATR-based Volatility Sizing.
    *   Smart Trailing Stops & Break-even logic.
    *   Daily Loss Circuit Breaker (halts trading if drawdowns hit a defined limit).

### 🖥️ The Command Center (Next.js)
*   **Live Strategy Dashboard:** Visualizes the exact decision-making process (Technicals + Macro + Sentiment).
*   **Real-Time Charting:** Lightweight-charts integration with live trade markers, EMAs, and execution history.
*   **Ops Center:** Manual overrides to Pause/Resume the algo or emergency close positions.
*   **Social Sharing:** One-click generation of branded trade logs and performance charts for sharing.

---

## ⚙️ How It Works

The system operates in a continuous loop (default: 60s cycle):

1.  **Data Ingestion:** Fetches M15 candles from OANDA, Macro data from FRED, and News from FMP.
2.  **Macro Analysis:** Determines the "Macro Regime" (e.g., *Yields Rising + Risk On = Bullish Bias*).
3.  **Technical Scan:** Checks for setup validity (e.g., Price > EMA200, RSI not overbought, ADX > 20).
4.  **Execution:** If Confluence Score > Threshold (default 4.0), a trade is executed via OANDA v20 API.
5.  **Management:** Monitors every tick to adjust trailing stops or close positions based on time/price logic.

---

## 🦅 Strategy Specification (The Alpha)

This is a specific breakdown of the Quant Logic engine (v10).

### 1. Macro Regime (Directional Bias)
Before any technical check, the algo determines the **Global Bias** using FRED data:

| Indicator | Condition | Signal |
| :--- | :--- | :--- |
| **US10Y / US02Y** | Spread Widening (> 0.05 delta) | **Bullish USD** |
| **US10Y / US02Y** | Spread Inverting | **Bearish USD** |
| **Inflation Breakeven** | Rising (> 2.0%) | **Bullish USD** |
| **Equity Sentiment** | VIX < 20 (Risk On) | **Bullish USD/JPY** |

*   **Rule:** If Bias is `BEARISH`, the algo **REJECTS** all Long signals.
*   **Rule:** If Bias is `BULLISH`, the algo **REJECTS** all Short signals.

### 2. Technical Confluence (The Trigger)
Once Bias is confirmed, the engine scans the **M15 Chart** for a setup. A trade requires a **Confluence Score ≥ 4.0**.

| Factor | Condition (Long Example) | Points |
| :--- | :--- | :--- |
| **Trend** | Price > EMA 200 | +1.0 |
| **Momentum** | EMA 9 > EMA 21 (Crossover) | +1.0 |
| **Regime** | RSI (14) between 45 and 65 | +1.0 |
| **Strength** | ADX > 20 (Trend Strength) | +1.0 |
| **Volume** | Vol > 20-period MA | +0.5 |
| **Structure** | Recent "Break of Structure" | +1.0 |

### 3. News Filtering (The Shield)
Using FMP API, the algo scans for **"High Impact"** events (NFP, CPI, FOMC) for both USD and JPY.
*   **Pre-Event:** Trading HALTS 60 minutes before the event.
*   **Post-Event:** Trading RESUMES 30 minutes after (once volatility settles).
*   **Veto:** If a high-impact event is imminent, all Technical Signals are vetoed.

### 4. Risk Engineering
Institutional-grade risk management is hard-coded.

*   **Position Sizing:** `Risk % (1%) / Stop Distance (ATR * 3.5)`
    *   *Result:* Volatility-adjusted sizing. Large candles = Smaller position.
*   **Stop Loss:** Placed at `ATR * 3.5` from Entry (Wide berth for noise).
*   **Take Profit:** Fixed at `2.0R` (Risk/Reward 1:2).
*   **Trailing Stop:** Activates when price hits `1.1R` profit. Locks in `Break-Even + 5 pips`.
*   **Time Stop:** If trade is stagnant for **6 hours** with < 0.5R profit, it is auto-closed to free up capital.

---

## 🛠️ Setup & Installation

### Prerequisites
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.
*   **OANDA** Account (Live or Practice).
*   **Financial Modeling Prep (FMP)** API Key (for news).
*   **FRED** API Key (for macro data - free).

### Quick Start

1.  **Clone the Repo**
    ```bash
    git clone https://github.com/buildwithzach/phantom-node.git
    cd phantom-node
    ```

2.  **Configure Environment**
    Copy the example file and fill in your keys:
    ```bash
    cp .env.example .env.local
    ```
    *Edit `.env.local` and add your keys:*
    ```env
    NEXT_PUBLIC_OANDA_API_KEY=your_key
    NEXT_PUBLIC_OANDA_ACCOUNT_ID=your_account_id
    NEXT_PUBLIC_OANDA_ENVIRONMENT=practice  # or 'live'
    NEXT_PUBLIC_FMP_API_KEY=your_fmp_key
    NEXT_PUBLIC_FRED_API_KEY=your_fred_key
    ```

3.  **Run with Docker**
    This drives the entire stack (Dashboard + Algo):
    ```bash
    docker compose up -d
    ```

4.  **Access Dashboard**
    Open [http://localhost:3000](http://localhost:3000)

---

## 📊 Configuration

You can fine-tune the strategy parameters in `python_algo/config.json` without touching the code.

*   `risk_per_trade`: % of equity per trade (default 0.01 = 1%).
*   `max_daily_loss`: Hard dollar stop-loss for the day.
*   `min_confluence_score`: How strict the entry requirements are.
*   `trailing_stop_enabled`: Toggle smart management.

_Note: Restart the container after changing config.json._

---

## ⚠️ Disclaimer

**Trading forex involves substantial risk.** This software is for educational and research purposes only. The creators are not responsible for financial losses incurred by using this software. Always test thoroughly in a practice environment before deploying real capital.
