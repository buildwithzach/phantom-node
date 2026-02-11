import { NextRequest, NextResponse } from 'next/server';

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY || '';
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID || '';
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

const OANDA_BASE_URL = OANDA_ENVIRONMENT === 'live'
    ? 'https://api-fxtrade.oanda.com/v3'
    : 'https://api-fxpractice.oanda.com/v3';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        // 1. Get the most recent transaction ID
        const summaryRes = await fetch(`${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/summary`, {
            headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` }
        });

        if (!summaryRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch account summary' }, { status: summaryRes.status });
        }

        const summaryData = await summaryRes.json();
        const lastTransactionID = parseInt(summaryData.lastTransactionID);

        // 2. Fetch transactions with optional date filtering
        let transactionsRes;
        
        if (fromDate && toDate) {
            // Use date range filter with pagination to get all transactions
            const from = new Date(fromDate).toISOString();
            const to = new Date(toDate).toISOString();
            let allTransactions: any[] = [];
            let pageId: string | null = null;

            do {
                let url = `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/transactions?from=${from}&to=${to}&type=ORDER_FILL`;
                if (pageId) {
                    url += `&pageId=${pageId}`;
                }
                
                transactionsRes = await fetch(url, { headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` } });
                
                if (!transactionsRes.ok) break;
                
                const pageData = await transactionsRes.json();
                allTransactions = allTransactions.concat(pageData.transactions || []);
                pageId = pageData.pages?.next || null;
            } while (pageId);

            // Create a mock response object for consistency
            transactionsRes = {
                ok: true,
                json: async () => ({ transactions: allTransactions })
            } as Response;
        } else {
            // Default: fetch last 500 transactions for better coverage
            const fromID = Math.max(1, lastTransactionID - 500);
            transactionsRes = await fetch(
                `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/transactions/idrange?from=${fromID}&to=${lastTransactionID}`,
                { headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` } }
            );
        }

        if (!transactionsRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch transaction details' }, { status: transactionsRes.status });
        }

        const transactionsData = await transactionsRes.json();
        const transactions = transactionsData.transactions || [];

        // Aggregate statistics
        let wins = 0;
        let losses = 0;
        let totalPl = 0;
        let totalWinAmount = 0;
        let totalLossAmount = 0;
        let totalPips = 0;

        const closedTrades = transactions
            .filter((t: any) => t.type === 'ORDER_FILL' && parseFloat(t.pl || '0') !== 0)
            .map((t: any) => {
                const pl = parseFloat(t.pl);
                const quotePl = parseFloat(t.quotePL || '0');
                const units = parseFloat(t.units || '1');
                const isJpy = t.instrument?.endsWith('_JPY');
                const pipSize = isJpy ? 0.01 : 0.0001;
                const pips = quotePl !== 0 ? (Math.abs(quotePl) / Math.abs(units)) / pipSize * (pl >= 0 ? 1 : -1) : 0;

                totalPl += pl;
                totalPips += pips;
                if (pl > 0) {
                    wins++;
                    totalWinAmount += pl;
                } else if (pl < 0) {
                    losses++;
                    totalLossAmount += Math.abs(pl);
                }
                
                // Determine position direction: negative units means closing a LONG (profit/loss on LONG)
                // positive units means closing a SHORT (profit/loss on SHORT)
                const positionDirection = units < 0 ? 'LONG' : 'SHORT';
                
                return {
                    id: t.id,
                    time: t.time,
                    pl: pl,
                    pips: pips,
                    instrument: t.instrument,
                    units: t.units,
                    price: t.price,
                    reason: t.reason,
                    positionDirection: positionDirection
                };
            });

        const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
        const avgWin = wins > 0 ? totalWinAmount / wins : 0;
        const avgLoss = losses > 0 ? totalLossAmount / losses : 0;
        const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 100 : 0;

        return NextResponse.json({
            stats: {
                totalTrades: wins + losses,
                wins,
                losses,
                winRate: winRate.toFixed(1),
                totalPl: totalPl.toFixed(2),
                totalPips: totalPips.toFixed(1),
                avgWin: avgWin.toFixed(2),
                avgLoss: avgLoss.toFixed(2),
                profitFactor: profitFactor.toFixed(2)
            },
            history: closedTrades.sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())
        });
    } catch (error) {
        console.error('Account audit API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
