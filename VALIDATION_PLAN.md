# Validation & Live Readiness Plan

## Phase 1: Robustness UI (Dashboard)
- [x] **Monte Carlo Integration**: Add a "Robustness" tab to the backtest page.
- [x] **Statistical Confidence**: Display 95% Confidence Drawdown and Probability of Profit.
- [x] **Multi-Pair Support**: Lock system to 'Big Three' JPY majors (USD/JPY, EUR/JPY, GBP/JPY) based on validation results.
- [x] **Equity Curve Comparison**: Overlay Monte Carlo sample curves on the main chart.

## Phase 2: Live Execution Bridge (Python)
- [x] **Strategy Port**: Port the exact v23 logic (H1 alignment, ADX rising, BOS trigger) to `python_algo/strategy.py`.
- [x] **OANDA Integration**: Implement the `PositionManager` class in `python_algo/main.py` for live orders.
- [x] **Logging & Monitoring**: Add Slack/Discord webhook support for trade alerts.
- [x] **Safety Circuit Breaker**: Implement a "Max Daily Loss" hard stop in the live loop.
