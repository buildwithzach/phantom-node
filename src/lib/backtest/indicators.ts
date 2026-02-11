
export function EMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema: number[] = new Array(data.length).fill(0);

    // Initial value is SMA
    let sma = 0;
    for (let i = 0; i < period; i++) {
        sma += data[i];
    }
    ema[period - 1] = sma / period;

    for (let i = period; i < data.length; i++) {
        ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }

    return ema;
}

export function RSI(data: number[], period: number): number[] {
    const rsi: number[] = new Array(data.length).fill(50);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgGain / (avgLoss || 1e-10);
        rsi[i] = 100 - (100 / (1 + rs));
    }

    return rsi;
}

export function ATR(high: number[], low: number[], close: number[], period: number): number[] {
    const tr: number[] = new Array(high.length).fill(0);
    const atr: number[] = new Array(high.length).fill(0);

    for (let i = 1; i < high.length; i++) {
        tr[i] = Math.max(
            high[i] - low[i],
            Math.abs(high[i] - close[i - 1]),
            Math.abs(low[i] - close[i - 1])
        );
    }

    let sum = 0;
    for (let i = 1; i <= period; i++) {
        sum += tr[i];
    }
    atr[period] = sum / period;

    for (let i = period + 1; i < high.length; i++) {
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return atr;
}

export function ADX(high: number[], low: number[], close: number[], period: number): { adx: number[], plusDI: number[], minusDI: number[] } {
    const tr: number[] = new Array(high.length).fill(0);
    const dmPlus: number[] = new Array(high.length).fill(0);
    const dmMinus: number[] = new Array(high.length).fill(0);

    for (let i = 1; i < high.length; i++) {
        const upMove = high[i] - high[i - 1];
        const downMove = low[i - 1] - low[i];

        tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
        dmPlus[i] = upMove > downMove && upMove > 0 ? upMove : 0;
        dmMinus[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    }

    const smoothTR: number[] = new Array(high.length).fill(0);
    const smoothPlus: number[] = new Array(high.length).fill(0);
    const smoothMinus: number[] = new Array(high.length).fill(0);

    let trSum = 0, pSum = 0, mSum = 0;
    for (let i = 1; i <= period; i++) {
        trSum += tr[i];
        pSum += dmPlus[i];
        mSum += dmMinus[i];
    }
    smoothTR[period] = trSum;
    smoothPlus[period] = pSum;
    smoothMinus[period] = mSum;

    const plusDI: number[] = new Array(high.length).fill(0);
    const minusDI: number[] = new Array(high.length).fill(0);
    const dx: number[] = new Array(high.length).fill(0);

    for (let i = period; i < high.length; i++) {
        if (i > period) {
            smoothTR[i] = smoothTR[i - 1] - (smoothTR[i - 1] / period) + tr[i];
            smoothPlus[i] = smoothPlus[i - 1] - (smoothPlus[i - 1] / period) + dmPlus[i];
            smoothMinus[i] = smoothMinus[i - 1] - (smoothMinus[i - 1] / period) + dmMinus[i];
        }

        plusDI[i] = 100 * (smoothPlus[i] / (smoothTR[i] || 1e-10));
        minusDI[i] = 100 * (smoothMinus[i] / (smoothTR[i] || 1e-10));
        dx[i] = 100 * (Math.abs(plusDI[i] - minusDI[i]) / ((plusDI[i] + minusDI[i]) || 1e-10));
    }

    const adx: number[] = new Array(high.length).fill(0);
    let dxSum = 0;
    for (let i = period; i < period * 2; i++) {
        dxSum += dx[i];
    }
    adx[period * 2 - 1] = dxSum / period;

    for (let i = period * 2; i < high.length; i++) {
        adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }

    return { adx, plusDI, minusDI };
}

export function SMA(data: number[], period: number): number[] {
    const sma: number[] = new Array(data.length).fill(0);
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j];
        }
        sma[i] = sum / period;
    }
    return sma;
}

export function BollingerBands(data: number[], period: number, stdDev: number = 2): { middle: number[], upper: number[], lower: number[], width: number[] } {
    const middle = SMA(data, period);
    const upper: number[] = new Array(data.length).fill(0);
    const lower: number[] = new Array(data.length).fill(0);
    const width: number[] = new Array(data.length).fill(0);

    for (let i = period - 1; i < data.length; i++) {
        let variance = 0;
        for (let j = 0; j < period; j++) {
            variance += Math.pow(data[i - j] - middle[i], 2);
        }
        const sd = Math.sqrt(variance / period);
        upper[i] = middle[i] + (sd * stdDev);
        lower[i] = middle[i] - (sd * stdDev);
        width[i] = (upper[i] - lower[i]) / (middle[i] || 1e-10);
    }

    return { middle, upper, lower, width };
}
