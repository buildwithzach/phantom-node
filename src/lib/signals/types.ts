/**
 * Signal Generation System - Type Definitions
 * 
 * Defines the core data structures for USD/JPY signal generation,
 * including signal output schema, confluence factors, and quality grading.
 */

export type SignalAction = 'BUY' | 'SELL';
export type SignalConfidence = 'HIGH' | 'MEDIUM';
export type SignalStatus = 'PENDING' | 'FILLED' | 'MISSED' | 'CANCELLED';
export type SignalGrade = 'A+' | 'A' | 'B';

/**
 * Confluence Factor - Individual confirmation signal
 */
export interface ConfluenceFactor {
    type: 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'LEVEL' | 'MACRO';
    name: string;
    timeframe?: 'H4' | 'H1' | 'M15';
    value: number | string;
    weight: number; // 0.5-2.0, default 1.0
}

/**
 * Trading Signal - Core signal output
 */
export interface TradingSignal {
    id: string;
    timestamp: number;
    pair: 'USD/JPY';
    action: SignalAction;
    confidence: SignalConfidence;
    grade: SignalGrade;

    // Entry/Exit Levels
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;

    // Risk Metrics
    riskReward: number; // Calculated R:R ratio
    size: number; // Recommended position size in units
    riskAmount: number; // USD amount at risk

    // Confluence Data
    confluenceScore: number; // Weighted total (3-6+)
    confluenceFactors: ConfluenceFactor[];

    // Context
    macroBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    atr: number; // ATR value used for calculations
    reason: string; // Human-readable explanation

    // Status Tracking
    status: SignalStatus;
    filledAt?: number;
    exitPrice?: number;
    pnl?: number;
}

/**
 * Signal Generation Config
 */
export interface SignalConfig {
    // Quality Filters
    minConfluenceScore: number; // Default: 3
    minRiskReward: number; // Default: 2.0
    maxDailySignals: number; // Default: 3

    // Macro Integration
    requireMacroAlignment: boolean; // Default: false
    macroWeight: number; // Default: 1.5

    // Risk Management
    accountSize: number;
    riskPerTrade: number; // Default: 0.01 (1%)

    // Timeframe Filters
    enableH4Trend: boolean; // Default: true
    enableH1Momentum: boolean; // Default: true
    enableM15Entry: boolean; // Default: true
}

/**
 * Signal Performance Metrics
 */
export interface SignalPerformance {
    totalSignals: number;
    winRate: number; // 0-100
    averageRR: number;
    averagePnL: number;
    bestSignal: TradingSignal | null;
    worstSignal: TradingSignal | null;
    period: {
        start: number;
        end: number;
    };
}
