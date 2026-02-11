import pandas as pd
import numpy as np
import datetime
import sys
from datetime import timedelta
import talib

class PhantomNodeV10:
    def __init__(self, config=None):
        self.config = config or {}
        self.name = "PHANTOM NODE V10 - Balanced Profit"
        self.version = "10.0"
        self.risk_per_trade = self.config.get('risk_per_trade', 0.01)  # 1% risk per trade
        self.atr_multiplier_sl = self.config.get('atr_multiplier_sl', 2.1)  # From config
        self.rr_ratio = self.config.get('rr_ratio', 3.5)  # From config
        self.max_trades = 5  # Day trading - 1-5 trades per day
        self.cooldown_bars = 4  # 1 hour spacing between trades
        
    def calculate_indicators(self, df):
        """Calculate technical indicators"""
        print(f"[DEBUG] DataFrame shape: {df.shape}, last close: {df.iloc[-1]['close'] if len(df) > 0 else 'N/A'}", file=sys.stderr)
        
        # EMAs for trend
        df['ema_9'] = talib.EMA(df['close'], timeperiod=9)
        df['ema_21'] = talib.EMA(df['close'], timeperiod=21)
        df['ema_50'] = talib.EMA(df['close'], timeperiod=50)
        df['ema_200'] = talib.EMA(df['close'], timeperiod=200)
        
        # Volatility
        df['atr'] = talib.ATR(df['high'], df['low'], df['close'], timeperiod=14)
        df['atr_ma'] = df['atr'].rolling(window=20).mean()
        
        print(f"[DEBUG] ATR calculated: {df['atr'].iloc[-1] if len(df) > 0 else 'N/A'}", file=sys.stderr)
        
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
            df['h1_rsi'] = talib.RSI(df['close'], timeperiod=14)  # H1 RSI (same as current since we're on M15)
        
        return df
    
    def is_trading_session_active(self, current_time):
        """Check if within forex trading hours (24/5: Mon 21:00 - Fri 21:00 UTC)"""
        # Forex is open 24/5 from Monday 21:00 UTC to Friday 21:00 UTC
        weekday = current_time.weekday()  # Monday=0, Sunday=6
        hour = current_time.hour
        minute = current_time.minute
        
        # Weekend check
        if weekday == 5:  # Saturday
            return False  # Entire Saturday is closed
        elif weekday == 6:  # Sunday
            return False  # Entire Sunday is closed
        elif weekday == 4:  # Friday
            # Friday closes at 21:00 UTC
            if hour > 21 or (hour == 21 and minute >= 0):
                return False
        elif weekday == 0:  # Monday
            # Monday opens at 21:00 UTC Sunday (which is weekday 6)
            # But since it's Monday, we're open all day
            pass
        
        # All other times during Mon-Fri are open
        return True
    
    def generate_signal(self, df, last_trade_time=None):
        """Generate balanced trading signals"""
        print(f"[DEBUG] generate_signal called with df shape: {df.shape}", file=sys.stderr)
        
        if len(df) < 100:
            print("[DEBUG] Insufficient data, returning HOLD", file=sys.stderr)
            return {'action': 'HOLD', 'reason': 'Insufficient data'}
        
        current = df.iloc[-1]
        prev = df.iloc[-2]
        current_time = pd.to_datetime(current.get('time', datetime.datetime.now()))
        
        print(f"[DEBUG] Current indicators - ATR: {current.get('atr', 'N/A')}, ADX: {current.get('adx', 'N/A')}, RSI: {current.get('rsi', 'N/A')}", file=sys.stderr)
        
        # Session filter
        if not self.is_trading_session_active(current_time):
            print("[DEBUG] Outside trading session, returning HOLD", file=sys.stderr)
            return {'action': 'HOLD', 'reason': 'Outside trading session'}
        
        # Cooldown filter
        if last_trade_time:
            bars_since_last = len(df[df['time'] > last_trade_time])
            if bars_since_last < self.cooldown_bars:
                return {'action': 'HOLD', 'reason': 'Cooldown period'}
        
        # Trend analysis
        uptrend = current['ema_9'] > current['ema_21'] > current['ema_50']
        downtrend = current['ema_9'] < current['ema_21'] < current['ema_50']
        
        # Major trend (200 EMA) - important but not mandatory
        major_uptrend = current['close'] > current['ema_200']
        major_downtrend = current['close'] < current['ema_200']
        
        # Trend strength - tighter threshold for better quality
        trend_strength = current['adx'] > 18  # Increased from 5
        
        # Multi-timeframe alignment - optional
        mtf_bullish = uptrend and current.get('h1_trend', False)
        mtf_bearish = downtrend and not current.get('h1_trend', True)
        
        # Volume confirmation - very lenient for live trading
        volume_ok = current['volume_ratio'] > 0.3  # Lowered from 0.5
        
        # RSI zones - widened
        rsi_bullish = 35 < current['rsi'] < 75
        rsi_bearish = 25 < current['rsi'] < 65
        
        # Stochastic
        stoch_bullish = current['stoch_k'] > current['stoch_d'] and current['stoch_k'] < 80
        stoch_bearish = current['stoch_k'] < current['stoch_d'] and current['stoch_k'] > 20
        
        # MACD
        macd_bullish = current['macd'] > current['macd_signal']
        macd_bearish = current['macd'] < current['macd_signal']
        
        # DI spread - tighter threshold to confirm momentum
        di_bullish = current['plus_di'] > current['minus_di'] and (current['plus_di'] - current['minus_di']) > 2.0
        di_bearish = current['minus_di'] > current['plus_di'] and (current['minus_di'] - current['plus_di']) > 2.0
        
        # Volatility filter
        good_volatility = current['atr'] > current['atr_ma'] * 0.8
        
        # Calculate Potential Scores for dashboard transparency
        raw_long_score = 0
        if uptrend: raw_long_score += 1.5
        if major_uptrend: raw_long_score += 1.0
        if current['rsi'] > 50: raw_long_score += 0.5
        if macd_bullish: raw_long_score += 1.0
        if di_bullish: raw_long_score += 1.0
        if trend_strength: raw_long_score += 1.0
        
        raw_short_score = 0
        if downtrend: raw_short_score += 1.5
        if major_downtrend: raw_short_score += 1.0
        if current['rsi'] < 50: raw_short_score += 0.5
        if macd_bearish: raw_short_score += 1.0
        if di_bearish: raw_short_score += 1.0
        if trend_strength: raw_short_score += 1.0
        
        signals = []
        
        # High probability entries (Type 1) - Strict trend and alignment
        high_conf_bullish = (uptrend and major_uptrend and trend_strength and volume_ok and di_bullish and macd_bullish)
        
        high_conf_bearish = (downtrend and major_downtrend and trend_strength and volume_ok and di_bearish and macd_bearish)
        
        # Medium probability entries (Type 2) - only 2 confirmations needed
        med_conf_bullish = (uptrend and trend_strength)
        
        med_conf_bearish = (downtrend and trend_strength)
        
        # Pullback entries (Type 3) - specific conditions
        pullback_bullish = (major_uptrend and current['rsi'] < 45 and current['stoch_k'] < 35 and 
                           current['close'] > current['bb_lower'] and volume_ok and good_volatility)
        
        pullback_bearish = (major_downtrend and current['rsi'] > 55 and current['stoch_k'] > 65 and 
                           current['close'] < current['bb_upper'] and volume_ok and good_volatility)
        
        # Generate signals based on type
        if high_conf_bullish:
            confluence_score = 6.0
            grade = 'A'
            factors = ['uptrend', 'major_uptrend', 'trend_strength', 'volume_ok', 'rsi_bullish', 'stoch_bullish', 'good_volatility']
            signals.append({
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] + (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': confluence_score,
                'long_score': confluence_score,
                'short_score': 0,
                'grade': grade,
                'factors': factors,
                'reason': 'Strong uptrend with momentum',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            })
        elif pullback_bullish:
            confluence_score = 4.5
            grade = 'B'
            factors = ['major_uptrend', 'rsi_pullback', 'stoch_oversold', 'above_bb_lower', 'volume_ok', 'good_volatility']
            signals.append({
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] + (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': confluence_score,
                'long_score': confluence_score,
                'short_score': 0,
                'grade': grade,
                'factors': factors,
                'reason': 'Pullback in major uptrend',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            })
        elif med_conf_bullish:
            confluence_score = 5.0
            grade = 'B'
            factors = ['uptrend', 'trend_strength', 'volume_ok', 'rsi_bullish', 'macd_bullish', 'good_volatility']
            signals.append({
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] + (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': confluence_score,
                'long_score': confluence_score,
                'short_score': 0,
                'grade': grade,
                'factors': factors,
                'reason': 'Moderate bullish momentum',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            })
        
        if high_conf_bearish:
            confluence_score = 6.0
            grade = 'A'
            factors = ['downtrend', 'major_downtrend', 'trend_strength', 'volume_ok', 'rsi_bearish', 'stoch_bearish', 'good_volatility']
            signals.append({
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] - (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': confluence_score,
                'long_score': 0,
                'short_score': confluence_score,
                'grade': grade,
                'factors': factors,
                'type': 'High Confidence',
                'reason': 'Strong downtrend with momentum',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            })
        elif pullback_bearish:
            confluence_score = 4.5
            grade = 'B'
            factors = ['major_downtrend', 'rsi_overbought', 'stoch_overbought', 'below_bb_upper', 'volume_ok', 'good_volatility']
            signals.append({
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] - (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': confluence_score,
                'long_score': 0,
                'short_score': confluence_score,
                'grade': grade,
                'factors': factors,
                'reason': 'Pullback in major downtrend',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            })
        elif med_conf_bearish:
            confluence_score = 5.0
            grade = 'B'
            factors = ['downtrend', 'trend_strength', 'volume_ok', 'rsi_bearish', 'macd_bearish', 'good_volatility']
            signals.append({
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] - (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': confluence_score,
                'long_score': 0,
                'short_score': confluence_score,
                'grade': grade,
                'factors': factors,
                'reason': 'Moderate bearish momentum',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            })
        
        # Return the strongest signal if multiple
        if signals:
            signals.sort(key=lambda x: x['confluence_score'], reverse=True)
            return signals[0]
        
        # FALLBACK: Basic MA crossover for day trading (your research #1)
        # EMA crossover signals
        bullish_crossover = (prev['ema_9'] <= prev['ema_21']) and (current['ema_9'] > current['ema_21'])
        bearish_crossover = (prev['ema_9'] >= prev['ema_21']) and (current['ema_9'] < current['ema_21'])
        
        # MACD confirmation
        macd_bullish = current['macd'] > current['macd_signal'] and current['macd_hist'] > 0
        macd_bearish = current['macd'] < current['macd_signal'] and current['macd_hist'] < 0
        
        if bullish_crossover and macd_bullish:
            return {
                'action': 'BUY',
                'entry': current['close'],
                'sl': current['close'] - (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] + (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': 2.0,
                'long_score': 2.0,
                'short_score': 0,
                'grade': 'B',
                'factors': ['ma_crossover', 'macd_bullish'],
                'reason': 'MA Crossover + MACD (Research Strategy #1)',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            }
        
        if bearish_crossover and macd_bearish:
            return {
                'action': 'SELL',
                'entry': current['close'],
                'sl': current['close'] + (current['atr'] * self.atr_multiplier_sl),
                'tp': current['close'] - (current['atr'] * self.atr_multiplier_sl * self.rr_ratio),
                'confluence_score': 2.0,
                'long_score': 0,
                'short_score': 2.0,
                'grade': 'B',
                'factors': ['ma_crossover', 'macd_bearish'],
                'reason': 'MA Crossover + MACD (Research Strategy #1)',
                'debug': {
                    'adx': float(current.get('adx', 0)),
                    'h1_rsi': float(current.get('h1_rsi', 0)),
                    'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10))
                }
            }
        
        return {
            'action': 'HOLD', 
            'reason': 'No setup',
            'confluence_score': 0,
            'long_score': raw_long_score,
            'short_score': raw_short_score,
            'grade': 'C',
            'factors': [],
            'debug': {
                'adx': float(current.get('adx', 0)),
                'h1_rsi': float(current.get('h1_rsi', 0)),
                'atr_ratio': float(current.get('atr', 0) / (current.get('atr_ma', 1) + 1e-10)),
                'uptrend': bool(uptrend),
                'downtrend': bool(downtrend),
                'di_spread': float(abs(current.get('plus_di', 0) - current.get('minus_di', 0)))
            }
        }
    
    def calculate_position_size(self, account_balance, entry_price, stop_loss, signal_strength=1.0):
        """Calculate position size"""
        risk_amount = account_balance * self.risk_per_trade * signal_strength
        risk_per_pip = abs(entry_price - stop_loss) * 100
        
        if risk_per_pip == 0:
            return 0.01
            
        pip_value_per_lot = 10  # USD/JPY
        position_size_lots = risk_amount / (risk_per_pip * pip_value_per_lot)
        
        # Cap between 0.01 and 0.8 lots
        position_size_lots = max(0.01, min(position_size_lots, 0.8))
        
        return round(position_size_lots, 2)
    
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
        
        # Time exit (12 hours)
        if (current_time - position['entry_time']) > timedelta(hours=12):
            return None, {
                'action': 'CLOSE',
                'price': current_price,
                'pnl': current_pnl,
                'reason': 'Time exit (12h)'
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
