import json
import subprocess
import os

def run_backtest_with_period(days):
    with open("python_algo/backtest_data.json", "r") as f:
        all_candles = json.load(f)
    
    with open("python_algo/config.json", "r") as f:
        config = json.load(f)
    
    # Estimate candles for 'days' (approx 96 per day)
    # We take the last 'days' from the end
    # 1 day ~ 96 candles
    num_candles = days * 96
    candles = all_candles[-num_candles:]
    
    input_payload = {
        "candles": candles,
        "config": config,
        "initial_equity": 100.0
    }
    
    process = subprocess.Popen(
        ["python3", "python_algo/backtest_cli.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout, stderr = process.communicate(input=json.dumps(input_payload))
    
    if process.returncode != 0:
        print(f"Error running backtest: {stderr}")
        return None
    
    try:
        return json.loads(stdout)
    except Exception as e:
        print(f"Failed to parse output: {e}\nOutput: {stdout}")
        return None

if __name__ == "__main__":
    print("--- 7-Day Baseline Backtest ---")
    res7 = run_backtest_with_period(7)
    if res7:
        print(f"PnL: {res7['totalPnl']:.2f}, Win Rate: {res7['winRate']:.2%}, Trades: {len(res7['trades'])}")
        
    print("\n--- 30-Day Baseline Backtest ---")
    res30 = run_backtest_with_period(30)
    if res30:
        print(f"PnL: {res30['totalPnl']:.2f}, Win Rate: {res30['winRate']:.2%}, Trades: {len(res30['trades'])}")
