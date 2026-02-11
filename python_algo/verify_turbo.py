import json
import pandas as pd
from optimize_fast import FastBacktestEngine

def verify_turbo():
    # Load data
    with open("python_algo/backtest_data.json", "r") as f:
        candles = json.load(f)
    df = pd.DataFrame(candles)
    df['date'] = pd.to_datetime(df['timestamp'], unit='ms')
    # 30 days
    candles30 = df.iloc[-(30 * 96):].copy()

    # The Turbo Config matching test_freq.py
    config = {
        "aggressive_mode": True,
        "min_confluence_score": 0.0,
        "risk_per_trade": 0.01,
        "max_daily_loss": 5000,
        "max_trades_per_day": 5,
        "atr_multiplier_sl": 1.2,
        "rr_ratio": 2.5,
        "ema_fast": 9,
        "ema_slow": 21,
        "ema_trend": 200,
        "h1_rsi_long": 40,
        "h1_rsi_short": 60,
        "adx_min": 15,
        "atr_expansion_enabled": True,
        "signal_cooldown": 12, # 3 hours
        "n_cross_fresh": 24,
        "bos_lookback": 10,
        "quant_active": True,
        "signal_active": True
    }

    # Calculate indicators first (FastBacktestEngine expects pre-calculated data)
    from strategy import UsdJpyQuantStrategy
    strat = UsdJpyQuantStrategy(config)
    candles30 = strat.calculate_indicators(candles30)

    print("Verifying Turbo Strategy Performance...")
    engine = FastBacktestEngine(candles30, config)
    pnl, dd, trades = engine.run()
    
    print(f"\nResults (30 Days):")
    print(f"PnL: ${pnl:.2f}")
    print(f"Trades: {trades}")
    print(f"Max Drawdown: {dd:.2%}")
    print(f"Ending Equity: ${100 + pnl:.2f}")

    if pnl > 0 and dd < 0.15:
        print("\n✅ PASSED: Profitable and Safe.")
        # Write to main config
        with open("python_algo/config.json", "w") as f:
            json.dump(config, f, indent=2)
        print("Updated python_algo/config.json with Turbo settings.")
    else:
        print("\n❌ CAUTION: Strategy might need tuning.")

if __name__ == "__main__":
    verify_turbo()
