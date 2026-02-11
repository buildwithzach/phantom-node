# USD/JPY Quant Algo: Development & Execution Plan

## 1. Strategy Architecture
The algorithm is built on a **Hybrid Quant Model** that combines technical momentum with fundamental risk filtering.

### Technical Stack (M15/H1)
- **Entry**: EMA 9/21 Crossover (Momentum Trigger).
- **Trend Filter**: EMA 200 (Institutional Bias).
- **Momentum Filter**: RSI(14) (Overbought/Oversold Confirmation).
- **Volatility Filter**: ATR(14) > 0.08 (Chop Avoidance).
- **Risk Management**: 1.5x ATR Stop Loss | 2.5x RR Take Profit.

### Fundamental Layer (News Intelligence)
- **High-Impact Filter**: Automatically pauses trading ±60 minutes around major US/JP data releases (NFP, CPI, BOJ Rates).
- **Surprise Exploitation**: (Optional Enhancement) Trigger trades based on deviations from forecasts (e.g., USD Long if CPI > Forecast).

---

## 2. Implementation Steps

### Step 1: Data Infrastructure
- Use `Financial Modeling Prep (FMP)` for historical OHLC and Economic Calendar data.
- Use `OANDA` or `MetaTrader 5` for live price feeds and execution.

### Step 2: Signal Engine (`strategy.py`)
- Encapsulate all logic in a reusable class.
- Ensure the backtest and live code use the **exact same logic** to avoid look-ahead bias.

### Step 3: Backtesting & Validation (`backtester.py`)
- Run vectorized backtests on 2025-2026 data.
- **Key Metrics to Track**:
  - **Expectancy**: (Win Rate * Avg Win) - (Loss Rate * Avg Loss).
  - **Profit Factor**: Sum of Gains / Sum of Losses.
  - **Max Drawdown**: Peak-to-trough decline.

### Step 4: Live Execution Loop (`main.py`)
- Implement a robust polling loop.
- Add error handling for API disconnects and rate limits.
- Implement a "Circuit Breaker": Pause trading after 3 consecutive losses.

---

## 3. Innovative Enhancements

### Machine Learning (Sentiment Analysis)
- **Idea**: Use a pre-trained NLP model (like FinBERT) to analyze news headlines from the FMP News API.
- **Application**: Only allow Longs if the sentiment for USD is positive and JPY is negative.

### Volume Profile Integration
- **Idea**: Add a Volume Weighted Average Price (VWAP) filter.
- **Application**: Only Long if price is above VWAP, ensuring institutional support for the move.

### Walk-Forward Optimization
- **Idea**: Instead of fixed parameters, optimize the EMA periods every 30 days based on the previous month's volatility.
- **Application**: Adapts the bot to changing market regimes (e.g., from trending to ranging).

---

## 4. Potential Pitfalls & Mitigations
- **Slippage**: Always use **Limit Orders** instead of Market Orders during high-volatility periods.
- **API Rate Limits**: Implement a `time.sleep()` or caching layer to avoid getting blocked by data providers.
- **Data Accuracy**: Cross-reference FMP data with your broker's feed to ensure consistency.

---

## 5. Hypothetical Performance (Jan 2026)
During the sharp Yen rally in late Jan 2026, this strategy would have:
1. **Avoided the Reversal**: The EMA 200 trend filter would have flipped to Short, preventing the bot from "buying the dip" into a falling knife.
2. **Captured the Move**: The EMA 9/21 cross would have triggered multiple Short entries as the Yen strengthened.
3. **Protected Capital**: The News Filter would have paused trading during the BOJ intervention rumors, avoiding the massive wicks.
