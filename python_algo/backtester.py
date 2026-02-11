import pandas as pd
import numpy as np
from strategy import UsdJpyQuantStrategy

class VectorizedBacktester:
    def __init__(self, df, calendar_df, initial_balance=1000):
        self.df = df
        self.calendar_df = calendar_df
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.trades = []
        
        config = {
            'ema_fast': 9,
            'ema_slow': 21,
            'ema_trend': 200,
            'rsi_period': 14,
            'atr_period': 14,
            'atr_multiplier_sl': 1.5,
            'rr_ratio': 2.5
        }
        self.strategy = UsdJpyQuantStrategy(config)

    def run(self):
        print(f"Starting Backtest on {len(self.df)} candles...")
        
        # Pre-calculate indicators for the whole dataframe
        self.df = self.strategy.calculate_indicators(self.df)
        
        active_trade = None
        
        for i in range(800, len(self.df)):
            curr_row = self.df.iloc[i]
            prev_row = self.df.iloc[i-1]
            
            # 1. Manage Active Trade
            if active_trade:
                if active_trade['type'] == 'BUY':
                    if curr_row['low'] <= active_trade['sl']:
                        self._close_trade(active_trade, active_trade['sl'], curr_row['date'], 'Stop Loss')
                        active_trade = None
                    elif curr_row['high'] >= active_trade['tp']:
                        self._close_trade(active_trade, active_trade['tp'], curr_row['date'], 'Take Profit')
                        active_trade = None
                else: # SELL
                    if curr_row['high'] >= active_trade['sl']:
                        self._close_trade(active_trade, active_trade['sl'], curr_row['date'], 'Stop Loss')
                        active_trade = None
                    elif curr_row['low'] <= active_trade['tp']:
                        self._close_trade(active_trade, active_trade['tp'], curr_row['date'], 'Take Profit')
                        active_trade = None
            
            # 2. Check for New Signal if no active trade
            if not active_trade:
                # Simple slice for signal generation
                slice_df = self.df.iloc[:i+1]
                signal = self.strategy.generate_signal(slice_df)
                
                if signal and signal['action'] in ['BUY', 'SELL']:
                    active_trade = {
                        'type': signal['action'],
                        'entry_price': signal['entry'],
                        'entry_date': curr_row['date'],
                        'sl': signal['sl'],
                        'tp': signal['tp'],
                        'size': (self.balance * 0.01) / (abs(signal['entry'] - signal['sl']))
                    }

        return self.get_metrics()

    def _close_trade(self, trade, exit_price, exit_date, reason):
        pnl = (exit_price - trade['entry_price']) * trade['size'] if trade['type'] == 'BUY' else (trade['entry_price'] - exit_price) * trade['size']
        self.balance += pnl
        self.trades.append({
            **trade,
            'exit_price': exit_price,
            'exit_date': exit_date,
            'pnl': pnl,
            'reason': reason,
            'balance': self.balance
        })

    def get_metrics(self):
        if not self.trades:
            return "No trades executed."
            
        trades_df = pd.DataFrame(self.trades)
        win_rate = (trades_df['pnl'] > 0).mean() * 100
        total_pnl = trades_df['pnl'].sum()
        max_drawdown = (trades_df['balance'].cummax() - trades_df['balance']).max()
        
        return {
            'Total PnL': f"${total_pnl:.2f}",
            'Win Rate': f"{win_rate:.1f}%",
            'Max Drawdown': f"${max_drawdown:.2f}",
            'Total Trades': len(trades_df),
            'Final Balance': f"${self.balance:.2f}"
        }

if __name__ == "__main__":
    # Mock data for demonstration
    dates = pd.date_range(start='2026-01-01', periods=1000, freq='15min')
    df = pd.DataFrame({
        'date': dates,
        'open': np.random.uniform(150, 160, 1000),
        'high': np.random.uniform(150, 160, 1000),
        'low': np.random.uniform(150, 160, 1000),
        'close': np.random.uniform(150, 160, 1000),
        'volume': np.random.uniform(1000, 5000, 1000)
    })
    
    # Ensure high/low are correct
    df['high'] = df[['open', 'close', 'high']].max(axis=1)
    df['low'] = df[['open', 'close', 'low']].min(axis=1)
    
    bt = VectorizedBacktester(df, pd.DataFrame())
    metrics = bt.run()
    print("\n--- Backtest Results ---")
    for k, v in metrics.items():
        print(f"{k}: {v}")
