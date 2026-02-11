import json
import pandas as pd
import numpy as np
from strategy import UsdJpyQuantStrategy
from itertools import product
from datetime import datetime

class FastBacktestEngine:
    def __init__(self, df, config, initial_equity=100.0):
        self.df = df
        self.config = config
        self.initial_equity = initial_equity
        
    def run(self):
        # We assume indicators are already calculated in self.df for speed
        equity = self.initial_equity
        active_trade = None
        trades = []
        equity_curve = []
        daily_pnl = 0
        last_date = None
        max_daily_loss = self.config.get('max_daily_loss', 500.0)
        risk_pct = self.config.get('risk_per_trade', 0.01)
        warmup = 500
        
        # We need a strategy instance to use its generate_signal logic
        # but we bypass its calculate_indicators
        class SimpleStrategy(UsdJpyQuantStrategy):
            def calculate_indicators(self, df): return df
            
        strat = SimpleStrategy(self.config)
        
        for i in range(warmup, len(self.df)):
            row = self.df.iloc[i]
            curr_date = row['date'].date()

            if last_date != curr_date:
                daily_pnl = 0
                last_date = curr_date

            if active_trade:
                exit_price = None
                if active_trade['action'] == 'BUY':
                    if row['low'] <= active_trade['sl']: exit_price = active_trade['sl']
                    elif row['high'] >= active_trade['tp']: exit_price = active_trade['tp']
                else:
                    if row['high'] >= active_trade['sl']: exit_price = active_trade['sl']
                    elif row['low'] <= active_trade['tp']: exit_price = active_trade['tp']

                if exit_price:
                    pnl_jpy = (exit_price - active_trade['entry']) * active_trade['units']
                    pnl = pnl_jpy / exit_price
                    equity += pnl
                    daily_pnl += pnl
                    trades.append({'pnl': pnl})
                    active_trade = None

            if not active_trade and daily_pnl > -max_daily_loss:
                if 8 <= row['date'].hour < 21:
                    # generate_signal needs a slice, but our FastBacktestStrategy ignores it
                    signal = strat.generate_signal(self.df.iloc[:i+1])
                    if signal['action'] in ['BUY', 'SELL']:
                        risk_amount = equity * risk_pct
                        sl_dist = abs(signal['entry'] - signal['sl'])
                        if sl_dist > 0:
                            units = (risk_amount * signal['entry']) / sl_dist
                            if signal['action'] == 'SELL': units = -units
                            active_trade = {
                                "action": signal['action'],
                                "entry": signal['entry'],
                                "sl": signal['sl'],
                                "tp": signal['tp'],
                                "units": units
                            }
            equity_curve.append(equity)
            
        total_pnl = equity - self.initial_equity
        peak = self.initial_equity
        max_dd = 0
        for e in equity_curve:
            if e > peak: peak = e
            dd = (peak - e) / peak
            if dd > max_dd: max_dd = dd
            
        return total_pnl, max_dd, len(trades)

def optimize():
    with open("python_algo/backtest_data.json", "r") as f:
        all_candles = json.load(f)
    
    df_all = pd.DataFrame(all_candles)
    df_all['date'] = pd.to_datetime(df_all['timestamp'], unit='ms')
    
    # Pre-calculate indicators for base params
    # (The strategy uses these columns)
    with open("python_algo/config.json", "r") as f:
        base_config = json.load(f)
    
    full_strat = UsdJpyQuantStrategy(base_config)
    df_with_ind = full_strat.calculate_indicators(df_all)
    
    candles30 = df_with_ind.iloc[-(30 * 96):].copy()
    candles7 = df_with_ind.iloc[-(7 * 96):].copy()
    
    param_grid = {
        "min_confluence_score": [0.0, 0.5], # Low bar for high freq
        "rr_ratio": [1.5, 2.0, 2.5],       # Practical day-trading RR
        "atr_multiplier_sl": [1.0, 1.5],   # Tight stops for more entries
        "adx_min": [0, 5, 10],            # Trade even in low-trend
        "h1_rsi_long": [35, 45, 55],       # Loosen trend filter
        "aggressive_mode": [True]
    }
    
    keys = list(param_grid.keys())
    values = list(param_grid.values())
    combinations = list(product(*values))
    
    print(f"Testing {len(combinations)} combinations in-process...")
    best_score = -float('inf')
    best_config = None
    results = []
    
    for count, combo in enumerate(combinations):
        cfg = base_config.copy()
        for i, key in enumerate(keys): cfg[key] = combo[i]
        
        # Enforce consistency for JPY pairs and small account
        cfg["atr_expansion_enabled"] = True
        cfg["h1_rsi_short"] = 100 - cfg["h1_rsi_long"] # Symmetrical
        cfg["risk_per_trade"] = 0.01 # Stick to 1% for consistency during high-freq sweep
        
        # 30 day run
        engine30 = FastBacktestEngine(candles30, cfg)
        pnl30, dd30, t30 = engine30.run()
        
        # 7 day run
        engine7 = FastBacktestEngine(candles7, cfg)
        pnl7, dd7, t7 = engine7.run()
        
        # Scoring - Pivoted for High Frequency (1-3 trades/day target)
        # 30 days has ~22 trading days. We want 20-40+ trades for 1-2/day avg.
        if t30 >= 20: trades_mult = 1.2    # Bonus for high activity
        elif t30 >= 10: trades_mult = 1.0  # Standard
        elif t30 >= 5: trades_mult = 0.5   # Penalty for low activity
        else: trades_mult = 0.1           # Severe penalty for "dead" strategy
        
        # New weighted score: Profitability + Frequency - Drawdown
        score = ((pnl30 / 100.0) * 1.0) + (pnl7 / 100.0) - (dd30 * 4.0)
        score *= trades_mult
        
        if pnl30 > 0 and pnl7 > 0: score += 5.0 # High bonus for multi-period profit
        
        results.append((score, pnl30, pnl7, dd30, t30, cfg.copy()))
        
        if score > best_score:
            best_score = score
            best_config = cfg.copy()
            print(f"[{count}/{len(combinations)}] New Best! Score: {score:.2f} | 30d: ${pnl30:.2f} ({t30} trades), 7d: ${pnl7:.2f}, DD: {dd30:.2%}", flush=True)

    if best_config:
        with open("python_algo/config_optimized.json", "w") as f:
            json.dump(best_config, f, indent=2)
        print("\nOptimization Complete. Best config saved.")
        
    results.sort(key=lambda x: x[0], reverse=True)
    print("\nTop 5 Results (Optimized for Day Trading):")
    for r in results[:5]:
        print(f"Score: {r[0]:.2f} | PnL30: ${r[1]:.2f} ({r[4]} trades) | PnL7: ${r[2]:.2f} | DD: {r[3]:.2%} | RR={r[5]['rr_ratio']}, Risk={r[5]['risk_per_trade']}")

if __name__ == "__main__":
    optimize()
