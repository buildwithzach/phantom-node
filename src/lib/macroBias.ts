/**
 * Macro Bias Engine for USDJPY
 * 
 * Implements the 3-question predictive framework:
 * 1️⃣ Are US yields rising or falling?
 * 2️⃣ Are stocks risk-on or risk-off?
 * 3️⃣ Any BoJ / Japan drama?
 * 
 * If 2/3 agree → that's the directional bias
 */

export interface MacroIndicator {
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

export interface BiasResult {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    score: number; // -100 to +100
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    yieldSignal: 'bullish' | 'bearish' | 'neutral';
    riskSignal: 'bullish' | 'bearish' | 'neutral';
    bojVolatility: boolean;
    agreementCount: number;
    recommendation: string;
    indicators: MacroIndicator[];
}

// FRED Series IDs for macro indicators
export const MACRO_SERIES = {
    // Tier 1 - Must Watch
    US_10Y_YIELD: 'DGS10',           // 10-Year Treasury Constant Maturity Rate
    VIX: 'VIXCLS',                   // CBOE Volatility Index
    FED_RATE: 'FEDFUNDS',            // Federal Funds Effective Rate
    CPI: 'CPIAUCSL',                 // Consumer Price Index
    UNEMPLOYMENT: 'UNRATE',          // Unemployment Rate (NFP proxy)

    // Tier 2 - Support
    OIL_WTI: 'DCOILWTICO',           // Crude Oil Prices: WTI
    PCE: 'PCE',                      // Personal Consumption Expenditures

    // Tier 3 - Context
    GDP: 'GDP',                      // Gross Domestic Product
    HOUSING: 'HOUST',                // Housing Starts
    PMI_PROXY: 'MANEMP',             // Manufacturing Employment (PMI proxy)

    // Japan
    JAPAN_CPI: 'JPNCPIALLMINMEI',    // Japan CPI
    USD_JPY: 'DEXJPUS',              // USD/JPY Exchange Rate
};

export async function fetchMacroIndicator(
    seriesId: string,
    name: string,
    tier: 1 | 2 | 3,
    limit: number = 5
): Promise<MacroIndicator | null> {
    try {
        const response = await fetch(`/api/fred?series_id=${seriesId}&limit=${limit}`);

        if (!response.ok) {
            console.error(`Failed to fetch ${seriesId}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const observations = data.observations || [];

        if (observations.length < 2) return null;

        // Filter out missing values
        const validObs = observations.filter((o: any) => o.value !== '.' && !isNaN(parseFloat(o.value)));
        if (validObs.length < 2) return null;

        const latest = validObs[0];
        const previous = validObs[1];
        const older = validObs[2] || previous;

        const currentValue = parseFloat(latest.value);
        const prevValue = parseFloat(previous.value);
        const change = currentValue - prevValue;
        const percentChange = (change / prevValue) * 100;

        // Determine trend based on recent movement
        let trend: 'rising' | 'falling' | 'stable' | 'unknown' = 'unknown';
        if (Math.abs(percentChange) < 0.5) {
            trend = 'stable';
        } else if (change > 0) {
            trend = 'rising';
        } else {
            trend = 'falling';
        }

        // Determine signal based on indicator type
        const signal = getSignalForIndicator(seriesId, trend, currentValue, prevValue);
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
    } catch (error) {
        console.error(`Error fetching ${seriesId}:`, error);
        return null;
    }
}

function getSignalForIndicator(
    seriesId: string,
    trend: 'rising' | 'falling' | 'stable' | 'unknown',
    currentValue: number,
    prevValue: number
): 'bullish' | 'bearish' | 'neutral' {

    switch (seriesId) {
        // US 10Y Yield - Rising = USD bullish (wider rate differential)
        case MACRO_SERIES.US_10Y_YIELD:
            if (trend === 'rising') return 'bullish';
            if (trend === 'falling') return 'bearish';
            return 'neutral';

        // VIX - Low/falling = Risk-on = USD/JPY bullish, High/rising = Risk-off = bearish
        case MACRO_SERIES.VIX:
            if (currentValue > 25) return 'bearish';  // High fear
            if (currentValue < 15) return 'bullish';  // Low fear (risk-on)
            if (trend === 'falling') return 'bullish';
            if (trend === 'rising') return 'bearish';
            return 'neutral';

        // Fed Rate - Rising = USD bullish
        case MACRO_SERIES.FED_RATE:
            if (trend === 'rising') return 'bullish';
            if (trend === 'falling') return 'bearish';
            return 'neutral';

        // CPI - Hot inflation = Fed hawkish = USD bullish
        case MACRO_SERIES.CPI:
            if (trend === 'rising') return 'bullish';
            if (trend === 'falling') return 'bearish';
            return 'neutral';

        // Unemployment - Low/falling = Strong economy = USD bullish
        case MACRO_SERIES.UNEMPLOYMENT:
            if (trend === 'falling') return 'bullish';
            if (trend === 'rising') return 'bearish';
            return 'neutral';

        // Oil - Rising oil can be complex, but often risk-off
        case MACRO_SERIES.OIL_WTI:
            if (currentValue > 100) return 'bearish';  // High oil = recession risk
            if (trend === 'rising' && currentValue > 80) return 'bearish';
            return 'neutral';

        // Japan CPI - Rising = BoJ may tighten = JPY strong = USDJPY bearish
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
    const direction = signal === 'bullish' ? 'Bullish' :
        signal === 'bearish' ? 'Bearish' : 'Neutral';

    switch (seriesId) {
        case MACRO_SERIES.US_10Y_YIELD:
            return `${direction} - ${change > 0 ? 'Rising' : 'Falling'} yields ${change > 0 ? 'widen' : 'narrow'} US-JP spread`;

        case MACRO_SERIES.VIX:
            return `${direction} - ${change > 0 ? 'Rising fear' : 'Risk appetite'} ${change > 0 ? 'favors JPY' : 'supports USD/JPY'}`;

        case MACRO_SERIES.FED_RATE:
            return `${direction} - ${change > 0 ? 'Hawkish' : 'Dovish'} Fed policy bias`;

        case MACRO_SERIES.CPI:
            return `${direction} - ${change > 0 ? 'Hot' : 'Cooling'} inflation impact`;

        case MACRO_SERIES.UNEMPLOYMENT:
            return `${direction} - ${change < 0 ? 'Strengthening' : 'Softening'} labor market`;

        case MACRO_SERIES.JAPAN_CPI:
            return `${direction} - BoJ tightening risk elevated`;

        default:
            return direction;
    }
}

export async function fetchAllMacroIndicators(): Promise<MacroIndicator[]> {
    const indicatorConfigs = [
        // Tier 1 - Must Watch
        { series: MACRO_SERIES.US_10Y_YIELD, name: 'US 10-Year Treasury Yield', tier: 1 as const },
        { series: MACRO_SERIES.VIX, name: 'VIX (Fear Index)', tier: 1 as const },
        { series: MACRO_SERIES.FED_RATE, name: 'Fed Funds Rate', tier: 1 as const },
        { series: MACRO_SERIES.CPI, name: 'US CPI', tier: 1 as const },
        { series: MACRO_SERIES.UNEMPLOYMENT, name: 'US Unemployment (NFP)', tier: 1 as const },

        // Tier 2 - Support
        { series: MACRO_SERIES.OIL_WTI, name: 'WTI Crude Oil', tier: 2 as const },
        { series: MACRO_SERIES.PCE, name: 'PCE (Core Inflation)', tier: 2 as const },
        { series: MACRO_SERIES.JAPAN_CPI, name: 'Japan CPI', tier: 2 as const },

        // Tier 3 - Context
        { series: MACRO_SERIES.GDP, name: 'US GDP', tier: 3 as const },
        { series: MACRO_SERIES.HOUSING, name: 'Housing Starts', tier: 3 as const },
    ];

    const results = await Promise.all(
        indicatorConfigs.map(config =>
            fetchMacroIndicator(config.series, config.name, config.tier)
        )
    );

    return results.filter((r): r is MacroIndicator => r !== null);
}

export function calculateBias(indicators: MacroIndicator[]): BiasResult {
    // 1️⃣ Question 1: Are US yields rising or falling?
    const yieldInd = indicators.find(i => i.name.includes('10-Year'));
    const yieldSignal = yieldInd?.signal || 'neutral';

    // 2️⃣ Question 2: Are stocks risk-on or risk-off?
    const vix = indicators.find(i => i.name.includes('VIX'));
    const riskSignal = vix?.signal || 'neutral';

    // 3️⃣ Question 3: Any BoJ / Japan drama? (Rising CPI = Tightening drama = JPY Strength)
    const japanCpi = indicators.find(i => i.name.includes('Japan CPI'));
    const bojVolatility = japanCpi ? Math.abs(japanCpi.change || 0) > 1 : false;
    const bojSignal: 'bullish' | 'bearish' | 'neutral' =
        japanCpi?.signal === 'bearish' ? 'bearish' : // Japan CPI Bearish for USDJPY = JPY Strong
            japanCpi?.signal === 'bullish' ? 'bullish' : 'neutral';

    // CONSENSUS LOGIC: 2/3 Agree -> Bias
    let bullishCount = 0;
    let bearishCount = 0;

    [yieldSignal, riskSignal, bojSignal].forEach(s => {
        if (s === 'bullish') bullishCount++;
        if (s === 'bearish') bearishCount++;
    });

    const agreementCount = Math.max(bullishCount, bearishCount);
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (bullishCount >= 2) bias = 'BULLISH';
    else if (bearishCount >= 2) bias = 'BEARISH';

    const score = (bullishCount - bearishCount) * 33;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (agreementCount === 3) confidence = 'HIGH';
    else if (agreementCount === 2) confidence = 'MEDIUM';

    // Generate operational recommendation
    let recommendation: string;
    if (agreementCount === 3) {
        recommendation = `HIGH PROBABILITY - Yields, Risk, and BoJ all align for ${bias} USDJPY momentum.`;
    } else if (agreementCount === 2) {
        recommendation = `MODERATE BIAS - 2/3 consensus reached. Watch for ${bias === 'BULLISH' ? 'Yield/Risk' : 'Yield/Risk'} divergence.`;
    } else {
        recommendation = "WAIT FOR ALIGNMENT - Macro drivers are fragmented. Neutral stance advised.";
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
    };
}
