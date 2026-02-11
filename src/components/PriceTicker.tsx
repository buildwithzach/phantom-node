'use client';

import { useEffect, useState } from 'react';
import { oandaAPI, OandaPrice } from '@/lib/oanda';

interface PriceTickerProps {
  instruments: string[];
}

export default function PriceTicker({ instruments }: PriceTickerProps) {
  const [prices, setPrices] = useState<Record<string, OandaPrice>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        console.log('Fetching prices...');
        const pricePromises = instruments.map(async (instrument) => {
          const price = await oandaAPI.getCurrentPrice(instrument);
          return { instrument, price };
        });

        const results = await Promise.all(pricePromises);
        const priceMap = results.reduce((acc, { instrument, price }) => {
          acc[instrument] = price;
          return acc;
        }, {} as Record<string, OandaPrice>);

        console.log('Prices fetched:', priceMap);
        setPrices(priceMap);
      } catch (error) {
        console.error('Error fetching prices:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
    
    // Update prices every 2 seconds for faster updates
    const interval = setInterval(fetchPrices, 2000);

    return () => clearInterval(interval);
  }, [instruments]);

  if (isLoading) {
    return (
      <div className="flex gap-6 p-4 bg-gray-900 border-b border-gray-800">
        {instruments.map((instrument) => (
          <div key={instrument} className="animate-pulse">
            <div className="h-4 w-20 bg-gray-700 rounded mb-1"></div>
            <div className="h-6 w-24 bg-gray-700 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-6 p-4 bg-gray-900 border-b border-gray-800 overflow-x-auto">
      {instruments.map((instrument) => {
        const price = prices[instrument];
        if (!price) return null;

        const bid = parseFloat(price.bid);
        const ask = parseFloat(price.ask);
        const spread = ask - bid;

        return (
          <div key={instrument} className="flex flex-col min-w-fit">
            <div className="text-xs text-gray-400 font-medium">
              {instrument.replace('_', '/')}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Bid: {bid.toFixed(5)}</span>
                <span className="text-sm text-gray-500">Ask: {ask.toFixed(5)}</span>
              </div>
              <div className="text-xs text-gray-400">
                Spread: {spread.toFixed(1)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
