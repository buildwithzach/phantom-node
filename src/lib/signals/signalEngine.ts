/**
 * Signal Generation Engine - Core Logic
 * 
 * Multi-indicator confluence framework for generating high-quality USD/JPY trading signals.
 * Implements professional signal filtering to achieve 2-3 signals per day target.
 */

import { Candle, EconomicEvent } from '@/types/forex';
import {
    TradingSignal,
    SignalConfig,
    ConfluenceFactor,
    SignalAction,
    SignalConfidence,
    SignalGrade,
} from './types';
import {
    calculateEMA,
    calculateRSI,
    calculateATR,
    calculateADX,
    calculateBollingerBands,
    detectRSIDivergence,
    detectLevelBreak,
    isBollingerSqueeze,
} from './indicators';

export class SignalEngine {
    private config: SignalConfig;
    private economicCalendar: EconomicEvent[] = [];
    private dailySignalCount: number = 0;
    private lastSignalDay: number = 0;

    constructor(config: Partial<SignalConfig> = {}) {
        this.config = {
            minConfluenceScore: config.minConfluenceScore ?? 3,
            minRiskReward: config.minRiskReward ?? 2.0,
            maxDailySignals: config.maxDailySignals ?? 3,
            requireMacroAlignment: config.requireMacroAlignment ?? false,
            macroWeight: config.macroWeight ?? 1.5,
            accountSize: config.accountSize ?? 10000,
            riskPerTrade: config.riskPerTrade ?? 0.01,
            enableH4Trend: config.enableH4Trend ?? true,
            enableH1Momentum: config.enableH1Momentum ?? true,
            enableM15Entry: config.enableM15Entry ?? true,
        };
    }

    /**
     * Set economic calendar for news filtering
     */
    public setEconomicCalendar(events: EconomicEvent[]): void {
        this.economicCalendar = events;
    }

    /**
     * Check if trading is safe (no high-impact news nearby)
     */
    private isNewsSafe(timestamp: number): boolean {
        if (!this.economicCalendar || this.economicCalendar.length === 0) return true;

        const buffer = 60 * 60 * 1000; // 60 minutes before/after
        const highImpactEvents = this.economicCalendar.filter(
            (e) =>
                (e.impact === 'HIGH' || e.impact === 'High') &&
                (e.currency === 'USD' || e.currency === 'JPY')
        );

        for (const event of highImpactEvents) {
            if (Math.abs(timestamp - event.timestamp) <= buffer) {
                return false;
            }
        }
        return true;
    }

    /**
     * Reset daily signal counter if new day
     */
    private checkDailyReset(timestamp: number): void {
        const currentDay = Math.floor(timestamp / (24 * 60 * 60 * 1000));
        if (currentDay !== this.lastSignalDay) {
            this.dailySignalCount = 0;
            this.lastSignalDay = currentDay;
        }
    }

    /**
     * Analyze trend confluence across timeframes
     */
    private analyzeTrendConfluence(
        h4Candles: Candle[],
        h1Candles: Candle[],
        prices: number[]
    ): ConfluenceFactor[] {
        const factors: ConfluenceFactor[] = [];

        if (!this.config.enableH4Trend) return factors;

        // H4 EMA 200 trend
        const ema200H4 = calculateEMA(prices, 200);
        const currentPrice = prices[prices.length - 1];
        const currentEMA200 = ema200H4[ema200H4.length - 1];

        if (currentPrice > currentEMA200 * 1.001) {
            // 0.1% above EMA200
            factors.push({
                type: 'TREND',
                name: 'EMA 200 H4 Bullish',
                timeframe: 'H4',
                value: currentEMA200.toFixed(3),
                weight: 1.5,
            });
        } else if (currentPrice < currentEMA200 * 0.999) {
            factors.push({
                type: 'TREND',
                name: 'EMA 200 H4 Bearish',
                timeframe: 'H4',
                value: currentEMA200.toFixed(3),
                weight: 1.5,
            });
        }

        // H1 EMA 50/200 Alignment
        if (this.config.enableH1Momentum && h1Candles.length >= 200) {
            const h1Prices = h1Candles.map((c) => c.close);
            const ema50H1 = calculateEMA(h1Prices, 50);
            const ema200H1 = calculateEMA(h1Prices, 200);

            const currentEMA50 = ema50H1[ema50H1.length - 1];
            const currentEMA200H1 = ema200H1[ema200H1.length - 1];

            if (currentEMA50 > currentEMA200H1) {
                factors.push({
                    type: 'TREND',
                    name: 'EMA 50/200 Cross Bullish',
                    timeframe: 'H1',
                    value: `${currentEMA50.toFixed(3)} > ${currentEMA200H1.toFixed(3)}`,
                    weight: 1.2,
                });
            } else if (currentEMA50 < currentEMA200H1) {
                factors.push({
                    type: 'TREND',
                    name: 'EMA 50/200 Cross Bearish',
                    timeframe: 'H1',
                    value: `${currentEMA50.toFixed(3)} < ${currentEMA200H1.toFixed(3)}`,
                    weight: 1.2,
                });
            }
        }

        return factors;
    }

    /**
     * Analyze momentum confluence
     */
    private analyzeMomentumConfluence(
        candles: Candle[],
        prices: number[]
    ): ConfluenceFactor[] {
        const factors: ConfluenceFactor[] = [];

        // RSI Divergence Detection
        const rsi = calculateRSI(prices, 14);
        const currentRSI = rsi[rsi.length - 1];

        const bullishDiv = detectRSIDivergence(prices, rsi, 'BULLISH');
        const bearishDiv = detectRSIDivergence(prices, rsi, 'BEARISH');

        if (bullishDiv && currentRSI < 40) {
            factors.push({
                type: 'MOMENTUM',
                name: 'RSI Bullish Divergence',
                timeframe: 'M15',
                value: currentRSI.toFixed(1),
                weight: 2.0, // High weight for divergence
            });
        } else if (bearishDiv && currentRSI > 60) {
            factors.push({
                type: 'MOMENTUM',
                name: 'RSI Bearish Divergence',
                timeframe: 'M15',
                value: currentRSI.toFixed(1),
                weight: 2.0,
            });
        }

        // ADX Strength Check
        const adx = calculateADX(candles, 14);
        const currentADX = adx[adx.length - 1];

        if (currentADX > 25) {
            factors.push({
                type: 'MOMENTUM',
                name: 'Strong Trend (ADX)',
                value: currentADX.toFixed(1),
                weight: 1.0,
            });
        }

        return factors;
    }

    /**
     * Analyze volatility confluence
     */
    private analyzeVolatilityConfluence(
        candles: Candle[],
        prices: number[]
    ): ConfluenceFactor[] {
        const factors: ConfluenceFactor[] = [];

        // ATR Expansion Check
        const atr = calculateATR(candles, 14);
        const currentATR = atr[atr.length - 1];
        const atrSMA = atr.slice(-20).reduce((a, b) => a + b, 0) / 20;

        if (currentATR > atrSMA * 1.2) {
            // 20% above average
            factors.push({
                type: 'VOLATILITY',
                name: 'ATR Expansion',
                value: `${currentATR.toFixed(4)} (${((currentATR / atrSMA - 1) * 100).toFixed(1)}%)`,
                weight: 1.0,
            });
        }

        // Bollinger Band Squeeze + Breakout
        const bands = calculateBollingerBands(prices, 20, 2);
        const isSqueeze = isBollingerSqueeze(bands);
        const currentPrice = prices[prices.length - 1];
        const upperBand = bands.upper[bands.upper.length - 1];
        const lowerBand = bands.lower[bands.lower.length - 1];

        if (isSqueeze && currentPrice > upperBand) {
            factors.push({
                type: 'VOLATILITY',
                name: 'BB Squeeze Breakout Bullish',
                value: currentPrice.toFixed(3),
                weight: 1.5,
            });
        } else if (isSqueeze && currentPrice < lowerBand) {
            factors.push({
                type: 'VOLATILITY',
                name: 'BB Squeeze Breakout Bearish',
                value: currentPrice.toFixed(3),
                weight: 1.5,
            });
        }

        return factors;
    }

    /**
     * Analyze support/resistance level breaks
     */
    private analyzeLevelConfluence(candles: Candle[]): ConfluenceFactor[] {
        const factors: ConfluenceFactor[] = [];

        // Detect resistance break (bullish)
        const resistanceBreak = detectLevelBreak(candles, 'RESISTANCE');
        if (resistanceBreak.broken) {
            factors.push({
                type: 'LEVEL',
                name: 'Resistance Break',
                value: resistanceBreak.level.toFixed(3),
                weight: 1.5,
            });
        }

        // Detect support break (bearish)
        const supportBreak = detectLevelBreak(candles, 'SUPPORT');
        if (supportBreak.broken) {
            factors.push({
                type: 'LEVEL',
                name: 'Support Break',
                value: supportBreak.level.toFixed(3),
                weight: 1.5,
            });
        }

        return factors;
    }

    /**
     * Generate trading signal from current market data
     */
    public generateSignal(
        m15Candles: Candle[],
        h1Candles?: Candle[],
        h4Candles?: Candle[],
        macroBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    ): TradingSignal | null {
        if (m15Candles.length < 200) return null;

        const currentCandle = m15Candles[m15Candles.length - 1];
        const currentTime = currentCandle.timestamp;

        // Check daily signal limit
        this.checkDailyReset(currentTime);
        if (this.dailySignalCount >= this.config.maxDailySignals) {
            return null;
        }

        // News filter
        if (!this.isNewsSafe(currentTime)) {
            return null;
        }

        // Calculate all confluence factors
        const prices = m15Candles.map((c) => c.close);
        const allFactors: ConfluenceFactor[] = [];

        // Trend confluence
        if (h4Candles && h1Candles) {
            allFactors.push(...this.analyzeTrendConfluence(h4Candles, h1Candles, prices));
        }

        // Momentum confluence
        allFactors.push(...this.analyzeMomentumConfluence(m15Candles, prices));

        // Volatility confluence
        allFactors.push(...this.analyzeVolatilityConfluence(m15Candles, prices));

        // Level confluence
        allFactors.push(...this.analyzeLevelConfluence(m15Candles));

        // Macro confluence (optional)
        if (macroBias && macroBias !== 'NEUTRAL') {
            allFactors.push({
                type: 'MACRO',
                name: `Macro Bias ${macroBias}`,
                value: macroBias,
                weight: this.config.macroWeight,
            });
        }

        // Calculate weighted confluence score
        const confluenceScore = allFactors.reduce((sum, f) => sum + f.weight, 0);

        // Filter by minimum confluence
        if (confluenceScore < this.config.minConfluenceScore) {
            return null;
        }

        // Determine signal direction
        const bullishFactors = allFactors.filter((f) =>
            f.name.toLowerCase().includes('bullish') || f.name.toLowerCase().includes('break')
        );
        const bearishFactors = allFactors.filter((f) =>
            f.name.toLowerCase().includes('bearish')
        );

        const bullishScore = bullishFactors.reduce((sum, f) => sum + f.weight, 0);
        const bearishScore = bearishFactors.reduce((sum, f) => sum + f.weight, 0);

        if (bullishScore < 2 && bearishScore < 2) {
            return null; // Not enough directional bias
        }

        const action: SignalAction = bullishScore > bearishScore ? 'BUY' : 'SELL';

        // Check macro alignment if required
        if (this.config.requireMacroAlignment && macroBias) {
            if (action === 'BUY' && macroBias === 'BEARISH') return null;
            if (action === 'SELL' && macroBias === 'BULLISH') return null;
        }

        // Calculate entry/exit levels
        const atr = calculateATR(m15Candles, 14);
        const currentATR = atr[atr.length - 1];
        const entry = currentCandle.close;

        const slDistance = currentATR * 1.5; // 1.5 ATR stop loss
        const tpDistance1 = slDistance * this.config.minRiskReward; // 1:2 minimum
        const tpDistance2 = slDistance * (this.config.minRiskReward + 1); // 1:3 extended

        const stopLoss = action === 'BUY' ? entry - slDistance : entry + slDistance;
        const takeProfit1 = action === 'BUY' ? entry + tpDistance1 : entry - tpDistance1;
        const takeProfit2 = action === 'BUY' ? entry + tpDistance2 : entry - tpDistance2;

        const riskReward = tpDistance1 / slDistance;

        // Calculate position size
        const riskAmount = this.config.accountSize * this.config.riskPerTrade;
        const positionSize = Math.floor((riskAmount * entry) / slDistance);

        // Determine confidence and grade
        const confidence: SignalConfidence = confluenceScore >= 5 ? 'HIGH' : 'MEDIUM';
        const grade: SignalGrade =
            confluenceScore >= 5.5 ? 'A+' : confluenceScore >= 4 ? 'A' : 'B';

        // Generate signal ID
        const id = `USDJPY-${action}-${currentTime}`;

        // Build reason string
        const topFactors = allFactors
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map((f) => f.name)
            .join(', ');

        const signal: TradingSignal = {
            id,
            timestamp: currentTime,
            pair: 'USD/JPY',
            action,
            confidence,
            grade,
            entry,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward,
            size: positionSize,
            riskAmount,
            confluenceScore,
            confluenceFactors: allFactors,
            macroBias,
            atr: currentATR,
            reason: `${grade} ${action} Signal - Confluence: ${confluenceScore.toFixed(1)}/6 (${topFactors})`,
            status: 'PENDING',
        };

        // Increment daily counter
        this.dailySignalCount++;

        return signal;
    }
}
