'use client';

import { TradeDetail } from '@/types/forex';

interface TradeDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    trade: TradeDetail | null;
}

export default function TradeDetailModal({ isOpen, onClose, trade }: TradeDetailModalProps) {
    if (!isOpen || !trade) return null;

    const formatDuration = (minutes?: number) => {
        if (!minutes) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e]/90 p-6 shadow-2xl backdrop-blur-xl transition-all max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">TRADE AUDIT DETAIL</h2>
                        <p className="text-[10px] uppercase tracking-[0.2rem] text-emerald-400 font-bold">
                            {trade.instrument} - {trade.positionDirection}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Trade Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-white/5 bg-black/40 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">P/L</p>
                            <p className={`mt-1 text-lg font-bold ${trade.pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {trade.pl >= 0 ? '+' : ''}{trade.pl.toFixed(2)} USD
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-black/40 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Pips</p>
                            <p className={`mt-1 text-lg font-bold ${trade.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {trade.pips >= 0 ? '+' : ''}{trade.pips.toFixed(1)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-black/40 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Duration</p>
                            <p className="mt-1 text-lg font-bold text-white">
                                {formatDuration(trade.duration)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-black/40 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Size</p>
                            <p className="mt-1 text-lg font-bold text-white">
                                {trade.units}
                            </p>
                        </div>
                    </div>

                    {/* Signal Information */}
                    {trade.signal && (
                        <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                            <div className="bg-black/40 px-4 py-2 border-b border-white/5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Signal Analysis</span>
                            </div>
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Signal Type</p>
                                        <p className={`text-sm font-bold ${trade.signal.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {trade.signal.type}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Confidence</p>
                                        <p className="text-sm font-bold text-white">{trade.signal.confidence}%</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Strength</p>
                                        <p className="text-sm font-bold text-white">{trade.signal.strength}/10</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Risk</p>
                                        <p className="text-sm font-bold text-white">{trade.signal.riskMetrics.riskPerTrade}%</p>
                                    </div>
                                </div>

                                {/* Technical Indicators */}
                                <div>
                                    <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-2">Technical Indicators</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {trade.signal.indicators.rsi !== undefined && (
                                            <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                                                <p className="text-[8px] text-gray-500">RSI</p>
                                                <p className="text-sm font-bold text-white">{trade.signal.indicators.rsi.toFixed(1)}</p>
                                            </div>
                                        )}
                                        {trade.signal.indicators.macd !== undefined && (
                                            <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                                                <p className="text-[8px] text-gray-500">MACD</p>
                                                <p className="text-sm font-bold text-white">{trade.signal.indicators.macd.toFixed(4)}</p>
                                            </div>
                                        )}
                                        {trade.signal.indicators.bollinger !== undefined && (
                                            <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                                                <p className="text-[8px] text-gray-500">Bollinger</p>
                                                <p className="text-sm font-bold text-white">{(trade.signal.indicators.bollinger * 100).toFixed(1)}%</p>
                                            </div>
                                        )}
                                        {trade.signal.indicators.volume !== undefined && (
                                            <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                                                <p className="text-[8px] text-gray-500">Volume</p>
                                                <p className="text-sm font-bold text-white">{trade.signal.indicators.volume.toFixed(1)}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Economic Context */}
                                {trade.signal.economicContext && (
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-2">Economic Context</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                                                <p className="text-[8px] text-gray-500">USD Bias</p>
                                                <p className={`text-sm font-bold ${trade.signal.economicContext.usdWeak ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {trade.signal.economicContext.usdWeak ? 'WEAK' : 'STRONG'}
                                                </p>
                                            </div>
                                            <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                                                <p className="text-[8px] text-gray-500">JPY Bias</p>
                                                <p className={`text-sm font-bold ${trade.signal.economicContext.jpyStrong ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {trade.signal.economicContext.jpyStrong ? 'STRONG' : 'WEAK'}
                                                </p>
                                            </div>
                                        </div>
                                        {trade.signal.economicContext.highImpactEvents.length > 0 && (
                                            <div className="mt-3">
                                                <p className="text-[8px] text-gray-500 mb-1">High Impact Events</p>
                                                <div className="space-y-1">
                                                    {trade.signal.economicContext.highImpactEvents.map((event, idx) => (
                                                        <div key={idx} className="text-[9px] text-gray-400">
                                                            {event.event} ({event.currency}) - {event.impact}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Filtering Data */}
                    {trade.filteringData && (
                        <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                            <div className="bg-black/40 px-4 py-2 border-b border-white/5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Filter Analysis</span>
                            </div>
                            <div className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {Object.entries(trade.filteringData).map(([filter, active]) => (
                                        <div key={filter} className="rounded-lg border border-white/5 bg-black/40 p-3">
                                            <p className="text-[8px] text-gray-500 capitalize">{filter.replace(/([A-Z])/g, ' $1').trim()}</p>
                                            <p className={`text-sm font-bold ${active ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {active ? 'ACTIVE' : 'INACTIVE'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Execution Details */}
                    {trade.execution && (
                        <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                            <div className="bg-black/40 px-4 py-2 border-b border-white/5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Execution Quality</span>
                            </div>
                            <div className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Entry Price</p>
                                        <p className="text-sm font-bold text-white">
                                            {trade.entryPrice ? trade.entryPrice.toFixed(5) : 'N/A'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Exit Price</p>
                                        <p className="text-sm font-bold text-white">
                                            {trade.exitPrice ? trade.exitPrice.toFixed(5) : 'N/A'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Slippage</p>
                                        <p className="text-sm font-bold text-white">{trade.execution.slippage || 0} pips</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Spread</p>
                                        <p className="text-sm font-bold text-white">{trade.execution.spread || 0} pips</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Trade Reason */}
                    {trade.reason && (
                        <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                            <div className="bg-black/40 px-4 py-2 border-b border-white/5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trade Reason</span>
                            </div>
                            <div className="p-4">
                                <p className="text-sm text-gray-300">{trade.reason}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
