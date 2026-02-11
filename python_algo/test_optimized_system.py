#!/usr/bin/env python3
"""
Test the optimized high-return selective trading system
"""
import json
from unified_backtester import UnifiedBacktester
from datetime import datetime

def main():
    # Load test data
    with open('data/usdjpy_recent.json', 'r') as f:
        candles = json.load(f)

    print(f'Loaded {len(candles)} candles')

    # Run optimized backtest
    backtester = UnifiedBacktester()
    results = backtester.run_backtest(candles, initial_balance=10000)

    print(f'\n=== OPTIMIZED HIGH-RETURN RESULTS ===')
    print(f'Total Return: {results["total_return"]:.2f}%')
    print(f'Total Trades: {results["total_trades"]}')
    print(f'Win Rate: {results["win_rate"]:.1f}%')
    print(f'Profit Factor: {results["profit_factor"]:.2f}')
    print(f'Max Drawdown: {results["max_drawdown"]:.2f}%')
    print(f'Sharpe Ratio: {results["sharpe_ratio"]:.2f}')

    # Calculate trades per day
    if results['total_trades'] > 0:
        first_trade = results['trades'][0]['entry_time']
        last_trade = results['trades'][-1]['entry_time']
        
        # Handle different datetime formats
        if isinstance(first_trade, str):
            start_dt = datetime.fromisoformat(first_trade.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(last_trade.replace('Z', '+00:00'))
        else:
            start_dt = first_trade
            end_dt = last_trade
            
        days = (end_dt - start_dt).days + 1
        trades_per_day = results['total_trades'] / days
        print(f'Trades per day: {trades_per_day:.1f}')
        print(f'Trading period: {days} days')
        
        # Analyze trade quality
        grades = {}
        for trade in results['trades']:
            grade = trade.get('grade', 'C')
            grades[grade] = grades.get(grade, 0) + 1
        
        print(f'\nTrade Quality Distribution:')
        for grade, count in sorted(grades.items()):
            print(f'  Grade {grade}: {count} trades')

    # Save results
    with open('optimized_high_return_results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f'\nResults saved to optimized_high_return_results.json')

if __name__ == "__main__":
    main()