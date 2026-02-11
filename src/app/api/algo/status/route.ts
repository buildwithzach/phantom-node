import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const STATUS_PATH = path.join(process.cwd(), '.algo-status.json');

export async function GET() {
    try {
        if (!existsSync(STATUS_PATH)) {
            return NextResponse.json({
                running: false,
                lastScan: null,
                lastSignal: null,
                error: 'Algo not started or no status yet',
                circuitBreakerTripped: false,
                circuitBreakerDate: null,
                dailyPnl: null,
            });
        }
        const raw = readFileSync(STATUS_PATH, 'utf-8');
        const data = JSON.parse(raw);
        return NextResponse.json({
            ...data,
            running: !!data.running,
            circuitBreakerTripped: !!data.circuitBreakerTripped,
        });
    } catch (e) {
        console.error('Algo status read error:', e);
        return NextResponse.json(
            {
                running: false,
                lastScan: null,
                lastSignal: null,
                error: 'Failed to read algo status',
                circuitBreakerTripped: false,
                circuitBreakerDate: null,
                dailyPnl: null,
            },
            { status: 500 }
        );
    }
}
