import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'python_algo', 'algo.log');

export async function GET() {
    try {
        if (!fs.existsSync(LOG_PATH)) {
            return NextResponse.json({ logs: ['Log file not found.'] });
        }

        const fileContent = fs.readFileSync(LOG_PATH, 'utf-8');
        const lines = fileContent.split('\n');

        // Return last 200 lines
        const lastLines = lines.slice(-200).reverse();

        return NextResponse.json({ logs: lastLines });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to read logs' }, { status: 500 });
    }
}
