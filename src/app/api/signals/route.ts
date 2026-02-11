/**
 * Signals API Route
 * 
 * Endpoints for generating and retrieving USD/JPY trading signals.
 * Integrates with OANDA for live price data and Macro Bias Engine for confluence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignalEngine } from '@/lib/signals/signalEngine';
import { signalHistory } from '@/lib/signals/signalHistory';
import { Candle } from '@/types/forex';

const OANDA_API_KEY = process.env.OANDA_API_KEY;
const OANDA_ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID;
const OANDA_BASE_URL = process.env.OANDA_BASE_URL || 'https://api-fxpractice.oanda.com';

/**
 * Fetch candles from OANDA
 */
async function fetchOandaCandles(
    instrument: string,
    granularity: 'M15' | 'H1' | 'H4',
    count: number = 300
): Promise<Candle[]> {
    try {
        const url = `${OANDA_BASE_URL}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${OANDA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            next: { revalidate: 60 }, // Cache for 1 minute
        });

        if (!response.ok) {
            console.error(`OANDA API error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const candles: Candle[] = data.candles.map((c: any) => ({
            timestamp: new Date(c.time).getTime(),
            open: parseFloat(c.mid.o),
            high: parseFloat(c.mid.h),
            low: parseFloat(c.mid.l),
            close: parseFloat(c.mid.c),
            volume: c.volume,
        }));

        return candles;
    } catch (error) {
        console.error('Error fetching OANDA candles:', error);
        return [];
    }
}

/**
 * Fetch macro bias from existing endpoint
 */
async function fetchMacroBias(): Promise<'BULLISH' | 'BEARISH' | 'NEUTRAL' | null> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/macro-bias`, {
            next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.bias || null;
    } catch (error) {
        console.error('Error fetching macro bias:', error);
        return null;
    }
}

/**
 * GET /api/signals - Retrieve active and recent signals
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const historyType = searchParams.get('history'); // 'all' | '30d' | null

        if (historyType === 'performance') {
            // Return performance metrics
            const performance = signalHistory.getLast30DaysPerformance();
            return NextResponse.json(performance);
        }

        if (historyType === 'all') {
            // Return all signals
            const allSignals = signalHistory.getAllSignals();
            return NextResponse.json({ signals: allSignals });
        }

        // Default: return active signals only
        const activeSignals = signalHistory.getActiveSignals();
        return NextResponse.json({ signals: activeSignals });
    } catch (error) {
        console.error('Signals API GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 });
    }
}

/**
 * POST /api/signals - Generate new signal
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { accountSize, riskPerTrade, requireMacroAlignment } = body;

        // Initialize signal engine
        const engine = new SignalEngine({
            accountSize: accountSize || 10000,
            riskPerTrade: riskPerTrade || 0.01,
            requireMacroAlignment: requireMacroAlignment ?? false,
            minConfluenceScore: 3.5,
            minRiskReward: 2.0,
            maxDailySignals: 3,
        });

        // Fetch multi-timeframe candles
        const [m15Candles, h1Candles, h4Candles] = await Promise.all([
            fetchOandaCandles('USD_JPY', 'M15', 300),
            fetchOandaCandles('USD_JPY', 'H1', 200),
            fetchOandaCandles('USD_JPY', 'H4', 100),
        ]);

        if (m15Candles.length === 0) {
            return NextResponse.json(
                { error: 'No market data available' },
                { status: 503 }
            );
        }

        // Fetch macro bias
        const macroBias = await fetchMacroBias();

        // Generate signal
        const signal = engine.generateSignal(m15Candles, h1Candles, h4Candles, macroBias || undefined);

        if (!signal) {
            return NextResponse.json({
                message: 'No signal generated. Confluence threshold not met or daily limit reached.',
                signal: null,
            });
        }

        // Store signal in history
        signalHistory.addSignal(signal);

        return NextResponse.json({ signal });
    } catch (error) {
        console.error('Signals API POST error:', error);
        return NextResponse.json(
            { error: 'Failed to generate signal' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/signals - Update signal status
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, status, filledAt, exitPrice } = body;

        if (!id) {
            return NextResponse.json({ error: 'Signal ID required' }, { status: 400 });
        }

        signalHistory.updateSignal(id, { status, filledAt, exitPrice });

        const updatedSignal = signalHistory.getSignal(id);
        return NextResponse.json({ signal: updatedSignal });
    } catch (error) {
        console.error('Signals API PATCH error:', error);
        return NextResponse.json(
            { error: 'Failed to update signal' },
            { status: 500 }
        );
    }
}
