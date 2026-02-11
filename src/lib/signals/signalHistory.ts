/**
 * Signal History Management
 * 
 * In-memory storage and performance tracking for generated signals.
 * Provides historical analysis and win-rate calculations.
 */

import { TradingSignal, SignalPerformance, SignalStatus } from './types';

export class SignalHistory {
    private signals: Map<string, TradingSignal> = new Map();
    private maxSignals: number = 100;

    /**
     * Add a new signal to history
     */
    public addSignal(signal: TradingSignal): void {
        this.signals.set(signal.id, signal);

        // Maintain max size
        if (this.signals.size > this.maxSignals) {
            const firstKey = Array.from(this.signals.keys())[0];
            if (firstKey !== undefined) {
                this.signals.delete(firstKey);
            }
        }
    }

    /**
     * Update signal status (filled, missed, cancelled)
     */
    public updateSignal(
        id: string,
        updates: Partial<Pick<TradingSignal, 'status' | 'filledAt' | 'exitPrice' | 'pnl'>>
    ): void {
        const signal = this.signals.get(id);
        if (!signal) return;

        Object.assign(signal, updates);

        // Auto-calculate P&L if exit price provided
        if (updates.exitPrice && signal.filledAt) {
            const pips =
                signal.action === 'BUY'
                    ? (updates.exitPrice - signal.entry) * 100
                    : (signal.entry - updates.exitPrice) * 100;
            signal.pnl = pips * (signal.size / 1000) * 0.065; // USD value
        }
    }

    /**
     * Get active signals (PENDING status)
     */
    public getActiveSignals(): TradingSignal[] {
        return Array.from(this.signals.values()).filter((s) => s.status === 'PENDING');
    }

    /**
     * Get all signals
     */
    public getAllSignals(): TradingSignal[] {
        return Array.from(this.signals.values()).sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get signals within date range
     */
    public getSignalsByDateRange(startTime: number, endTime: number): TradingSignal[] {
        return Array.from(this.signals.values()).filter(
            (s) => s.timestamp >= startTime && s.timestamp <= endTime
        );
    }

    /**
     * Calculate performance metrics for a given period
     */
    public getPerformanceMetrics(
        startTime: number,
        endTime: number
    ): SignalPerformance {
        const periodSignals = this.getSignalsByDateRange(startTime, endTime);
        const closedSignals = periodSignals.filter(
            (s) => s.status === 'FILLED' && s.pnl !== undefined
        );

        if (closedSignals.length === 0) {
            return {
                totalSignals: 0,
                winRate: 0,
                averageRR: 0,
                averagePnL: 0,
                bestSignal: null,
                worstSignal: null,
                period: { start: startTime, end: endTime },
            };
        }

        const winningSignals = closedSignals.filter((s) => (s.pnl ?? 0) > 0);
        const winRate = (winningSignals.length / closedSignals.length) * 100;

        const totalPnL = closedSignals.reduce((sum, s) => sum + (s.pnl ?? 0), 0);
        const averagePnL = totalPnL / closedSignals.length;

        const averageRR =
            closedSignals.reduce((sum, s) => sum + s.riskReward, 0) / closedSignals.length;

        const bestSignal = closedSignals.reduce((best, current) =>
            (current.pnl ?? 0) > (best.pnl ?? 0) ? current : best
        );

        const worstSignal = closedSignals.reduce((worst, current) =>
            (current.pnl ?? 0) < (worst.pnl ?? 0) ? current : worst
        );

        return {
            totalSignals: closedSignals.length,
            winRate,
            averageRR,
            averagePnL,
            bestSignal,
            worstSignal,
            period: { start: startTime, end: endTime },
        };
    }

    /**
     * Get last 30 days performance
     */
    public getLast30DaysPerformance(): SignalPerformance {
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        return this.getPerformanceMetrics(thirtyDaysAgo, now);
    }

    /**
     * Clear all signals (for testing)
     */
    public clear(): void {
        this.signals.clear();
    }

    /**
     * Get signal by ID
     */
    public getSignal(id: string): TradingSignal | undefined {
        return this.signals.get(id);
    }
}

// Global singleton instance
export const signalHistory = new SignalHistory();
