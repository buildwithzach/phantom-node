
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  symbol: string;
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  beHit: boolean;
  atrAtEntry?: number;
  exitReason?: string;
  mfe?: number; // Max Favorable Excursion in R
  trailActivated?: boolean;
  barsSinceTrigger?: number; // Bars since 2.2R trigger hit
}

export interface BacktestResult {
  trades: Trade[];
  totalPnl: number;
  winRate: number;
  maxDrawdown: number;
  equityCurve: { timestamp: number; equity: number }[];
}

export interface EconomicEvent {
  timestamp: number;
  currency: string;
  event: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  actual: number;
  forecast: number;
  previous: number;
}
