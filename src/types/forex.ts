export type TimeFrame = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface Candle {
  timestamp: number; // Unix timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EconomicData {
  usdWeak: boolean;
  jpyStrong: boolean;
  lastUpdated: number;
  nextHighImpactEvent?: {
    currency: 'USD' | 'JPY';
    event: string;
    timestamp: number;
    impact: 'High' | 'Medium' | 'Low';
  };
}

export interface StrategyConfig {
  accountSize: number;
  riskPerTrade: number;
  maxSlippage: number;
  maxOpenTrades?: number;
  maxDailyTrades?: number;
  newsFilter?: boolean;
  newsBufferMinutes?: number;
}
export interface EconomicEvent {
  timestamp: number;
  currency: 'USD' | 'JPY' | string;
  event: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  actual?: number;
  forecast?: number;
  previous?: number;
}

export interface TradeSignal {
  id: string;
  timestamp: number;
  type: 'BUY' | 'SELL';
  instrument: string;
  confidence: number;
  strength: number;
  indicators: {
    rsi?: number;
    macd?: number;
    bollinger?: number;
    volume?: number;
  };
  economicContext?: {
    usdWeak: boolean;
    jpyStrong: boolean;
    newsFilterActive: boolean;
    highImpactEvents: EconomicEvent[];
  };
  riskMetrics: {
    riskPerTrade: number;
    positionSize: number;
    stopLoss?: number;
    takeProfit?: number;
  };
}

export interface TradeDetail {
  id: string;
  time: string;
  pl: number;
  pips: number;
  instrument: string;
  units: string;
  price: string;
  reason?: string;
  positionDirection?: string;
  entryPrice?: number;
  exitPrice?: number;
  duration?: number;
  signal?: TradeSignal;
  filteringData?: {
    newsFilter: boolean;
    volatilityFilter: boolean;
    volumeFilter: boolean;
    technicalFilter: boolean;
    riskFilter: boolean;
  };
  execution?: {
    slippage?: number;
    spread?: number;
    executionTime?: number;
  };
}
