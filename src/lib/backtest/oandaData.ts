
import axios from 'axios';
import { Candle } from '@/types/forex';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY;
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID;
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

const OANDA_BASE_URL = OANDA_ENVIRONMENT === 'live'
    ? 'https://api-fxtrade.oanda.com/v3'
    : 'https://api-fxpractice.oanda.com/v3';

export async function fetchOandaCandles(instrument: string, granularity: string, from: string, count: number = 5000): Promise<Candle[]> {
    if (!OANDA_API_KEY || !OANDA_ACCOUNT_ID) {
        throw new Error('OANDA credentials missing in .env.local');
    }

    try {
        const response = await axios.get(
            `${OANDA_BASE_URL}/instruments/${instrument}/candles`,
            {
                params: {
                    price: 'M',
                    granularity,
                    from,
                    count,
                },
                headers: {
                    'Authorization': `Bearer ${OANDA_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept-Datetime-Format': 'UNIX',
                },
            }
        );

        if (response.status !== 200) {
            throw new Error(`OANDA API Error: ${response.status} ${response.statusText}`);
        }

        const data = response.data;

        return data.candles.map((candle: any) => ({
            timestamp: parseInt(candle.time) * 1000, // Convert to ms
            open: parseFloat(candle.mid.o),
            high: parseFloat(candle.mid.h),
            low: parseFloat(candle.mid.l),
            close: parseFloat(candle.mid.c),
            volume: candle.volume,
        }));
    } catch (error: any) {
        console.error('Error fetching OANDA candles:', error.response?.data || error.message);
        throw error;
    }
}

export async function fetchHistoricalData(instrument: string, granularity: string, startDate: string, endDate: string): Promise<Candle[]> {
    let allCandles: Candle[] = [];
    let currentFrom = new Date(startDate).toISOString();
    const endTimestamp = new Date(endDate).getTime();

    console.log(`Fetching data for ${instrument} from ${startDate} to ${endDate}...`);

    while (true) {
        try {
            const candles = await fetchOandaCandles(instrument, granularity, currentFrom, 5000);

            if (candles.length === 0) break;

            allCandles = allCandles.concat(candles);

            const lastCandle = candles[candles.length - 1];
            if (lastCandle.timestamp >= endTimestamp) {
                break;
            }

            // Next batch starts from the last candle time + 1 second (or granularity)
            // Oanda 'from' is inclusive, so we need to be careful not to duplicate or miss.
            // Actually, Oanda returns count candles from 'from'.
            // So we can just use the last timestamp.
            // Wait, if we use the last timestamp, we might get the same candle again?
            // Let's add 1 second to be safe.
            currentFrom = new Date(lastCandle.timestamp + 1000).toISOString();

            console.log(`Fetched ${candles.length} candles. Total: ${allCandles.length}. Last: ${new Date(lastCandle.timestamp).toISOString()}`);

            // Safety break
            if (allCandles.length > 50000) {
                console.warn('Hit safety limit of 50000 candles.');
                break;
            }

            // If we got fewer than requested, we might be at the end
            if (candles.length < 5000) {
                break;
            }

        } catch (e) {
            console.error('Error in fetch loop:', e);
            break;
        }
    }

    // Deduplicate and sort
    const uniqueCandles = Array.from(new Map(allCandles.map(c => [c.timestamp, c])).values());
    return uniqueCandles.sort((a, b) => a.timestamp - b.timestamp).filter(c => c.timestamp <= endTimestamp);
}
