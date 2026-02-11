'use client';

import React, { useState, useEffect } from 'react';

interface AlgoConfig {
    aggressive_mode: boolean;
    min_confluence_score: number;
    risk_per_trade: number;
    max_daily_loss: number;
    atr_multiplier_sl: number;
    rr_ratio: number;
    quant_active: boolean;
}

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
    heartbeat?: string;
    telemetry?: TelemetryData;
}

interface AlgoOpsCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AlgoOpsCenter: React.FC<AlgoOpsCenterProps> = ({ isOpen, onClose }) => {
    const [config, setConfig] = useState<AlgoConfig | null>(null);
    const [status, setStatus] = useState<AlgoStatus | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'control' | 'config' | 'logs'>('control');
    const [isSaving, setIsSaving] = useState(false);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [isAlgoRunning, setIsAlgoRunning] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchConfig();
            fetchLogs();
            fetchStatus();
            const interval = setInterval(() => {
                fetchLogs();
                fetchConfig();
                fetchStatus();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    // Update running status when status changes
    useEffect(() => {
        if (status?.heartbeat) {
            setIsAlgoRunning(true);
        }
    }, [status?.heartbeat]);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/algo/config');
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
                setLastSync(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch config:', error);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/algo/status');
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (error) {
            console.error('Failed to fetch status:', error);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/algo/logs');
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        }
    };

    const handleSaveDelta = async (delta: Partial<AlgoConfig>) => {
        if (!config) return;
        const updatedConfig = { ...config, ...delta };
        setIsSaving(true);
        try {
            const res = await fetch('/api/algo/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConfig),
            });
            if (res.ok) {
                setConfig(updatedConfig);
            }
        } catch (error) {
            console.error('Failed to save config:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-4xl max-h-[90vh] bg-[#030712] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header - Clean & Condensed */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isAlgoRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-gray-600'} transition-all duration-500`} />
                            <h2 className="text-lg font-bold text-white tracking-tight uppercase">Ops Center</h2>
                        </div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest font-black">
                            {isAlgoRunning ? 'LIVE' : 'IDLE'}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-[8px] text-gray-600 uppercase tracking-widest font-black">
                            {lastSync?.toLocaleTimeString() || 'Syncing...'}
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs - Compact */}
                <div className="flex border-b border-white/10 bg-white/[0.01]">
                    {(['control', 'config', 'logs'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {tab}
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-transparent to-black/20">
                    {activeTab === 'control' && (
                        <div className="space-y-4">
                            {/* Single Clean Status Card */}
                            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-left transition-all relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl -mr-12 -mt-12" />
                                <div className="flex items-center justify-between mb-3 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white uppercase tracking-tight">Quant Engine</h3>
                                            <div className="text-[8px] text-emerald-400 uppercase tracking-widest font-black">
                                                {isAlgoRunning ? 'ACTIVE' : 'IDLE'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[9px] text-gray-400 leading-relaxed uppercase tracking-[0.1em] relative z-10">
                                    Autonomous Execution Core • Real-time Market Scanning • Order Management
                                </p>
                            </div>

                            {/* Operational Telemetry Deck */}
                            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 relative overflow-hidden">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Operational Telemetry</h4>
                                        <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5 opacity-70">Calculated Real-Time Insight</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[8px] text-gray-600 font-bold uppercase block tracking-widest">Market Price</span>
                                        <span className="text-lg font-mono font-bold text-white tracking-tighter">
                                            {status?.telemetry?.price?.toFixed(3) || '000.000'}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-6 relative z-10">
                                    <div className="space-y-1">
                                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Long Score</p>
                                        <div className="text-lg font-mono font-bold text-emerald-400">
                                            {status?.telemetry?.long_score?.toFixed(1) || '0.0'}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Short Score</p>
                                        <div className="text-lg font-mono font-bold text-rose-400">
                                            {status?.telemetry?.short_score?.toFixed(1) || '0.0'}
                                        </div>
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Active Logic Factors</p>
                                        <div className="text-[10px] text-gray-400 flex flex-wrap gap-1">
                                            {(status?.telemetry?.factors || []).length > 0 ? (
                                                status?.telemetry?.factors?.map((f, i) => (
                                                    <span key={i} className={`px-1.5 py-0.5 rounded border font-medium ${f.includes('OK') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/60'}`}>
                                                        {f}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="italic text-gray-600">Scanning for confluence...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Debug Metrics for Transparency */}
                                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-white/5 pt-4">
                                    <div className="space-y-0.5">
                                        <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest text-center">ADX Strength</p>
                                        <div className="text-sm font-mono font-bold text-center text-white/80">
                                            {status?.telemetry?.debug?.adx?.toFixed(1) || '0.0'}
                                        </div>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest text-center">H1 RSI</p>
                                        <div className="text-sm font-mono font-bold text-center text-white/80">
                                            {status?.telemetry?.debug?.h1_rsi?.toFixed(1) || '0.0'}
                                        </div>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest text-center">ATR Exp %</p>
                                        <div className="text-sm font-mono font-bold text-center text-white/80">
                                            {((status?.telemetry?.debug?.atr_ratio || 1) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Status:</span>
                                        <span className="text-[10px] text-blue-400 font-black uppercase italic tracking-wider">
                                            {status?.telemetry?.reason || 'Idle...'}
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-gray-700 font-bold uppercase tracking-[0.2em]">Strategy v10</span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
                                <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4">Safety Protocols</h4>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Kill Switch</p>
                                        <button className="w-full py-2 bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-black uppercase rounded-lg hover:bg-rose-500/30 transition-all">
                                            Emergency Halt
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Max Drawdown</p>
                                        <div className="text-xl font-mono text-white">${config?.max_daily_loss?.toLocaleString() || '1,000'}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Account Risk</p>
                                        <div className="text-xl font-mono text-white">{(config?.risk_per_trade ? config.risk_per_trade * 100 : 1).toFixed(1)}% / Trade</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'config' && config && (
                        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                            <div className="space-y-6">
                                <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em] border-b border-emerald-500/20 pb-2">Risk Strategy</h4>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Risk Per Trade (%)</label>
                                        <span className="text-xs font-mono text-emerald-400">{(config?.risk_per_trade ? (config.risk_per_trade * 100).toFixed(1) : '1.0')}%</span>
                                    </div>
                                    <input
                                        type="range" min="0.005" max="0.05" step="0.001"
                                        value={config?.risk_per_trade || 0.01}
                                        onChange={(e) => handleSaveDelta({ risk_per_trade: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Max Daily Loss ($)</label>
                                        <span className="text-xs font-mono text-emerald-400">${config?.max_daily_loss || 1000}</span>
                                    </div>
                                    <input
                                        type="range" min="100" max="5000" step="50"
                                        value={config?.max_daily_loss || 1000}
                                        onChange={(e) => handleSaveDelta({ max_daily_loss: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Min Confluence Score</label>
                                        <span className="text-xs font-mono text-emerald-400">{config?.min_confluence_score?.toFixed(1) || '3.0'}</span>
                                    </div>
                                    <input
                                        type="range" min="1.0" max="6.0" step="0.1"
                                        value={config?.min_confluence_score || 3.0}
                                        onChange={(e) => handleSaveDelta({ min_confluence_score: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Risk:Reward Ratio</label>
                                        <span className="text-xs font-mono text-emerald-400">1:{config?.rr_ratio?.toFixed(1) || '2.0'}</span>
                                    </div>
                                    <input
                                        type="range" min="1.5" max="5.0" step="0.1"
                                        value={config?.rr_ratio || 2.0}
                                        onChange={(e) => handleSaveDelta({ rr_ratio: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">ATR Stop Multiplier</label>
                                        <span className="text-xs font-mono text-emerald-400">{config?.atr_multiplier_sl?.toFixed(1) || '1.5'}x</span>
                                    </div>
                                    <input
                                        type="range" min="1.0" max="3.0" step="0.1"
                                        value={config?.atr_multiplier_sl || 1.5}
                                        onChange={(e) => handleSaveDelta({ atr_multiplier_sl: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em] border-b border-emerald-500/20 pb-2">Logic Parameters</h4>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Min Confluence Score</label>
                                        <span className="text-xs font-mono text-emerald-400">{config?.min_confluence_score?.toFixed(1) || '3.0'}</span>
                                    </div>
                                    <input
                                        type="range" min="1.0" max="6.0" step="0.1"
                                        value={config?.min_confluence_score || 3.0}
                                        onChange={(e) => handleSaveDelta({ min_confluence_score: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">Risk:Reward Ratio</label>
                                        <span className="text-xs font-mono text-emerald-400">1:{config?.rr_ratio?.toFixed(1) || '2.0'}</span>
                                    </div>
                                    <input
                                        type="range" min="1.5" max="5.0" step="0.1"
                                        value={config?.rr_ratio || 2.0}
                                        onChange={(e) => handleSaveDelta({ rr_ratio: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-white uppercase tracking-widest">ATR Stop Multiplier</label>
                                        <span className="text-xs font-mono text-emerald-400">{config?.atr_multiplier_sl?.toFixed(1) || '1.5'}x</span>
                                    </div>
                                    <input
                                        type="range" min="1.0" max="3.0" step="0.1"
                                        value={config?.atr_multiplier_sl || 1.5}
                                        onChange={(e) => handleSaveDelta({ atr_multiplier_sl: parseFloat(e.target.value) })}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="h-full flex flex-col">
                            <div className="flex-1 bg-black/50 rounded-xl border border-white/5 font-mono text-[10px] p-4 overflow-y-auto space-y-1 custom-scrollbar">
                                {logs.map((log, idx) => {
                                    const isError = log.includes('[ERROR]') || log.includes('failed') || log.includes('Error');
                                    const isExec = log.includes('EXECUTING');

                                    return (
                                        <div key={idx} className={`${isError ? 'text-rose-400' :
                                            isExec ? 'text-blue-400 font-bold' :
                                                'text-gray-500'
                                            }`}>
                                            {log}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex gap-4">
                        <p className="text-[9px] text-gray-600 uppercase font-black">Memory: OK</p>
                        <p className="text-[9px] text-gray-600 uppercase font-black">CPU: 42%</p>
                        <p className="text-[9px] text-gray-600 uppercase font-black">Lat: 12ms</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
