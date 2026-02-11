import { NextRequest, NextResponse } from 'next/server';

const FRED_API_KEY = process.env.NEXT_PUBLIC_FRED_API_KEY || '';
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const seriesId = searchParams.get('series_id');
        const limit = searchParams.get('limit') || '3';

        if (!seriesId) {
            return NextResponse.json({ error: 'series_id is required' }, { status: 400 });
        }

        // Check if API key is available
        if (!FRED_API_KEY || FRED_API_KEY === 'your_fred_api_key_here') {
            return NextResponse.json({
                error: 'FRED API key not configured',
                observations: []
            }, { status: 200 });
        }

        const response = await fetch(
            `${FRED_BASE_URL}/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&limit=${limit}&sort_order=desc`
        );

        if (!response.ok) {
            // Return empty data instead of error to prevent console spam
            return NextResponse.json({
                error: 'FRED API unavailable',
                observations: []
            }, { status: 200 });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in FRED API route:', error);
        return NextResponse.json({
            error: 'FRED service unavailable',
            observations: []
        }, { status: 200 });
    }
}
