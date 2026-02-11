import { NextRequest, NextResponse } from 'next/server';

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY || '';
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID || '';
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

const OANDA_BASE_URL = OANDA_ENVIRONMENT === 'live'
    ? 'https://api-fxtrade.oanda.com/v3'
    : 'https://api-fxpractice.oanda.com/v3';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { instrument, units, action, stopLoss, takeProfit } = body;

        if (!instrument || !units || !action) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Oanda units are positive for BUY and negative for SELL
        const orderUnits = action === 'BUY' ? Math.abs(units).toString() : (-Math.abs(units)).toString();

        const orderPayload: any = {
            order: {
                units: orderUnits,
                instrument: instrument,
                timeInForce: 'FOK',
                type: 'MARKET',
                positionFill: 'DEFAULT',
            }
        };

        if (stopLoss) {
            orderPayload.order.stopLossOnFill = { price: stopLoss.toFixed(3) };
        }

        if (takeProfit) {
            orderPayload.order.takeProfitOnFill = { price: takeProfit.toFixed(3) };
        }

        const response = await fetch(
            `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/orders`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OANDA_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderPayload),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('OANDA Order Error:', data);
            return NextResponse.json({ error: 'Failed to place order', details: data }, { status: response.status });
        }

        return NextResponse.json({ success: true, order: data });
    } catch (error) {
        console.error('Error in orders API route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
