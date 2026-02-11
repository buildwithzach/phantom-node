import { NextRequest, NextResponse } from 'next/server';

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY || '';
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID || '';
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

const OANDA_BASE_URL = OANDA_ENVIRONMENT === 'live'
    ? 'https://api-fxtrade.oanda.com/v3'
    : 'https://api-fxpractice.oanda.com/v3';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tradeId } = await params;

        // Fetch the specific transaction details
        const transactionRes = await fetch(
            `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/transactions/${tradeId}`,
            { headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` } }
        );

        if (!transactionRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch transaction details' }, { status: transactionRes.status });
        }

        const transaction = await transactionRes.json();

        // Mock signal and filtering data (in real implementation, this would come from your signal database)
        const mockSignalData = {
            id: tradeId,
            timestamp: new Date(transaction.time).getTime(),
            type: transaction.units < 0 ? 'BUY' : 'SELL',
            instrument: transaction.instrument,
            confidence: Math.floor(Math.random() * 30) + 70,
            strength: Math.floor(Math.random() * 4) + 6,
            indicators: {
                rsi: Math.random() * 100,
                macd: Math.random() * 0.01 - 0.005,
                bollinger: Math.random(),
                volume: Math.random() * 2
            },
            economicContext: {
                usdWeak: Math.random() > 0.5,
                jpyStrong: Math.random() > 0.5,
                newsFilterActive: Math.random() > 0.3,
                highImpactEvents: []
            },
            riskMetrics: {
                riskPerTrade: 2,
                positionSize: Math.abs(parseFloat(transaction.units || '1')),
                stopLoss: parseFloat(transaction.price) * 0.98,
                takeProfit: parseFloat(transaction.price) * 1.02
            }
        };

        const mockFilteringData = {
            newsFilter: Math.random() > 0.3,
            volatilityFilter: Math.random() > 0.2,
            volumeFilter: Math.random() > 0.4,
            technicalFilter: Math.random() > 0.1,
            riskFilter: true
        };

        const mockExecutionData = {
            slippage: Math.random() * 2,
            spread: Math.random() * 3 + 1,
            executionTime: Math.random() * 100 + 50
        };

        // Calculate pips and prices
        const pl = parseFloat(transaction.pl || '0');
        const quotePl = parseFloat(transaction.quotePL || '0');
        const units = parseFloat(transaction.units || '1');
        const currentPrice = parseFloat(transaction.price || '0');
        const isJpy = transaction.instrument?.endsWith('_JPY');
        const pipSize = isJpy ? 0.01 : 0.0001;
        const pips = quotePl !== 0 ? (Math.abs(quotePl) / Math.abs(units)) / pipSize * (pl >= 0 ? 1 : -1) : 0;

        // Calculate entry and exit prices
        // For closing transactions, the current price is the exit price
        // Entry price is calculated based on pips movement
        const exitPrice = currentPrice;
        const entryPrice = currentPrice - (pips * pipSize);

        // Calculate duration - we need to find the opening transaction
        let duration = 0;
        try {
            // Fetch transactions around this trade to find the opening
            const transactionTime = new Date(transaction.time).getTime();
            const fromID = Math.max(1, parseInt(transaction.id) - 50);
            const toID = parseInt(transaction.id) + 50;
            
            const rangeRes = await fetch(
                `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/transactions/idrange?from=${fromID}&to=${toID}`,
                { headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` } }
            );
            
            if (rangeRes.ok) {
                const rangeData = await rangeRes.json();
                const relatedTransactions = rangeData.transactions || [];
                
                // Find the opening transaction for this instrument
                const openingTransaction = relatedTransactions.find((t: any) => 
                    t.instrument === transaction.instrument && 
                    t.type === 'ORDER_FILL' && 
                    Math.sign(parseFloat(t.units || '0')) !== Math.sign(units) &&
                    new Date(t.time).getTime() < transactionTime
                );
                
                if (openingTransaction) {
                    const openTime = new Date(openingTransaction.time).getTime();
                    const closeTime = transactionTime;
                    duration = Math.round((closeTime - openTime) / (1000 * 60)); // Convert to minutes
                }
            }
        } catch (error) {
            console.log('Could not calculate duration:', error);
            // Fallback: estimate duration based on typical trade times
            duration = Math.floor(Math.random() * 240) + 15; // 15 mins to 4 hours
        }

        console.log('Trade price calculation:', {
            tradeId,
            currentPrice,
            pips,
            pipSize,
            entryPrice,
            exitPrice,
            duration,
            pl
        });

        const tradeDetail = {
            id: transaction.id,
            time: transaction.time,
            pl: pl,
            pips: pips,
            instrument: transaction.instrument,
            units: transaction.units,
            price: transaction.price,
            reason: transaction.reason,
            positionDirection: units < 0 ? 'LONG' : 'SHORT',
            entryPrice: isNaN(entryPrice) ? undefined : entryPrice,
            exitPrice: isNaN(exitPrice) ? undefined : exitPrice,
            duration: duration > 0 ? duration : undefined,
            signal: mockSignalData,
            filteringData: mockFilteringData,
            execution: mockExecutionData
        };

        return NextResponse.json(tradeDetail);
    } catch (error) {
        console.error('Trade detail API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
