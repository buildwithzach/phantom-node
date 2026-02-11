'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, Time, SeriesMarker, IPriceLine } from 'lightweight-charts';

interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  timestamp: number;
}

interface TradingChartProps {
  instrument: string;
  granularity?: string;
  height?: number;
  signal?: TradeSignal | null;
  tradeHistory?: any[];
  currentPrice?: number | null;
}

// Helper functions for technical indicators
function calculateSMA(data: any[], period: number) {
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val.close, 0);
    sma.push({ time: data[i].time, value: sum / period });
  }
  return sma;
}

function calculateEMA(data: any[], period: number) {
  const k = 2 / (period + 1);
  const ema = [];
  let prevEma = data[0].close;

  for (let i = 0; i < data.length; i++) {
    const currentEma = data[i].close * k + prevEma * (1 - k);
    ema.push({ time: data[i].time, value: currentEma });
    prevEma = currentEma;
  }
  return ema;
}

export default function TradingChart({
  instrument,
  granularity = 'M1',
  height = 400,
  signal,
  tradeHistory = [],
  currentPrice = null
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const tradeHistoryRef = useRef<any[]>([]); // Ref to avoid stale closures
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Keep ref in sync
  useEffect(() => {
    tradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { color: '#030712' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#64748b',
          labelBackgroundColor: '#1e293b',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#64748b',
          labelBackgroundColor: '#1e293b',
          width: 1,
          style: 2,
        },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 10,
        rightOffset: 8,
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        textColor: '#94a3b8',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderDownColor: '#f43f5e',
      borderUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      wickUpColor: '#10b981',
    });

    const ema9Series = chart.addLineSeries({
      color: '#10b981', // Emerald for 9 EMA
      lineWidth: 2,
      title: 'EMA 9',
    });

    const ema200Series = chart.addLineSeries({
      color: 'rgba(234, 179, 8, 0.4)', // Subtle Yellow for 200 EMA
      lineWidth: 1,
      title: 'EMA 200',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    smaSeriesRef.current = ema9Series;
    emaSeriesRef.current = null;
    ema50SeriesRef.current = null;
    ema200SeriesRef.current = ema200Series;

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    // Handle clicks for trade details
    chart.subscribeClick((param) => {
      if (!param.point || !param.time) {
        setSelectedTrade(null);
        return;
      }

      // Find closest trade in history
      const clickedTime = param.time as number;

      // Determine timeframe duration in seconds
      let duration = 60; // Default M1
      if (granularity === 'M5') duration = 300;
      if (granularity === 'M15') duration = 900;
      if (granularity === 'M30') duration = 1800;
      if (granularity === 'H1') duration = 3600;
      if (granularity === 'H4') duration = 14400;
      if (granularity === 'D') duration = 86400;

      const trade = tradeHistoryRef.current?.find(t => {
        const tradeTime = Math.floor(t.timestamp / 1000);
        // Expand search to +/- 2 candles to make it much easier to click
        return tradeTime >= clickedTime - (duration * 2) && tradeTime < clickedTime + (duration * 2);
      });

      if (trade) {
        setSelectedTrade(trade);
        setTooltipPos({ x: param.point.x, y: param.point.y });
      } else {
        setSelectedTrade(null);
      }
    });

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]); // Removed tradeHistory from here to prevent chart recreation

  // Handle signals and history (markers and price lines)
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear existing price lines
    priceLinesRef.current.forEach(line => seriesRef.current?.removePriceLine(line));
    priceLinesRef.current = [];

    // Create markers for all trades in history
    const markers: SeriesMarker<Time>[] = (tradeHistory || []).map(t => {
      // Convert timestamp to match candle format exactly
      let chartTime: Time;

      // Convert trade timestamp from milliseconds to seconds
      const tradeTimeSeconds = Math.floor(t.timestamp / 1000);

      // Round to nearest 15-minute interval to match candle times exactly
      const fifteenMinutes = 15 * 60;
      const roundedTime = Math.round(tradeTimeSeconds / fifteenMinutes) * fifteenMinutes;
      chartTime = roundedTime as Time;

      return {
        time: chartTime,
        position: t.action === 'SELL' ? 'aboveBar' : 'belowBar',
        color: t.action === 'SELL' ? '#f43f5e' : '#10b981',
        shape: t.action === 'SELL' ? 'arrowDown' : 'arrowUp',
        text: `${t.action}`,
        size: 1,
      };
    });

    // Sort markers by time to ensure they render correctly
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    seriesRef.current.setMarkers(markers);
  }, [tradeHistory]); // Removed signal from dependency

  useEffect(() => {
    const loadInitialData = async () => {
      if (!seriesRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/candles?instrument=${instrument}&granularity=${granularity}&count=200`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        const chartData = data.candles.map((candle: any) => ({
          time: Math.floor(parseFloat(candle.time)) as Time,
          open: parseFloat(candle.open),
          high: parseFloat(candle.high),
          low: parseFloat(candle.low),
          close: parseFloat(candle.close),
        }));

        seriesRef.current.setData(chartData);

        // Calculate and set EMA 9
        if (smaSeriesRef.current && chartData.length >= 9) {
          const emaData = calculateEMA(chartData, 9);
          smaSeriesRef.current.setData(emaData);
        }

        // Calculate and set EMA 200
        if (ema200SeriesRef.current && chartData.length >= 200) {
          const emaData = calculateEMA(chartData, 200);
          ema200SeriesRef.current.setData(emaData);
        }

        // Calculate and set EMA 200
        if (ema50SeriesRef.current && chartData.length >= 200) {
          const emaData = calculateEMA(chartData, 200);
          ema50SeriesRef.current.setData(emaData);
        }
      } catch (err) {
        console.error('Error loading initial data:', err);
        setError('Failed to load chart data');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [instrument, granularity]);

  useEffect(() => {
    const updatePrice = async () => {
      try {
        const response = await fetch(`/api/candles?instrument=${instrument}&granularity=${granularity}&count=1`);

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data.error || !data.candles || data.candles.length === 0) {
          return;
        }

        if (seriesRef.current && data.candles[0]) {
          const candle = data.candles[0];
          const priceData = {
            time: Math.floor(parseFloat(candle.time)) as Time,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
          };

          seriesRef.current.update(priceData);
        }
      } catch (error) {
        console.error('Error updating price:', error);
      }
    };

    const interval = setInterval(updatePrice, 5000);
    return () => clearInterval(interval);
  }, [instrument, granularity]);

  const copyChartToClipboard = async () => {
    if (!chartRef.current) return;

    try {
      // takeScreenshot() captures the FULL chart: candles + price scale + time axis
      const screenshot = chartRef.current.takeScreenshot();

      // Create a larger canvas with room for a branded header and footer
      const headerH = 48;
      const footerH = 40;
      const comp = document.createElement('canvas');
      comp.width = screenshot.width;
      comp.height = screenshot.height + headerH + footerH;
      const ctx = comp.getContext('2d');
      if (!ctx) return;

      // Fill background
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, comp.width, comp.height);

      // --- HEADER BAR ---
      ctx.fillStyle = '#0a0f1a';
      ctx.fillRect(0, 0, comp.width, headerH);
      // Bottom border on header
      ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.fillRect(0, headerH - 1, comp.width, 1);

      // Brand name (left)
      ctx.font = 'bold 18px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('\u26a1 PHANTOM NODE', 16, headerH / 2);

      // Instrument + Timeframe (center)
      const pair = instrument.replace('_', '/');
      ctx.font = 'bold 16px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText(`${pair}  \u00b7  ${granularity}`, comp.width / 2, headerH / 2);

      // Price (right)
      if (currentPrice) {
        ctx.font = 'bold 16px Inter, monospace, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'right';
        ctx.fillText(currentPrice.toFixed(3), comp.width - 16, headerH / 2);
      }

      // --- CHART IMAGE ---
      ctx.drawImage(screenshot, 0, headerH);

      // --- FOOTER BAR ---
      const footerY = headerH + screenshot.height;
      ctx.fillStyle = '#0a0f1a';
      ctx.fillRect(0, footerY, comp.width, footerH);
      // Top border on footer
      ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.fillRect(0, footerY, comp.width, 1);

      // Timestamp (left)
      const now = new Date();
      const ts = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '  \u00b7  ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ts, 16, footerY + footerH / 2);

      // Tag (right)
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText('Algo-Traded  \u00b7  phantomnode.io', comp.width - 16, footerY + footerH / 2);

      // Convert to blob and copy / download
      comp.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${instrument}_${granularity}_${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Copy chart error:', err);
    }
  };

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 rounded-xl">
          <div className="text-white text-xs animate-pulse">Syncing market data...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 rounded-xl">
          <div className="text-red-400 text-xs">{error}</div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />

      {/* Copy Chart Button */}
      <button
        id="copy-chart-btn"
        onClick={copyChartToClipboard}
        className={`absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${copied
          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
          : 'bg-black/50 backdrop-blur-md border border-white/10 text-gray-400 hover:text-white hover:border-white/30 hover:bg-black/70'
          }`}
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            Copy Chart
          </>
        )}
      </button>

      {/* Chart Legend & Status Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md border border-white/5 rounded-lg px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 bg-[#10b981]" />
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">EMA 9</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 bg-[#eab308]/40" />
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">EMA 200</span>
          </div>
        </div>
      </div>

      {/* Trade Detail Card */}
      {selectedTrade && tooltipPos && (
        <div
          className="absolute z-50 bg-black/80 border border-white/10 rounded-xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md pointer-events-auto min-w-[200px]"
          style={{
            left: Math.min(tooltipPos.x + 15, (chartContainerRef.current?.clientWidth || 0) - 220),
            top: Math.min(tooltipPos.y - 60, height - 160)
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${selectedTrade.status === 'OPEN' ? 'bg-emerald-500' : 'bg-gray-500'}`} />
              <span className="text-[10px] font-bold tracking-widest text-white uppercase">
                {selectedTrade.action} Trade
              </span>
            </div>
            <button
              onClick={() => setSelectedTrade(null)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <div>
              <p className="text-[8px] uppercase text-gray-500 font-medium">Entry Price</p>
              <p className="text-xs font-mono text-white">{selectedTrade.entry.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase text-gray-500 font-medium">Status</p>
              <p className={`text-xs font-bold ${selectedTrade.status === 'OPEN' ? 'text-emerald-400' : 'text-gray-400'}`}>
                {selectedTrade.status}
              </p>
            </div>
            <div>
              <p className="text-[8px] uppercase text-gray-500 font-medium">Stop Loss</p>
              <p className="text-xs font-mono text-red-400">{selectedTrade.stopLoss.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase text-gray-500 font-medium">Take Profit</p>
              <p className="text-xs font-mono text-emerald-400">{selectedTrade.takeProfit1.toFixed(3)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[8px] uppercase text-gray-500 font-medium tracking-widest">Position Size</p>
              <p className="text-xs font-mono text-white">{selectedTrade.size.toLocaleString()} units</p>
            </div>

            {/* TACTICAL PERFORMANCE DATA */}
            {selectedTrade.status === 'OPEN' && currentPrice && (
              <div className="col-span-2 mt-3 pt-3 border-t border-white/10 flex justify-between items-end">
                <div>
                  <p className="text-[7px] font-black tracking-[0.2em] text-gray-500 uppercase mb-1 leading-none">PIPS</p>
                  <p className={`text-[11px] font-black font-mono leading-none ${(selectedTrade.action === 'BUY' ? currentPrice - selectedTrade.entry : selectedTrade.entry - currentPrice) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                    {((selectedTrade.action === 'BUY' ? currentPrice - selectedTrade.entry : selectedTrade.entry - currentPrice) * 100).toFixed(1)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[7px] font-black tracking-[0.2em] text-gray-500 uppercase mb-1 leading-none">PROFIT USD</p>
                  <p className={`text-[13px] font-black font-mono leading-none ${(selectedTrade.action === 'BUY' ? currentPrice - selectedTrade.entry : selectedTrade.entry - currentPrice) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                    ${(((selectedTrade.action === 'BUY' ? currentPrice - selectedTrade.entry : selectedTrade.entry - currentPrice) * 100) * (selectedTrade.size / 1000) * 0.065).toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-[9px] text-gray-400 leading-relaxed italic">
              &ldquo;{selectedTrade.reason}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
