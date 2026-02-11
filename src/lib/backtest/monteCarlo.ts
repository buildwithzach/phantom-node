import { Trade } from './types';

export interface MonteCarloResult {
    runs: number;
    profitablePercent: number;
    maxDrawdownMean: number;
    maxDrawdown95th: number;
    expectedReturnMean: number;
    equityCurves: number[][];
}

export class MonteCarloSimulator {
    private trades: Trade[];
    private initialEquity: number;

    constructor(trades: Trade[], initialEquity: number = 1000) {
        this.trades = trades.filter(t => t.status === 'CLOSED');
        this.initialEquity = initialEquity;
    }

    public run(iterations: number = 1000): MonteCarloResult {
        if (this.trades.length === 0) {
            return {
                runs: 0,
                profitablePercent: 0,
                maxDrawdownMean: 0,
                maxDrawdown95th: 0,
                expectedReturnMean: 0,
                equityCurves: []
            };
        }

        const pnls = this.trades.map(t => t.pnl || 0);
        const equityCurves: number[][] = [];
        const maxDrawdowns: number[] = [];
        const finalReturns: number[] = [];

        for (let i = 0; i < iterations; i++) {
            let currentEquity = this.initialEquity;
            const curve = [currentEquity];
            let peak = currentEquity;
            let maxDd = 0;

            // Shuffle and simulate
            const shuffled = [...pnls].sort(() => Math.random() - 0.5);

            for (const pnl of shuffled) {
                currentEquity += pnl;
                curve.push(currentEquity);

                if (currentEquity > peak) peak = currentEquity;
                const dd = (peak - currentEquity) / peak;
                if (dd > maxDd) maxDd = dd;
            }

            equityCurves.push(curve);
            maxDrawdowns.push(maxDd);
            finalReturns.push(currentEquity - this.initialEquity);
        }

        const profitableRuns = finalReturns.filter(r => r > 0).length;
        const sortedDds = [...maxDrawdowns].sort((a, b) => a - b);

        return {
            runs: iterations,
            profitablePercent: (profitableRuns / iterations) * 100,
            maxDrawdownMean: maxDrawdowns.reduce((a, b) => a + b, 0) / iterations,
            maxDrawdown95th: sortedDds[Math.floor(iterations * 0.95)],
            expectedReturnMean: finalReturns.reduce((a, b) => a + b, 0) / iterations,
            equityCurves: equityCurves.slice(0, 10) // Return 10 sample curves for UI
        };
    }
}
