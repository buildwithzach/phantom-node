import { NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/backtest/oandaData';
import fs from 'fs';
import path from 'path';
import {
    RISK_PER_TRADE_DEFAULT,
    MAX_DAILY_LOSS_USD,
    INITIAL_EQUITY_DEFAULT,
} from '@/lib/backtest/constants';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instrument = searchParams.get('instrument') || 'USD_JPY';
    const granularity = searchParams.get('granularity') || 'M15';
    const days = parseInt(searchParams.get('days') || '30');
    const equity = parseFloat(searchParams.get('equity') || '');
    const riskPct = parseFloat(searchParams.get('riskPct') || '');
    const initialEquity = Number.isFinite(equity) && equity > 0 ? equity : INITIAL_EQUITY_DEFAULT;
    const riskPerTrade = Number.isFinite(riskPct) && riskPct > 0 ? riskPct / 100 : RISK_PER_TRADE_DEFAULT;

    const endDate = new Date().toISOString();
    // Add 14 days buffer for indicator warmup (approx 1350 M15 candles)
    // The Python script will filter trades to start from the requested 'days' window.
    const bufferDays = 14;
    const startDate = new Date(Date.now() - (days + bufferDays) * 24 * 60 * 60 * 1000).toISOString();
    // We also pass the "target start date" to python so it knows when to start trading
    const targetStartDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Load EXACT live configuration from config.json
    let liveConfig: any = {};
    try {
        const configPath = path.join(process.cwd(), 'python_algo', 'config.json');
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            liveConfig = JSON.parse(configContent);
            console.log('Loaded live config from file:', liveConfig);
        }
    } catch (e) {
        console.error('Failed to load live config:', e);
        // Fallback to hardcoded values
        liveConfig = {
            atr_multiplier_sl: 2.1,
            rr_ratio: 3.5,
            risk_per_trade: 0.01,
            max_daily_loss: 5000
        };
    }

    try {
        const candles = await fetchHistoricalData(instrument, granularity, startDate, endDate);

        if (candles.length < 100) {
            return NextResponse.json({ error: 'Insufficient data for backtest' }, { status: 400 });
        }

        // Run Python Backtester (Single Source of Truth)
        const { spawn } = await import('child_process');
        const pythonPath = process.env.NODE_ENV === 'production' ? 'python' : 'python3';

        const result = await new Promise<any>((resolve, reject) => {
            const py = spawn(pythonPath, [path.join(process.cwd(), 'python_algo', 'backtest_cli.py')]);
            let output = '';
            let error = '';

            py.stdout.on('data', (data) => {
                output += data.toString();
            });
            py.stderr.on('data', (data) => error += data.toString());

            py.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}: ${error}`));
                } else {
                    try {
                        // Extract the last JSON object from output
                        const lines = output.trim().split('\n');
                        let jsonOutput = '';
                        for (let i = lines.length - 1; i >= 0; i--) {
                            const line = lines[i].trim();
                            if (line.startsWith('{') && line.endsWith('}')) {
                                try {
                                    JSON.parse(line);
                                    jsonOutput = line;
                                    break;
                                } catch (e) {
                                    // Not valid JSON, continue looking
                                }
                            }
                        }
                        if (!jsonOutput) {
                            throw new Error('No valid JSON found in output');
                        }
                        resolve(JSON.parse(jsonOutput));
                    } catch (e) {
                        reject(new Error(`Failed to parse Python output: ${output}`));
                    }
                }
            });

            // Pass data to Python
            py.stdin.write(JSON.stringify({
                candles,
                initial_equity: initialEquity,
                target_start_date: targetStartDate,
                config: {
                    ...liveConfig,
                    risk_per_trade: riskPerTrade
                }
            }));
            py.stdin.end();
        });

        if (result.error) {
            throw new Error(result.error);
        }

        // Run Monte Carlo Simulation on the results
        const { MonteCarloSimulator } = await import('@/lib/backtest/monteCarlo');
        const mc = new MonteCarloSimulator(result.trades, initialEquity);
        const mcResults = mc.run(1000);

        return NextResponse.json({
            ...result,
            _config: { initialEquity, riskPerTrade, maxDailyLossUsd: liveConfig.max_daily_loss || 500 },
            monteCarlo: {
                profitablePercent: mcResults.profitablePercent,
                maxDrawdown95th: mcResults.maxDrawdown95th,
                expectedReturnMean: mcResults.expectedReturnMean,
                sampleCurves: mcResults.equityCurves
            }
        });
    } catch (error: any) {
        console.error('Backtest API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
