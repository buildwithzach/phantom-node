# Quick check of your actual trade PnLs from your log
trades = [
    -1.00, -0.99, 0.10, -0.98, 1.94, -0.99, 0.10, -0.98, -0.97, -0.96,
    1.90, 0.10, 1.94, 0.10, 1.98, 0.10, 0.10, -1.02, -1.01, 0.10,
    1.98, 2.02, 2.06, 2.10, 0.11, -1.08, 0.11, 0.11, -1.07, -1.06,
    0.10, -1.05, -1.04, -1.03, -1.02, -1.01, 2.00, 2.04, -1.04, -1.03,
    -1.02, 2.02, 0.10, -1.03, -1.02, 0.10, 0.10, 0.10, -1.01, 2.00,
    -1.02, -1.01, 2.01, 0.10, -1.02, 0.10, 0.10, 0.10, -1.01, -1.00,
    -1.00, 1.96, -1.01, -0.99, -0.99, -0.97, -0.97, 0.10, -0.96, -0.96,
    1.89, -0.97, -0.96, -0.96, -0.95, -0.94, 0.09, -0.94, 1.86, 0.10,
    -0.95, 0.09, -0.94, 1.86, 0.10, 0.10, -0.95, -0.95, -0.93, -0.92,
    0.09, -0.92, -0.92, -0.91, -0.91, 1.79, -0.92, -0.91, 1.82, 1.85,
    -0.93, -0.92, 1.85, 0.09, -0.93
]

total_pnl = sum(trades)
wins = [t for t in trades if t > 0]
losses = [t for t in trades if t < 0]

print('YOUR TRADE ANALYSIS:')
print(f'Total Trades: {len(trades)}')
print(f'Total PnL: ${total_pnl:.2f}')
print(f'Wins: {len(wins)} | Losses: {len(losses)}')
print(f'Win Rate: {len(wins)/len(trades)*100:.1f}%')
if wins:
    print(f'Avg Win: ${sum(wins)/len(wins):.2f}')
if losses:
    print(f'Avg Loss: ${sum(losses)/len(losses):.2f}')
print()
print('MONTE CARLO ISSUE:')
print(f'With $100 start equity, your ${total_pnl:.2f} total PnL is {total_pnl/100*100:.1f}% return')
print('Monte Carlo shows 0% because your strategy is barely breaking even')
print('You need larger wins or smaller losses to get positive Monte Carlo')
