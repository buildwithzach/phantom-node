# Signal Service Module: Technical Specification

## 1. Introduction & Scope
This document defines the architecture for the **Signal Service Module**, a dedicated component for generating high-probability trading signals for **USD/JPY**.

- **Type:** Pure signal generation engine (decoupled from execution).
- **Asset Class:** Currently single-pair (**USD/JPY**), architected to be pair-agnostic.
- **Intended User:** Designed for a single discretionary trader monitoring **2–3 intraday signals per day**.
- **Philosophy:** "Quality over Quantity"—relies on multi-timeframe confluence to filter noise.

## 2. Core Signal Engine
The engine uses a "top-down" analysis approach across three distinct timeframes:

*   **H4 (Trend Filter):** Determines the macro bias using EMA200 and fundamental macro alignment.
*   **H1 (Confirmation):** Confirms trend and momentum strength using EMA50/200 alignment and ADX > 25.
*   **M15 (Entry & Timing):** Identifies precise entry points via RSI divergence, Bollinger Band squeezes, and ATR volatility checks.

## 3. Confluence Logic & Scoring
Signals are graded based on a weighted sum of satisfied conditions. This strictly quantitative approach removes emotional bias.

### Scoring Formula
> **Signal Score** = Σ (Weight of each satisfied factor)

*   **Minimum Threshold:** **3.0** (No signal generated below this).
*   **High Confidence:** **≥ 5.0** (Grade A+ setup).
*   *Note:* Factors can be negative (e.g., counter-trend macro bias reduces score).

### Confluence Factors (Example Weights)
| Factor | Weight | Condition |
| :--- | :--- | :--- |
| **H4 Trend** | +1.5 | Price > EMA200 & Slope > 0 |
| **H1 Momentum** | +1.0 | ADX(14) > 25 & +DI > -DI |
| **M15 RSI Div** | +1.5 | Bullish Divergence detected |
| **BB Squeeze** | +1.0 | Bandwidth percentile < 10% |
| **Macro Bias** | ±2.0 | Fundamental directional alignment |

## 4. Risk Management Rules
The module strictly enforces risk parameters *before* a signal is emitted.

- **Per-Signal Risk:** Supports variable risk caps (e.g., **1.0% – 2.5%** of equity) based on Signal Score.
- **Portfolio Exposure:**
  - `maxOpenRisk`: **0.25** (Cap total open risk at 25% of equity).
  - `maxOpenPositions`: **3** (Portfolio-level guardrail).
- **Trade Parameters:**
  - **Stop Loss:** Dynamic, based on **1.5x – 2.0x ATR(14)**.
  - **Take Profit:** Minimum **1:2 Risk:Reward** ratio.

## 5. Signal Generation Workflow
The logic executes on every **M15 candle close**:

1.  **News Filter Check:**
    *   Is there high-impact USD or JPY news within ±30 minutes?
    *   If **YES** → **SKIP** processing.
2.  **Data Ingestion:**
    *   Fetch latest H4, H1, M15 candles from OANDA/FMP.
    *   Fetch latest Macro Bias state.
3.  **Indicator Computation:**
    *   Calculate EMA, RSI, ATR, ADX, Bollinger Bands, and Key Levels.
4.  **Scoring & Confluence:**
    *   Run `calculate_confluence_score()`.
    *   If `score < minConfluenceScore` (3.0) → **STOP**.
5.  **Operational Checks:**
    *   Check `dailySignalCount < maxDailySignals`.
    *   Check `spread < maxSpreadAllowed`.
6.  **Signal Finalization:**
    *   Compute ATR-based SL/TP prices.
    *   Assign "Grade" (B, A, A+) based on score.
    *   **Persist** signal to DB/Log and **Push** to UI.

## 6. Configuration Profile (Recommended)
This configuration balances frequency with high conviction:

```yaml
# Signal Configuration
symbol: "USD_JPY"
timeframes: ["M15", "H1", "H4"]

# Confluence Settings
minConfluenceScore: 3.0
highConfidenceThreshold: 5.0

# Risk Constraints
riskPerTrade: 0.02          # 2% default risk
maxOpenRisk: 0.25           # Max 25% equity exposure total
maxOpenPositions: 3         # Max concurrent signals
maxDailySignals: 3          # Prevent overtrading
minRiskReward: 2.0          # Minimum 1:2 R:R

# Volatility Settings
atrPeriod: 14
slMultiplier: 1.5           # 1.5x ATR for Stop Loss
```

## 7. Validation & Automated Testing
To ensure the algo performs as a "validated quant approach":

*   **Unit Testing:**
    *   **Mock OANDA/Macro:** Test edge cases (no data returned, news blackout active).
    *   **Scoring Boundaries:** Regression tests for `score=2.9` (false) vs `score=3.0` (true).
*   **Backtest Guidelines:**
    *   **Dataset:** Min. 6–12 months of **M15** or **Tick** data for USD/JPY.
    *   **Success Metrics:** Target **>60% Win Rate**, **>1.5 Profit Factor**, and **<15% Max Drawdown**.
    *   **Distribution:** Track distribution of Confluence Scores vs. Win Rate to recalibrate weights.

## 8. API & Interface Signatures (Python)
*Implementation reference for developers:*

```python
@dataclass
class SignalRequest:
    symbol: str
    current_price: float
    volatility_atr: float
    score_breakdown: Dict[str, float]
    
class SignalEngine:
    def evaluate(self, market_data: MarketData) -> Optional[SignalResult]:
        """
        Main entry point.
        Returns SignalResult if score >= threshold AND risk checks pass.
        Returns None otherwise.
        """
        pass

    def _calculate_score(self, indicators: Dict, rules: List[Rule]) -> float:
        """
        Sums weights of all passing rules.
        """
        pass
```
