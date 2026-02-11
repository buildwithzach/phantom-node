import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY || '';
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID || '';
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

const OANDA_BASE_URL = OANDA_ENVIRONMENT === 'live'
    ? 'https://api-fxtrade.oanda.com/v3'
    : 'https://api-fxpractice.oanda.com/v3';

interface SocialContentPost {
    id: string;
    category: 'performance' | 'macro' | 'educational' | 'market';
    content: string;
    hashtags: string[];
    characterCount: number;
    timestamp: number;
    data: any; // Source data for the post
}

interface MacroBiasData {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    yield_signal: string;
    risk_signal: string;
    boj_volatility: boolean;
    key_factors: string[];
    last_tweet_time: string;
}

interface AlgoStatus {
    running: boolean;
    lastScan: string;
    lastSignal?: any;
    dailyPnl: number;
    telemetry: {
        price: number;
        long_score: number;
        short_score: number;
        factors: string[];
        reason: string;
        atr: number;
        debug: any;
    };
}

function generatePerformancePosts(stats: any, history: any[]): SocialContentPost[] {
    const posts: SocialContentPost[] = [];

    if (!stats || !history || history.length === 0) return posts;

    const winRate = parseFloat(stats.winRate || '0');
    const totalPl = parseFloat(stats.totalPl || '0');
    const totalPips = parseFloat(stats.totalPips || '0');
    const profitFactor = parseFloat(stats.profitFactor || '0');
    const wins = parseInt(stats.wins || '0');
    const losses = parseInt(stats.losses || '0');

    // Calculate additional metrics
    const avgWin = wins > 0 ? totalPl / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(history.filter(t => t.pl < 0).reduce((sum, t) => sum + t.pl, 0) / losses) : 0;
    const largestWin = Math.max(...history.map(t => t.pl));
    const largestLoss = Math.min(...history.map(t => t.pl));
    const recentTrades = history.slice(0, 5);
    const recentWinRate = recentTrades.filter(t => t.pl > 0).length / recentTrades.length * 100;

    // Performance summary with real data
    posts.push({
        id: 'performance-summary',
        category: 'performance',
        content: `Trading Performance: ${wins}W/${losses}L (${winRate}% win rate). Net P&L: $${totalPl.toFixed(2)} (${totalPips > 0 ? '+' : ''}${totalPips.toFixed(0)} pips). Risk management: ${profitFactor.toFixed(2)} profit factor. #TradingStats`,
        hashtags: ['#TradingStats'],
        characterCount: 0,
        timestamp: Date.now(),
        data: { winRate, totalPl, totalPips, wins, losses, profitFactor }
    });

    // Recent performance focus
    if (recentTrades.length >= 3) {
        const recentPl = recentTrades.reduce((sum, t) => sum + t.pl, 0);
        posts.push({
            id: 'recent-performance',
            category: 'performance',
            content: `Last 5 trades: ${recentWinRate.toFixed(0)}% win rate, $${recentPl.toFixed(2)} P&L. ${recentPl > 0 ? 'Momentum building' : 'Need to refocus strategy'}. #DayTrading #Forex`,
            hashtags: ['#DayTrading', '#Forex'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { recentWinRate, recentPl }
        });
    }

    // Best trade analysis
    const bestTrade = history
        .filter(t => t.pl > 0)
        .sort((a, b) => b.pl - a.pl)[0];

    if (bestTrade) {
        const holdTime = bestTrade.duration ? `${Math.floor(bestTrade.duration / 60)}min` : 'intraday';
        posts.push({
            id: 'best-trade-analysis',
            category: 'performance',
            content: `Best trade: ${bestTrade.instrument} ${bestTrade.positionDirection} +$${bestTrade.pl.toFixed(2)} (+${bestTrade.pips.toFixed(1)} pips). ${holdTime} hold. Technical setup paid off. #TradingWins`,
            hashtags: ['#TradingWins'],
            characterCount: 0,
            timestamp: Date.now(),
            data: bestTrade
        });
    }

    // Risk/reward analysis
    if (avgWin > 0 && avgLoss > 0) {
        const rrRatio = avgWin / avgLoss;
        posts.push({
            id: 'risk-reward-analysis',
            category: 'educational',
            content: `Risk Management: Avg win $${avgWin.toFixed(2)} vs avg loss $${avgLoss.toFixed(2)}. R:R ratio 1:${rrRatio.toFixed(2)}. ${rrRatio >= 2 ? 'Solid risk management' : 'Need better exits'}. #RiskManagement`,
            hashtags: ['#RiskManagement'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { avgWin, avgLoss, rrRatio }
        });
    }

    // Trading frequency analysis
    const today = new Date();
    const todayTrades = history.filter(t => {
        const tradeDate = new Date(t.time);
        return tradeDate.toDateString() === today.toDateString();
    });

    if (todayTrades.length > 0) {
        const todayPl = todayTrades.reduce((sum, t) => sum + t.pl, 0);
        posts.push({
            id: 'daily-performance',
            category: 'performance',
            content: `Today: ${todayTrades.length} trades, $${todayPl.toFixed(2)} P&L. ${todayPl > 0 ? 'Profitable session' : 'Learning day'}. Consistency is key. #IntradayTrading`,
            hashtags: ['#IntradayTrading'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { trades: todayTrades.length, pl: todayPl }
        });
    }

    // Instrument performance
    const instrumentPerformance = history.reduce((acc, trade) => {
        if (!acc[trade.instrument]) {
            acc[trade.instrument] = { pl: 0, count: 0, wins: 0 };
        }
        acc[trade.instrument].pl += trade.pl;
        acc[trade.instrument].count += 1;
        if (trade.pl > 0) acc[trade.instrument].wins += 1;
        return acc;
    }, {} as Record<string, { pl: number; count: number; wins: number }>);

    const sortedInstruments = Object.entries(instrumentPerformance)
        .sort(([, a], [, b]) => (b as any).pl - (a as any).pl);

    if (sortedInstruments.length > 0) {
        const [instrument, perf] = sortedInstruments[0];
        const perfData = perf as any;
        const instrumentWinRate = (perfData.wins / perfData.count * 100).toFixed(0);
        posts.push({
            id: 'instrument-performance',
            category: 'performance',
            content: `${instrument} Focus: Algo identified high-probability edge. $${perfData.pl.toFixed(2)} Net PnL (${instrumentWinRate}% WR) across ${perfData.count} executions. Optimization paying off. #QuantTrading #Forex`,
            hashtags: ['#QuantTrading', '#Forex'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { instrument, pl: perfData.pl, count: perfData.count, wins: perfData.wins }
        });
    }

    return posts.map(post => ({
        ...post,
        characterCount: post.content.length
    }));
}

function generateMacroPosts(macroData: MacroBiasData | null): SocialContentPost[] {
    const posts: SocialContentPost[] = [];

    if (!macroData) return posts;

    const { bias, confidence, key_factors } = macroData;

    // Bias announcement
    posts.push({
        id: 'macro-bias',
        category: 'macro',
        content: `MACRO DEEP-DIVE: USD/JPY directional bias is ${bias} (${confidence} confidence). Rate differentials + high-beta risk sentiment driving the tape. #MacroConf #USDJPY`,
        hashtags: ['#MacroConf', '#USDJPY'],
        characterCount: 0,
        timestamp: Date.now(),
        data: macroData
    });

    // Yield analysis
    if (macroData.yield_signal) {
        posts.push({
            id: 'yield-analysis',
            category: 'macro',
            content: `Treasury Outlook: ${macroData.yield_signal} yield signal confirmed. Market pricing in terminal rate shifts. US 10Y continues to dictate USDJPY velocity. #Fed #Treasuries`,
            hashtags: ['#Fed', '#Treasuries'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { yield_signal: macroData.yield_signal }
        });
    }

    // Risk sentiment
    if (macroData.risk_signal) {
        posts.push({
            id: 'risk-sentiment',
            category: 'market',
            content: `Sentiment Pulse: ${macroData.risk_signal}. Equities vs Bonds battle continues. Quantitative liquidity filters showing ${macroData.risk_signal === 'bearish' ? 'risk-off deleveraging' : 'risk-on expansion'}. #MarketSentiment #VIX`,
            hashtags: ['#MarketSentiment', '#VIX'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { risk_signal: macroData.risk_signal }
        });
    }

    return posts.map(post => ({
        ...post,
        characterCount: post.content.length
    }));
}

function generateAlgoTelemetryPosts(status: AlgoStatus | null): SocialContentPost[] {
    const posts: SocialContentPost[] = [];
    if (!status || !status.telemetry) return posts;

    const { telemetry } = status;
    const { long_score, short_score, debug, factors } = telemetry;

    posts.push({
        id: 'algo-telemetry',
        category: 'market',
        content: `QUANT SCAN: USD/JPY Live Stats
- Long Score: ${long_score.toFixed(1)}
- Short Score: ${short_score.toFixed(1)}
- ADX Strength: ${debug?.adx?.toFixed(1) || 'N/A'}
- RSI: ${debug?.h1_rsi?.toFixed(1) || 'N/A'}

Engine currently ${status.lastSignal ? 'deploying capital' : 'waiting for confluence'}. #AlgoTrading #USDJPY`,
        hashtags: ['#AlgoTrading', '#USDJPY'],
        characterCount: 0,
        timestamp: Date.now(),
        data: telemetry
    });

    if (factors && factors.length > 0) {
        posts.push({
            id: 'confluence-factors',
            category: 'educational',
            content: `Confluence Check: Algo is tracking ${factors.length} signals. ${factors.slice(0, 3).join(', ')} leading the conviction. Quality > Quantity. #QuantSignals #TradingProcess`,
            hashtags: ['#QuantSignals', '#TradingProcess'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { factors }
        });
    }

    return posts;
}

function generateWeeklySummary(stats: any, history: any[]): SocialContentPost[] {
    const posts: SocialContentPost[] = [];
    if (!stats || history.length === 0) return posts;

    const winRate = stats.winRate;
    const totalPl = stats.totalPl;
    const wins = stats.wins;
    const losses = stats.losses;
    const profitFactor = stats.profitFactor;

    posts.push({
        id: 'weekly-thread',
        category: 'performance',
        content: `WEEKLY ALGO SUMMARY (Feb 2026)

Total Trades: ${history.length}
Net PnL: $${totalPl}
Win Rate: ${winRate}% (${wins}W/${losses}L)
Profit Factor: ${profitFactor}

The V10 PhantomNode engine handled the recent volatility with strict risk gating. Stay disciplined. #ForexResults #TradingThread`,
        hashtags: ['#ForexResults', '#TradingThread'],
        characterCount: 0,
        timestamp: Date.now(),
        data: { stats }
    });

    return posts;
}

function generateEducationalPosts(history: any[]): SocialContentPost[] {
    const posts: SocialContentPost[] = [];

    if (history.length === 0) return posts;

    // Trading pattern analysis
    const winningTrades = history.filter(t => t.pl > 0);
    const losingTrades = history.filter(t => t.pl < 0);

    if (winningTrades.length >= 3) {
        const avgWinPips = winningTrades.reduce((sum, t) => sum + t.pips, 0) / winningTrades.length;
        const longWins = winningTrades.filter(t => t.positionDirection === 'LONG').length;
        const shortWins = winningTrades.filter(t => t.positionDirection === 'SHORT').length;

        posts.push({
            id: 'alpha-patterns',
            category: 'educational',
            content: `ALPHA METRIC: Execution Edge
- Avg Win: +${avgWinPips.toFixed(1)} pips
- Long Bias Strength: ${longWins > shortWins ? 'Outperforming' : 'Lagging'}
- Win Rate Skew: ${((longWins / winningTrades.length) * 100).toFixed(0)}% Bullish

Quant systems don't predict, they manage probability density. #AlphaMetrics #TradingEdge`,
            hashtags: ['#AlphaMetrics', '#TradingEdge'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { avgWinPips, longWins, shortWins }
        });
    }

    // Risk Architecture
    if (losingTrades.length >= 2) {
        const avgLossPips = Math.abs(losingTrades.reduce((sum, t) => sum + t.pips, 0) / losingTrades.length);

        posts.push({
            id: 'risk-architecture',
            category: 'educational',
            content: `RISK ARCHITECTURE: Defensive Mode
- Avg Drawdown: ${avgLossPips.toFixed(1)} pips
- Recovery Parameter: ${(avgLossPips * 1.5).toFixed(1)} pips needed for 1.5R

The secret to a 10-year career is surviving the first one. Protect the downside, the upside takes care of itself. #RiskManagement #WealthShield`,
            hashtags: ['#RiskManagement', '#WealthShield'],
            characterCount: 0,
            timestamp: Date.now(),
            data: { avgLossPips, totalLosses: losingTrades.length }
        });
    }

    return posts.map(post => ({
        ...post,
        characterCount: post.content.length
    }));
}

async function loadMacroBiasData(): Promise<MacroBiasData | null> {
    try {
        const macroPath = path.join(process.cwd(), 'python_algo', 'macro_tweet_state.json');
        if (fs.existsSync(macroPath)) {
            const data = fs.readFileSync(macroPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load macro bias data:', error);
    }
    return null;
}

async function loadAlgoStatus(): Promise<AlgoStatus | null> {
    try {
        const statusPath = path.join(process.cwd(), '.algo-status.json');
        if (fs.existsSync(statusPath)) {
            const data = fs.readFileSync(statusPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load algo status:', error);
    }
    return null;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');

        // Fetch trade data (reuse audit logic)
        let trades: any[] = [];
        let stats = null;

        // Get the most recent transaction ID
        const summaryRes = await fetch(`${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/summary`, {
            headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` }
        });

        if (summaryRes.ok) {
            const summaryData = await summaryRes.json();
            const lastTransactionID = parseInt(summaryData.lastTransactionID);

            // Fetch transactions
            let transactionsRes;

            if (fromDate && toDate) {
                const from = new Date(fromDate).toISOString();
                const to = new Date(toDate).toISOString();
                let allTransactions: any[] = [];
                let pageId: string | null = null;

                do {
                    let url = `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/transactions?from=${from}&to=${to}&type=ORDER_FILL`;
                    if (pageId) {
                        url += `&pageId=${pageId}`;
                    }

                    transactionsRes = await fetch(url, { headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` } });

                    if (transactionsRes.ok) {
                        const pageData = await transactionsRes.json();
                        allTransactions = allTransactions.concat(pageData.transactions || []);
                        pageId = pageData.pages?.next || null;
                    }
                } while (pageId);

                transactionsRes = {
                    ok: true,
                    json: async () => ({ transactions: allTransactions })
                } as Response;
            } else {
                const fromID = Math.max(1, lastTransactionID - 500);
                transactionsRes = await fetch(
                    `${OANDA_BASE_URL}/accounts/${OANDA_ACCOUNT_ID}/transactions/idrange?from=${fromID}&to=${lastTransactionID}`,
                    { headers: { 'Authorization': `Bearer ${OANDA_API_KEY}` } }
                );
            }

            if (transactionsRes.ok) {
                const transactionsData = await transactionsRes.json();
                const transactions = transactionsData.transactions || [];

                // Process trades with proper pip calculation
                trades = transactions
                    .filter((t: any) => t.type === 'ORDER_FILL' && parseFloat(t.pl || '0') !== 0)
                    .map((t: any) => {
                        const pl = parseFloat(t.pl || '0');
                        const quotePl = parseFloat(t.quotePL || '0');
                        const units = parseFloat(t.units || '1');
                        const isJpy = t.instrument?.endsWith('_JPY');
                        const pipSize = isJpy ? 0.01 : 0.0001;
                        const pips = quotePl !== 0 ? (Math.abs(quotePl) / Math.abs(units)) / pipSize * (pl >= 0 ? 1 : -1) : 0;

                        return {
                            id: t.id,
                            time: t.time,
                            pl: pl,
                            pips: pips,
                            instrument: t.instrument,
                            units: t.units,
                            price: t.price,
                            reason: t.reason,
                            positionDirection: parseFloat(t.units || '0') > 0 ? 'LONG' : 'SHORT',
                            duration: Math.floor(Math.random() * 240) + 15 // Mock duration for now
                        };
                    });

                // Calculate proper stats
                const wins = trades.filter(t => t.pl > 0).length;
                const losses = trades.filter(t => t.pl < 0).length;
                const totalPl = trades.reduce((sum, t) => sum + t.pl, 0);
                const totalPips = trades.reduce((sum, t) => sum + t.pips, 0);
                const winRate = trades.length > 0 ? (wins / trades.length * 100) : 0;
                const totalWinAmount = trades.filter(t => t.pl > 0).reduce((sum, t) => sum + t.pl, 0);
                const totalLossAmount = Math.abs(trades.filter(t => t.pl < 0).reduce((sum, t) => sum + t.pl, 0));
                const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0;

                stats = {
                    totalTrades: trades.length,
                    wins,
                    losses,
                    winRate: winRate.toFixed(1),
                    totalPl: totalPl.toFixed(2),
                    totalPips: totalPips.toFixed(1),
                    avgWin: wins > 0 ? (totalWinAmount / wins).toFixed(2) : '0',
                    avgLoss: losses > 0 ? (totalLossAmount / losses).toFixed(2) : '0',
                    profitFactor: profitFactor.toFixed(2)
                };
            }
        }

        // Load macro bias and algo status
        const macroData = await loadMacroBiasData();
        const algoStatus = await loadAlgoStatus();

        // Generate content
        const performancePosts = generatePerformancePosts(stats, trades);
        const macroPosts = generateMacroPosts(macroData);
        const educationalPosts = generateEducationalPosts(trades);
        const telemetryPosts = generateAlgoTelemetryPosts(algoStatus);
        const weeklySummary = generateWeeklySummary(stats, trades);

        const allPosts = [
            ...weeklySummary,
            ...telemetryPosts,
            ...performancePosts,
            ...macroPosts,
            ...educationalPosts
        ];

        return NextResponse.json({
            success: true,
            posts: allPosts.sort((a, b) => b.timestamp - a.timestamp),
            stats,
            macroData,
            tradesCount: trades.length,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Failed to generate social content:', error);
        return NextResponse.json({
            error: 'Failed to generate social content',
            details: error instanceof Error ? error.message : 'Unknown error',
            posts: [],
            generatedAt: new Date().toISOString()
        }, { status: 500 });
    }
}
