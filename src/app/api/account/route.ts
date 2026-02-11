import { NextRequest, NextResponse } from 'next/server';

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY || '';
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID || '';
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

const OANDA_BASE_URL = OANDA_ENVIRONMENT === 'live'
    ? 'https://api-fxtrade.oanda.com/v3'
    : 'https://api-fxpractice.oanda.com/v3';

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(
            `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/summary`,
            {
                headers: {
                    'Authorization': `Bearer ${OANDA_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OANDA API Error:', errorText);
            return NextResponse.json({ error: 'Failed to fetch account summary' }, { status: response.status });
        }

        const data = await response.json();
        const account = data.account;

        return NextResponse.json({
            balance: parseFloat(account.balance),
            pl: parseFloat(account.pl),
            unrealizedPL: parseFloat(account.unrealizedPL),
            marginUsed: parseFloat(account.marginUsed),
            marginAvailable: parseFloat(account.marginAvailable),
            currency: account.currency
        });
    } catch (error) {
        console.error('Error in account API route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
