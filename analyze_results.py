import json
import ast
from datetime import datetime

# Parse the trades data from the backtest output
trades_data = [
    {'id': 1, 'action': 'BUY', 'direction': 'LONG', 'entry': 156.652, 'entryPrice': 156.652, 'entryTime': 1767732300000, 'sl': 156.65907142857142, 'tp': 156.86414285714284, 'units': 221528.0808081169, 'grade': 'A', 'confluenceScore': 8.0, 'exitPrice': 156.65907142857142, 'exitTime': 1767744000000, 'exitReason': 'Stop Loss', 'pnl': 9.999548610347421},
    {'id': 2, 'action': 'SELL', 'direction': 'SHORT', 'entry': 156.478, 'entryPrice': 156.478, 'entryTime': 1767777300000, 'sl': 156.5937142857143, 'tp': 156.13085714285714, 'units': -135363.1230317498, 'grade': 'A', 'confluenceScore': 8.0, 'exitPrice': 156.5937142857143, 'exitTime': 1767790800000, 'exitReason': 'Stop Loss', 'pnl': -100.02602700320162},
    {'id': 3, 'action': 'BUY', 'direction': 'LONG', 'entry': 157.918, 'entryPrice': 157.918, 'entryTime': 1767967200000, 'sl': 157.93745714285714, 'tp': 158.50171428571429, 'units': 80431.29508146613, 'grade': 'A', 'confluenceScore': 8.0, 'exitPrice': 157.93745714285714, 'exitTime': 1767970800000, 'exitReason': 'Stop Loss', 'pnl': 9.908752660041472},
    {'id': 4, 'action': 'BUY', 'direction': 'LONG', 'entry': 158.702, 'entryPrice': 158.702, 'entryTime': 1769085000000, 'sl': 158.71385, 'tp': 159.0575, 'units': 132852.75583886896, 'grade': 'A', 'confluenceScore': 8.0, 'exitPrice': 158.71385, 'exitTime': 1769085900000, 'exitReason': 'Stop Loss', 'pnl': 9.919141629365578},
    {'id': 5, 'action': 'SELL', 'direction': 'SHORT', 'entry': 153.669, 'entryPrice': 153.669, 'entryTime': 1769441400000, 'sl': 153.91682142857144, 'tp': 152.9255357142857, 'units': -61572.66797207613, 'grade': 'A', 'confluenceScore': 8.0, 'exitPrice': 153.91682142857144, 'exitTime': 1769443200000, 'exitReason': 'Stop Loss', 'pnl': -99.1381344557935}
]

print('BACKTEST RESULTS ON REAL USD/JPY DATA (30 days):')
print('=' * 60)

trades = trades_data
wins = [t for t in trades if t['pnl'] > 0]
losses = [t for t in trades if t['pnl'] < 0]
total_pnl = sum(t['pnl'] for t in trades)

print(f'Total Trades: {len(trades)}')
print(f'Trade Frequency: {len(trades)/30:.2f} trades per day')
print()
print(f'Win Rate: {len(wins)}/{len(trades)} ({len(wins)/len(trades)*100:.1f}%)')
print(f'Total PnL: ${total_pnl:.2f}')
if wins:
    print(f'Average Win: ${sum(t["pnl"] for t in wins)/len(wins):.2f}')
if losses:
    print(f'Average Loss: ${sum(t["pnl"] for t in losses)/len(losses):.2f}')

print()
print('Trade Details:')
for i, trade in enumerate(trades, 1):
    entry_time = datetime.fromtimestamp(trade['entryTime']/1000)
    exit_time = datetime.fromtimestamp(trade['exitTime']/1000)
    duration = exit_time - entry_time
    print(f'{i}. {trade["action"]} @ {trade["entry"]:.3f} | PnL: ${trade["pnl"]:.2f} | {entry_time.strftime("%m/%d %H:%M")} | Duration: {duration} | {trade["exitReason"]}')

print()
print('ISSUE IDENTIFIED:')
print('- Only 5 trades in 30 days = 0.17 trades/day')
print('- Need 1-3 trades/day for day trading strategy')
print('- All trades hit stop losses quickly (tight SL)')
print('- Confluence score too high (8.0) - overfiltering')
