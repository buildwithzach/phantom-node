'use client';

import { useState, useEffect, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useRef } from 'react';

export default function BacktestPage() {
    const [results, setResults] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState(30);
    const [symbol, setSymbol] = useState('USD_JPY');
    const [equity, setEquity] = useState(1000);
    const [riskPct, setRiskPct] = useState(1);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
    const mcSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

    const runBacktest = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                days: String(days),
                instrument: symbol,
                equity: String(equity),
                riskPct: String(riskPct),
            });
            const res = await fetch(`/api/backtest?${params}`);
            const data = await res.json();
            
            if (!res.ok || data.error) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            
            setResults(data);
        } catch (err: any) {
            console.error('Backtest failed:', err);
            setError(err.message || 'Failed to run backtest');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 300,
            layout: {
                background: { color: 'transparent' },
                textColor: '#94a3b8',
                fontSize: 10,
            },
            grid: {
                vertLines: { color: 'rgba(30, 41, 59, 0.3)' },
                horzLines: { color: 'rgba(30, 41, 59, 0.3)' },
            },
            timeScale: {
                borderColor: 'rgba(51, 65, 85, 0.5)',
                timeVisible: true,
            },
            rightPriceScale: {
                borderColor: 'rgba(51, 65, 85, 0.5)',
            },
        });

        const areaSeries = chart.addAreaSeries({
            lineColor: '#10b981',
            topColor: 'rgba(16, 185, 129, 0.3)',
            bottomColor: 'rgba(16, 185, 129, 0)',
            lineWidth: 2,
        });

        chartRef.current = chart;
        areaSeriesRef.current = areaSeries;

        const handleResize = () => {
            if (chartContainerRef.current && chart) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    useEffect(() => {
        if (results?.equityCurve && areaSeriesRef.current) {
            // Clear existing MC series
            mcSeriesRef.current.forEach(s => chartRef.current?.removeSeries(s));
            mcSeriesRef.current = [];

            // Deduplicate points by timestamp
            const uniquePoints = new Map();
            results.equityCurve.forEach((p: any) => {
                uniquePoints.set(Math.floor(p.timestamp / 1000), p.equity);
            });

            const data = Array.from(uniquePoints.entries())
                .map(([time, value]) => ({
                    time: time as Time,
                    value: value,
                }))
                .sort((a, b) => (a.time as number) - (b.time as number));

            areaSeriesRef.current.setData(data);

            // Add Monte Carlo Sample Curves
            if (results.monteCarlo?.sampleCurves && chartRef.current) {
                results.monteCarlo.sampleCurves.forEach((curve: number[], idx: number) => {
                    const lineSeries = chartRef.current!.addLineSeries({
                        color: 'rgba(16, 185, 129, 0.1)',
                        lineWidth: 1,
                        priceLineVisible: false,
                        lastValueVisible: false,
                    });

                    const mcData = curve.map((val, i) => {
                        // Map MC index to actual timestamps if possible, or just use sequence
                        const time = data[i]?.time || (data[data.length - 1].time as number + (i - data.length + 1) * 900) as Time;
                        return { time, value: val };
                    });

                    lineSeries.setData(mcData);
                    mcSeriesRef.current.push(lineSeries);
                });
            }

            chartRef.current?.timeScale().fitContent();
        }
    }, [results]);

    return (
        <div className="min-h-screen bg-[#030712] text-slate-200 p-8 font-sans">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Strategy Validator</h1>
                    <p className="text-slate-400 text-sm mt-1">Backtest and validate your USDJPY quant models.</p>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="USD_JPY">USD/JPY</option>
                        <option value="EUR_JPY">EUR/JPY</option>
                        <option value="GBP_JPY">GBP/JPY</option>
                    </select>
                    <select
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value))}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value={7}>Last 7 Days</option>
                        <option value={30}>Last 30 Days</option>
                        <option value={90}>Last 90 Days</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Equity</span>
                        <input
                            type="number"
                            min={100}
                            step={100}
                            value={equity}
                            onChange={(e) => setEquity(Number(e.target.value) || 1000)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Risk %</span>
                        <input
                            type="number"
                            min={0.1}
                            max={10}
                            step={0.1}
                            value={riskPct}
                            onChange={(e) => setRiskPct(Number(e.target.value) || 1)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 w-16 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </label>
                    <button
                        onClick={runBacktest}
                        disabled={isLoading}
                        className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-bold py-2 px-6 rounded-lg transition-all shadow-lg shadow-emerald-500/20"
                    >
                        {isLoading ? 'Simulating...' : 'Run Backtest'}
                    </button>
                    <a href="/" className="text-slate-400 hover:text-white text-sm font-medium transition-colors">Back to Deck</a>
                </div>
            </header>

            {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-2xl backdrop-blur-xl mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
                        <h3 className="text-rose-400 font-bold text-sm uppercase tracking-wider">Backtest Error</h3>
                    </div>
                    <p className="text-rose-300 mt-2 font-mono text-sm">{error}</p>
                </div>
            )}

            {results && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Total PnL</p>
                            <p className={`text-2xl font-mono font-bold ${(results?.totalPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${(results?.totalPnl || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Win Rate</p>
                            <p className="text-2xl font-mono font-bold text-white">
                                {((results?.winRate || 0) * 100).toFixed(1)}%
                            </p>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Max Drawdown</p>
                            <p className="text-2xl font-mono font-bold text-rose-400">
                                {((results?.maxDrawdown || 0) * 100).toFixed(1)}%
                            </p>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Total Trades</p>
                            <p className="text-2xl font-mono font-bold text-white">
                                {results?.trades?.length || 0}
                            </p>
                        </div>
                    </div>

                    {results.monteCarlo && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-2xl backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-emerald-400 font-bold text-sm uppercase tracking-wider">Monte Carlo Robustness</h3>
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-bold">1,000 RUNS</span>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">Prob. of Profit</span>
                                    <span className="text-white font-mono font-bold">{results.monteCarlo.profitablePercent.toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">95% Conf. Drawdown</span>
                                    <span className="text-rose-400 font-mono font-bold">{(results.monteCarlo.maxDrawdown95th * 100).toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">Expected Return</span>
                                    <span className="text-emerald-400 font-mono font-bold">${results.monteCarlo.expectedReturnMean.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl min-h-[400px]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-white">Equity Curve</h2>
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Performance Simulation</span>
                        </div>
                        <div ref={chartContainerRef} className="w-full h-[300px]" />
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                        <h2 className="text-lg font-bold text-white mb-6">Trade Execution Log</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                        <th className="pb-4 font-medium">Time</th>
                                        <th className="pb-4 font-medium">Type</th>
                                        <th className="pb-4 font-medium">Entry</th>
                                        <th className="pb-4 font-medium">Exit</th>
                                        <th className="pb-4 font-medium">PnL</th>
                                        <th className="pb-4 font-medium">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {(results?.trades ?? []).map((trade: any) => (
                                        <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                                            <td className="py-4 text-slate-400 font-mono text-xs">
                                                {new Date(trade.entryTime).toLocaleDateString()}
                                            </td>
                                            <td className="py-4">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                    {trade.direction}
                                                </span>
                                            </td>
                                            <td className="py-4 font-mono text-white">{trade.entryPrice.toFixed(3)}</td>
                                            <td className="py-4 font-mono text-white">{trade.exitPrice?.toFixed(3) || '--'}</td>
                                            <td className={`py-4 font-mono font-bold ${trade.pnl > 0 ? 'text-emerald-400' : trade.pnl < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                                {typeof trade.pnl === 'number' ? `$${trade.pnl.toFixed(2)}` : '--'}
                                            </td>
                                            <td className="py-4 text-slate-500 text-xs italic">{trade.exitReason || 'Open'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                        <h2 className="text-lg font-bold text-white mb-4">Strategy Parameters</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                <span className="text-slate-400 text-sm">Model</span>
                                <span className="text-white text-sm font-bold">PHANTOM NODE</span>
                            </div>
                            {results?._config && (
                                <>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                        <span className="text-slate-400 text-sm">Initial equity</span>
                                        <span className="text-white text-sm font-bold">${results._config.initialEquity.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                        <span className="text-slate-400 text-sm">Risk per trade</span>
                                        <span className="text-white text-sm font-bold">{(results._config.riskPerTrade * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                        <span className="text-slate-400 text-sm">Max daily loss</span>
                                        <span className="text-rose-400 text-sm font-bold">${results._config.maxDailyLossUsd}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                <span className="text-slate-400 text-sm">Trailing Stop</span>
                                <span className="text-white text-sm font-bold text-emerald-400">2.1x ATR (Starts @ 2.2R)</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                <span className="text-slate-400 text-sm">Time Stop</span>
                                <span className="text-white text-sm font-bold">8h Soft Kill (Runners {'>'} 1.5R)</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                <span className="text-slate-400 text-sm">Target RR</span>
                                <span className="text-white text-sm font-bold">1:3</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl">
                        <h3 className="text-emerald-400 font-bold mb-2">Live-aligned</h3>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Validator uses the same risk %, sizing formula, and max daily loss circuit breaker as the live algo. Use matching equity and risk % to compare backtest vs live.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
