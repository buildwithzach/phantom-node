import json
import subprocess
import os
import sys
from itertools import product

def run_backtest_with_config(config, candles):
    input_payload = {
        "candles": candles,
        "config": config,
        "initial_equity": 100.0
    }
    
    process = subprocess.Popen(
        [sys.executable, "python_algo/backtest_cli.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout, stderr = process.communicate(input=json.dumps(input_payload))
    if process.returncode != 0:
        return None
    
    try:
        return json.loads(stdout)
    except:
        return None

def optimize():
    with open("python_algo/backtest_data.json", "r") as f:
        all_candles = json.load(f)
    
    # Data for periods
    candles30 = all_candles[-(30 * 96):]
    candles7 = all_candles[-(7 * 96):]
    
    # Search Space - Broadened for $100 account
    param_grid = {
        "min_confluence_score": [0.5, 1.0, 1.5],
        "rr_ratio": [2.0, 3.0, 4.0, 5.0], 
        "atr_multiplier_sl": [1.0, 1.5, 2.0],
        "adx_min": [10, 15, 20],
        "risk_per_trade": [0.02, 0.05], # 2% and 5% risk for faster micro-growth
        "aggressive_mode": [True, False]
    }
    
    keys = list(param_grid.keys())
    values = list(param_grid.values())
    combinations = list(product(*values))
    
    print(f"Total combinations to test: {len(combinations)}", flush=True)
    
    best_score = -float('inf')
    best_config = None
    
    # Load base config
    with open("python_algo/config.json", "r") as f:
        base_config = json.load(f)
    
    results = []
    
    for count, combo in enumerate(combinations):
        current_config = base_config.copy()
        for i, key in enumerate(keys):
            current_config[key] = combo[i]
        
        # Enforce survival settings
        current_config["atr_expansion_enabled"] = True
            
        res30 = run_backtest_with_config(current_config, candles30)
        res7 = run_backtest_with_config(current_config, candles7)
        
        if res30 and res7:
            pnl30 = res30['totalPnl']
            pnl7 = res7['totalPnl']
            max_dd = res30.get('maxDrawdown', 1.0)
            
            # Weighted Score: prioritize both positive, but don't exclude from results
            score = (pnl30 / 100.0) + (pnl7 / 100.0) - (max_dd * 2)
            if pnl30 > 0 and pnl7 > 0: score += 1.0 # Bonus for both positive
            
            results.append((score, pnl30, pnl7, max_dd, current_config.copy()))
            
            if score > best_score:
                best_score = score
                best_config = current_config.copy()
                print(f"New Best! Score: {score:.2f} | PnL30: ${pnl30:.2f}, PnL7: ${pnl7:.2f}, MaxDD: {max_dd:.2%} | RR: {current_config['rr_ratio']} Risk: {current_config['risk_per_trade']}", flush=True)

    if best_config:
        with open("python_algo/config_optimized.json", "w") as f:
            json.dump(best_config, f, indent=2)
        print("\nOptimization Complete. Best config saved.", flush=True)
        
    # Sort and print top 5 even if not "best"
    results.sort(key=lambda x: x[0], reverse=True)
    print("\nTop 5 Results:", flush=True)
    for r in results[:5]:
        print(f"Score: {r[0]:.2f} | PnL30: ${r[1]:.2f}, PnL7: ${r[2]:.2f}, DD: {r[3]:.2%} | Config: {json.dumps({k: r[4][k] for k in keys})}", flush=True)





    # Sort results by PnL
    results.sort(key=lambda x: x[0], reverse=True)
    
    print("\nTop 5 Results:")
    for pnl, cfg, trades, wr in results[:5]:
        print(f"PnL: {pnl:.2f} | Trades: {trades} | WR: {wr:.2%} | Config: {json.dumps({k: cfg[k] for k in keys})}")

    if best_config:
        # Save best config
        with open("python_algo/config_optimized.json", "w") as f:
            json.dump(best_config, f, indent=2)
        print("\nOptimized config saved to python_algo/config_optimized.json")

if __name__ == "__main__":
    optimize()
