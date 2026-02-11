'use client';

interface CondensedTradeDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    trade: any | null; // Using any for execution log trade structure
}

export default function CondensedTradeDetailModal({ isOpen, onClose, trade }: CondensedTradeDetailModalProps) {
    if (!isOpen || !trade) return null;

    const getTradeReasonDescription = (reason: string, pl?: number) => {
        // Special handling for stop loss orders - check if profitable
        if (reason === 'STOP_LOSS_ORDER' && pl && pl > 0) {
            return 'Trailing Stop Exit - Profit secured via dynamic stop loss';
        }
        
        const reasonMap: { [key: string]: string } = {
            'MARKET_ORDER': 'Market Execution - Immediate fill at current price',
            'LIMIT_ORDER': 'Limit Order - Filled at specified price or better',
            'STOP_ORDER': 'Stop Order - Filled when price triggered stop level',
            'STOP_LOSS_ORDER': 'Stop Loss - Risk management exit at predefined level',
            'TAKE_PROFIT_ORDER': 'Take Profit - Profit target reached',
            'TRAILING_STOP_ORDER': 'Trailing Stop - Dynamic stop loss following price',
            'MARKET_IF_TOUCHED_ORDER': 'Market if Touched - Market order when price touched',
            'ORDER_FILL': 'Order Execution - Trade filled successfully',
            'ORDER_CANCEL': 'Order Cancellation - Trade order cancelled',
            'CLIENT_ORDER_REPLACE': 'Order Modification - Trade parameters updated',
            'MARGIN_CLOSEOUT': 'Margin Closeout - Forced liquidation due to margin',
            'TRANSFER_FUNDS': 'Account Transfer - Funds moved between accounts',
            'DAILY_FINANCING': 'Daily Financing - Swap/rollover charges applied',
            'FEE': 'Transaction Fee - Broker commission charged',
            'DIVIDEND_ADJUSTMENT': 'Dividend Adjustment - Corporate action adjustment',
            'RESET_RESETTABLE_PL': 'PL Reset - Profit/Loss reset for period'
        };

        return reasonMap[reason] || `Order Type: ${reason.replace(/_/g, ' ')}`;
    };

    const formatDuration = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        return `${minutes}m`;
    };

    const isBuy = trade.action === 'BUY';
    const currentPrice = trade.entry; // Entry price for open trades

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#0a0f1e]/90 p-3 shadow-2xl backdrop-blur-xl transition-all">
                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold tracking-tight text-white">LIVE TRADE DETAILS</h2>
                        <p className="text-[8px] uppercase tracking-[0.2rem] text-emerald-400 font-bold">
                            {trade.action} @ {trade.entry.toFixed(5)}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-full bg-white/5 p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-2">
                    {/* Trade Entry Information */}
                    <div className="grid grid-cols-4 gap-1">
                        <div className="rounded-lg border border-white/5 bg-black/40 p-1.5">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Action</p>
                            <p className="mt-0.5 text-xs font-bold ${isBuy ? 'text-emerald-400' : 'text-rose-400'}">
                                {trade.action}
                            </p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/40 p-1.5">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Entry</p>
                            <p className="mt-0.5 text-xs font-bold text-white">{trade.entry.toFixed(5)}</p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Size</p>
                            <p className="mt-0.5 text-xs font-bold text-white">{trade.size}</p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Status</p>
                            <p className="mt-0.5 text-xs font-bold text-white">{trade.status}</p>
                        </div>
                    </div>

                    {/* Risk Management */}
                    <div className="rounded-lg border border-white/5 bg-black/20 overflow-hidden">
                        <div className="bg-black/40 px-3 py-1.5 border-b border-white/5">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Risk Management</span>
                        </div>
                        <div className="p-3">
                            <div className="grid grid-cols-2 gap-3">
                                {trade.stopLoss > 0 && (
                                    <div>
                                        <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-1">Stop Loss</p>
                                        <p className="text-xs font-bold text-rose-400">{trade.stopLoss.toFixed(5)}</p>
                                        <p className="text-[7px] text-gray-600">
                                            {Math.abs((trade.stopLoss - trade.entry) * 100).toFixed(1)} pips risk
                                        </p>
                                    </div>
                                )}
                                {trade.takeProfit1 > 0 && (
                                    <div>
                                        <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-1">Take Profit</p>
                                        <p className="text-xs font-bold text-emerald-400">{trade.takeProfit1.toFixed(5)}</p>
                                        <p className="text-[7px] text-gray-600">
                                            {Math.abs((trade.takeProfit1 - trade.entry) * 100).toFixed(1)} pips target
                                        </p>
                                    </div>
                                )}
                                {!trade.stopLoss && !trade.takeProfit1 && (
                                    <div className="col-span-2 text-center text-gray-500 text-[9px]">
                                        No risk management levels set
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Trade Information */}
                    <div className="rounded-lg border border-white/5 bg-black/20 overflow-hidden">
                        <div className="bg-black/40 px-3 py-1.5 border-b border-white/5">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Trade Information</span>
                        </div>
                        <div className="p-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-1">Entry Time</p>
                                    <p className="text-xs font-bold text-white">
                                        {new Date(trade.timestamp).toLocaleString()}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-1">Time Open</p>
                                    <p className="text-xs font-bold text-white">
                                        {formatDuration(trade.timestamp)}
                                    </p>
                                </div>
                            </div>
                            
                            {trade.reason && (
                                <div className="mt-2">
                                    <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-0.5">Entry Reason</p>
                                    <p className="text-xs text-gray-300 leading-relaxed">{getTradeReasonDescription(trade.reason, trade.pl)}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Risk/Reward Ratio */}
                    {trade.stopLoss > 0 && trade.takeProfit1 > 0 && (
                        <div className="rounded-lg border border-white/5 bg-black/20 overflow-hidden">
                            <div className="bg-black/40 px-3 py-1.5 border-b border-white/5">
                                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">Risk/Reward Analysis</span>
                            </div>
                            <div className="p-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-0.5">Risk Amount</p>
                                        <p className="text-xs font-bold text-rose-400">
                                            {Math.abs(trade.stopLoss - trade.entry).toFixed(5)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-0.5">Reward Amount</p>
                                        <p className="text-xs font-bold text-emerald-400">
                                            {Math.abs(trade.takeProfit1 - trade.entry).toFixed(5)}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-1 pt-1 border-t border-white/10">
                                    <p className="text-[8px] uppercase tracking-wider text-gray-500 mb-0.5">Risk/Reward Ratio</p>
                                    <p className="text-xs font-bold text-white">
                                        1:{(Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.stopLoss - trade.entry)).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
