
import pandas as pd
import numpy as np
import json
import sys
from strategy import UsdJpyQuantStrategy

def generate_trend_data(n=800):
    # Generate a strong uptrend
    dates = pd.date_range(start='2024-01-01', periods=n, freq='15min')
    
    # Base price movement (Sine wave trend to create swings for ADX)
    t = np.linspace(0, 40 * np.pi, n) # More frequent swings
    trend = np.linspace(100, 140, n)
    wave = 1.5 * np.sin(t) # Slightly smaller amplitude for faster crosses
    
    price = trend + wave
    
    # Add noise
    noise = np.random.normal(0, 0.2, n)
    
    # Create OHLC
    close = price + noise
    # Intentional spread to spike ATR
    high = close + 0.3 
    low = close - 0.3
    open_ = close - 0.05
    
    # Volume
    volume = np.random.randint(100, 1000, n)
    
    df = pd.DataFrame({
        'time': dates,
        'open': open_,
        'high': high,
        'low': low,
        'close': close,
        'volume': volume,
        'complete': [True] * n
    })
    
    # Create timestamps in ms for strategy compatibility
    df['timestamp'] = df['time'].astype(np.int64) // 10**6
    return df

def validate():
    print("--- GENERATING SYNTHETIC UPTREND DATA ---")
    df = generate_trend_data(1000)
    
    config = {
        "aggressive_mode": True,
        "min_confluence_score": 1.5, # Loosen for synth test
        "risk_per_trade": 0.01,
        "max_daily_loss": 5000,
        "atr_multiplier_sl": 1.5,
        "rr_ratio": 3.0,
        "ema_fast": 9,
        "ema_slow": 21,
        "ema_trend": 200
    }
    
    print("--- INITIALIZING STRATEGY ---")
    strategy = UsdJpyQuantStrategy(config)
    
    print("--- CALCULATING INDICATORS ---")
    df = strategy.calculate_indicators(df)
    
    print(f"Data Head:\n{df[['time', 'close', 'adx14', 'h1_rsi14']].tail()}")
    
    print("\n--- CHECKING FOR SIGNALS (Last 50 bars) ---")
    signals_found = 0
    for i in range(800, len(df)):
        slice_df = df.iloc[:i+1]
        signal = strategy.generate_signal(slice_df)
        
        if signal['action'] != 'HOLD':
            print(f"[{slice_df.iloc[-1]['time']}] SIGNAL: {signal['action']} | Score: {signal.get('confluence_score')} | Reason: {signal.get('reason')}")
            signals_found += 1
            if signals_found >= 5:
                break
        else:
            if i % 10 == 0:
                print(f"[{slice_df.iloc[-1]['time']}] HOLD: {signal['reason']}")
    
    if signals_found == 0:
        print("\n[FAIL] No signals generated on perfect trend data.")
        # Debug why
        last_signal = strategy.generate_signal(df)
        print(f"Last Log: {last_signal}")
        sys.exit(1)
    else:
        print(f"\n[PASS] Successfully generated {signals_found} signals on synthetic data.")
        sys.exit(0)

if __name__ == "__main__":
    validate()
