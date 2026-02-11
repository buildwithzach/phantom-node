import json
import subprocess
import sys
import pandas as pd
from datetime import datetime, timedelta

def run_repro():
    # 1. Load sample candles (we need to fetch or mock them)
    # Since we can't fetch live, we'll assume we have a way or mock it.
    # Actually, we can use the 'test_payload.json' if it exists, or create a dummy one.
    # But for a real test, we need data.
    # Let's try to run `fetchHistoricalData` via node first? No, too complex.
    # We will just verify if the script crashes with dummy data.
    
    # Create dummy candles for 90 days (M15) ~ 6000 candles
    candles = []
    base_time = datetime.utcnow() - timedelta(days=90)
    price = 150.0
    for i in range(6000):
        time = base_time + timedelta(minutes=15*i)
        # Create a "trend" to ensure at least some signals might trigger
        price += 0.05 if i % 100 < 50 else -0.05
        # Add some volatility
        high = price + 0.1
        low = price - 0.1
        candles.append({
            "time": time.isoformat() + "Z",
            "mid": {"o": str(price), "h": str(high), "l": str(low), "c": str(price)},
            "volume": 100,
            "timestamp": time.timestamp() * 1000
        })
        
    # Flatten structure as per backtest_cli expectation
    flat_candles = []
    for c in candles:
        flat_candles.append({
            "timestamp": c['timestamp'],
            "open": float(c['mid']['o']),
            "high": float(c['mid']['h']),
            "low": float(c['mid']['l']),
            "close": float(c['mid']['c']),
            "volume": c['volume']
        })

    # Load config from file
    try:
        with open('python_algo/config.json', 'r') as f:
            config = json.load(f)
    except Exception as e:
        print(f"Error loading config: {e}")
        return

    payload = {
        "candles": flat_candles,
        "initial_equity": 1000,
        "target_start_date": (datetime.utcnow() - timedelta(days=90)).isoformat() + "Z",
        "config": config
    }
    
    # Run backtest_cli.py
    process = subprocess.Popen(
        ['python3', 'python_algo/backtest_cli.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout, stderr = process.communicate(input=json.dumps(payload))
    
    print("STDERR Sample:", stderr[:1000]) # Print first 1000 chars of stderr to see debug logs
    # print("STDOUT:", stdout)
    
    try:
        res = json.loads(stdout)
        print("Trades Count:", len(res.get('trades', [])))
        print("Total PnL:", res.get('totalPnl'))
    except Exception as e:
        print("Failed to parse JSON:", e)

if __name__ == "__main__":
    run_repro()
