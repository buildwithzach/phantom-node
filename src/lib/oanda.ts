import axios from 'axios';

const OANDA_API_KEY = process.env.NEXT_PUBLIC_OANDA_API_KEY || '';
const OANDA_ACCOUNT_ID = process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID || '';
const OANDA_ENVIRONMENT = process.env.NEXT_PUBLIC_OANDA_ENVIRONMENT || 'practice';

export interface OandaCandle {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
  time: string;
  complete: boolean;
}

export interface OandaPrice {
  instrument: string;
  time: string;
  bid: string;
  ask: string;
  status: string;
}

class OandaAPI {
  private apiKey: string;
  private accountId: string;

  constructor() {
    this.apiKey = OANDA_API_KEY;
    this.accountId = OANDA_ACCOUNT_ID;
  }

  async getCandles(instrument: string, granularity: string = 'M1', count: number = 100): Promise<OandaCandle[]> {
    try {
      const response = await fetch(`/api/candles?instrument=${instrument}&granularity=${granularity}&count=${count}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.candles;
    } catch (error) {
      console.error('Error fetching candles:', error);
      throw error;
    }
  }

  async getCurrentPrice(instrument: string): Promise<OandaPrice> {
    try {
      const response = await fetch(`/api/price?instrument=${instrument}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.price;
    } catch (error) {
      console.error('Error fetching current price:', error);
      throw error;
    }
  }

  getWebSocketURL(): string {
    const wsUrl = OANDA_ENVIRONMENT === 'live'
      ? 'wss://stream-fxtrade.oanda.com/v3'
      : 'wss://stream-fxpractice.oanda.com/v3';
    
    return `${wsUrl}/accounts/${this.accountId}/pricing/stream?instruments=EUR_USD,GBP_USD,USD_JPY`;
  }
}

export const oandaAPI = new OandaAPI();
