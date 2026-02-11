#!/usr/bin/env python3
import json

with open('python_algo/optimized_high_return_results.json', 'r') as f:
    results = json.load(f)

print('CURRENT PERFORMANCE ANALYSIS:')
print(f'Total Return: {results["total_return"]:.2f}%')
print(f'Total Trades: {results["total_trades"]}')
print(f'Win Rate: {results["win_rate"]:.1f}%')
print(f'Max Drawdown: {results["max_drawdown"]:.2f}%')
print(f'Profit Factor: {results["profit_factor"]:.2f}')

# Analyze trade grades
trades = results['trades']
grade_analysis = {}
for trade in trades:
    grade = trade.get('grade', 'C')
    if grade not in grade_analysis:
        grade_analysis[grade] = {'count': 0, 'total_pnl': 0, 'wins': 0}
    grade_analysis[grade]['count'] += 1
    grade_analysis[grade]['total_pnl'] += trade['pnl']
    if trade['pnl'] > 0:
        grade_analysis[grade]['wins'] += 1

print('\nTRADE GRADE ANALYSIS:')
for grade, stats in grade_analysis.items():
    win_rate = (stats['wins'] / stats['count']) * 100 if stats['count'] > 0 else 0
    avg_pnl = stats['total_pnl'] / stats['count'] if stats['count'] > 0 else 0
    print(f'{grade}: {stats["count"]} trades, {win_rate:.1f}% win rate, avg P&L: ${avg_pnl:.2f}')

# Find the big winner
big_winners = [t for t in trades if t['pnl'] > 100]
print(f'\nBIG WINNERS (>$100): {len(big_winners)}')
for winner in big_winners:
    print(f'  {winner["grade"]} grade: ${winner["pnl"]:.2f} ({winner["exit_reason"]})')

print('\nKEY INSIGHTS:')
print('- Very conservative system with low drawdown but minimal returns')
print('- Need to increase position sizing and risk tolerance')
print('- One big winner shows the system can capture large moves')
print('- Should focus on A+ and A grade signals for higher returns')