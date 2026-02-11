import subprocess
import sys
import pandas as pd
import json

def repro():
    # Load config
    with open("python_algo/config.json", "r") as f:
        config = json.load(f)

    # Load data
    with open("python_algo/backtest_data.json", "r") as f:
        candles = json.load(f)

    # Slice 1000 candles (simulating API buffer)
    candles_sample = candles[-1000:]
    
    # Set target start date to ~400 candles ago (approx 4 days)
    # This leaves 600 candles for warmup
    target_start_ts = candles_sample[-400]['timestamp']
    target_start_date = pd.to_datetime(target_start_ts, unit='ms').isoformat()

    input_payload = {
        "candles": candles_sample,
        "initial_equity": 1000,
        "target_start_date": target_start_date,
        "config": config
    }

    print(f"Testing with {len(candles_sample)} candles from {target_start_date}...")
    
    # Run backtest_cli.py
    process = subprocess.Popen(
        [sys.executable, "python_algo/backtest_cli.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    out, err = process.communicate(input=json.dumps(input_payload))
    
    print("--- STDERR ---")
    print(err)
    print("--- STDOUT ---")
    try:
        res = json.loads(out)
        print(json.dumps(res, indent=2))
        print(f"\nTotal Trades: {len(res['trades'])}")
    except:
        print("Raw Output:", out)

if __name__ == "__main__":
    repro()
