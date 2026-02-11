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

    if (!instrument) {
      return NextResponse.json({ error: 'Instrument is required' }, { status: 400 });
    }

    // Try pricing API first
    const pricingResponse = await fetch(
      `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${instrument}`,
      {
        headers: {
          'Authorization': `Bearer ${OANDA_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (pricingResponse.ok) {
      const data = await pricingResponse.json();
      const price = data.prices[0];

      const priceData = {
        instrument: price.instrument,
        time: price.time,
        bid: price.bids[0].price,
        ask: price.asks[0].price,
        status: price.status,
      };

      return NextResponse.json({ price: priceData });
    }

    // Fallback to candles API for more frequent updates
    console.log('Pricing API failed, using candles fallback');
    const candlesResponse = await fetch(
      `${OANDA_BASE_URL}/instruments/${instrument}/candles?price=M&granularity=S5&count=1`,
      {
        headers: {
          'Authorization': `Bearer ${OANDA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept-Datetime-Format': 'UNIX',
        },
      }
    );

    if (!candlesResponse.ok) {
      throw new Error('Both pricing and candles APIs failed');
    }

    const candlesData = await candlesResponse.json();
    const candle = candlesData.candles[0];

    // Create price data from candle
    const priceData = {
      instrument: instrument,
      time: new Date(candle.time * 1000).toISOString(),
      bid: (parseFloat(candle.mid.c) - 0.001).toFixed(5),  // Simulate bid
      ask: (parseFloat(candle.mid.c) + 0.001).toFixed(5),  // Simulate ask
      status: 'tradeable',
    };

    return NextResponse.json({ price: priceData });
  } catch (error) {
    console.error('Error in price API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
