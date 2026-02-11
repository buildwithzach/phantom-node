/**
 * Signal Generation Engine - Technical Indicators
 * 
 * Core technical analysis functions for multi-timeframe confluence detection.
 * Used by the signal engine to calculate trend, momentum, and volatility metrics.
 */

import { Candle } from '@/types/forex';

/**
 * Calculate Exponential Moving Average
 */
export function calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
        ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

/**
 * Calculate Relative Strength Index
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
    const rsis: number[] = [];
    for (let i = period; i <= prices.length; i++) {
        const window = prices.slice(i - period, i);
        let gains = 0, losses = 0;
        for (let j = 1; j < window.length; j++) {
            const diff = window[j] - window[j - 1];
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        rsis.push(100 - (100 / (1 + avgGain / (avgLoss || 0.00001))));
    }
    const padding = new Array(prices.length - rsis.length).fill(50);
    return [...padding, ...rsis];
}

/**
 * Calculate Average True Range
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
    const atrs: number[] = [];
    const trs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }

    for (let i = period - 1; i < trs.length; i++) {
        const window = trs.slice(i - period + 1, i + 1);
        atrs.push(window.reduce((a, b) => a + b, 0) / period);
    }

    const padding = new Array(candles.length - atrs.length).fill(atrs[0] || 0.02);
    return [...padding, ...atrs];
}

/**
 * Calculate Average Directional Index (ADX)
 */
export function calculateADX(candles: Candle[], period: number = 14): number[] {
    if (candles.length < period * 2) return new Array(candles.length).fill(20);

    const adxs: number[] = [];
    const trs: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const ph = candles[i - 1].high;
        const pl = candles[i - 1].low;
        const pc = candles[i - 1].close;

        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));

        const upMove = h - ph;
        const downMove = pl - l;

        if (upMove > downMove && upMove > 0) {
            plusDMs.push(upMove);
            minusDMs.push(0);
        } else if (downMove > upMove && downMove > 0) {
            minusDMs.push(downMove);
            plusDMs.push(0);
        } else {
            plusDMs.push(0);
            minusDMs.push(0);
        }
    }

    for (let i = period - 1; i < trs.length; i++) {
        const tr_sum = trs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        const pdm_sum = plusDMs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        const mdm_sum = minusDMs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);

        const plusDI = 100 * (pdm_sum / (tr_sum || 0.01));
        const minusDI = 100 * (mdm_sum / (tr_sum || 0.01));
        adxs.push(Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1) * 100);
    }

    const padding = new Array(candles.length - adxs.length).fill(adxs[0] || 20);
    return [...padding, ...adxs];
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
    prices: number[],
    period: number = 20,
    stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
    const middle: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = period - 1; i < prices.length; i++) {
        const window = prices.slice(i - period + 1, i + 1);
        const sma = window.reduce((a, b) => a + b, 0) / period;
        const variance = window.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
        const sd = Math.sqrt(variance);

        middle.push(sma);
        upper.push(sma + stdDev * sd);
        lower.push(sma - stdDev * sd);
    }

    const padding = new Array(prices.length - middle.length).fill(0);
    return {
        upper: [...padding, ...upper],
        middle: [...padding, ...middle],
        lower: [...padding, ...lower],
    };
}

/**
 * Detect RSI Divergence
 * Returns true if bullish/bearish divergence is detected
 */
export function detectRSIDivergence(
    prices: number[],
    rsi: number[],
    type: 'BULLISH' | 'BEARISH',
    lookback: number = 14
): boolean {
    if (prices.length < lookback || rsi.length < lookback) return false;

    const recentPrices = prices.slice(-lookback);
    const recentRSI = rsi.slice(-lookback);

    // Find local highs/lows
    const priceMin = Math.min(...recentPrices);
    const priceMax = Math.max(...recentPrices);
    const rsiMin = Math.min(...recentRSI);
    const rsiMax = Math.max(...recentRSI);

    if (type === 'BULLISH') {
        // Price making lower lows, RSI making higher lows
        const priceLowIndex1 = recentPrices.indexOf(priceMin);
        const rsiLowIndex1 = recentRSI.indexOf(rsiMin);

        // Check for divergence pattern
        if (priceLowIndex1 < recentPrices.length - 5) {
            const laterPrices = recentPrices.slice(priceLowIndex1 + 1);
            const laterRSI = recentRSI.slice(rsiLowIndex1 + 1);
            const laterPriceMin = Math.min(...laterPrices);
            const laterRSIMin = Math.min(...laterRSI);

            return laterPriceMin < priceMin && laterRSIMin > rsiMin;
        }
    } else {
        // Price making higher highs, RSI making lower highs
        const priceHighIndex1 = recentPrices.indexOf(priceMax);
        const rsiHighIndex1 = recentRSI.indexOf(rsiMax);

        if (priceHighIndex1 < recentPrices.length - 5) {
            const laterPrices = recentPrices.slice(priceHighIndex1 + 1);
            const laterRSI = recentRSI.slice(rsiHighIndex1 + 1);
            const laterPriceMax = Math.max(...laterPrices);
            const laterRSIMax = Math.max(...laterRSI);

            return laterPriceMax > priceMax && laterRSIMax < rsiMax;
        }
    }

    return false;
}

/**
 * Detect Support/Resistance Level Break
 */
export function detectLevelBreak(
    candles: Candle[],
    type: 'SUPPORT' | 'RESISTANCE',
    lookback: number = 50
): { broken: boolean; level: number } {
    if (candles.length < lookback) return { broken: false, level: 0 };

    const recentCandles = candles.slice(-lookback);
    const currentCandle = candles[candles.length - 1];

    // Find pivot highs/lows
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);

    if (type === 'RESISTANCE') {
        const resistanceLevel = Math.max(...highs.slice(0, -5)); // Exclude last 5 candles
        const broken = currentCandle.close > resistanceLevel && currentCandle.open < resistanceLevel;
        return { broken, level: resistanceLevel };
    } else {
        const supportLevel = Math.min(...lows.slice(0, -5));
        const broken = currentCandle.close < supportLevel && currentCandle.open > supportLevel;
        return { broken, level: supportLevel };
    }
}

/**
 * Check if Bollinger Bands are squeezing (low volatility)
 */
export function isBollingerSqueeze(
    bands: { upper: number[]; middle: number[]; lower: number[] },
    threshold: number = 0.01
): boolean {
    const recentUpper = bands.upper.slice(-1)[0];
    const recentLower = bands.lower.slice(-1)[0];
    const recentMiddle = bands.middle.slice(-1)[0];

    const bandwidth = (recentUpper - recentLower) / recentMiddle;
    return bandwidth < threshold;
}
