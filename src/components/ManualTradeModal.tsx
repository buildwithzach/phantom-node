'use client';

import { useState, useEffect } from 'react';

interface ManualTradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPrice: number | null;
    instrument: string;
    onTradeSuccess: () => void;
}

export default function ManualTradeModal({
    isOpen,
    onClose,
    currentPrice,
    instrument,
    onTradeSuccess,
}: ManualTradeModalProps) {
    const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
    const [usdAmount, setUsdAmount] = useState<number>(1000);
    const [useUnits, setUseUnits] = useState(false);
    const [units, setUnits] = useState<number>(1000);
    const [takeProfit, setTakeProfit] = useState<string>('');
    const [stopLoss, setStopLoss] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Sync USD to Units
    useEffect(() => {
        if (!useUnits && currentPrice && usdAmount) {
            // For USD_JPY, 1 unit is 1 USD.
            // If the user wants to trade "1000 USD" worth of the position:
            // In Oanda, "units" usually refers to the base currency (USD in USD_JPY).
            // So 1000 units = $1,000 position size.
            setUnits(Math.floor(usdAmount));
        }
    }, [usdAmount, currentPrice, useUnits]);

    // Sync Units back to USD if manually changed
    useEffect(() => {
        if (useUnits && units) {
            setUsdAmount(units);
        }
    }, [units, useUnits]);

    // Auto-calculate suggested SL/TP based on action and current price
    useEffect(() => {
        if (currentPrice && !takeProfit && !stopLoss) {
            if (action === 'BUY') {
                setStopLoss((currentPrice - 0.150).toFixed(3));
                setTakeProfit((currentPrice + 0.300).toFixed(3));
            } else {
                setStopLoss((currentPrice + 0.150).toFixed(3));
                setTakeProfit((currentPrice - 0.300).toFixed(3));
            }
        }
    }, [currentPrice, action, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccess(false);

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    instrument,
                    units, // Always send calculated units
                    action,
                    takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
                    stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to place order');
            }

            setSuccess(true);
            setTimeout(() => {
                onTradeSuccess();
                onClose();
                setSuccess(false);
            }, 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-[#030712] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-white/5 to-transparent">
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Execute Trade</h2>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest">{instrument} · Market Execution</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Action Selector */}
                    <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                        <button
                            type="button"
                            onClick={() => setAction('BUY')}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 ${action === 'BUY'
                                ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            LONG (BUY)
                        </button>
                        <button
                            type="button"
                            onClick={() => setAction('SELL')}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 ${action === 'SELL'
                                ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            SHORT (SELL)
                        </button>
                    </div>

                    {/* Current Price Display */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-widest text-gray-400">Mark Price</span>
                        <span className="text-xl font-mono font-bold text-white">
                            {currentPrice ? currentPrice.toFixed(3) : '---.---'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Value Input */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                    {useUnits ? 'Units' : 'Trade Amount ($)'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setUseUnits(!useUnits)}
                                    className="text-[8px] text-emerald-500/70 hover:text-emerald-400 uppercase font-bold"
                                >
                                    Use {useUnits ? '$' : 'Units'}
                                </button>
                            </div>
                            <div className="relative">
                                {!useUnits && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">$</span>}
                                <input
                                    type="number"
                                    value={useUnits ? units : usdAmount}
                                    onChange={(e) => useUnits ? setUnits(parseInt(e.target.value)) : setUsdAmount(parseFloat(e.target.value))}
                                    className={`w-full bg-black/40 border border-white/10 rounded-lg ${!useUnits ? 'pl-7 pr-3' : 'px-3'} py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-colors`}
                                    placeholder={useUnits ? "1000" : "5000.00"}
                                    required
                                />
                            </div>
                        </div>

                        {/* Position Info helper */}
                        <div className="space-y-1.5 flex flex-col justify-end pb-2">
                            <p className="text-[9px] text-gray-400 font-medium">
                                Est. Size: <span className="text-white">{units.toLocaleString()} units</span>
                            </p>
                            <p className="text-[8px] text-gray-500">
                                ~{(units / 100000).toFixed(2)} Standard Lots
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Stop Loss */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest text-rose-400 font-bold">Stop Loss</label>
                            <input
                                type="text"
                                value={stopLoss}
                                onChange={(e) => setStopLoss(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-rose-500/50 transition-colors"
                                placeholder="0.000"
                            />
                        </div>

                        {/* Take Profit */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Take Profit</label>
                            <input
                                type="text"
                                value={takeProfit}
                                onChange={(e) => setTakeProfit(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                                placeholder="0.000"
                            />
                        </div>
                    </div>

                    {/* Status Messages */}
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                            <p className="text-[10px] text-rose-400 font-medium leading-tight">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                            <p className="text-[10px] text-emerald-400 font-bold text-center tracking-widest animate-pulse">
                                ORDER EXECUTED SUCCESSFULLY
                            </p>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting || success}
                        className={`w-full py-4 rounded-xl text-xs font-black tracking-[0.2em] uppercase transition-all duration-300 transform active:scale-[0.98] ${success
                            ? 'bg-emerald-500 text-white'
                            : action === 'BUY'
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_25px_rgba(16,185,129,0.3)]'
                                : 'bg-rose-500 hover:bg-rose-400 text-white shadow-[0_0_25px_rgba(244,63,94,0.3)]'
                            } ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                TRANSMITTING...
                            </span>
                        ) : success ? (
                            'ORDER FILLED'
                        ) : (
                            `CONFIRM ${action} ORDER`
                        )}
                    </button>

                    <p className="text-[8px] text-center text-gray-500 uppercase tracking-widest px-4">
                        By clicking confirm, you are executing a live market order on your OANDA account. Trade responsibly.
                    </p>
                </form>
            </div>
        </div>
    );
}
