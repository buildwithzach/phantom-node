'use client';

import React, { useState, useEffect } from 'react';
import { TradingSignal, SignalPerformance } from '@/lib/signals/types';

interface SignalFeedPanelProps {
    isMinimal?: boolean;
}

export const SignalFeedPanel: React.FC<SignalFeedPanelProps> = ({ isMinimal = false }) => {
    const [signals, setSignals] = useState<TradingSignal[]>([]);
    const [performance, setPerformance] = useState<SignalPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [acceptingId, setAcceptingId] = useState<string | null>(null);

    useEffect(() => {
        fetchSignals();
        fetchPerformance();
        const interval = setInterval(() => {
            fetchSignals();
            fetchPerformance();
        }, 10000); // Refresh every 10 seconds

        return () => clearInterval(interval);
    }, []);

    const fetchSignals = async () => {
        try {
            const res = await fetch('/api/signals');
            if (res.ok) {
                const data = await res.json();
                setSignals(data.signals || []);
            }
        } catch (error) {
            console.error('Error fetching signals:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPerformance = async () => {
        try {
            const res = await fetch('/api/signals?history=performance');
            if (res.ok) {
                const data = await res.json();
                setPerformance(data);
            }
        } catch (error) {
            console.error('Error fetching performance:', error);
        }
    };

    const dismissSignal = async (id: string) => {
        try {
            await fetch('/api/signals', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: 'CANCELLED' }),
            });
            fetchSignals();
        } catch (error) {
            console.error('Error dismissing signal:', error);
        }
    };

    const acceptSignal = async (signal: TradingSignal) => {
        setAcceptingId(signal.id);
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instrument: 'USD_JPY',
                    units: signal.size || 5000, // Fallback if size is missing
                    action: signal.action,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit1,
                }),
            });
            if (res.ok) {
                // Once accepted, dismiss it from the pool
                await dismissSignal(signal.id);
            } else {
                const errorData = await res.json();
                alert(`Execution Failed: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error accepting signal:', error);
            alert('Execution Failed: Network or Server Error');
        } finally {
            setAcceptingId(null);
        }
    };

    if (loading) {
        if (isMinimal) {
            return (
                <div className="h-full flex items-center justify-center">
                    <span className="text-[10px] font-bold tracking-[0.4rem] text-gray-500 uppercase">Loading...</span>
                </div>
            );
        }
        return (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 h-full flex items-center justify-center">
                <span className="text-[10px] font-bold tracking-[0.4rem] text-gray-500 uppercase">Loading Signals...</span>
            </div>
        );
    }

    const content = (
        <>
            {!isMinimal && (
                <div className="flex items-center justify-between mb-3 shrink-0">
                    <div>
                        <p className="text-[9px] uppercase tracking-[0.4rem] text-emerald-400 font-black">Signal Feed</p>
                        <h3 className="text-sm font-bold text-white uppercase tracking-tight">Trading Signals</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">
                            {signals.length} Active
                        </span>
                        {signals.length > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                    </div>
                </div>
            )}

            {/* Signal Cards */}
            <div className={`flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 space-y-2 ${isMinimal ? '' : 'mb-3'}`}>
                {signals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-10">
                        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">No Active Signals</p>
                        <p className="text-[8px] text-gray-700 mt-1">Waiting for confluence threshold</p>
                    </div>
                ) : (
                    signals.map((signal) => {
                        const isProfit = signal.action === 'BUY';
                        const rr = signal.riskReward.toFixed(1);
                        const confluencePercent = ((signal.confluenceScore / 6) * 100).toFixed(0);

                        return (
                            <div
                                key={signal.id}
                                className="relative rounded-lg border border-white/10 bg-black/20 p-2.5 hover:bg-white/5 transition-all group"
                            >
                                {/* Header Row */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`text-[11px] font-black tracking-[0.15em] px-2 py-0.5 rounded leading-none ${signal.action === 'BUY'
                                                ? 'text-emerald-400 bg-emerald-500/10'
                                                : 'text-rose-400 bg-rose-500/10'
                                                }`}
                                        >
                                            {signal.action}
                                        </span>
                                        <span className="text-[9px] font-black text-white uppercase tracking-widest">
                                            {signal.confidence}
                                        </span>
                                        <div className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                            <span className="text-[8px] font-black text-amber-400 uppercase">{signal.grade}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => acceptSignal(signal)}
                                            disabled={acceptingId === signal.id}
                                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded transition-all active:scale-95 ${acceptingId === signal.id
                                                ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                                                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                                }`}
                                        >
                                            {acceptingId === signal.id ? 'Accepting...' : 'Accept'}
                                        </button>
                                        <button
                                            onClick={() => dismissSignal(signal.id)}
                                            className="text-[8px] text-gray-600 hover:text-white uppercase font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </div>

                                {/* Entry/Exit Levels */}
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-gray-600 uppercase tracking-widest font-bold">Entry</span>
                                        <span className="text-[10px] font-mono text-white font-bold leading-none">{signal.entry.toFixed(3)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-gray-600 uppercase tracking-widest font-bold">Stop Loss</span>
                                        <span className="text-[10px] font-mono text-rose-400 font-bold leading-none">{signal.stopLoss.toFixed(3)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-gray-600 uppercase tracking-widest font-bold">TP1</span>
                                        <span className="text-[10px] font-mono text-emerald-400 font-bold leading-none">{signal.takeProfit1.toFixed(3)}</span>
                                    </div>
                                </div>

                                {/* Metrics Row */}
                                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-[7px] text-gray-500 uppercase font-bold">R:R</span>
                                            <span className="text-[9px] font-mono text-emerald-400 font-bold">1:{rr}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-[7px] text-gray-500 uppercase font-bold">Confluence</span>
                                            <span className="text-[9px] font-mono text-white font-bold">{signal.confluenceScore.toFixed(1)}/6</span>
                                        </div>
                                    </div>
                                    <span className="text-[8px] text-gray-600 font-mono">
                                        {new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Confluence Details (Hover) */}
                                <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="flex flex-wrap gap-1">
                                        {signal.confluenceFactors.slice(0, 3).map((factor, idx) => (
                                            <span key={idx} className="text-[7px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 uppercase leading-none">
                                                {factor.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Performance Footer */}
            {performance && performance.totalSignals > 0 && (
                <div className="pt-3 border-t border-white/10 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[7px] text-gray-600 uppercase tracking-widest font-bold">30d WR</span>
                            <span className={`text-[10px] font-black font-mono ${performance.winRate >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {performance.winRate.toFixed(0)}%
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[7px] text-gray-600 uppercase tracking-widest font-bold">avg rr</span>
                            <span className="text-[10px] font-black font-mono text-white">{performance.averageRR.toFixed(1)}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[7px] text-gray-600 uppercase tracking-widest font-bold">volume</span>
                            <span className="text-[10px] font-black font-mono text-gray-400">{performance.totalSignals}</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (isMinimal) return content;

    return (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#051125] to-transparent p-3 backdrop-blur flex flex-col h-[400px]">
            {content}
        </div>
    );
};
