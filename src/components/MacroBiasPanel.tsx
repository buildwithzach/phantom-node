'use client';

import React, { useState, useEffect } from 'react';

interface TelemetryData {
    price?: number;
    long_score?: number;
    short_score?: number;
    factors?: string[];
    reason?: string;
    debug?: {
        adx?: number;
        h1_rsi?: number;
        atr_ratio?: number;
    };
}

interface AlgoStatus {
    running: boolean;
    telemetry?: TelemetryData;
    lastSignal?: any;
    error?: string;
}

// Operational Telemetry Insights Component
const OperationalTelemetryInsights: React.FC = () => {
    const [status, setStatus] = useState<AlgoStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/algo/status');
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                }
            } catch (error) {
                console.error('Failed to fetch telemetry:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !status?.telemetry) {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Algorithm Status</span>
                    <span className="text-[8px] text-gray-500 font-mono">Syncing...</span>
                </div>
            </div>
        );
    }

    const { telemetry } = status;
    const isRunning = status.running;

    return (
        <div className="space-y-2">
            {/* Algorithm Status */}
            <div className="flex items-center justify-between">
                <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Algorithm Status</span>
                <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                    <span className={`text-[8px] font-mono ${isRunning ? 'text-emerald-300' : 'text-gray-500'}`}>
                        {isRunning ? 'ACTIVE' : 'IDLE'}
                    </span>
                </div>
            </div>

            {/* Market Price */}
            <div className="flex items-center justify-between">
                <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Market Price</span>
                <span className="text-[8px] font-mono text-white/80">
                    {telemetry.price?.toFixed(3) || 'N/A'}
                </span>
            </div>

            {/* Signal Strength */}
            <div className="flex items-center justify-between">
                <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Signal Strength</span>
                <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono text-emerald-300">
                        L:{telemetry.long_score?.toFixed(0) || '0'}
                    </span>
                    <span className="text-[8px] font-mono text-rose-300">
                        S:{telemetry.short_score?.toFixed(0) || '0'}
                    </span>
                </div>
            </div>

            {/* Technical Indicators */}
            <div className="flex items-center justify-between">
                <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Technical Health</span>
                <div className="flex items-center gap-2">
                    <span className="text-[7px] font-mono text-blue-300">
                        ADX:{telemetry.debug?.adx?.toFixed(1) || '0.0'}
                    </span>
                    <span className="text-[7px] font-mono text-purple-300">
                        RSI:{telemetry.debug?.h1_rsi?.toFixed(0) || '0'}
                    </span>
                    <span className="text-[7px] font-mono text-amber-300">
                        ATR:{((telemetry.debug?.atr_ratio || 1) * 100).toFixed(0)}%
                    </span>
                </div>
            </div>

            {/* Active Factors */}
            {telemetry.factors && telemetry.factors.length > 0 && (
                <div className="mt-2">
                    <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Active Factors</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {telemetry.factors.slice(0, 3).map((factor, idx) => (
                            <span key={idx} className="text-[7px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-gray-300 uppercase tracking-wider">
                                {factor}
                            </span>
                        ))}
                        {telemetry.factors.length > 3 && (
                            <span className="text-[7px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-gray-500 uppercase tracking-wider">
                                +{telemetry.factors.length - 3}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Current Strategy Reason */}
            {telemetry.reason && (
                <div className="mt-2 pt-2 border-t border-current/10">
                    <span className="text-[8px] text-gray-600 uppercase tracking-wider font-medium">Current Thesis</span>
                    <p className="text-[8px] text-gray-400 mt-1 leading-tight uppercase tracking-wider font-medium">
                        {telemetry.reason}
                    </p>
                </div>
            )}
        </div>
    );
};

// Simple Telemetry Status Component
const TelemetryStatus: React.FC = () => {
    const [status, setStatus] = useState<AlgoStatus | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/algo/status');
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                }
            } catch (error) {
                // Silent fail for telemetry
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    if (!status?.telemetry) {
        return <span className="text-current/50">Algorithm syncing...</span>;
    }

    const { telemetry } = status;
    const isRunning = status.running;

    return (
        <span className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 ${isRunning ? 'text-emerald-300' : 'text-gray-500'}`}>
                <div className={`w-1 h-1 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                {isRunning ? 'ACTIVE' : 'IDLE'}
            </span>
            <span className="text-current/60">
                {telemetry.reason || 'Scanning...'}
            </span>
        </span>
    );
};

interface MacroIndicator {
    name: string;
    tier: 1 | 2 | 3;
    value: number | null;
    previousValue: number | null;
    change: number | null;
    trend: 'rising' | 'falling' | 'stable' | 'unknown';
    signal: 'bullish' | 'bearish' | 'neutral';
    usdJpyImpact: string;
}

interface BiasResult {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    score: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    yieldSignal: 'bullish' | 'bearish' | 'neutral';
    riskSignal: 'bullish' | 'bearish' | 'neutral';
    bojVolatility: boolean;
    agreementCount: number;
    recommendation: string;
    indicators: MacroIndicator[];
    timestamp: string;
}

const SignalBadge: React.FC<{ signal: string }> = ({ signal }) => {
    const isBull = signal.toLowerCase().includes('bull') || signal.toLowerCase() === 'rising' || signal.toLowerCase() === 'risk-on';
    const isBear = signal.toLowerCase().includes('bear') || signal.toLowerCase() === 'falling' || signal.toLowerCase() === 'risk-off';

    return (
        <span className={`text-[9px] font-black tracking-[0.2em] uppercase ${isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-gray-500'
            }`}>
            {signal}
        </span>
    );
};

// COMPONENT 1: The Consensus Panel (The 3 Questions Checklist)
export const MacroConsensusPanel: React.FC = () => {
    const [data, setData] = useState<BiasResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    const copyBiasToClipboard = async () => {
        if (!data) return;
        const W = 480, headerH = 52, rowH = 50, recH = 70, footerH = 40, padX = 20;
        const rows = 3; // Yield, Equity, Vol
        const H = headerH + (rows * rowH) + recH + footerH + 24;

        const comp = document.createElement('canvas');
        comp.width = W * 2;
        comp.height = H * 2;
        const ctx = comp.getContext('2d');
        if (!ctx) return;
        ctx.scale(2, 2);

        // BG
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, W, H);

        // Header
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, 0, W, headerH);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.fillRect(0, headerH - 1, W, 1);

        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('\u26a1 PHANTOM NODE', padX, headerH / 2);

        ctx.font = 'bold 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText('EXECUTION BIAS', W / 2, headerH / 2 - 7);
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Macro Framework', W / 2, headerH / 2 + 8);

        // Bias badge (right)
        const biasColor = data.bias === 'BULLISH' ? '#10b981' : data.bias === 'BEARISH' ? '#f43f5e' : '#94a3b8';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = biasColor;
        ctx.textAlign = 'right';
        ctx.fillText(data.bias, W - padX, headerH / 2);

        // Rows
        const items = [
            { label: 'Yield Environment', value: data.yieldSignal === 'bullish' ? 'RISING' : 'FALLING', signal: data.yieldSignal },
            { label: 'Equity Liquidity', value: data.riskSignal === 'bullish' ? 'RISK-ON' : 'RISK-OFF', signal: data.riskSignal },
            { label: 'Vol Regime', value: data.bojVolatility ? 'BOJ VOL' : 'STABLE', signal: data.bojVolatility ? 'bearish' : 'neutral' },
        ];

        let y = headerH + 8;
        items.forEach((item) => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
            ctx.beginPath();
            ctx.roundRect(padX, y, W - padX * 2, rowH - 8, 8);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.stroke();

            ctx.font = 'bold 10px Inter, system-ui, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText(item.label.toUpperCase(), padX + 14, y + (rowH - 8) / 2);

            const sigColor = item.signal === 'bullish' ? '#10b981' : item.signal === 'bearish' ? '#f43f5e' : '#64748b';
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.fillStyle = sigColor;
            ctx.textAlign = 'right';
            ctx.fillText(item.value, W - padX - 14, y + (rowH - 8) / 2);

            y += rowH;
        });

        // Recommendation
        y += 4;
        const confColor = data.confidence === 'HIGH' ? '#10b981' : data.confidence === 'MEDIUM' ? '#eab308' : '#64748b';
        ctx.fillStyle = data.confidence === 'HIGH' ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)';
        ctx.beginPath();
        ctx.roundRect(padX, y, W - padX * 2, recH - 8, 8);
        ctx.fill();
        ctx.strokeStyle = data.confidence === 'HIGH' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)';
        ctx.stroke();

        ctx.font = 'bold 8px Inter, system-ui, sans-serif';
        ctx.fillStyle = confColor;
        ctx.textAlign = 'left';
        ctx.fillText('STRATEGY PROTOCOL:', padX + 14, y + 18);

        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = confColor;
        // Wrap recommendation text
        const words = data.recommendation.toUpperCase().split(' ');
        let line = '';
        let lineY = y + 36;
        words.forEach(word => {
            const test = line + word + ' ';
            if (ctx.measureText(test).width > W - padX * 2 - 28) {
                ctx.fillText(line.trim(), padX + 14, lineY);
                line = word + ' ';
                lineY += 14;
            } else {
                line = test;
            }
        });
        ctx.fillText(line.trim(), padX + 14, lineY);

        // Footer
        const footerY = H - footerH;
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, footerY, W, footerH);
        ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
        ctx.fillRect(0, footerY, W, 1);

        const now = new Date();
        const ts = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '  \u00b7  ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ts, padX, footerY + footerH / 2);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'right';
        ctx.fillText('phantomnode.io', W - padX, footerY + footerH / 2);

        comp.toBlob(async (blob) => {
            if (!blob) return;
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                setCopied(true); setTimeout(() => setCopied(false), 2000);
            } catch {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `macro_bias_${Date.now()}.png`; a.click();
                URL.revokeObjectURL(url);
                setCopied(true); setTimeout(() => setCopied(false), 2000);
            }
        }, 'image/png');
    };

    useEffect(() => {
        const fetchBias = async () => {
            try {
                const res = await fetch('/api/macro-bias');
                if (res.ok) setData(await res.json());
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchBias();
        const t = setInterval(fetchBias, 60000);
        return () => clearInterval(t);
    }, []);

    if (loading || !data) {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 h-full flex items-center justify-center animate-pulse">
                <span className="text-[10px] font-bold tracking-[0.4rem] text-gray-500 uppercase">Framework Sync...</span>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur flex flex-col h-[400px] overflow-hidden transition-all duration-500 hover:border-white/20">
            <div className="flex items-center justify-between mb-4 shrink-0 px-1">
                <div>
                    <p className="text-[8px] uppercase tracking-[0.4rem] text-emerald-400 font-black">Execution Bias</p>
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight">Macro Framework</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copyBiasToClipboard}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${copied
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                : 'bg-black/40 border border-white/10 text-white/40 hover:text-white hover:border-white/30'
                            }`}
                    >
                        {copied ? (
                            <>
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Copied!
                            </>
                        ) : (
                            <>
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy PNG
                            </>
                        )}
                    </button>
                    <div className={`px-2.5 py-1 rounded bg-black/40 border border-white/10 text-[9px] font-black uppercase tracking-widest ${data.bias === 'BULLISH' ? 'text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : data.bias === 'BEARISH' ? 'text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]' : 'text-gray-400'}`}>
                        {data.bias}
                    </div>
                </div>
            </div>

            <div className="flex-1 space-y-2 py-1 overflow-y-auto custom-scrollbar">
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-200 transition-colors">Yield Environment</span>
                    <SignalBadge signal={data.yieldSignal === 'bullish' ? 'Rising' : 'Falling'} />
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-200 transition-colors">Equity Liquidity</span>
                    <SignalBadge signal={data.riskSignal === 'bullish' ? 'Risk-On' : 'Risk-Off'} />
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-200 transition-colors">Vol Regime</span>
                    <SignalBadge signal={data.bojVolatility ? 'BoJ VOL' : 'STABLE'} />
                </div>
            </div>

            {/* Probability Anchor - Bold Visual */}
            <div className={`mt-4 p-3 rounded-xl border-t shadow-2xl shrink-0 ${data.confidence === 'HIGH' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                data.confidence === 'MEDIUM' ? 'bg-amber-500/5 border-amber-500/10 text-amber-300' :
                    'bg-white/5 border-white/5 text-gray-400'
                }`}>
                <div className="flex items-center gap-2 mb-1.5 opacity-60">
                    <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
                    <p className="text-[8px] font-black uppercase tracking-[0.2em]">Strategy Protocol:</p>
                </div>
                <p className="text-[11px] font-bold leading-tight uppercase tracking-tight">
                    {data.recommendation}
                </p>
                <div className="mt-2 text-[8px] text-current/70 font-medium uppercase tracking-wider">
                    <TelemetryStatus />
                </div>
            </div>
        </div>
    );
};

// COMPONENT 2: The Indicator Feed (Tiers 1, 2, 3 Context)
export const MacroIndicatorFeed: React.FC = () => {
    const [data, setData] = useState<BiasResult | null>(null);

    useEffect(() => {
        const fetchBias = async () => {
            try {
                const res = await fetch('/api/macro-bias');
                if (res.ok) setData(await res.json());
            } catch (e) { console.error(e); }
        };
        fetchBias();
        const t = setInterval(fetchBias, 60000);
        return () => clearInterval(t);
    }, []);

    const [showInfo, setShowInfo] = useState(false);
    const [copiedIntel, setCopiedIntel] = useState(false);

    const copyIntelToClipboard = async () => {
        if (!data) return;
        const indicators = data.indicators || [];
        const padX = 20, W = 520, headerH = 52, footerH = 40;
        const tierH = 24;
        const indRowH = 38;
        // Calculate height
        const tiers = [1, 2, 3];
        let totalRows = 0;
        let totalTierHeaders = 0;
        tiers.forEach(tier => {
            const inds = indicators.filter((i: MacroIndicator) => i.tier === tier);
            if (inds.length > 0) { totalTierHeaders++; totalRows += inds.length; }
        });
        const H = headerH + (totalTierHeaders * tierH) + (totalRows * indRowH) + footerH + 24;

        const comp = document.createElement('canvas');
        comp.width = W * 2;
        comp.height = H * 2;
        const ctx = comp.getContext('2d');
        if (!ctx) return;
        ctx.scale(2, 2);

        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, W, H);

        // Header
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, 0, W, headerH);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.fillRect(0, headerH - 1, W, 1);

        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('\u26a1 PHANTOM NODE', padX, headerH / 2);

        ctx.font = 'bold 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText('MACRO INTELLIGENCE', W / 2, headerH / 2 - 7);
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Tiered Indicator Feed', W / 2, headerH / 2 + 8);

        // Bias (right)
        const biasColor = data.bias === 'BULLISH' ? '#10b981' : data.bias === 'BEARISH' ? '#f43f5e' : '#94a3b8';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = biasColor;
        ctx.textAlign = 'right';
        ctx.fillText(data.bias, W - padX, headerH / 2);

        // Tiers
        let y = headerH + 8;
        const tierLabels: Record<number, string> = { 1: 'HIGH IMPACT', 2: 'STRUCTURAL', 3: 'CONTEXT' };
        tiers.forEach(tier => {
            const inds = indicators.filter((i: MacroIndicator) => i.tier === tier);
            if (inds.length === 0) return;

            // Tier header
            ctx.fillStyle = '#475569';
            ctx.font = 'bold 8px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`\u2014 ${tierLabels[tier]}`, padX, y + tierH / 2);
            y += tierH;

            inds.forEach((ind: MacroIndicator) => {
                // Row bg
                ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
                ctx.beginPath();
                ctx.roundRect(padX, y, W - padX * 2, indRowH - 4, 6);
                ctx.fill();

                const rowMid = y + (indRowH - 4) / 2;

                // Signal dot
                const dotColor = ind.signal === 'bullish' ? '#10b981' : ind.signal === 'bearish' ? '#f43f5e' : '#475569';
                ctx.beginPath();
                ctx.arc(padX + 14, rowMid - 5, 3, 0, Math.PI * 2);
                ctx.fillStyle = dotColor;
                ctx.fill();

                // Name
                ctx.font = 'bold 10px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#e2e8f0';
                ctx.textAlign = 'left';
                ctx.fillText(ind.name.toUpperCase(), padX + 24, rowMid - 5);

                // Impact desc
                ctx.font = '8px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#475569';
                const impact = ind.usdJpyImpact.length > 40 ? ind.usdJpyImpact.substring(0, 40) + '...' : ind.usdJpyImpact;
                ctx.fillText(impact.toUpperCase(), padX + 24, rowMid + 9);

                // Value
                const valColor = ind.signal === 'bullish' ? '#10b981' : ind.signal === 'bearish' ? '#f43f5e' : '#64748b';
                ctx.font = 'bold 12px monospace';
                ctx.fillStyle = valColor;
                ctx.textAlign = 'right';
                ctx.fillText(ind.value?.toFixed(2) || '--', W - padX - 14, rowMid);

                y += indRowH;
            });
        });

        // Footer
        const footerY = H - footerH;
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, footerY, W, footerH);
        ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
        ctx.fillRect(0, footerY, W, 1);

        const now = new Date();
        const ts = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '  \u00b7  ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ts, padX, footerY + footerH / 2);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'right';
        ctx.fillText('phantomnode.io', W - padX, footerY + footerH / 2);

        comp.toBlob(async (blob) => {
            if (!blob) return;
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                setCopiedIntel(true); setTimeout(() => setCopiedIntel(false), 2000);
            } catch {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `macro_intel_${Date.now()}.png`; a.click();
                URL.revokeObjectURL(url);
                setCopiedIntel(true); setTimeout(() => setCopiedIntel(false), 2000);
            }
        }, 'image/png');
    };

    if (!data) return null;

    const tierLabels = { 1: '[T1] Priority Drivers', 2: '[T2] Structural Support', 3: '[T3] Economic Context' };

    return (
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur flex flex-col h-[400px] overflow-hidden transition-all duration-500 hover:border-white/20">
            {/* Intel Header */}
            <div className="flex items-center justify-between mb-4 shrink-0 px-1">
                <div>
                    <p className="text-[8px] uppercase tracking-[0.4rem] text-gray-400 font-black">Intel Tape</p>
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight">Macro Intelligence</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copyIntelToClipboard}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${copiedIntel
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                : 'bg-black/40 border border-white/10 text-white/40 hover:text-white hover:border-white/30'
                            }`}
                    >
                        {copiedIntel ? (
                            <>
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Copied!
                            </>
                        ) : (
                            <>
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy PNG
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className="rounded-full border border-white/10 bg-black/40 p-1 text-gray-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all active:scale-90"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Educational Overlay */}
            {showInfo && (
                <div className="absolute inset-0 z-30 bg-black/95 p-6 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
                    <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-2">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Operational Manual</span>
                        <button onClick={() => setShowInfo(false)} className="text-gray-500 hover:text-white text-[10px] font-black uppercase transition-colors">Close</button>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-2">[T1] MARKET DRIVERS</h4>
                            <p className="text-[9px] text-gray-400 leading-relaxed uppercase tracking-tight font-medium">Immediate impact. If T1 data aligns with the 3-Question Consensus, it signals a high-probability entry window.</p>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-2">[T2] STRUCTURAL DATA</h4>
                            <p className="text-[9px] text-gray-400 leading-relaxed uppercase tracking-tight font-medium">Inflation & Energy flows. These drive the structural trend. Use these to maintain conviction in longer duration swing trades.</p>
                        </div>
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Tactical Protocol</h4>
                            <p className="text-[9px] text-emerald-300 leading-relaxed uppercase tracking-tight font-medium">Never fight Tier 1 flow. If US yields [T1] are rising while the dashboard is bearish, wait for decompression before execution.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {[1, 2, 3].map((tier) => (
                    <div key={tier} className="mb-5 last:mb-0">
                        <div className="flex items-center gap-2 mb-2 ml-1 opacity-60">
                            <div className="h-[1px] w-2 bg-gray-500" />
                            <p className="text-[8px] uppercase tracking-[0.2rem] text-gray-500 font-bold">
                                {tier === 1 ? 'High Impact' : tier === 2 ? 'Structural' : 'Context'}
                            </p>
                        </div>
                        <div className="space-y-1">
                            {data.indicators.filter(i => i.tier === tier).map((ind, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-white/[0.03] bg-black/20 hover:bg-white/[0.04] transition-all group">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[9px] font-black text-white/70 uppercase leading-none group-hover:text-white transition-colors">{ind.name}</span>
                                            <div className={`w-1 h-1 rounded-full ${ind.signal === 'bullish' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : ind.signal === 'bearish' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-gray-700'}`} />
                                        </div>
                                        <span className="text-[8px] text-gray-600 truncate max-w-[160px] uppercase font-medium">{ind.usdJpyImpact}</span>
                                    </div>
                                    <div className={`text-[11px] font-mono font-black ${ind.signal === 'bullish' ? 'text-emerald-400' : ind.signal === 'bearish' ? 'text-rose-400' : 'text-gray-500'
                                        }`}>
                                        {ind.value?.toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-4 pt-2 border-t border-white/5 text-right flex items-center justify-between">
                <span className="text-[7px] text-gray-500 uppercase font-black tracking-widest">Global Sync</span>
                <span className="text-[7px] text-gray-400 uppercase tracking-widest font-black tabular-nums">{new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC</span>
            </div>
        </div>
    );
};

export default MacroConsensusPanel;
