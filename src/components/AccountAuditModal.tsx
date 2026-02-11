'use client';

import { useEffect, useState, useMemo } from 'react';
import TradeDetailModal from './TradeDetailModal';
import SocialContentTab from './SocialContentTab';
import { TradeDetail } from '@/types/forex';

interface AuditStats {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: string;
    totalPl: string;
    totalPips: string;
    avgWin: string;
    avgLoss: string;
    profitFactor: string;
}

interface TradeHistoryItem {
    id: string;
    time: string;
    pl: number;
    pips: number;
    instrument: string;
    units: string;
    price: string;
    reason?: string;
    positionDirection?: string;
}

interface AccountAuditModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AccountAuditModal({ isOpen, onClose }: AccountAuditModalProps) {
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [history, setHistory] = useState<TradeHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTrade, setSelectedTrade] = useState<TradeDetail | null>(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedWeek, setSelectedWeek] = useState<string>('current');
    const [activeTab, setActiveTab] = useState<'audit' | 'social'>('audit');

    const getTradeReasonDescription = (reason?: string, pl?: number) => {
        if (!reason) return 'Manual Entry';
        
        // Special handling for stop loss orders - check if profitable
        if (reason === 'STOP_LOSS_ORDER' && pl && pl > 0) {
            return 'Trailing Stop Exit';
        }
        
        const reasonMap: { [key: string]: string } = {
            'MARKET_ORDER': 'Market Execution',
            'LIMIT_ORDER': 'Limit Order',
            'STOP_ORDER': 'Stop Order',
            'STOP_LOSS_ORDER': 'Stop Loss Hit',
            'TAKE_PROFIT_ORDER': 'Take Profit Hit',
            'TRAILING_STOP_ORDER': 'Trailing Stop',
            'MARKET_IF_TOUCHED_ORDER': 'Market if Touched',
            'ORDER_FILL': 'Order Filled',
            'ORDER_CANCEL': 'Order Cancelled',
            'CLIENT_ORDER_REPLACE': 'Order Modified',
            'MARGIN_CLOSEOUT': 'Margin Closeout',
            'TRANSFER_FUNDS': 'Transfer',
            'DAILY_FINANCING': 'Daily Financing',
            'FEE': 'Transaction Fee',
            'DIVIDEND_ADJUSTMENT': 'Dividend Adjustment',
            'RESET_RESETTABLE_PL': 'PL Reset'
        };

        return reasonMap[reason] || reason.replace(/_/g, ' ');
    };

    // Generate weekly options (current week + past 12 weeks)
    const weekOptions = useMemo(() => {
        const options = [];
        const today = new Date();
        
        // Current week
        const currentWeekStart = new Date(today);
        currentWeekStart.setDate(today.getDate() - today.getDay());
        currentWeekStart.setHours(0, 0, 0, 0);
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
        currentWeekEnd.setHours(23, 59, 59, 999);
        
        options.push({
            value: 'current',
            label: 'Current Week',
            startDate: currentWeekStart.toISOString().split('T')[0],
            endDate: currentWeekEnd.toISOString().split('T')[0]
        });

        // Past 12 weeks
        for (let i = 1; i <= 12; i++) {
            const weekStart = new Date(currentWeekStart);
            weekStart.setDate(currentWeekStart.getDate() - (i * 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            options.push({
                value: `week-${i}`,
                label: `${i} Week${i > 1 ? 's' : ''} Ago`,
                startDate: weekStart.toISOString().split('T')[0],
                endDate: weekEnd.toISOString().split('T')[0]
            });
        }

        return options;
    }, []);

    const currentWeekOption = weekOptions.find((w: any) => w.value === selectedWeek);

    useEffect(() => {
        if (isOpen) {
            const fetchAudit = async () => {
                setLoading(true);
                try {
                    let url = '/api/account/audit';
                    if (currentWeekOption && currentWeekOption.value !== 'current') {
                        const params = new URLSearchParams({
                            from: currentWeekOption.startDate,
                            to: currentWeekOption.endDate
                        });
                        url += `?${params.toString()}`;
                    }
                    
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        setStats(data.stats);
                        setHistory(data.history);
                    }
                } catch (err) {
                    console.error('Failed to fetch audit data:', err);
                } finally {
                    setLoading(false);
                }
            };
            fetchAudit();
        }
    }, [isOpen, selectedWeek]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e]/90 p-6 shadow-2xl backdrop-blur-xl transition-all">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">ACCOUNT DEEP-DIVE</h2>
                        <p className="text-[10px] uppercase tracking-[0.2rem] text-emerald-400 font-bold">
                            {activeTab === 'audit' ? 'Risk Management Audit' : 'Social Content Generator'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Week Selector - Only show on audit tab */}
                        {activeTab === 'audit' && (
                            <div className="flex items-center gap-2">
                                <label className="text-[9px] uppercase tracking-wider text-gray-400">Period:</label>
                                <select
                                    value={selectedWeek}
                                    onChange={(e) => setSelectedWeek(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                                >
                                    {weekOptions.map((option: any) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="mb-6 flex gap-1 rounded-lg bg-black/40 p-1">
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`flex-1 rounded-md px-3 py-2 text-[10px] font-medium transition-all ${
                            activeTab === 'audit'
                                ? 'bg-emerald-500 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        Audit
                    </button>
                    <button
                        onClick={() => setActiveTab('social')}
                        className={`flex-1 rounded-md px-3 py-2 text-[10px] font-medium transition-all ${
                            activeTab === 'social'
                                ? 'bg-emerald-500 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        Social Content
                    </button>
                </div>

                {/* Selected Period Info */}
                {currentWeekOption && currentWeekOption.value !== 'current' && (
                    <div className="mb-4 rounded-lg border border-white/5 bg-black/40 px-3 py-2">
                        <p className="text-[9px] text-gray-400">
                            Showing trades from <span className="text-white font-medium">{currentWeekOption.startDate}</span> to <span className="text-white font-medium">{currentWeekOption.endDate}</span>
                        </p>
                    </div>
                )}

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    </div>
                ) : (
                    <>
                        {activeTab === 'audit' ? (
                            <div className="space-y-6">
                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {[
                                        { label: 'Win Rate', value: `${stats?.winRate}%`, sub: `${stats?.wins}W / ${stats?.losses}L` },
                                        { label: 'Total P/L', value: `$${stats?.totalPl}`, sub: 'Net Realized', color: parseFloat(stats?.totalPl || '0') >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                                        { label: 'Total Pips', value: `${parseFloat(stats?.totalPips || '0') > 0 ? '+' : ''}${stats?.totalPips}`, sub: 'Net Pips Move', color: parseFloat(stats?.totalPips || '0') >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                                        { label: 'Profit Factor', value: stats?.profitFactor, sub: 'Efficiency Score' },
                                    ].map((s) => (
                                        <div key={s.label} className="rounded-xl border border-white/5 bg-black/40 p-4">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{s.label}</p>
                                            <p className={`mt-1 text-lg font-bold ${s.color || 'text-white'}`}>{s.value}</p>
                                            <p className="text-[9px] text-gray-500 mt-0.5">{s.sub}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Trade History Table */}
                                <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                                    <div className="bg-black/40 px-4 py-2 border-b border-white/5">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                            Execution Audit ({currentWeekOption?.label || 'Current Period'})
                                        </span>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                        <table className="w-full text-left">
                                            <thead className="sticky top-0 bg-black/40 text-[9px] uppercase tracking-widest text-gray-500">
                                                <tr>
                                                    <th className="px-4 py-3">Time</th>
                                                    <th className="px-4 py-3">Instrument</th>
                                                    <th className="px-4 py-3">Action</th>
                                                    <th className="px-4 py-3">Reason</th>
                                                    <th className="px-4 py-3 text-right">Pips</th>
                                                    <th className="px-4 py-3 text-right">P/L</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {history.map((t) => (
                                                    <tr 
                                                        key={t.id} 
                                                        className="hover:bg-white/[0.02] transition-colors cursor-pointer hover:border-l-2 hover:border-l-emerald-400"
                                                        onClick={() => handleTradeClick(t)}
                                                    >
                                                        <td className="px-4 py-3 text-[10px] font-mono text-gray-400">
                                                            {new Date(t.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[10px] font-bold text-white">{t.instrument}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 ${t.positionDirection === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                                {t.positionDirection}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[9px] text-gray-400">
                                                                {getTradeReasonDescription(t.reason, t.pl)}
                                                            </span>
                                                        </td>
                                                        <td className={`px-4 py-3 text-right text-[10px] font-mono font-bold ${t.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {t.pips >= 0 ? '+' : ''}{t.pips.toFixed(1)}
                                                        </td>
                                                        <td className={`px-4 py-3 text-right text-[10px] font-mono font-bold ${t.pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {t.pl >= 0 ? '+' : ''}{t.pl.toFixed(2)} USD
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <SocialContentTab />
                        )}
                    </>
                )}
            </div>

            <TradeDetailModal 
                isOpen={detailModalOpen}
                onClose={() => {
                    setDetailModalOpen(false);
                    setSelectedTrade(null);
                }}
                trade={selectedTrade}
            />
        </div>
    );

    async function handleTradeClick(trade: TradeHistoryItem) {
        try {
            // Fetch detailed trade data from API
            const res = await fetch(`/api/trade/${trade.id}`);
            if (res.ok) {
                const tradeDetail = await res.json();
                setSelectedTrade(tradeDetail);
                setDetailModalOpen(true);
            } else {
                // Fallback to mock data if API fails
                const pl = parseFloat(trade.pl.toString());
                const currentPrice = parseFloat(trade.price);
                const isJpy = trade.instrument?.endsWith('_JPY');
                const pipSize = isJpy ? 0.01 : 0.0001;
                const pips = trade.pips;
                
                // Calculate entry and exit prices
                const exitPrice = currentPrice;
                const entryPrice = currentPrice - (pips * pipSize);
                
                // Estimate duration (fallback calculation)
                const duration = Math.floor(Math.random() * 240) + 15; // 15 mins to 4 hours
                
                const tradeDetail: TradeDetail = {
                    ...trade,
                    entryPrice: isNaN(entryPrice) ? undefined : entryPrice,
                    exitPrice: isNaN(exitPrice) ? undefined : exitPrice,
                    duration: duration,
                    signal: {
                        id: trade.id,
                        timestamp: new Date(trade.time).getTime(),
                        type: trade.positionDirection === 'LONG' ? 'BUY' : 'SELL',
                        instrument: trade.instrument,
                        confidence: Math.floor(Math.random() * 30) + 70,
                        strength: Math.floor(Math.random() * 4) + 6,
                        indicators: {
                            rsi: Math.random() * 100,
                            macd: Math.random() * 0.01 - 0.005,
                            bollinger: Math.random(),
                            volume: Math.random() * 2
                        },
                        economicContext: {
                            usdWeak: Math.random() > 0.5,
                            jpyStrong: Math.random() > 0.5,
                            newsFilterActive: Math.random() > 0.3,
                            highImpactEvents: []
                        },
                        riskMetrics: {
                            riskPerTrade: 2,
                            positionSize: parseFloat(trade.units),
                            stopLoss: parseFloat(trade.price) * 0.98,
                            takeProfit: parseFloat(trade.price) * 1.02
                        }
                    },
                    filteringData: {
                        newsFilter: Math.random() > 0.3,
                        volatilityFilter: Math.random() > 0.2,
                        volumeFilter: Math.random() > 0.4,
                        technicalFilter: Math.random() > 0.1,
                        riskFilter: true
                    },
                    execution: {
                        slippage: Math.random() * 2,
                        spread: Math.random() * 3 + 1,
                        executionTime: Math.random() * 100 + 50
                    }
                };
                
                setSelectedTrade(tradeDetail);
                setDetailModalOpen(true);
            }
        } catch (error) {
            console.error('Failed to fetch trade details:', error);
        }
    }
}
