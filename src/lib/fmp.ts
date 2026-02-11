
import axios from 'axios';

const FRED_API_KEY = process.env.NEXT_PUBLIC_FRED_API_KEY || '';
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

export interface EconomicEvent {
    event: string;
    date: string;
    country: string;
    actual: number | null;
    estimate: number | null;
    impact: 'Low' | 'Medium' | 'High';
    currency: string;
    change?: number | null;
    trend?: string;
    previousValue?: number | null;
    usdJpyImpact?: string;
    daysUntil?: number;
}

// Key economic indicators to track for USD/JPY (verified working FRED series)
const ECONOMIC_SERIES = {
    USD: {
        CPI: 'CPIAUCSL',          // Consumer Price Index
        CORE_CPI: 'CPILFESL',      // Core CPI
        GDP: 'GDP',                // GDP
        UNEMPLOYMENT: 'UNRATE',    // Unemployment Rate
        FED_RATE: 'FEDFUNDS',      // Federal Funds Rate
        RETAIL_SALES: 'RSXFS',     // Retail Sales
        ISM_MANUFACTURING: 'IPMAN', // Industrial Production Index (proxy for manufacturing)
        ISM_SERVICES: 'DSPIC96',   // Real Services GDP (proxy for services)
        CONSUMER_CONFIDENCE: 'UMCSENT', // University of Michigan Consumer Confidence
        PPI: 'PPIACO',             // Producer Price Index
        INITIAL_CLAIMS: 'ICSA',    // Initial Jobless Claims
        YIELD_10Y: 'DGS10',        // 10-Year Treasury Yield
        YIELD_2Y: 'DGS2',          // 2-Year Treasury Yield
        NFP: 'PAYEMS',             // Non-Farm Payrolls (All Employees)
    },
    JPY: {
        CPI: 'JPNCPIALLMINMEI',    // Japan CPI
        CORE_CPI: 'JPNCORALMMEI',  // Japan Core CPI
        GDP: 'JPNRGDPEXP',         // Japan GDP
        UNEMPLOYMENT: 'LRUNTTTTJPM156S', // Japan Unemployment
        INDUSTRIAL_PRODUCTION: 'JPNIPMAN', // Japan Industrial Production
        TRADE_BALANCE: 'JPNB6BLT02S', // Japan Trade Balance
        RETAIL_SALES: 'JPNRETMQMEI', // Japan Retail Sales
        YIELD_10Y: 'IRLTLT01JPM156N', // Japan 10-Year Yield
    }
};

// Helper function to generate future event dates based on typical release schedules
function generateFutureEventDate(dayOfWeek: number, hour: number, minute: number = 0): string {
    const today = new Date();
    const futureDate = new Date(today);

    // Find the next occurrence of the specified day of the week
    const currentDayOfWeek = today.getDay();
    let daysUntilEvent = (dayOfWeek - currentDayOfWeek + 7) % 7;

    // If it's the same day and the time has passed, go to next week
    if (daysUntilEvent === 0 && today.getHours() > hour) {
        daysUntilEvent = 7;
    }

    futureDate.setDate(today.getDate() + daysUntilEvent);
    futureDate.setHours(hour, minute, 0, 0);

    return futureDate.toISOString().slice(0, 19).replace('T', ' ');
}

// Helper function to add days to a date
function addDaysToDate(days: number): string {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return futureDate.toISOString().slice(0, 19).replace('T', ' ');
}

async function fetchFredSeries(seriesId: string, limit: number = 3): Promise<any[]> {
    try {
        const response = await fetch(`/api/fred?series_id=${seriesId}&limit=${limit}`);

        if (!response.ok) {
            console.warn(`FRED API error for ${seriesId}: ${response.status}`);
            return [];
        }

        const data = await response.json();
        return data.observations || [];
    } catch (error) {
        console.error(`Error fetching FRED series ${seriesId}:`, error);
        return [];
    }
}

export async function fetchEconomicCalendar(from: string, to: string): Promise<EconomicEvent[]> {
    const events: EconomicEvent[] = [];

    try {
        // Fetch US PPI - Producer inflation
        const ppiData = await fetchFredSeries(ECONOMIC_SERIES.USD.PPI, 3);
        if (ppiData.length >= 2) {
            const latest = ppiData[0];
            const previous = ppiData[1];
            const monthlyChange = ((parseFloat(latest.value) - parseFloat(previous.value)) / parseFloat(previous.value)) * 100;

            events.push({
                event: 'US Producer Price Index (PPI)',
                date: generateFutureEventDate(2, 8, 30), // Next Tuesday 8:30 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'Medium',
                currency: 'USD',
                change: monthlyChange,
                trend: monthlyChange > 0 ? 'Rising' : 'Falling',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: monthlyChange > 0.5 ? 'USD Bullish - Producer inflation rising' :
                    monthlyChange < 0 ? 'USD Bearish - Producer prices falling' :
                        'Neutral - Producer inflation stable'
            });
        }

        // Fetch US Consumer Confidence
        const confidenceData = await fetchFredSeries(ECONOMIC_SERIES.USD.CONSUMER_CONFIDENCE, 3);
        if (confidenceData.length >= 2) {
            const latest = confidenceData[0];
            const previous = confidenceData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'University of Michigan Consumer Confidence',
                date: generateFutureEventDate(5, 10, 0), // Next Friday 10:00 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'Medium',
                currency: 'USD',
                change: change,
                trend: change > 0 ? 'Improving' : 'Worsening',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 5 ? 'USD Bullish - Strong confidence supports spending' :
                    change < -5 ? 'USD Bearish - Weak confidence signals slowdown' :
                        'Neutral - Confidence stable'
            });
        }

        // Fetch US Core CPI - crucial for Fed policy
        const coreCpiData = await fetchFredSeries(ECONOMIC_SERIES.USD.CORE_CPI, 3);
        if (coreCpiData.length >= 2) {
            const latest = coreCpiData[0];
            const previous = coreCpiData[1];
            const monthlyChange = ((parseFloat(latest.value) - parseFloat(previous.value)) / parseFloat(previous.value)) * 100;

            events.push({
                event: 'US Core CPI (Ex Food & Energy)',
                date: generateFutureEventDate(4, 8, 30), // Next Thursday 8:30 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'USD',
                change: monthlyChange,
                trend: monthlyChange > 0 ? 'Accelerating' : 'Decelerating',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: monthlyChange > 0.4 ? 'USD Bullish - Stubborn core inflation keeps Fed hawkish' :
                    monthlyChange < 0.2 ? 'USD Bearish - Core inflation cooling allows Fed pause' :
                        'Neutral - Core inflation moderating'
            });
        }

        // Fetch Non-Farm Payrolls
        const nfpData = await fetchFredSeries(ECONOMIC_SERIES.USD.NFP, 3);
        if (nfpData.length >= 2) {
            const latest = nfpData[0];
            const previous = nfpData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'Non-Farm Payrolls',
                date: generateFutureEventDate(5, 8, 30), // Next Friday 8:30 AM (NFP day)
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value) + 200, // Typical monthly growth
                impact: 'High',
                currency: 'USD',
                change: change,
                trend: change > 250 ? 'Strong' : change < 100 ? 'Weak' : 'Moderate',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 300 ? 'USD Bullish - Strong labor market supports higher rates' :
                    change < 150 ? 'USD Bearish - Weak jobs growth suggests Fed cuts' :
                        'Neutral - Jobs growth in line with expectations'
            });
        }

        // Fetch ISM Manufacturing PMI
        const ismMfgData = await fetchFredSeries(ECONOMIC_SERIES.USD.ISM_MANUFACTURING, 3);
        if (ismMfgData.length >= 2) {
            const latest = ismMfgData[0];
            const previous = ismMfgData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'ISM Manufacturing PMI',
                date: generateFutureEventDate(1, 10, 0), // Next Monday 10:00 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: 50, // 50 = breakeven
                impact: 'High',
                currency: 'USD',
                change: change,
                trend: parseFloat(latest.value) > 50 ? 'Expansion' : 'Contraction',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: parseFloat(latest.value) > 52 ? 'USD Bullish - Manufacturing strength supports USD' :
                    parseFloat(latest.value) < 48 ? 'USD Bearish - Manufacturing contraction hurts USD' :
                        'Neutral - Manufacturing near breakeven'
            });
        }

        // Fetch ISM Services PMI
        const ismSvcData = await fetchFredSeries(ECONOMIC_SERIES.USD.ISM_SERVICES, 3);
        if (ismSvcData.length >= 2) {
            const latest = ismSvcData[0];
            const previous = ismSvcData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'ISM Services PMI',
                date: generateFutureEventDate(3, 10, 0), // Next Wednesday 10:00 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: 50,
                impact: 'High',
                currency: 'USD',
                change: change,
                trend: parseFloat(latest.value) > 50 ? 'Expansion' : 'Contraction',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: parseFloat(latest.value) > 56 ? 'USD Bullish - Services sector robust' :
                    parseFloat(latest.value) < 48 ? 'USD Bearish - Services weakness signals slowdown' :
                        'Neutral - Services activity moderate'
            });
        }

        // Fetch Initial Jobless Claims
        const claimsData = await fetchFredSeries(ECONOMIC_SERIES.USD.INITIAL_CLAIMS, 3);
        if (claimsData.length >= 2) {
            const latest = claimsData[0];
            const previous = claimsData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'Initial Jobless Claims',
                date: generateFutureEventDate(4, 8, 30), // Next Thursday 8:30 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: 220000, // Typical weekly level
                impact: 'Medium',
                currency: 'USD',
                change: change,
                trend: change < -10000 ? 'Improving' : change > 10000 ? 'Worsening' : 'Stable',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: parseFloat(latest.value) < 200000 ? 'USD Bullish - Low claims show strong labor market' :
                    parseFloat(latest.value) > 250000 ? 'USD Bearish - High claims signal labor weakness' :
                        'Neutral - Claims near normal levels'
            });
        }

        // Fetch 10-Year Treasury Yield
        const yield10yData = await fetchFredSeries(ECONOMIC_SERIES.USD.YIELD_10Y, 2);
        if (yield10yData.length >= 2) {
            const latest = yield10yData[0];
            const previous = yield10yData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'US 10-Year Treasury Yield',
                date: addDaysToDate(1), // Tomorrow
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'USD',
                change: change,
                trend: change > 0 ? 'Rising' : 'Falling',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 0.1 ? 'USD Bullish - Higher yields attract capital' :
                    change < -0.1 ? 'USD Bearish - Lower yields reduce appeal' :
                        'Neutral - Yields stable'
            });
        }

        // Fetch 2-Year Treasury Yield
        const yield2yData = await fetchFredSeries(ECONOMIC_SERIES.USD.YIELD_2Y, 2);
        if (yield2yData.length >= 2) {
            const latest = yield2yData[0];
            const previous = yield2yData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'US 2-Year Treasury Yield',
                date: addDaysToDate(2), // Day after tomorrow
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'Medium',
                currency: 'USD',
                change: change,
                trend: change > 0 ? 'Rising' : 'Falling',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 0.05 ? 'USD Bullish - Higher short-term yields support dollar' :
                    change < -0.05 ? 'USD Bearish - Lower yields reduce dollar appeal' :
                        'Neutral - Short-term yields stable'
            });
        }

        // Fetch US CPI with trend
        const cpiData = await fetchFredSeries(ECONOMIC_SERIES.USD.CPI, 3);
        if (cpiData.length >= 2) {
            const latest = cpiData[0];
            const previous = cpiData[1];
            const older = cpiData[2];
            const monthlyChange = ((parseFloat(latest.value) - parseFloat(previous.value)) / parseFloat(previous.value)) * 100;
            const trend = cpiData.length >= 3 ?
                ((parseFloat(latest.value) - parseFloat(older.value)) / parseFloat(older.value)) * 100 : 0;

            events.push({
                event: 'US CPI (Consumer Price Index)',
                date: generateFutureEventDate(4, 8, 30), // Next Thursday 8:30 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'USD',
                change: monthlyChange,
                trend: trend > 0 ? 'Rising' : 'Falling',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: monthlyChange > 0.3 ? 'USD Bullish - Higher inflation supports Fed hawkish stance' :
                    monthlyChange < 0.1 ? 'USD Bearish - Cooling inflation may pause Fed hikes' :
                        'Neutral - In-line with expectations'
            });
        }

        // Fetch US Unemployment with context
        const unemploymentData = await fetchFredSeries(ECONOMIC_SERIES.USD.UNEMPLOYMENT, 3);
        if (unemploymentData.length >= 2) {
            const latest = unemploymentData[0];
            const previous = unemploymentData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'US Unemployment Rate',
                date: generateFutureEventDate(5, 8, 30), // Next Friday 8:30 AM
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'USD',
                change: change,
                trend: change < 0 ? 'Improving' : 'Weakening',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change < -0.1 ? 'USD Bullish - Strong labor market supports USD' :
                    change > 0.1 ? 'USD Bearish - Weakening employment weighs on USD' :
                        'Neutral - Stable employment picture'
            });
        }

        // Fetch Fed Funds Rate with policy context
        const fedRateData = await fetchFredSeries(ECONOMIC_SERIES.USD.FED_RATE, 3);
        if (fedRateData.length >= 2) {
            const latest = fedRateData[0];
            const previous = fedRateData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'Federal Funds Effective Rate',
                date: addDaysToDate(3), // 3 days from now (FOMC announcements)
                country: 'US',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'USD',
                change: change,
                trend: change > 0 ? 'Tightening' : change < 0 ? 'Easing' : 'Unchanged',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 0 ? 'USD Bullish - Rate hikes widen US-Japan yield differential' :
                    change < 0 ? 'USD Bearish - Rate cuts narrow yield advantage' :
                        'Neutral - Policy on hold, watch forward guidance'
            });
        }

        // Fetch Japan CPI with BoJ policy context
        const jpnCpiData = await fetchFredSeries(ECONOMIC_SERIES.JPY.CPI, 3);
        if (jpnCpiData.length >= 2 && jpnCpiData[0].value !== '.') {
            const latest = jpnCpiData[0];
            const previous = jpnCpiData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'Japan CPI (All Items)',
                date: generateFutureEventDate(5, 23, 30), // Next Friday 11:30 PM JST
                country: 'Japan',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'JPY',
                change: change,
                trend: change > 0 ? 'Rising' : 'Falling',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 0.3 ? 'JPY Bullish - Rising inflation may force BoJ policy shift' :
                    change < 0 ? 'JPY Bearish - Deflation risk keeps BoJ ultra-dovish' :
                        'Neutral - Inflation near BoJ target'
            });
        }

        // Fetch Japan Core CPI - crucial for BoJ
        const jpnCoreCpiData = await fetchFredSeries(ECONOMIC_SERIES.JPY.CORE_CPI, 3);
        if (jpnCoreCpiData.length >= 2 && jpnCoreCpiData[0].value !== '.') {
            const latest = jpnCoreCpiData[0];
            const previous = jpnCoreCpiData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'Japan Core CPI (Ex Fresh Food)',
                date: generateFutureEventDate(5, 23, 30), // Next Friday 11:30 PM JST
                country: 'Japan',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'JPY',
                change: change,
                trend: change > 0 ? 'Accelerating' : 'Decelerating',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 0.2 ? 'JPY Bullish - Core inflation rising supports BoJ tightening' :
                    change < 0 ? 'JPY Bearish - Core inflation falling delays policy shift' :
                        'Neutral - Core inflation stable'
            });
        }

        // Fetch Japan Industrial Production
        const jpnIpData = await fetchFredSeries(ECONOMIC_SERIES.JPY.INDUSTRIAL_PRODUCTION, 3);
        if (jpnIpData.length >= 2 && jpnIpData[0].value !== '.') {
            const latest = jpnIpData[0];
            const previous = jpnIpData[1];
            const change = ((parseFloat(latest.value) - parseFloat(previous.value)) / parseFloat(previous.value)) * 100;

            events.push({
                event: 'Japan Industrial Production',
                date: generateFutureEventDate(2, 23, 50), // Next Tuesday 11:50 PM JST
                country: 'Japan',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'Medium',
                currency: 'JPY',
                change: change,
                trend: change > 0 ? 'Expanding' : 'Contracting',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 2 ? 'JPY Bullish - Strong production supports economic recovery' :
                    change < -2 ? 'JPY Bearish - Weak production signals economic weakness' :
                        'Neutral - Production stable'
            });
        }

        // Fetch Japan Trade Balance
        const jpnTradeData = await fetchFredSeries(ECONOMIC_SERIES.JPY.TRADE_BALANCE, 3);
        if (jpnTradeData.length >= 2 && jpnTradeData[0].value !== '.') {
            const latest = jpnTradeData[0];
            const previous = jpnTradeData[1];

            events.push({
                event: 'Japan Trade Balance',
                date: generateFutureEventDate(3, 23, 50), // Next Wednesday 11:50 PM JST
                country: 'Japan',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'Medium',
                currency: 'JPY',
                change: parseFloat(latest.value) - parseFloat(previous.value),
                trend: parseFloat(latest.value) > 0 ? 'Surplus' : 'Deficit',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: parseFloat(latest.value) > 0 ? 'JPY Bullish - Trade surplus supports yen' :
                    parseFloat(latest.value) < -1000 ? 'JPY Bearish - Large deficit pressures yen' :
                        'Neutral - Trade balance moderate'
            });
        }

        // Fetch Japan 10-Year Yield
        const jpnYieldData = await fetchFredSeries(ECONOMIC_SERIES.JPY.YIELD_10Y, 3);
        if (jpnYieldData.length >= 2 && jpnYieldData[0].value !== '.') {
            const latest = jpnYieldData[0];
            const previous = jpnYieldData[1];
            const change = parseFloat(latest.value) - parseFloat(previous.value);

            events.push({
                event: 'Japan 10-Year Government Bond Yield',
                date: addDaysToDate(1), // Tomorrow
                country: 'Japan',
                actual: parseFloat(latest.value),
                estimate: parseFloat(previous.value),
                impact: 'High',
                currency: 'JPY',
                change: change,
                trend: change > 0 ? 'Rising' : 'Falling',
                previousValue: parseFloat(previous.value),
                usdJpyImpact: change > 0.05 ? 'JPY Bullish - Higher yields narrow US-Japan spread' :
                    change < -0.05 ? 'JPY Bearish - Lower yields widen carry trade appeal' :
                        'Neutral - Yields stable'
            });
        }

        // Add upcoming NFP with context
        const today = new Date();
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const firstFriday = new Date(nextMonth);
        while (firstFriday.getDay() !== 5) {
            firstFriday.setDate(firstFriday.getDate() + 1);
        }

        const daysUntilNFP = Math.ceil((firstFriday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilNFP <= 14 && daysUntilNFP > 0) {
            events.push({
                event: 'Non-Farm Payrolls (Upcoming)',
                date: firstFriday.toISOString().split('T')[0] + ' 08:30:00',
                country: 'US',
                actual: null,
                estimate: 180,
                impact: 'High',
                currency: 'USD',
                change: null,
                trend: 'Expected',
                previousValue: null,
                usdJpyImpact: `Major volatility expected - Strong print (>200k) = USD rally. Weak (<150k) = USD selloff. Watch for wage growth data.`,
                daysUntil: daysUntilNFP
            });
        }

    } catch (error) {
        console.error('Error fetching FRED economic data:', error);
    }

    return events;
}

export function filterHighImpactUsdJpyEvents(events: EconomicEvent[]): EconomicEvent[] {
    return events.filter(e =>
        (e.currency === 'USD' || e.currency === 'JPY') &&
        (e.impact === 'High' || e.impact === 'Medium' ||
            e.event.includes('Fed') || e.event.includes('BoJ') ||
            e.event.includes('CPI') || e.event.includes('Employment') ||
            e.event.includes('Payrolls') || e.event.includes('ISM') ||
            e.event.includes('Treasury') || e.event.includes('Yield') ||
            e.event.includes('Industrial') || e.event.includes('Trade'))
    );
}
