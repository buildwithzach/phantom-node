import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'python_algo', 'config.json');

export async function GET() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return NextResponse.json({ error: 'Config file not found' }, { status: 404 });
        }
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return NextResponse.json(config);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const newConfig = await request.json();
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
        return NextResponse.json({ success: true, config: newConfig });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
    }
}
