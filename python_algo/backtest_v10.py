import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from strategy_v10 import PhantomNodeV10
import os

def load_data(file_path):
    """Load and preprocess market data"""
    print(f"Loading data from {file_path}...")
    df = pd.read_json(file_path)
    
    # Convert timestamp to datetime
    if 'time' in df.columns:
        df['time'] = pd.to_datetime(df['time'])
    elif 'timestamp' in df.columns:
        df['time'] = pd.to_datetime(df['timestamp'], unit='ms')
    else:
        raise ValueError("No time or timestamp column found in data")
    
    print(f"✅ Successfully loaded {len(df)} candles")
    print(f"Date Range: {df['time'].min()} to {df['time'].max()}")
    
    return df

def run_backtest():
    # Initialize strategy
    strategy = PhantomNodeV10()
    
    # Load data
    data_file = 'data/usdjpy_m15.json'
    if not os.path.exists(data_file):
        data_file = '../data/usdjpy_m15.json'
    
    df = load_data(data_file)
    
    # Backtest parameters
    initial_balance = 10000
    balance = initial_balance
    risk_per_trade = strategy.risk_per_trade
    max_trades = strategy.max_trades
    warmup_bars = 100
    
    # Initialize variables
    trades = []
    equity_curve = [{'time': df['time'].iloc[warmup_bars], 'balance': initial_balance}]
    position = None
    max_balance = initial_balance
    max_drawdown = 0
    last_trade_time = None
    
    print(f"\n🚀 Starting backtest with {len(df) - warmup_bars} bars")
    print(f"📊 Target trades: {max_trades} | Risk per trade: {risk_per_trade*100:.1f}%")
    print(f"🎯 Strategy: {strategy.name}")
    
    # Main backtest loop
    for i in range(warmup_bars, len(df)):
        current_df = df.iloc[:i+1].copy()
        current_candle = current_df.iloc[-1]
        current_time = current_candle['time']
        current_price = current_candle['close']
        
        # Calculate indicators
        current_df = strategy.calculate_indicators(current_df)
        current_candle = current_df.iloc[-1]
        
        # Generate signal if no open position
        if position is None and len(trades) < max_trades:
            signal = strategy.generate_signal(current_df, last_trade_time)
            
            if signal['action'] in ['BUY', 'SELL']:
                # Calculate position size
                position_size = strategy.calculate_position_size(
                    balance, 
                    signal['entry'], 
                    signal['sl'],
                    signal.get('strength', 1.0)
                )
                
                if position_size > 0:
                    position = {
                        'entry_time': current_time,
                        'action': signal['action'],
                        'entry': signal['entry'],
                        'sl': signal['sl'],
                        'tp': signal['tp'],
                        'size': position_size,
                        'atr': current_candle.get('atr', 0.001)
                    }
                    last_trade_time = current_time
                    
                    print(f"\n🎯 Trade #{len(trades)+1} - {current_time}")
                    print(f"   {signal['action']} | Type: {signal.get('type', 'N/A')} | Strength: {signal.get('strength', 1.0):.1f}")
                    print(f"   Entry: {current_price:.4f} | SL: {signal['sl']:.4f} | TP: {signal['tp']:.4f}")
                    print(f"   Size: {position_size:.2f} lots | Risk: ${balance * risk_per_trade:.2f}")
                    print(f"   {signal.get('reason', '')}")
        
        # Manage open position
        if position is not None:
            entry_time = position['entry_time']
            
            # Manage the position
            new_position, exit_signal = strategy.manage_position(position, current_price, current_time)
            
            # Check if position was closed
            if new_position is None and exit_signal:
                if exit_signal['action'] == 'CLOSE':
                    # Update balance
                    balance += exit_signal['pnl']
                    max_balance = max(max_balance, balance)
                    current_drawdown = (max_balance - balance) / max_balance * 100
                    max_drawdown = max(max_drawdown, current_drawdown)
                    
                    # Record trade
                    trade = {
                        'entry_time': entry_time,
                        'exit_time': current_time,
                        'action': position['action'],
                        'entry_price': position['entry'],
                        'exit_price': exit_signal['price'],
                        'pnl': exit_signal['pnl'],
                        'balance': balance,
                        'exit_reason': exit_signal.get('reason', 'Unknown'),
                        'duration_hours': (current_time - entry_time).total_seconds() / 3600
                    }
                    trades.append(trade)
                    equity_curve.append({'time': current_time, 'balance': balance})
                    position = None
                    
                    print(f"\n💵 Trade #{len(trades)} CLOSED - {current_time}")
                    print(f"   {trade['action']} | Entry: {trade['entry_price']:.4f} | Exit: {trade['exit_price']:.4f}")
                    print(f"   P&L: ${trade['pnl']:.2f} | Balance: ${balance:.2f}")
                    print(f"   {trade['exit_reason']}")
                    
            elif exit_signal and exit_signal['action'] == 'PARTIAL_CLOSE':
                # Update balance with partial close
                balance += exit_signal['pnl']
                equity_curve.append({'time': current_time, 'balance': balance})
                print(f"\n🔄 Partial close - {current_time}")
                print(f"   Size: {exit_signal['size']:.2f} lots | P&L: ${exit_signal['pnl']:.2f}")
                print(f"   {exit_signal['reason']}")
                
                # Update position reference
                position = new_position
    
    # Close any open position at the end
    if position is not None:
        current_price = df['close'].iloc[-1]
        entry_time = position['entry_time']
        position, exit_signal = strategy.manage_position(position, current_price, df['time'].iloc[-1])
        
        if exit_signal and exit_signal['action'] == 'CLOSE':
            balance += exit_signal['pnl']
            trade = {
                'entry_time': entry_time,
                'exit_time': df['time'].iloc[-1],
                'action': position['action'],
                'entry_price': position['entry'],
                'exit_price': exit_signal['price'],
                'pnl': exit_signal['pnl'],
                'balance': balance,
                'exit_reason': exit_signal.get('reason', 'End of backtest'),
                'duration_hours': (df['time'].iloc[-1] - entry_time).total_seconds() / 3600
            }
            trades.append(trade)
            equity_curve.append({'time': df['time'].iloc[-1], 'balance': balance})
    
    # Calculate performance metrics
    if not trades:
        return {
            'initial_balance': initial_balance,
            'final_balance': balance,
            'total_return': 0,
            'total_trades': 0,
            'win_rate': 0,
            'profit_factor': 0,
            'max_drawdown': 0,
            'sharpe_ratio': 0,
            'trades': [],
            'equity_curve': equity_curve
        }
    
    # Calculate metrics
    total_return = (balance - initial_balance) / initial_balance * 100
    winning_trades = [t for t in trades if t['pnl'] > 0]
    losing_trades = [t for t in trades if t['pnl'] <= 0]
    win_rate = len(winning_trades) / len(trades) * 100 if trades else 0
    
    total_profit = sum(t['pnl'] for t in winning_trades)
    total_loss = abs(sum(t['pnl'] for t in losing_trades))
    profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')
    
    # Calculate Sharpe ratio
    returns = pd.Series([t['pnl'] / initial_balance for t in trades])
    sharpe_ratio = (returns.mean() / (returns.std() + 1e-9)) * np.sqrt(252)
    
    # Prepare results
    results = {
        'initial_balance': initial_balance,
        'final_balance': balance,
        'total_return': total_return,
        'total_trades': len(trades),
        'win_rate': win_rate,
        'profit_factor': profit_factor,
        'max_drawdown': max_drawdown,
        'sharpe_ratio': sharpe_ratio,
        'trades': trades,
        'equity_curve': equity_curve,
        'winning_trades': len(winning_trades),
        'losing_trades': len(losing_trades),
        'avg_win': np.mean([t['pnl'] for t in winning_trades]) if winning_trades else 0,
        'avg_loss': np.mean([t['pnl'] for t in losing_trades]) if losing_trades else 0,
    }
    
    return results

def print_backtest_results(results):
    """Print formatted backtest results"""
    print("\n" + "=" * 60)
    print(f"🔥 {PhantomNodeV10().name} - BACKTEST RESULTS")
    print("=" * 60)
    
    # Account Summary
    print("\n💵 ACCOUNT SUMMARY")
    print(f"Initial Balance: ${results['initial_balance']:,.2f}")
    print(f"Final Balance:   ${results['final_balance']:,.2f}")
    print(f"Total Return:    {results['total_return']:.2f}%")
    
    # Performance Metrics
    print("\n📈 PERFORMANCE METRICS")
    print(f"Total Trades:    {results['total_trades']}")
    print(f"Win Rate:        {results['win_rate']:.1f}%")
    print(f"Profit Factor:   {results['profit_factor']:.2f}")
    print(f"Max Drawdown:    {results['max_drawdown']:.2f}%")
    print(f"Sharpe Ratio:    {results['sharpe_ratio']:.2f}")
    
    # Trade Analysis
    if results['total_trades'] > 0:
        print("\n🔍 TRADE ANALYSIS")
        print(f"Average Win:     ${results['avg_win']:.2f}")
        print(f"Average Loss:    ${results['avg_loss']:.2f}")
        win_loss_ratio = abs(results['avg_win'] / results['avg_loss']) if results['avg_loss'] != 0 else float('inf')
        print(f"Win/Loss Ratio:  {win_loss_ratio:.2f}R")
        
        # Monthly performance
        trades_df = pd.DataFrame(results['trades'])
        if not trades_df.empty:
            trades_df['month'] = trades_df['exit_time'].dt.strftime('%Y-%m')
            monthly = trades_df.groupby('month')['pnl'].sum()
            if not monthly.empty:
                print("\n📅 MONTHLY PERFORMANCE")
                for month, pnl in monthly.items():
                    print(f"{month}: ${pnl:,.2f} ({(pnl/results['initial_balance'])*100:.1f}%)")
        
        # Exit reasons
        if 'exit_reason' in trades_df.columns:
            print("\n🚦 EXIT REASONS")
            print(trades_df['exit_reason'].value_counts().to_string())
        
        # Last 5 trades
        if len(trades_df) > 0:
            print("\n🔄 LAST 5 TRADES")
            last_trades = trades_df.tail(5)
            for _, trade in last_trades.iterrows():
                print(f"{trade['action']} | {trade['exit_time']} | "
                      f"Entry: {trade['entry_price']:.4f} | Exit: {trade['exit_price']:.4f} | "
                      f"P&L: ${trade['pnl']:.2f} | {trade['exit_reason']}")

if __name__ == "__main__":
    results = run_backtest()
    print_backtest_results(results)
