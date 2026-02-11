
import sys
import json
import pandas as pd
import numpy as np
from strategy_v10 import PhantomNodeV10

def run_backtest():
    try:
        input_data = json.load(sys.stdin)
        candles_raw = input_data.get('candles', [])
        config = input_data.get('config', {})
        
        # Use the EXACT live configuration passed from API
        # NO OVERRIDES - use what the live system uses
        print(f"[DEBUG] Using live config: {config}", file=sys.stderr)
        initial_equity = input_data.get('initial_equity', 10000.0)
        max_daily_loss = config.get('max_daily_loss', 500.0)
        
        target_start_str = input_data.get('target_start_date')
        # Ensure target_start_dt is timezone-naive for comparison
        target_start_dt = pd.to_datetime(target_start_str).tz_localize(None) if target_start_str else None

        if not candles_raw:
            print(json.dumps({"error": "No candles provided"}))
            return

        df = pd.DataFrame(candles_raw)
        df['date'] = pd.to_datetime(df['timestamp'], unit='ms')
        df = df.rename(columns={'timestamp': 'time'})
        # Convert time to datetime to avoid numpy.int64 issues
        df['time'] = pd.to_datetime(df['time'], unit='ms')
        
        # Add volume column if missing
        if 'volume' not in df.columns:
            df['volume'] = 1000  # Default volume

        # --- OPTIMIZATION: Pre-calculate indicators on full dataset ---
        # This prevents O(N^2) recalculation inside the loop
        temp_strategy = PhantomNodeV10(config)
        df = temp_strategy.calculate_indicators(df)
        
        # Subclass to skip recalculation during loop
        class FastBacktestStrategy(PhantomNodeV10):
            def calculate_indicators(self, df):
                return df
                
        strategy = FastBacktestStrategy(config)
        
        # Backtest state
        equity = initial_equity
        active_trade = None
        trades = []
        equity_curve = []
        
        # Daily PnL tracking
        daily_pnl = 0
        last_date = None

        # Warmup
        warmup = 500
        
        print(f"Starting backtest on {len(df)} candles. Warmup: {warmup}", file=sys.stderr)
        
        for i in range(warmup, len(df)):
            row = df.iloc[i]
            curr_date = row['date'].date()
            
            # Skipping logic for target date
            if target_start_dt and row['date'] < target_start_dt:
                continue

            # Daily Reset
            if last_date != curr_date:
                daily_pnl = 0
                last_date = curr_date

            # 1. Manage Active Trade
            if active_trade:
                # Update current price
                current_price = row['close']
                low = row['low']
                high = row['high']
                current_atr = row.get('atr14', 0)
                
                # Update trailing stop if enabled
                if 'phantom_node' in active_trade.get('signal', {}) and \
                   active_trade['signal']['phantom_node'].get('trailing_stop', {}).get('enabled', False):
                    
                    sl_dist = active_trade['sl'] - active_trade['entry'] if active_trade['action'] == 'SELL' else active_trade['entry'] - active_trade['sl']
                    atr_mult = active_trade['signal']['phantom_node']['trailing_stop'].get('atr_multiplier', 2.1)
                    start_rr = active_trade['signal']['phantom_node']['trailing_stop'].get('start_rr', 2.0)
                    
                    # Calculate current R multiple
                    if active_trade['action'] == 'BUY':
                        current_rr = (current_price - active_trade['entry']) / sl_dist
                        if current_rr >= start_rr:
                            new_sl = current_price - (atr_mult * current_atr)
                            active_trade['sl'] = max(new_sl, active_trade['sl'])  # Only move up for long
                    else:  # SELL
                        current_rr = (active_trade['entry'] - current_price) / sl_dist
                        if current_rr >= start_rr:
                            new_sl = current_price + (atr_mult * current_atr)
                            active_trade['sl'] = min(new_sl, active_trade['sl'])  # Only move down for short
                
                exit_price = None
                exit_reason = None
                
                if active_trade['action'] == 'BUY':
                    # Dynamic Trailing Stop
                    # If price moves > 1R in profit, move SL to Breakeven
                    entry_price = active_trade['entry']
                    sl_dist = entry_price - active_trade['sl']
                    
                    if high > (entry_price + sl_dist): # > 1R Profit
                        # Move SL to Breakeven + a tiny buffer
                        new_sl = entry_price + (sl_dist * 0.1) 
                        if new_sl > active_trade['sl']:
                            active_trade['sl'] = new_sl

                    if low <= active_trade['sl']:
                        exit_price = active_trade['sl']
                        exit_reason = "Stop Loss"
                    elif high >= active_trade['tp']:
                        exit_price = active_trade['tp']
                        exit_reason = "Take Profit"
                else: # SELL
                    entry_price = active_trade['entry']
                    sl_dist = active_trade['sl'] - entry_price
                    
                    if low < (entry_price - sl_dist): # > 1R Profit
                        new_sl = entry_price - (sl_dist * 0.1)
                        if new_sl < active_trade['sl']:
                            active_trade['sl'] = new_sl

                    if high >= active_trade['sl']:
                        exit_price = active_trade['sl']
                        exit_reason = "Stop Loss"
                    elif low <= active_trade['tp']:
                        exit_price = active_trade['tp']
                        exit_reason = "Take Profit"

                if exit_price:
                    # Calculate PnL (JPY for USD/JPY)
                    # Calculate PnL based on position size in lots
                    # For USD/JPY: 1 pip = 0.01 JPY
                    # PnL in JPY = (exit_price - entry_price) * units * 100,000 * 0.01
                    # PnL in USD = PnL_JPY / exit_price
                    price_diff = exit_price - active_trade['entry']
                    if active_trade['action'] == 'SELL':
                        price_diff = -price_diff
                    
                    pnl_jpy = price_diff * abs(active_trade['units']) * 100000 * 0.01
                    pnl = pnl_jpy / exit_price
                    equity += pnl
                    daily_pnl += pnl
                    
                    active_trade['exitPrice'] = exit_price
                    active_trade['exitTime'] = int(row['date'].timestamp() * 1000)
                    active_trade['exitReason'] = exit_reason
                    active_trade['pnl'] = pnl
                    trades.append(active_trade)
                    active_trade = None
                    print(f"Trade Closed: {exit_reason} PnL: {pnl:.2f}", file=sys.stderr)

            # 2. Check for New Signal (if no active trade and not circuit broken)
            if not active_trade and daily_pnl > -max_daily_loss:
                # Use strategy's session filter
                if strategy.is_trading_session_active(row['date']):
                    slice_df = df.iloc[:i+1]
                    signal = strategy.generate_signal(slice_df)
                    
                    # Diagnostic Log
                    if i % 100 == 0 or signal['action'] != 'HOLD':
                         print(f"[{row['date']}] {signal['action']} | Score: {signal.get('confluence_score', 0)} | Reason: {signal.get('reason', 'N/A')}", file=sys.stderr)

                    if signal['action'] in ['BUY', 'SELL']:
                        # Position Sizing
                        risk_pct = config.get('risk_per_trade', 0.01)
                        risk_amount = equity * risk_pct
                        sl_dist = abs(signal['entry'] - signal['sl'])
                        
                        if sl_dist > 0:
                            # Use the same position sizing calculation as live algo
                            def calc_units_usdjpy(balance: float, risk_pct: float, entry: float, sl: float, action: str) -> int:
                                """Position size in OANDA units for USD/JPY. Risk = risk_pct * balance."""
                                sl_dist = abs(entry - sl)
                                if sl_dist <= 0:
                                    return 0
                                risk_amount = balance * risk_pct
                                units = int(risk_amount / sl_dist)
                                return units
                            
                            units = calc_units_usdjpy(equity, risk_pct, signal['entry'], signal['sl'], signal['action'])
                            if signal['action'] == 'SELL': 
                                units = -units
                            
                            active_trade = {
                                "id": len(trades) + 1,
                                "action": signal['action'],
                                "direction": "LONG" if signal['action'] == 'BUY' else "SHORT",
                                "entry": signal['entry'],
                                "entryPrice": signal['entry'],
                                "entryTime": int(row['date'].timestamp() * 1000),
                                "sl": signal['sl'],
                                "tp": signal['tp'],
                                "units": units,
                                "grade": signal.get('grade', 'C'),
                                "confluenceScore": signal.get('confluence_score', 0)
                            }

            equity_curve.append({"timestamp": int(row['date'].timestamp() * 1000), "equity": equity})

        # Calculate Stats
        total_pnl = equity - initial_equity
        wins = [t for t in trades if t['pnl'] > 0]
        win_rate = len(wins) / len(trades) if trades else 0
        
        # Max Drawdown
        equities = [p['equity'] for p in equity_curve]
        peak = initial_equity
        max_dd = 0
        for e in equities:
            if e > peak: peak = e
            dd = (peak - e) / peak
            if dd > max_dd: max_dd = dd

        # Output only the JSON result to stdout
        result = {
            "totalPnl": total_pnl,
            "winRate": win_rate,
            "maxDrawdown": max_dd,
            "equityCurve": equity_curve,
            "trades": trades
        }
        print(json.dumps(result, separators=(',', ':')))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    run_backtest()
