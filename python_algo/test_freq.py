import json
import pandas as pd
from strategy import UsdJpyQuantStrategy
from datetime import datetime

def test_frequency():
    with open("python_algo/backtest_data.json", "r") as f:
        candles = json.load(f)
    df = pd.DataFrame(candles)
    df['date'] = pd.to_datetime(df['timestamp'], unit='ms')
    
    # Ultra-Aggressive High-Frequency Config
    config = {
        "aggressive_mode": True,
        "min_confluence_score": 0.0,
        "risk_per_trade": 0.01,
        "max_daily_loss": 5000,
        "max_trades_per_day": 5,
        "atr_multiplier_sl": 1.5,
        "rr_ratio": 2.0,
        "ema_fast": 9,
        "ema_slow": 21,
        "ema_trend": 200,
        "h1_rsi_long": 45,
        "h1_rsi_short": 55,
        "adx_min": 10,
        "atr_expansion_enabled": True,
        "signal_cooldown": 16, # 4 hours
        "quant_active": True,
        "signal_active": True
    }
    
    strat = UsdJpyQuantStrategy(config)
    df = strat.calculate_indicators(df)
    
    signals = []
    # Test last 30 days
    test_df = df.iloc[- (30 * 96):]
    
    for i in range(100, len(test_df)):
        sig = strat.generate_signal(test_df.iloc[:i+1])
        if sig['action'] != 'HOLD':
            signals.append({
                'time': test_df.iloc[i]['date'],
                'action': sig['action']
            })
            
    # Count trades by day
    if not signals:
        print("No signals found even with ultra-aggressive settings.")
        return
        
    sig_df = pd.DataFrame(signals)
    sig_df['day'] = sig_df['time'].dt.date
    daily_counts = sig_df.groupby('day').size()
    
    print(f"Total signals in 30 days: {len(signals)}")
    print(f"Average signals per day: {len(signals)/30:.2f}")
    print("\nDaily Breakdown (First 5 days with signals):")
    print(daily_counts.head(5))

if __name__ == "__main__":
    test_frequency()
