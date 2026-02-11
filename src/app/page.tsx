'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TradingChart from '@/components/TradingChart';
import { oandaAPI, OandaPrice } from '@/lib/oanda';
import { fetchEconomicCalendar, filterHighImpactUsdJpyEvents } from '@/lib/fmp';
import { getMarketStatus, formatCountdown, formatEventCountdown } from '@/lib/marketHours';
import AccountAuditModal from '@/components/AccountAuditModal';
import CondensedTradeDetailModal from '@/components/CondensedTradeDetailModal';
import { MacroConsensusPanel, MacroIndicatorFeed } from '@/components/MacroBiasPanel';
import { AlgoOpsCenter } from '@/components/AlgoOpsCenter';
import Link from 'next/link';

const PRIMARY_INSTRUMENT = 'USD_JPY';
const SECONDARY_INSTRUMENTS = [
    { label: 'Gold', instrument: 'XAU_USD', driver: 'Safe-haven hedge', accent: 'from-amber-300/40 via-amber-500/10 to-transparent' },
    { label: 'Silver', instrument: 'XAG_USD', driver: 'Industrial beta', accent: 'from-slate-200/40 via-slate-300/10 to-transparent' },
    { label: 'WTI Crude', instrument: 'WTICO_USD', driver: 'Energy inflation', accent: 'from-orange-300/40 via-orange-500/10 to-transparent' },
];
const KEY_INSTRUMENTS = [PRIMARY_INSTRUMENT, ...SECONDARY_INSTRUMENTS.map((item) => item.instrument)];
const TIMEFRAMES = [
    { label: 'M1', value: 'M1' },
    { label: 'M5', value: 'M5' },
    { label: 'M15', value: 'M15' },
    { label: 'M30', value: 'M30' },
    { label: 'H1', value: 'H1' },
    { label: 'H4', value: 'H4' },
    { label: 'D1', value: 'D' },
];

const SESSION_WINDOWS: {
    label: string;
    range: [number, number];
    focus: string;
    vol: string;
}[] = [
        { label: 'Tokyo', range: [23, 8], focus: 'BoJ, exporters', vol: '62% of avg' },
        { label: 'London', range: [7, 16], focus: 'Real money, EU data', vol: '88% of avg' },
        { label: 'New York', range: [12, 21], focus: 'USTs, macro funds', vol: '95% of avg' },
    ];

const DRIVER_SIGNALS = [
    {
        label: 'US 10Y vs JGB 10Y spread',
        value: 78,
        bias: '+213 bps keeps USD bid on rate differentials',
    },
    {
        label: 'Risk appetite (HSI, NKY, ES futures)',
        value: 41,
        bias: 'Equity softness fuels defensive JPY tone',
    },
    {
        label: 'Energy impulse (WTI + NatGas)',
        value: 65,
        bias: 'Higher energy reprices Japan trade balance',
    },
    {
        label: 'Gold / Silver ratio',
        value: 54,
        bias: 'Rebalancing toward metals curbs USD upside',
    },
];

const isHourWithin = (hour: number, [start, end]: [number, number]) => {
    if (start <= end) {
        return hour >= start && hour < end;
    }
    return hour >= start || hour < end;
};

const getMidPrice = (price?: OandaPrice) => {
    if (!price) return null;
    const bid = parseFloat(price.bid);
    const ask = parseFloat(price.ask);
    if (Number.isNaN(bid) || Number.isNaN(ask)) return null;
    return (bid + ask) / 2;
};

const getSpread = (price?: OandaPrice) => {
    if (!price) return null;
    const bid = parseFloat(price.bid);
    const ask = parseFloat(price.ask);
    if (Number.isNaN(bid) || Number.isNaN(ask)) return null;
    return ask - bid;
};

export default function Home() {
    const [timeframe, setTimeframe] = useState('M15');
    const [priceMap, setPriceMap] = useState<Record<string, OandaPrice>>({});
    const [isPriceLoading, setIsPriceLoading] = useState(true);
    const [usdJpyDelta, setUsdJpyDelta] = useState<number | null>(null);

    const selectedGranularity = useMemo(() => {
        const match = TIMEFRAMES.find((tf) => tf.label === timeframe);
        return match ? match.value : 'M5';
    }, [timeframe]);
    const [utcHour, setUtcHour] = useState(0);

    useEffect(() => {
        setUtcHour(new Date().getUTCHours());
    }, []);
    const usdJpyPrevRef = useRef<number | null>(null);
    const [newsEvents, setNewsEvents] = useState<any[]>([]);
    const [newsError, setNewsError] = useState<string | null>(null);
    const [activeSignal, setActiveSignal] = useState<any>(null);
    const [algoStatus, setAlgoStatus] = useState<{
        running: boolean;
        lastScan: string | null;
        lastSignal: any;
        error: string | null;
        circuitBreakerTripped?: boolean;
        circuitBreakerDate?: string | null;
        dailyPnl?: number | null;
    }>({ running: false, lastScan: null, lastSignal: null, error: null });
    const [auditStats, setAuditStats] = useState<any>(null);
    const [tradeHistory, setTradeHistory] = useState<any[]>([]);
    const tradeHistoryRef = useRef<any[]>([]);
    useEffect(() => { tradeHistoryRef.current = tradeHistory; }, [tradeHistory]);
    const [accountInfo, setAccountInfo] = useState<any>(null);
    const [leverage, setLeverage] = useState(100);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [selectedExecutionTrade, setSelectedExecutionTrade] = useState<any | null>(null);
    const [isCondensedModalOpen, setIsCondensedModalOpen] = useState(false);
    const [isOpsModalOpen, setIsOpsModalOpen] = useState(false);
    const [countdownTick, setCountdownTick] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [copiedTrades, setCopiedTrades] = useState(false);

    const copyTradeHistoryToClipboard = async () => {
        if (!tradeHistory || tradeHistory.length === 0) return;

        const trades = tradeHistory.slice(0, 20); // Cap at 20 most recent
        const rowH = 36;
        const headerH = 52;
        const tableHeaderH = 30;
        const footerH = 40;
        const padX = 20;
        const W = 600;
        const H = headerH + tableHeaderH + (trades.length * rowH) + footerH + 16;

        const comp = document.createElement('canvas');
        comp.width = W * 2; // 2x for retina
        comp.height = H * 2;
        const ctx = comp.getContext('2d');
        if (!ctx) return;
        ctx.scale(2, 2);

        // Background
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, W, H);

        // --- HEADER ---
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, 0, W, headerH);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.fillRect(0, headerH - 1, W, 1);

        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('\u26a1 PHANTOM NODE', padX, headerH / 2);

        ctx.font = 'bold 14px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText('EXECUTION LOG  \u00b7  USD/JPY', W / 2, headerH / 2);

        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';
        ctx.fillText(`${trades.length} trades`, W - padX, headerH / 2);

        // --- TABLE HEADER ---
        const thY = headerH;
        ctx.fillStyle = '#0f1629';
        ctx.fillRect(0, thY, W, tableHeaderH);
        ctx.fillStyle = 'rgba(51, 65, 85, 0.3)';
        ctx.fillRect(0, thY + tableHeaderH - 1, W, 1);

        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('ACTION', padX, thY + tableHeaderH / 2);
        ctx.fillText('ENTRY', padX + 70, thY + tableHeaderH / 2);
        ctx.fillText('SL', padX + 165, thY + tableHeaderH / 2);
        ctx.fillText('TP', padX + 250, thY + tableHeaderH / 2);
        ctx.fillText('SIZE', padX + 335, thY + tableHeaderH / 2);
        ctx.textAlign = 'center';
        ctx.fillText('PIPS', padX + 420, thY + tableHeaderH / 2);
        ctx.textAlign = 'right';
        ctx.fillText('P/L', W - padX, thY + tableHeaderH / 2);

        // --- TRADE ROWS ---
        const startY = headerH + tableHeaderH;
        trades.forEach((trade: any, i: number) => {
            const y = startY + i * rowH;
            const isBuy = trade.action === 'BUY';
            const pips = midPrice ? (isBuy ? midPrice - trade.entry : trade.entry - midPrice) * 100 : 0;
            const isProfit = pips >= 0;
            const profitUsd = pips * (trade.size / 1000) * 0.065;

            // Alternate row bg
            if (i % 2 === 0) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
                ctx.fillRect(0, y, W, rowH);
            }

            // Row separator
            ctx.fillStyle = 'rgba(51, 65, 85, 0.15)';
            ctx.fillRect(padX, y + rowH - 1, W - padX * 2, 1);

            const rowMid = y + rowH / 2;

            // Action badge
            const badgeColor = isBuy ? '#10b981' : '#f43f5e';
            const badgeBg = isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
            ctx.fillStyle = badgeBg;
            const badgeW = 36;
            const badgeH = 16;
            ctx.beginPath();
            ctx.roundRect(padX, rowMid - badgeH / 2, badgeW, badgeH, 3);
            ctx.fill();
            ctx.font = 'bold 9px Inter, system-ui, sans-serif';
            ctx.fillStyle = badgeColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(trade.action, padX + badgeW / 2, rowMid);

            // Entry
            ctx.font = '11px monospace';
            ctx.fillStyle = '#e2e8f0';
            ctx.textAlign = 'left';
            ctx.fillText(trade.entry.toFixed(3), padX + 70, rowMid);

            // SL
            ctx.fillStyle = '#f43f5e';
            ctx.fillText(trade.stopLoss > 0 ? trade.stopLoss.toFixed(3) : '--', padX + 165, rowMid);

            // TP
            ctx.fillStyle = '#10b981';
            ctx.fillText(trade.takeProfit1 > 0 ? trade.takeProfit1.toFixed(3) : '--', padX + 250, rowMid);

            // Size
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(trade.size?.toLocaleString() || '--', padX + 335, rowMid);

            // Pips
            if (trade.status === 'OPEN' && midPrice) {
                ctx.font = 'bold 11px monospace';
                ctx.fillStyle = isProfit ? '#10b981' : '#f43f5e';
                ctx.textAlign = 'center';
                ctx.fillText(`${isProfit ? '+' : ''}${pips.toFixed(1)}`, padX + 420, rowMid);

                // P/L USD
                ctx.textAlign = 'right';
                ctx.fillText(`$${isProfit ? '+' : ''}${profitUsd.toFixed(2)}`, W - padX, rowMid);
            } else {
                ctx.font = '10px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#475569';
                ctx.textAlign = 'center';
                ctx.fillText(trade.status || '--', padX + 420, rowMid);
                ctx.textAlign = 'right';
                ctx.fillText('--', W - padX, rowMid);
            }
        });

        // --- FOOTER ---
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
        ctx.fillText('Algo-Traded  \u00b7  phantomnode.io', W - padX, footerY + footerH / 2);

        // Copy / Download
        comp.toBlob(async (blob) => {
            if (!blob) return;
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                setCopiedTrades(true);
                setTimeout(() => setCopiedTrades(false), 2000);
            } catch {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `execution_log_${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(url);
                setCopiedTrades(true);
                setTimeout(() => setCopiedTrades(false), 2000);
            }
        }, 'image/png');
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    // Update countdowns every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdownTick(prev => prev + 1);
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, []);


    // Fetch account info
    useEffect(() => {
        const fetchAccount = async () => {
            try {
                const res = await fetch('/api/account');
                if (res.ok) {
                    const data = await res.json();
                    setAccountInfo(data);
                }
            } catch (err) {
                console.error('Failed to fetch account:', err);
            }
        };
        fetchAccount();
        fetchAccount();
        const interval = setInterval(fetchAccount, 2000);  // Sync with chart - every 2 seconds
        return () => clearInterval(interval);
    }, []);

    // Fetch real trade history from OANDA
    useEffect(() => {
        const fetchTrades = async () => {
            try {
                const res = await fetch('/api/orders/history');
                if (res.ok) {
                    const data = await res.json();
                    setTradeHistory(data.trades || []);
                }
            } catch (err) {
                console.error('Failed to fetch trades:', err);
            }
        };
        fetchTrades();
        fetchTrades();
        const interval = setInterval(fetchTrades, 2000);  // Sync with chart - every 2 seconds
        return () => clearInterval(interval);
    }, []);

    const fetchTrades = async () => {
        try {
            const res = await fetch('/api/orders/history');
            if (res.ok) {
                const data = await res.json();
                setTradeHistory(data.trades || []);
            }
        } catch (err) {
            console.error('Failed to fetch trades:', err);
        }
    };

    // Algo trader status (runs with npm run dev via concurrently)
    useEffect(() => {
        const fetchAlgoStatus = async () => {
            try {
                const res = await fetch('/api/algo/status');
                if (res.ok) {
                    const data = await res.json();
                    setAlgoStatus(data);
                    if (data.lastSignal) {
                        setActiveSignal({
                            action: data.lastSignal.action,
                            entry: data.lastSignal.entry,
                            stopLoss: data.lastSignal.stopLoss,
                            takeProfit1: data.lastSignal.takeProfit1,
                            takeProfit2: data.lastSignal.takeProfit2 ?? data.lastSignal.takeProfit1,
                            timestamp: data.lastSignal.timestamp,
                            reason: data.lastSignal.reason,
                        });
                    } else {
                        setActiveSignal(null);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch algo status:', err);
            }
        };
        fetchAlgoStatus();
        const interval = setInterval(fetchAlgoStatus, 2000);  // Sync with chart - every 2 seconds
        return () => clearInterval(interval);
    }, []);

    // Fetch account audit stats for total P/L calculation
    useEffect(() => {
        const fetchAudit = async () => {
            try {
                const res = await fetch('/api/account/audit');
                if (res.ok) {
                    const data = await res.json();
                    setAuditStats(data.stats);
                }
            } catch (err) {
                console.error('Failed to fetch audit:', err);
            }
        };
        fetchAudit();
        fetchAudit();
        const interval = setInterval(fetchAudit, 2000);  // Sync with chart - every 2 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const loadNews = async () => {
            try {
                const today = new Date();
                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 7);

                const fromStr = today.toISOString().split('T')[0];
                const toStr = nextWeek.toISOString().split('T')[0];

                const events = await fetchEconomicCalendar(fromStr, toStr);
                const relevant = filterHighImpactUsdJpyEvents(events).slice(0, 5); // Top 5

                const formatted = relevant.map(e => ({
                    title: e.event,
                    detail: e.usdJpyImpact || `Actual: ${e.actual || '--'} vs Previous: ${e.previousValue || e.estimate || '--'}`,
                    impact: e.impact,
                    timestamp: e.date.split(' ')[1]?.slice(0, 5) + ' UTC',
                    fullDate: e.date, // Keep full date for countdown calculation
                    sentiment: e.usdJpyImpact?.includes('Bullish') ? e.currency + ' Bullish' :
                        e.usdJpyImpact?.includes('Bearish') ? e.currency + ' Bearish' : 'Neutral',
                    actual: e.actual,
                    previous: e.previousValue || e.estimate,
                    change: e.change,
                    trend: e.trend,
                    daysUntil: e.daysUntil,
                    currency: e.currency
                }));

                // Sort events by countdown time (next event first)
                const sortedEvents = formatted.sort((a, b) => {
                    const dateA = new Date(a.fullDate);
                    const dateB = new Date(b.fullDate);
                    return dateA.getTime() - dateB.getTime();
                });

                setNewsEvents(sortedEvents);
                setNewsError(null);
            } catch (err: any) {
                if (err.message === 'INVALID_API_KEY') {
                    setNewsError('API Key Required');
                } else {
                    setNewsError('Failed to load news');
                }
            }
        };

        loadNews();
    }, []);

    useEffect(() => {
        const updateHour = () => setUtcHour(new Date().getUTCHours());
        const interval = setInterval(updateHour, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const [marketTick, setMarketTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setMarketTick((n) => n + 1), 30_000);
        return () => clearInterval(t);
    }, []);
    const marketStatus = useMemo(() => getMarketStatus(new Date()), [marketTick]);

    useEffect(() => {
        let isMounted = true;

        const fetchSuitePrices = async () => {
            try {
                const results = await Promise.all(
                    KEY_INSTRUMENTS.map(async (instrument) => {
                        const price = await oandaAPI.getCurrentPrice(instrument);
                        return { instrument, price };
                    })
                );

                if (!isMounted) return;

                const nextMap = results.reduce((acc, { instrument, price }) => {
                    acc[instrument] = price;
                    return acc;
                }, {} as Record<string, OandaPrice>);

                const nextMid = getMidPrice(nextMap[PRIMARY_INSTRUMENT]);
                if (nextMid !== null) {
                    if (usdJpyPrevRef.current !== null) {
                        setUsdJpyDelta(nextMid - usdJpyPrevRef.current);
                    }
                    usdJpyPrevRef.current = nextMid;
                }

                setPriceMap(nextMap);
            } catch (error) {
                console.error('Error fetching USD/JPY complex prices:', error);
            } finally {
                if (isMounted) {
                    setIsPriceLoading(false);
                }
            }
        };

        fetchSuitePrices();
        const interval = setInterval(fetchSuitePrices, 2000);  // Sync with chart - every 2 seconds

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);



    const usdJpyPrice = priceMap[PRIMARY_INSTRUMENT];
    const midPrice = getMidPrice(usdJpyPrice);
    const spread = getSpread(usdJpyPrice);
    const deltaSign = usdJpyDelta && usdJpyDelta >= 0 ? '+' : '-';
    const formattedDelta = usdJpyDelta !== null ? `${deltaSign}${Math.abs(usdJpyDelta).toFixed(3)}` : '--';

    const sessionIntel = useMemo(
        () =>
            SESSION_WINDOWS.map((session) => ({
                ...session,
                isActive: isHourWithin(utcHour, session.range),
            })),
        [utcHour]
    );

    const correlationBlocks = useMemo(
        () =>
            SECONDARY_INSTRUMENTS.map((asset) => {
                const price = priceMap[asset.instrument];
                const mid = getMidPrice(price);
                const spreadValue = getSpread(price);
                return {
                    ...asset,
                    price: mid,
                    spread: spreadValue,
                };
            }),
        [priceMap]
    );

    return (
        <div className="min-h-screen bg-[#030712] text-white">
            {/* Top notification bar: Market + Algo status */}
            <div className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-sm px-4 py-2 sm:px-6 lg:px-10 flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:justify-start">
                    <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                        <div className={`h-2 w-2 rounded-full ${mounted && marketStatus.open ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Market</span>
                        <span className={`text-[10px] font-semibold ${mounted && marketStatus.open ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {mounted ? (marketStatus.open ? 'Open' : 'Closed') : '---'}
                        </span>
                        <span className="text-[9px] text-gray-500">
                            {mounted && (
                                <>
                                    {marketStatus.message}
                                    {marketStatus.countdownMs > 0 && (
                                        <span className="ml-1 text-gray-400">· {formatCountdown(marketStatus.countdownMs)}</span>
                                    )}
                                </>
                            )}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${algoStatus.running ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Algo Trader</span>
                        <span className={`text-[10px] ${algoStatus.running ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {algoStatus.running ? 'Running' : 'Idle'}
                        </span>
                    </div>
                    {algoStatus.lastScan && (
                        <span className="text-[9px] text-gray-500">
                            Scan: {new Date(algoStatus.lastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {auditStats && (
                        <span className={`text-[10px] font-medium ${(parseFloat(auditStats.totalPl) + (accountInfo?.unrealizedPL || 0)) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            Total Session: {(parseFloat(auditStats.totalPl) + (accountInfo?.unrealizedPL || 0)) >= 0 ? '+' : ''}{(parseFloat(auditStats.totalPl) + (accountInfo?.unrealizedPL || 0)).toFixed(2)} USD ({auditStats.totalPips} pips)
                        </span>
                    )}
                </div>

                {/* Manual Trade Actions - Top Bar far right */}
                <div className="flex items-center gap-2">
                    <Link
                        href="/backtest"
                        className="hidden md:flex items-center gap-1.5 text-gray-400 hover:text-emerald-400 transition-colors"
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider">Backtest</span>
                    </Link>
                    <button
                        onClick={() => setIsOpsModalOpen(true)}
                        className="hidden md:flex items-center gap-1.5 text-gray-400 hover:text-blue-400 transition-colors"
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider">Ops</span>
                    </button>
                    <button
                        onClick={() => setIsAuditModalOpen(true)}
                        className="hidden md:flex items-center gap-1.5 text-gray-400 hover:text-amber-400 transition-colors"
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider">Audit</span>
                    </button>
                </div>
            </div>

            <div className="relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#020617] via-[#030712] to-black">
                <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
                    <div className="absolute -top-32 right-10 h-64 w-64 rounded-full bg-[#60a5fa]/30 blur-[120px]" />
                    <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-[#22d3ee]/20 blur-[140px]" />
                </div>
                <header className="relative px-6 py-4 lg:px-10">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4rem] text-emerald-300">Live Intelligence Stack</p>
                            <div className="flex items-center gap-4">
                                <div>
                                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                                        PHANTOM NODE
                                    </h1>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">USD/JPY · Command</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-2xl backdrop-blur min-w-[240px]">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] uppercase tracking-[0.3rem] text-gray-400">Realtime print</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">
                                        LIVE • SYNC ACTIVE
                                    </span>
                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                            </div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-3xl font-semibold leading-none text-white">
                                        {midPrice ? midPrice.toFixed(3) : '--'}
                                    </div>
                                    <p className={`mt-1.5 text-[10px] ${usdJpyDelta && usdJpyDelta >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                                        {formattedDelta} (vs last tick)
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] text-gray-300">
                                        Bal: <span className="font-semibold">${accountInfo?.balance?.toLocaleString() || '5,000'}</span>
                                    </p>
                                    <p className={`text-[9px] font-bold ${(parseFloat(auditStats?.totalPl || '0') + (accountInfo?.unrealizedPL || 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        Total P/L: ${(parseFloat(auditStats?.totalPl || '0') + (accountInfo?.unrealizedPL || 0)).toFixed(2)}
                                    </p>
                                    <p className="text-[8px] text-gray-500 mt-0.5">Spread: {spread ? `${spread.toFixed(3)} pips` : '--'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Global Command Ticker: Liquidity Pools (Horizontal) */}
                <div className="px-6 pb-4 lg:px-10">
                    <div className="flex items-center gap-6 py-1.5 border-y border-white/5 overflow-x-auto scrollbar-hide">
                        <span className="text-[8px] font-black uppercase tracking-[0.4rem] text-gray-500 shrink-0 pr-4 border-r border-white/10 leading-none">Liquidity Cycle</span>
                        <div className="flex items-center gap-8">
                            {sessionIntel.map((session) => (
                                <div key={session.label} className="flex items-center gap-2.5 shrink-0">
                                    <div className={`h-1 w-1 rounded-full ${session.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-white/10'}`} />
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${session.isActive ? 'text-white' : 'text-gray-600'}`}>
                                            {session.label}
                                        </span>
                                        {session.isActive && (
                                            <span className="text-[9px] text-gray-400 font-medium uppercase tracking-tight opacity-80">
                                                — {session.focus}
                                            </span>
                                        )}
                                        {!session.isActive && (
                                            <span className="text-[8px] text-gray-700 uppercase font-bold tracking-tighter">Inactive</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <main className="px-6 py-4 lg:px-10 space-y-3">
                {/* Commodity Pulse - Global Ticker */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {correlationBlocks.map((asset) => (
                        <div
                            key={asset.instrument}
                            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur"
                        >
                            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${asset.accent} opacity-30`} aria-hidden />
                            <div className="relative flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs uppercase tracking-[0.3rem] text-gray-400">{asset.label}</p>
                                        {isPriceLoading && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />}
                                    </div>
                                    <p className="mt-0.5 text-xl font-bold text-white tracking-tight">
                                        {asset.price ? asset.price.toFixed(2) : '--'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">{asset.driver}</p>
                                    <p className="mt-1 text-xs font-medium text-emerald-300/80">
                                        Spread: {asset.spread ? asset.spread.toFixed(3) : '--'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                    {/* Row 1: The Core (Price + Macro Execution) */}
                    {/* Market Structure / Chart */}
                    <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur flex flex-col h-[400px]">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between h-10 mb-2 shrink-0">
                            <div>
                                <p className="text-[9px] uppercase tracking-[0.4rem] text-gray-400 font-bold">Market Structure</p>
                                <h2 className="text-lg font-semibold text-white">USD/JPY • {timeframe}</h2>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {TIMEFRAMES.map((tf) => (
                                    <button
                                        key={tf.label}
                                        onClick={() => setTimeframe(tf.label)}
                                        className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold transition ${timeframe === tf.label
                                            ? 'bg-white text-black'
                                            : 'border border-white/20 text-gray-300 hover:border-white/40'
                                            }`}
                                    >
                                        {tf.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 w-full rounded-xl border border-white/5 bg-black/30 p-1.5 overflow-hidden">
                            <TradingChart instrument={PRIMARY_INSTRUMENT} granularity={selectedGranularity} signal={activeSignal} tradeHistory={tradeHistory} currentPrice={midPrice} />
                        </div>
                    </div>

                    {/* EXECUTION PORTAL: Macro Consensus Checklist */}
                    <div className="h-[400px]">
                        <MacroConsensusPanel />
                    </div>

                    {/* INTELLIGENCE TAPE: Tiered Indicators */}
                    <div className="h-[400px]">
                        <MacroIndicatorFeed />
                    </div>

                    {/* Trade History */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur flex flex-col h-[400px] overflow-hidden transition-all duration-500 hover:border-white/20">
                        <div className="flex items-center justify-between mb-4 shrink-0 px-1">
                            <div>
                                <p className="text-[8px] uppercase tracking-[0.4rem] text-gray-400 font-black">Trade History</p>
                                <h3 className="text-sm font-bold text-white uppercase tracking-tight">Execution Log</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    id="copy-trades-btn"
                                    onClick={copyTradeHistoryToClipboard}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${copiedTrades
                                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                            : 'bg-black/40 border border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                        }`}
                                >
                                    {copiedTrades ? (
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
                                <div className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">
                                    LIVE
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <div className="space-y-1.5 pb-2">
                                {tradeHistory.length > 0 ? (
                                    tradeHistory.map((trade) => {
                                        const isBuy = trade.action === 'BUY';
                                        const pips = midPrice ? (isBuy ? midPrice - trade.entry : trade.entry - midPrice) * 100 : 0;
                                        const isProfit = pips >= 0;
                                        const profitUsd = pips * (trade.size / 1000) * 0.065;

                                        return (
                                            <div
                                                key={trade.timestamp}
                                                className="relative rounded-lg border border-white/5 px-2.5 py-1.5 bg-black/20 hover:bg-white/5 transition-all group cursor-pointer hover:border-l-2 hover:border-l-emerald-400"
                                                onClick={() => {
                                                    setSelectedExecutionTrade(trade);
                                                    setIsCondensedModalOpen(true);
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded leading-none ${isBuy ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                                                                {trade.action}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-white tracking-widest">{trade.entry.toFixed(3)}</span>
                                                        </div>
                                                        {trade.status === 'OPEN' && (trade.stopLoss > 0 || trade.takeProfit1 > 0) && (
                                                            <div className="flex items-center gap-3 mt-1.5 pl-1">
                                                                {trade.stopLoss > 0 && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="w-1 h-1 rounded-full bg-rose-500/60 shadow-[0_0_5px_rgba(244,63,94,0.4)]" />
                                                                        <span className="text-[7px] font-black text-rose-400/50 uppercase tracking-tighter">LMT {trade.stopLoss.toFixed(3)}</span>
                                                                    </div>
                                                                )}
                                                                {trade.takeProfit1 > 0 && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="w-1 h-1 rounded-full bg-emerald-500/60 shadow-[0_0_5px_rgba(52,211,153,0.4)]" />
                                                                        <span className="text-[7px] font-black text-emerald-400/50 uppercase tracking-tighter">TGT {trade.takeProfit1.toFixed(3)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 ml-auto">
                                                        {trade.status === 'OPEN' && (
                                                            <>
                                                                <span className={`text-[9px] font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    {isProfit ? '+' : ''}{pips.toFixed(1)}
                                                                </span>
                                                                <span className={`text-[9px] font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    ${isProfit ? '+' : ''}{profitUsd.toFixed(2)}
                                                                </span>
                                                            </>
                                                        )}
                                                        <span className="text-[8px] text-gray-700 font-mono">
                                                            {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                                        <div className="text-[8px] uppercase tracking-[0.3em] animate-pulse">Scanning Archive...</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* News Events */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur flex flex-col h-[400px] overflow-hidden transition-all duration-500 hover:border-white/20">
                        <div className="flex items-center justify-between mb-4 shrink-0 px-1">
                            <div>
                                <p className="text-[8px] uppercase tracking-[0.4rem] text-gray-400 font-black">Event Tape</p>
                                <h3 className="text-sm font-bold text-white uppercase tracking-tight">Economic Data</h3>
                            </div>
                            <div className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">
                                USD/JPY
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {newsError ? (
                                <div className="text-red-400 p-2 border border-red-500/30 rounded-lg bg-red-900/20 text-[9px]">
                                    {newsError}
                                </div>
                            ) : newsEvents.length > 0 ? (
                                <div className="space-y-2">
                                    {newsEvents.map((item) => {
                                        const { countdown, isPast } = formatEventCountdown(item.fullDate);
                                        return (
                                            <div key={item.title} className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                                    <span className="rounded-full border border-white/20 px-1.5 py-0.5 text-[8px] text-gray-400 uppercase tracking-widest leading-none">
                                                        {item.impact}
                                                    </span>
                                                    <span className="text-[8px] text-gray-500 uppercase">{item.timestamp}</span>
                                                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest leading-none ${isPast
                                                        ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                                                        }`}>
                                                        {countdown}
                                                    </span>
                                                </div>
                                                <h4 className="text-[10px] font-bold text-white mb-1.5 uppercase tracking-tighter leading-tight">{item.title}</h4>
                                                <p className="text-[9px] text-gray-500 leading-tight">{item.detail}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-gray-500 text-[9px] uppercase tracking-widest animate-pulse p-4 text-center">Loading Events...</div>
                            )}
                        </div>
                    </div>
                </div>
            </main>


            <AccountAuditModal
                isOpen={isAuditModalOpen}
                onClose={() => setIsAuditModalOpen(false)}
            />

            <AlgoOpsCenter
                isOpen={isOpsModalOpen}
                onClose={() => setIsOpsModalOpen(false)}
            />

            <CondensedTradeDetailModal
                isOpen={isCondensedModalOpen}
                onClose={() => {
                    setIsCondensedModalOpen(false);
                    setSelectedExecutionTrade(null);
                }}
                trade={selectedExecutionTrade}
            />
        </div>
    );
}
