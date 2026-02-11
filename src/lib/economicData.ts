
import { EconomicEvent } from './backtest/types';

export class EconomicDataService {
    private events: EconomicEvent[] = [];

    constructor() {
        // Initialize with some mock data or load from file
        this.generateMockData();
    }

    private generateMockData() {
        // Generate some mock events for 2025-2026
        const startDate = new Date('2024-01-01').getTime(); // Start earlier
        const endDate = new Date('2026-12-31').getTime();

        for (let t = startDate; t <= endDate; t += 86400000) { // Daily
            // 30% chance of bearish news each day to ensure we get some signals
            if (Math.random() < 0.3) {
                this.events.push({
                    timestamp: t,
                    currency: 'USD',
                    event: 'NFP',
                    impact: 'HIGH',
                    actual: 150000,
                    forecast: 180000, // Bearish for USD
                    previous: 160000
                });
            }
        }
    }

    public getEvents(startTime: number, endTime: number): EconomicEvent[] {
        return this.events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
    }

    public checkConditions(timestamp: number): { usdWeak: boolean, jpyStrong: boolean } {
        // Look at recent events (e.g., last 24 hours)
        const recentEvents = this.getEvents(timestamp - 86400000, timestamp);

        let usdWeak = false;
        let jpyStrong = false;

        // Simple logic: if recent NFP < Forecast, USD Weak
        const nfp = recentEvents.find(e => e.event === 'NFP');
        if (nfp && nfp.actual < nfp.forecast) {
            usdWeak = true;
        }

        // Mock JPY logic
        // In reality, would check Tankai or intervention headlines
        // For now, let's assume JPY is strong if USD is weak (mean reversion context)
        if (usdWeak) jpyStrong = true;

        return { usdWeak, jpyStrong };
    }
}
