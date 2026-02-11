import { NextResponse } from 'next/server';

const FRED_API_KEY = process.env.NEXT_PUBLIC_FRED_API_KEY || '';
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

// FRED Series IDs for macro indicators
const MACRO_SERIES = {
    // Tier 1 - Must Watch
    US_10Y_YIELD: 'DGS10',
    VIX: 'VIXCLS',
    FED_RATE: 'FEDFUNDS',
    CPI: 'CPIAUCSL',
    UNEMPLOYMENT: 'UNRATE',

    // Tier 2 - Support
    OIL_WTI: 'DCOILWTICO',
    PCE: 'PCE',

    // Tier 3 - Context  
    GDP: 'GDP',
    HOUSING: 'HOUST',

    // Japan
    JAPAN_CPI: 'JPNCPIALLMINMEI',
};

interface MacroIndicator {
    name: string;
    tier: 1 | 2 | 3;
    value: number | null;
    previousValue: number | null;
    change: number | null;
    trend: 'rising' | 'falling' | 'stable' | 'unknown';
    signal: 'bullish' | 'bearish' | 'neutral';
    usdJpyImpact: string;
    lastUpdated: string;
    source: string;
}

interface BiasResult {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    score: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    yieldSignal: 'bullish' | 'bearish' | 'neutral';
    riskSignal: 'bullish' | 'bearish' | 'neutral';
    bojVolatility: boolean;
    agreementCount: number;
    recommendation: string;
    indicators: MacroIndicator[];
    timestamp: string;
}

async function fetchFredSeries(seriesId: string, limit: number = 5): Promise<any[]> {
    try {
        const url = `${FRED_BASE_URL}/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
        const response = await fetch(url, { next: { revalidate: 3600 } }); // Cache for 1 hour

        if (!response.ok) {
            console.error(`FRED API error for ${seriesId}: ${response.status}`);
            return [];
        }

        const data = await response.json();
        return data.observations || [];
    } catch (error) {
        console.error(`Error fetching FRED series ${seriesId}:`, error);
        return [];
    }
}

function getSignalForIndicator(
    seriesId: string,
    trend: 'rising' | 'falling' | 'stable' | 'unknown',
    currentValue: number
): 'bullish' | 'bearish' | 'neutral' {

    switch (seriesId) {
        case MACRO_SERIES.US_10Y_YIELD:
            if (trend === 'rising') return 'bullish';
            if (trend === 'falling') return 'bearish';
            return 'neutral';

        case MACRO_SERIES.VIX:
            if (currentValue > 25) return 'bearish';
            if (currentValue < 15) return 'bullish';
            if (trend === 'falling') return 'bullish';
            if (trend === 'rising') return 'bearish';
            return 'neutral';

        case MACRO_SERIES.FED_RATE:
            if (trend === 'rising') return 'bullish';
            if (trend === 'falling') return 'bearish';
            return 'neutral';

        case MACRO_SERIES.CPI:
            if (trend === 'rising') return 'bullish';
            if (trend === 'falling') return 'bearish';
            return 'neutral';

        case MACRO_SERIES.UNEMPLOYMENT:
            if (trend === 'falling') return 'bullish';
            if (trend === 'rising') return 'bearish';
            return 'neutral';

        case MACRO_SERIES.OIL_WTI:
            if (currentValue > 100) return 'bearish';
            if (trend === 'rising' && currentValue > 80) return 'bearish';
            return 'neutral';

        case MACRO_SERIES.JAPAN_CPI:
            if (trend === 'rising') return 'bearish';
            if (trend === 'falling') return 'bullish';
            return 'neutral';

        default:
            return 'neutral';
    }
}

function getImpactDescription(
    seriesId: string,
    signal: 'bullish' | 'bearish' | 'neutral',
    change: number
): string {
    const direction = signal === 'bullish' ? 'BULLISH' :
        signal === 'bearish' ? 'BEARISH' : 'NEUTRAL';

    switch (seriesId) {
        case MACRO_SERIES.US_10Y_YIELD:
            return `${direction} - ${change > 0 ? 'Rising' : 'Falling'} yields ${change > 0 ? 'widen' : 'narrow'} US-JP rate differential`;

        case MACRO_SERIES.VIX:
            return `${direction} - ${change > 0 ? 'Rising fear' : 'Risk appetite'} ${change > 0 ? 'favors JPY haven' : 'supports carry trades'}`;

        case MACRO_SERIES.FED_RATE:
            return `${direction} - ${change > 0 ? 'Hawkish' : 'Dovish'} Fed ${change > 0 ? 'strengthens' : 'weakens'} USD`;

        case MACRO_SERIES.CPI:
            return `${direction} - ${change > 0 ? 'Hot' : 'Cool'} inflation ${change > 0 ? 'supports' : 'undermines'} Fed hawkishness`;

        case MACRO_SERIES.UNEMPLOYMENT:
            return `${direction} - ${change < 0 ? 'Strong' : 'Weak'} labor market`;

        case MACRO_SERIES.JAPAN_CPI:
            return `${direction} - ${change > 0 ? 'Rising JP inflation may force BoJ tightening' : 'Deflationary pressure keeps BoJ dovish'}`;

        default:
            return direction;
    }
}

async function fetchIndicator(
    seriesId: string,
    name: string,
    tier: 1 | 2 | 3
): Promise<MacroIndicator | null> {
    const observations = await fetchFredSeries(seriesId, 5);

    if (observations.length < 2) return null;

    const validObs = observations.filter((o: any) => o.value !== '.' && !isNaN(parseFloat(o.value)));
    if (validObs.length < 2) return null;

    const latest = validObs[0];
    const previous = validObs[1];

    const currentValue = parseFloat(latest.value);
    const prevValue = parseFloat(previous.value);
    const change = currentValue - prevValue;
    const percentChange = prevValue !== 0 ? (change / prevValue) * 100 : 0;

    let trend: 'rising' | 'falling' | 'stable' | 'unknown' = 'unknown';
    if (Math.abs(percentChange) < 0.5) {
        trend = 'stable';
    } else if (change > 0) {
        trend = 'rising';
    } else {
        trend = 'falling';
    }

    const signal = getSignalForIndicator(seriesId, trend, currentValue);
    const impact = getImpactDescription(seriesId, signal, change);

    return {
        name,
        tier,
        value: currentValue,
        previousValue: prevValue,
        change: percentChange,
        trend,
        signal,
        usdJpyImpact: impact,
        lastUpdated: latest.date,
        source: 'FRED',
    };
}

function calculateBias(indicators: MacroIndicator[]): BiasResult {
    // 1️⃣ Yield Signal
    const yieldIndicators = indicators.filter(i =>
        i.name.includes('10-Year') || i.name.includes('Fed Funds')
    );
    const yieldBullish = yieldIndicators.filter(i => i.signal === 'bullish').length;
    const yieldBearish = yieldIndicators.filter(i => i.signal === 'bearish').length;
    const yieldSignal: 'bullish' | 'bearish' | 'neutral' =
        yieldBullish > yieldBearish ? 'bullish' :
            yieldBearish > yieldBullish ? 'bearish' : 'neutral';

    // 2️⃣ Risk Signal
    const vix = indicators.find(i => i.name.includes('VIX'));
    const riskSignal: 'bullish' | 'bearish' | 'neutral' = vix?.signal || 'neutral';

    // 3️⃣ BoJ Volatility
    const japanCpi = indicators.find(i => i.name.includes('Japan CPI'));
    const bojVolatility = japanCpi ? Math.abs(japanCpi.change || 0) > 1 : false;

    // Count agreement
    let bullishCount = 0;
    let bearishCount = 0;

    if (yieldSignal === 'bullish') bullishCount++;
    else if (yieldSignal === 'bearish') bearishCount++;

    if (riskSignal === 'bullish') bullishCount++;
    else if (riskSignal === 'bearish') bearishCount++;

    const agreementCount = Math.max(bullishCount, bearishCount);
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    let score: number;

    if (bullishCount >= 2) {
        bias = 'BULLISH';
        score = 50 + (bullishCount * 25);
    } else if (bearishCount >= 2) {
        bias = 'BEARISH';
        score = -50 - (bearishCount * 25);
    } else {
        bias = 'NEUTRAL';
        score = (bullishCount - bearishCount) * 25;
    }

    if (bojVolatility) {
        score = Math.round(score * 0.8);
    }

    let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    if (agreementCount >= 2 && !bojVolatility) {
        confidence = 'HIGH';
    } else if (agreementCount >= 2 || bullishCount + bearishCount >= 2) {
        confidence = 'MEDIUM';
    } else {
        confidence = 'LOW';
    }

    let recommendation: string;
    if (bias === 'BULLISH' && confidence === 'HIGH') {
        recommendation = 'HIGH PROBABILITY - Yields rising + Risk-on sentiment alignment';
    } else if (bias === 'BEARISH' && confidence === 'HIGH') {
        recommendation = 'HIGH PROBABILITY - Yields falling + Risk-off sentiment alignment';
    } else if (bias === 'BULLISH') {
        recommendation = 'MODERATE BIAS - Long bias detected. Monitor for divergence.';
    } else if (bias === 'BEARISH') {
        recommendation = 'MODERATE BIAS - Short bias detected. Monitor for divergence.';
    } else if (bojVolatility) {
        recommendation = 'WAIT FOR ALIGNMENT - BoJ Volatility Risk active. Neutral stance.';
    } else {
        recommendation = 'WAIT FOR ALIGNMENT - No clear macro consensus.';
    }

    return {
        bias,
        score,
        confidence,
        yieldSignal,
        riskSignal,
        bojVolatility,
        agreementCount,
        recommendation,
        indicators,
        timestamp: new Date().toISOString(),
    };
}

export async function GET() {
    try {
        const indicatorConfigs = [
            { series: MACRO_SERIES.US_10Y_YIELD, name: 'US 10-Year Treasury Yield', tier: 1 as const },
            { series: MACRO_SERIES.VIX, name: 'VIX (Fear Index)', tier: 1 as const },
            { series: MACRO_SERIES.FED_RATE, name: 'Fed Funds Rate', tier: 1 as const },
            { series: MACRO_SERIES.CPI, name: 'US CPI', tier: 1 as const },
            { series: MACRO_SERIES.UNEMPLOYMENT, name: 'US Unemployment (NFP)', tier: 1 as const },
            { series: MACRO_SERIES.OIL_WTI, name: 'WTI Crude Oil', tier: 2 as const },
            { series: MACRO_SERIES.PCE, name: 'PCE (Core Inflation)', tier: 2 as const },
            { series: MACRO_SERIES.JAPAN_CPI, name: 'Japan CPI', tier: 2 as const },
            { series: MACRO_SERIES.GDP, name: 'US GDP', tier: 3 as const },
            { series: MACRO_SERIES.HOUSING, name: 'Housing Starts', tier: 3 as const },
        ];

        const indicators = await Promise.all(
            indicatorConfigs.map(config =>
                fetchIndicator(config.series, config.name, config.tier)
            )
        );

        const validIndicators = indicators.filter((i): i is MacroIndicator => i !== null);
        const biasResult = calculateBias(validIndicators);

        return NextResponse.json(biasResult);
    } catch (error) {
        console.error('Macro bias API error:', error);
        return NextResponse.json(
            { error: 'Failed to calculate macro bias' },
            { status: 500 }
        );
    }
}
