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
    const instrument = searchParams.get('instrument');
    const granularity = searchParams.get('granularity') || 'M1';
    const count = searchParams.get('count') || '100';

    if (!instrument) {
      return NextResponse.json({ error: 'Instrument is required' }, { status: 400 });
    }

    const response = await fetch(
      `${OANDA_BASE_URL}/instruments/${instrument}/candles?price=M&granularity=${granularity}&count=${count}`,
      {
        headers: {
          'Authorization': `Bearer ${OANDA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept-Datetime-Format': 'UNIX',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OANDA API Error:', errorText);
      return NextResponse.json({ error: 'Failed to fetch candles', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    const candles = data.candles.map((candle: any) => ({
      open: candle.mid?.o || candle.open,
      high: candle.mid?.h || candle.high,
      low: candle.mid?.l || candle.low,
      close: candle.mid?.c || candle.close,
      volume: candle.volume,
      time: candle.time,
      complete: candle.complete,
    }));

    return NextResponse.json({ candles });
  } catch (error) {
    console.error('Error in candles API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
