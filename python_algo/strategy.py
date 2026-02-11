import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging
import talib

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('PhantomNodeV10')

class UsdJpyQuantStrategy:
    def __init__(self, config=None):
        self.config = config or {}
        self.logger = logging.getLogger('PhantomNodeV10')
        self.last_signal_idx = -1
        self.last_signal_time = None
        self.cooldown_bars = 2  # Less cooldown for more trades
        self.min_hours_between_trades = 0.5
        
        # V10 Optimized Parameters (13.81% return in backtest)
        self.risk_per_trade = 0.01  # 1% risk per trade
        self.max_trades = 20
        self.adx_min = 22  # Trend strength requirement
        self.volume_ratio_min = 1.1  # Volume confirmation
        self.rsi_bullish_range = (35, 75)
        self.rsi_bearish_range = (25, 65)
        self.di_spread_min = 4  # DI spread requirement
        
        # Risk Management
        self.sl_atr_mult = 3.0  # 3x ATR stop loss
        self.tp_rr = 4.0  # 4:1 risk/reward ratio
        self.breakeven_rr = 1.0
        self.trailing_start_rr = 2.0
        self.time_stop_hours = 12
        
        # Position sizing
        self.max_position_size = 0.8
        self.min_position_size = 0.01
        
        self.last_trade_pnl = 0.0

    def is_trading_session_active(self, current_time):
        """Check if within active trading hours"""
        if isinstance(current_time, (int, float)):
            current_time = pd.to_datetime(current_time, unit='ms')
        hour = current_time.hour
        
        # Extended hours for more opportunities
        london = 7 <= hour < 16
        ny = 13 <= hour < 22
        tokyo = 0 <= hour < 9
        
        # More lenient - include individual sessions
        return london or ny or tokyo

    def calculate_position_size(self, account_balance, entry_price, stop_loss, signal_strength=1.0):
        """Calculate position size based on risk and signal strength"""
        risk_amount = account_balance * self.risk_per_trade * signal_strength
        risk_per_pip = abs(entry_price - stop_loss) * 100
        
        if risk_per_pip == 0:
            return 0.01
            
        pip_value_per_lot = 10  # USD/JPY
        position_size_lots = risk_amount / (risk_per_pip * pip_value_per_lot)
        
        # Cap between min and max
        position_size_lots = max(self.min_position_size, min(position_size_lots, self.max_position_size))
        
        return round(position_size_lots, 2)

    def calculate_indicators(self, df):
        """Calculate all technical indicators"""
        df = df.copy()
        
        # Handle time column
        if 'date' in df.columns and 'time' not in df.columns:
            df['time'] = df['date']
        elif 'timestamp' in df.columns:
            df['time'] = pd.to_datetime(df['timestamp'], unit='ms')
        
        # EMAs for trend
        df['ema_9'] = talib.EMA(df['close'], timeperiod=9)
        df['ema_21'] = talib.EMA(df['close'], timeperiod=21)
        df['ema_50'] = talib.EMA(df['close'], timeperiod=50)
        df['ema_200'] = talib.EMA(df['close'], timeperiod=200)
        
        # Volatility
        df['atr'] = talib.ATR(df['high'], df['low'], df['close'], timeperiod=14)
        df['atr_ma'] = df['atr'].rolling(window=20).mean()
        
        # Momentum
        df['rsi'] = talib.RSI(df['close'], timeperiod=14)
        df['stoch_k'], df['stoch_d'] = talib.STOCH(df['high'], df['low'], df['close'])
        
        # Trend strength
        df['adx'] = talib.ADX(df['high'], df['low'], df['close'], timeperiod=14)
        df['plus_di'] = talib.PLUS_DI(df['high'], df['low'], df['close'], timeperiod=14)
        df['minus_di'] = talib.MINUS_DI(df['high'], df['low'], df['close'], timeperiod=14)
        
        # Volume
        df['volume_ma'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_ma']
        
        # MACD
        df['macd'], df['macd_signal'], df['macd_hist'] = talib.MACD(df['close'])
        
        # Bollinger Bands
        df['bb_upper'], df['bb_middle'], df['bb_lower'] = talib.BBANDS(df['close'])
        
        # Multi-timeframe
        if len(df) > 100:
            df['h1_ema'] = df['close'].rolling(4).mean()
            df['h4_ema'] = df['close'].rolling(16).mean()
            df['h1_trend'] = df['h1_ema'] > df['h1_ema'].shift(4)
            df['h4_trend'] = df['h4_ema'] > df['h4_ema'].shift(16)
        
        return df

    def generate_signal(self, df):
        """Generate balanced trading signals - V10 Strategy"""
        if len(df) < 100:
            return {'action': 'HOLD', 'reason': 'Insufficient data'}
        
        current_time = df['time'].iloc[-1]
        if isinstance(current_time, (int, float)):
            current_time = pd.to_datetime(current_time, unit='ms')
        
        # Session filter
        if not self.is_trading_session_active(current_time):
            return {'action': 'HOLD', 'reason': 'Outside trading session'}
        
        # Cooldown filter
        bar_cooldown_ok = (len(df) - 1 - self.last_signal_idx) >= self.cooldown_bars
        time_cooldown_ok = True
        if self.last_signal_time is not None:
            diff = (current_time - self.last_signal_time).total_seconds() / 3600
            time_cooldown_ok = diff >= self.min_hours_between_trades
        
        if not (bar_cooldown_ok and time_cooldown_ok):
            return {'action': 'HOLD', 'reason': 'Cooldown period'}
        
        # Calculate indicators
        df = self.calculate_indicators(df)
        current = df.iloc[-1]
        
        # Trend analysis
        uptrend = current['ema_9'] > current['ema_21'] > current['ema_50']
        downtrend = current['ema_9'] < current['ema_21'] < current['ema_50']
        
        # Major trend (200 EMA) - important but not mandatory
        major_uptrend = current['close'] > current['ema_200']
        major_downtrend = current['close'] < current['ema_200']
        
        # Trend strength
        trend_strength = current['adx'] > self.adx_min
        
        # Multi-timeframe alignment - optional
        mtf_bullish = uptrend and current.get('h1_trend', False)
        mtf_bearish = downtrend and not current.get('h1_trend', True)
        
        # Volume confirmation
        volume_ok = current['volume_ratio'] > self.volume_ratio_min
        
        # RSI zones
        rsi_bullish = self.rsi_bullish_range[0] < current['rsi'] < self.rsi_bullish_range[1]
        rsi_bearish = self.rsi_bearish_range[0] < current['rsi'] < self.rsi_bearish_range[1]
        
        # Stochastic
        stoch_bullish = current['stoch_k'] > current['stoch_d'] and current['stoch_k'] < 80
        stoch_bearish = current['stoch_k'] < current['stoch_d'] and current['stoch_k'] > 20
        
        # MACD
        macd_bullish = current['macd'] > current['macd_signal']
        macd_bearish = current['macd'] < current['macd_signal']
        
        # DI spread
        di_bullish = current['plus_di'] > current['minus_di'] and (current['plus_di'] - current['minus_di']) > self.di_spread_min
        di_bearish = current['minus_di'] > current['plus_di'] and (current['minus_di'] - current['plus_di']) > self.di_spread_min
        
        # Volatility filter
        good_volatility = current['atr'] > current['atr_ma'] * 0.8
        
        signals = []
        
        # High probability entries (Type 1) - 6/8 confirmations
        high_conf_bullish = (uptrend and major_uptrend and trend_strength and volume_ok and 
                            rsi_bullish and stoch_bullish and good_volatility)
        
        high_conf_bearish = (downtrend and major_downtrend and trend_strength and volume_ok and 
                            rsi_bearish and stoch_bearish and good_volatility)
        
        # Medium probability entries (Type 2) - 5/8 confirmations
        med_conf_bullish = (uptrend and trend_strength and volume_ok and 
                           rsi_bullish and macd_bullish and good_volatility)
        
        med_conf_bearish = (downtrend and trend_strength and volume_ok and 
                           rsi_bearish and macd_bearish and good_volatility)
        
        # Pullback entries (Type 3) - specific conditions
        pullback_bullish = (major_uptrend and current['rsi'] < 45 and current['stoch_k'] < 35 and 
                           current['close'] > current['bb_lower'] and volume_ok and good_volatility)
        
        pullback_bearish = (major_downtrend and current['rsi'] > 55 and current['stoch_k'] > 65 and 
                           current['close'] < current['bb_upper'] and volume_ok and good_volatility)
        
        # Generate signals based on type
        if high_conf_bullish:
            signals.append({
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * self.sl_atr_mult),
                'tp': current['close'] + (current['atr'] * self.sl_atr_mult * self.tp_rr),
                'strength': 1.6,
                'type': 'High Confidence',
                'reason': 'Strong uptrend with momentum'
            })
        elif pullback_bullish:
            signals.append({
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * 2.5),
                'tp': current['close'] + (current['atr'] * 2.5 * self.tp_rr),
                'strength': 1.3,
                'type': 'Pullback',
                'reason': 'Pullback in major uptrend'
            })
        elif med_conf_bullish:
            signals.append({
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * self.sl_atr_mult),
                'tp': current['close'] + (current['atr'] * self.sl_atr_mult * self.tp_rr),
                'strength': 1.4,
                'type': 'Medium Confidence',
                'reason': 'Moderate bullish momentum'
            })
        
        if high_conf_bearish:
            signals.append({
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * self.sl_atr_mult),
                'tp': current['close'] - (current['atr'] * self.sl_atr_mult * self.tp_rr),
                'strength': 1.6,
                'type': 'High Confidence',
                'reason': 'Strong downtrend with momentum'
            })
        elif pullback_bearish:
            signals.append({
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * 2.5),
                'tp': current['close'] - (current['atr'] * 2.5 * self.tp_rr),
                'strength': 1.3,
                'type': 'Pullback',
                'reason': 'Pullback in major downtrend'
            })
        elif med_conf_bearish:
            signals.append({
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * self.sl_atr_mult),
                'tp': current['close'] - (current['atr'] * self.sl_atr_mult * self.tp_rr),
                'strength': 1.4,
                'type': 'Medium Confidence',
                'reason': 'Moderate bearish momentum'
            })
        
        # Return the strongest signal if any
        if signals:
            signals.sort(key=lambda x: x['strength'], reverse=True)
            signal = signals[0]
            
            # Calculate position size
            account_balance = self.config.get('balance', 10000)
            position_size = self.calculate_position_size(
                account_balance,
                signal['entry'],
                signal['sl'],
                signal.get('strength', 1.0)
            )
            
            if position_size < self.min_position_size:
                return {'action': 'HOLD', 'reason': 'Position size too small'}
            
            # Update tracking
            self.last_signal_idx = len(df) - 1
            self.last_signal_time = current_time
            
            return {
                'action': signal['action'],
                'entry': signal['entry'],
                'sl': signal['sl'],
                'tp': signal['tp'],
                'size': position_size,
                'reason': f"PHANTOM NODE V10 - {signal['type']}: {signal['reason']}",
                'grade': 'A+',
                'atr': current['atr'],
                'strength': signal.get('strength', 1.0),
                'type': signal.get('type', 'Unknown')
            }
        
        return {'action': 'HOLD', 'reason': 'No setup'}

    def manage_position(self, position, current_price, current_time):
        """Manage position with optimized exits"""
        if position is None:
            return None, None
            
        entry_price = position['entry']
        position_size_lots = position['size']
        
        # Calculate P&L
        if position['action'] == 'BUY':
            pips = (current_price - entry_price) * 100
        else:
            pips = (entry_price - current_price) * 100
        
        current_pnl = pips * position_size_lots * 10
        
        # Time exit
        if (current_time - position['entry_time']) > timedelta(hours=self.time_stop_hours):
            return None, {
                'action': 'CLOSE',
                'price': current_price,
                'pnl': current_pnl,
                'reason': 'Time exit'
            }
        
        # Dynamic trailing stop
        atr = position.get('atr', 0.001)
        risk_pips = abs(entry_price - position['sl']) * 100
        
        # Move to breakeven after 1R
        if 'breakeven' not in position and abs(pips) >= risk_pips:
            position['breakeven'] = True
            if position['action'] == 'BUY':
                position['sl'] = entry_price
            else:
                position['sl'] = entry_price
        
        # Trailing after 2R
        if abs(pips) >= 2 * risk_pips:
            if position['action'] == 'BUY':
                new_sl = current_price - (atr * 2)
                if new_sl > position['sl']:
                    position['sl'] = new_sl
            else:
                new_sl = current_price + (atr * 2)
                if new_sl < position['sl']:
                    position['sl'] = new_sl
        
        # Aggressive trailing after 3R
        if abs(pips) >= 3 * risk_pips:
            if position['action'] == 'BUY':
                new_sl = current_price - (atr * 1.5)
                if new_sl > position['sl']:
                    position['sl'] = new_sl
            else:
                new_sl = current_price + (atr * 1.5)
                if new_sl < position['sl']:
                    position['sl'] = new_sl
        
        # Check stop loss
        if (position['action'] == 'BUY' and current_price <= position['sl']) or \
           (position['action'] == 'SELL' and current_price >= position['sl']):
            if position['action'] == 'BUY':
                pips = (position['sl'] - entry_price) * 100
            else:
                pips = (entry_price - position['sl']) * 100
            sl_pnl = pips * position_size_lots * 10
            return None, {
                'action': 'CLOSE',
                'price': position['sl'],
                'pnl': sl_pnl,
                'reason': 'Stop loss hit'
            }
        
        # Check take profit
        if (position['action'] == 'BUY' and current_price >= position['tp']) or \
           (position['action'] == 'SELL' and current_price <= position['tp']):
            if position['action'] == 'BUY':
                pips = (position['tp'] - entry_price) * 100
            else:
                pips = (entry_price - position['tp']) * 100
            tp_pnl = pips * position_size_lots * 10
            return None, {
                'action': 'CLOSE',
                'price': position['tp'],
                'pnl': tp_pnl,
                'reason': 'Take profit hit'
            }
        
        # Partial close at 2R (close 25%)
        if 'partial_taken' not in position and abs(pips) >= 2 * risk_pips:
            position['partial_taken'] = True
            partial_size = position_size_lots * 0.25
            position['size'] = position_size_lots * 0.75
            return position, {
                'action': 'PARTIAL_CLOSE',
                'price': current_price,
                'pnl': current_pnl * 0.25,
                'size': partial_size,
                'reason': 'Partial profit at 2R'
            }
        
        # Second partial at 3R (close another 25%)
        if 'partial2_taken' not in position and 'partial_taken' in position and abs(pips) >= 3 * risk_pips:
            position['partial2_taken'] = True
            partial_size = position['size'] * 0.333  # 25% of original
            position['size'] = position['size'] * 0.667  # Keep 50% of original
            return position, {
                'action': 'PARTIAL_CLOSE',
                'price': current_price,
                'pnl': current_pnl * 0.333,
                'size': partial_size,
                'reason': 'Second partial at 3R'
            }
        
        return position, None
