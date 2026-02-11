import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('PhantomNode')

class UsdJpyQuantStrategy:
    def __init__(self, config):
        # Initialize logger
        self.logger = logging.getLogger('PhantomNode')
        self.logger.setLevel(logging.INFO)
        
        if not self.logger.handlers:
            ch = logging.StreamHandler()
            ch.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
            self.logger.addHandler(ch)
        
        self.config = config
        
        # === OPTIMIZED PARAMETERS (for 1-3 trades/day target) ===
        self.ema_fast_len = config.get('ema_fast', 9)
        self.ema_slow_len = config.get('ema_slow', 21)
        self.atr_len = config.get('atr_len', 14)
        self.adx_len = config.get('adx_len', 14)
        self.atr_sma_len = config.get('atr_sma_len', 20)
        
        # H1 Proxy (still on M15 bars)
        self.h1_ema_len = config.get('h1_ema_len', 800)
        self.h1_rsi_len = config.get('h1_rsi_len', 56)
        
        # Frequency & Cooldown (relaxed for 20-30 trades/month)
        self.last_signal_idx = -1
        self.last_signal_time = None
        self.cooldown_bars = config.get('signal_cooldown', 16)          # ~4 hours
        self.min_hours_between_trades = config.get('min_hours_between_trades', 4)
        
        # Core thresholds
        self.h1_rsi_long_thresh = config.get('h1_rsi_long', 55)
        self.h1_rsi_short_thresh = config.get('h1_rsi_short', 45)
        self.adx_min_strength = config.get('adx_min', 18)               # Lowered from 22
        self.atr_expansion_required = config.get('atr_expansion_enabled', False)  # Disabled for more entries
        
        # Entry windows
        self.n_cross_fresh = config.get('n_cross_fresh', 24)
        self.bos_lookback = config.get('bos_lookback', 10)
        
        # Risk & Exits
        self.risk_pct = config.get('risk_per_trade', 0.01)
        self.sl_atr_mult = config.get('atr_multiplier_sl', 2.1)
        self.tp_rr = config.get('rr_ratio', 3.5)                        # Slightly higher RR
        self.aggressive_mode = config.get('aggressive_mode', True)      # ENABLED by default
        
        # PHANTOM NODE Exits
        self.trailing_stop_enabled = config.get('trailing_stop_enabled', True)
        self.trailing_stop_start_rr = config.get('trailing_stop_start_rr', 1.8)  # Earlier activation
        self.time_stop_enabled = config.get('time_stop_enabled', True)
        self.time_stop_hours = config.get('time_stop_hours', 8)
        self.time_stop_min_rr = config.get('time_stop_min_rr', 1.5)

        self.last_trade_pnl = 0.0  # For dynamic risk scaling (updated externally after each trade)

    def is_good_trading_hour(self, dt):
        """Only trade during high probability hours"""
        if isinstance(dt, (int, float, np.integer)):
            dt = pd.to_datetime(dt, unit='ms')
        elif not isinstance(dt, (pd.Timestamp, datetime)):
            dt = pd.to_datetime(dt)
        hour = dt.hour
        london_open = 8 <= hour < 16
        asian_session = 0 <= hour < 6
        return london_open or asian_session
        
    def calculate_position_size(self, risk_amount, entry, sl):
        """Fixed: Dynamic pip value for USD/JPY"""
        if entry == 0 or sl == 0:
            return 0
        risk_pips = abs(entry - sl) * 100
        if risk_pips == 0:
            return 0
        pip_value_usd = 1000 / entry  # 1000 JPY/pip per lot → USD
        position_size = risk_amount / (risk_pips * pip_value_usd)
        return min(position_size, 1.0)

    def calculate_indicators(self, df):
        df = df.copy()
        if 'date' in df.columns and 'time' not in df.columns:
            df['time'] = df['date']
        elif 'timestamp' in df.columns and 'time' not in df.columns:
            df['time'] = pd.to_datetime(df['timestamp'], unit='ms')
        
        # M15 EMAs
        df['ema9'] = df['close'].ewm(span=self.ema_fast_len, adjust=False).mean()
        df['ema21'] = df['close'].ewm(span=self.ema_slow_len, adjust=False).mean()
        df['ema_fast'] = df['ema9']
        df['ema_medium'] = df['ema21']
        
        # H1 Proxy Trend
        df['h1_ema200'] = df['close'].ewm(span=self.h1_ema_len, adjust=False).mean()
        df['ema_slow'] = df['h1_ema200']
        
        # H1 Proxy RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=self.h1_rsi_len).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=self.h1_rsi_len).mean()
        rs = gain / (loss + 1e-10)
        df['h1_rsi14'] = 100 - (100 / (1 + rs))
        
        # M15 RSI
        delta_m15 = df['close'].diff()
        gain_m15 = (delta_m15.where(delta_m15 > 0, 0)).rolling(window=14).mean()
        loss_m15 = (-delta_m15.where(delta_m15 < 0, 0)).rolling(window=14).mean()
        rs_m15 = gain_m15 / (loss_m15 + 1e-10)
        df['rsi'] = 100 - (100 / (1 + rs_m15))
        
        # ATR & ADX
        high_low = df['high'] - df['low']
        high_cp = np.abs(df['high'] - df['close'].shift())
        low_cp = np.abs(df['low'] - df['close'].shift())
        df['tr'] = pd.concat([high_low, high_cp, low_cp], axis=1).max(axis=1)
        df['atr14'] = df['tr'].rolling(window=self.atr_len).mean()
        df['atr_ma20'] = df['atr14'].rolling(window=self.atr_sma_len).mean()
        
        df['plus_dm'] = np.where((df['high'] - df['high'].shift() > df['low'].shift() - df['low']) & (df['high'] - df['high'].shift() > 0), df['high'] - df['high'].shift(), 0)
        df['minus_dm'] = np.where((df['low'].shift() - df['low'] > df['high'] - df['high'].shift()) & (df['low'].shift() - df['low'] > 0), df['low'].shift() - df['low'], 0)
        
        tr_sum = df['tr'].rolling(window=self.adx_len).sum()
        plus_di = 100 * (df['plus_dm'].rolling(window=self.adx_len).sum() / (tr_sum + 1e-10))
        minus_di = 100 * (df['minus_dm'].rolling(window=self.adx_len).sum() / (tr_sum + 1e-10))
        dx = (np.abs(plus_di - minus_di) / (plus_di + minus_di + 1e-10)) * 100
        df['adx14'] = dx.rolling(window=self.adx_len).mean()
        df['adx'] = df['adx14']
        df['+di14'] = plus_di
        df['-di14'] = minus_di
        
        # Choppiness
        chop_len = 14
        chop_sum_atr = df['tr'].rolling(window=chop_len).sum()
        chop_max_hi = df['high'].rolling(window=chop_len).max()
        chop_min_lo = df['low'].rolling(window=chop_len).min()
        chop_range = chop_max_hi - chop_min_lo
        df['chop14'] = 100 * np.log10(chop_sum_atr / (chop_range + 1e-10)) / np.log10(chop_len)
        
        return df

    def calculate_trailing_stop(self, position, current_price, current_atr, entry_price):
        if not self.trailing_stop_enabled:
            return position['sl']
        if position['action'] == 'BUY':
            current_rr = (current_price - entry_price) / (entry_price - position['sl'])
        else:
            current_rr = (entry_price - current_price) / (position['sl'] - entry_price)
        if current_rr < self.trailing_stop_start_rr:
            return position['sl']
        trailing_distance = self.sl_atr_mult * current_atr
        if position['action'] == 'BUY':
            new_sl = current_price - trailing_distance
            return max(new_sl, position['sl'])
        else:
            new_sl = current_price + trailing_distance
            return min(new_sl, position['sl'])

    def check_time_stop(self, position, entry_time, current_time, entry_price):
        if not self.time_stop_enabled:
            return False
        entry_dt = entry_time.to_pydatetime() if hasattr(entry_time, 'to_pydatetime') else pd.to_datetime(entry_time)
        current_dt = current_time.to_pydatetime() if hasattr(current_time, 'to_pydatetime') else pd.to_datetime(current_time)
        time_elapsed = (current_dt - entry_dt).total_seconds() / 3600
        if time_elapsed >= self.time_stop_hours:
            current_price = position.get('current_price', entry_price)
            if position['action'] == 'BUY':
                current_rr = (current_price - entry_price) / (entry_price - position['sl'])
            else:
                current_rr = (entry_price - current_price) / (position['sl'] - entry_price)
            if current_rr >= self.time_stop_min_rr:
                return True
        return False

    def generate_signal(self, df):
        signal = self._generate_original_signal(df)
        self.logger.info(f"Signal: {signal['action']} | Reason: {signal.get('reason', '')}")
        return signal
        
    def _generate_original_signal(self, df):
        if len(df) < 400:
            return {'action': 'HOLD', 'reason': f'Need 400 bars, have {len(df)}'}
            
        # Calculate indicators FIRST
        df = self.calculate_indicators(df)
        
        current_time = df['time'].iloc[-1]
        if isinstance(current_time, (int, float, np.integer)):
            current_time = pd.to_datetime(current_time, unit='ms')
        elif not isinstance(current_time, (pd.Timestamp, datetime)):
            current_time = pd.to_datetime(current_time)
        if not self.is_good_trading_hour(current_time):
            return {'action': 'HOLD', 'reason': 'Outside trading hours'}
            
        # Volatility check (relaxed)
        current_atr = df['atr14'].iloc[-1]
        atr_ma = df['atr14'].rolling(50).mean().iloc[-1]
        atr_ratio = current_atr / atr_ma
        vol_threshold = 0.7
        if atr_ratio < vol_threshold:
            return {'action': 'HOLD', 'reason': f'Low volatility (ATR ratio: {atr_ratio:.2f} < {vol_threshold})'}

        curr = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else curr
        t = len(df) - 1

        # --- REGIME FILTERS (relaxed) ---
        strong_uptrend = (curr['adx'] > self.adx_min_strength and 
                         curr['ema_fast'] > curr['ema_medium'] > curr['ema_slow'] and
                         curr['ema_fast'] > prev['ema_fast'])
        strong_downtrend = (curr['adx'] > self.adx_min_strength and 
                           curr['ema_fast'] < curr['ema_medium'] < curr['ema_slow'] and
                           curr['ema_fast'] < prev['ema_fast'])
        
        h1_long_ok = (curr['close'] > curr['h1_ema200'] and 
                     curr['h1_rsi14'] >= self.h1_rsi_long_thresh and
                     (curr['close'] - curr['h1_ema200']) / curr['h1_ema200'] > 0.001)
        h1_short_ok = (curr['close'] < curr['h1_ema200'] and 
                      curr['h1_rsi14'] <= self.h1_rsi_short_thresh and
                      (curr['close'] - curr['h1_ema200']) / curr['h1_ema200'] < -0.001)
        
        adx_strength_ok = curr['adx14'] >= (self.adx_min_strength * (0.9 if self.aggressive_mode else 1.0))
        adx_rising_ok = True if curr['adx14'] > 25 else (curr['adx14'] >= df.iloc[t-1]['adx14'] - 0.5 if self.aggressive_mode else curr['adx14'] > df.iloc[t-3]['adx14'] if t >= 3 else False)
        
        atr_expansion_ok = True if not self.atr_expansion_required else curr['atr14'] > curr['atr_ma20'] * 0.9
        chop_ok = curr['chop14'] < 65.0

        long_filters_pass = h1_long_ok and adx_strength_ok and adx_rising_ok and atr_expansion_ok and chop_ok
        short_filters_pass = h1_short_ok and adx_strength_ok and adx_rising_ok and atr_expansion_ok and chop_ok

        # --- ENTRY LOGIC (aggressive by default) ---
        bull_cross_idx = bear_cross_idx = -1
        lookback = int(self.n_cross_fresh * 2)
        for i in range(max(1, t - lookback), t + 1):
            if df.iloc[i-1]['ema9'] <= df.iloc[i-1]['ema21'] and df.iloc[i]['ema9'] > df.iloc[i]['ema21']:
                bull_cross_idx = i
            if df.iloc[i-1]['ema9'] >= df.iloc[i-1]['ema21'] and df.iloc[i]['ema9'] < df.iloc[i]['ema21']:
                bear_cross_idx = i
        
        fresh_window = self.n_cross_fresh * (2.0 if self.aggressive_mode else 1.0)
        cross_fresh_long = bull_cross_idx != -1 and (t - bull_cross_idx) < fresh_window
        cross_fresh_short = bear_cross_idx != -1 and (t - bear_cross_idx) < fresh_window
        
        alignment_long = curr['ema9'] > curr['ema21'] and curr['adx14'] > 25
        alignment_short = curr['ema9'] < curr['ema21'] and curr['adx14'] > 25
        
        band_mult = 0.25 if self.aggressive_mode else 0.15
        band = band_mult * curr['atr14']
        pb_long = curr['low'] <= curr['ema21'] + band and curr['close'] >= curr['ema21'] - band
        pb_short = curr['high'] >= curr['ema21'] - band and curr['close'] <= curr['ema21'] + band
        
        mom_mult = 0.10 if self.aggressive_mode else 0.15
        momentum_thresh = mom_mult * curr['atr14']
        mom_long = (curr['close'] - curr['ema21']) > momentum_thresh
        mom_short = (curr['ema21'] - curr['close']) > momentum_thresh
        
        lookback_slice = df.iloc[t - self.bos_lookback : t]
        highest_high = lookback_slice['high'].max()
        lowest_low = lookback_slice['low'].min()
        strength_req = 0.4 if self.aggressive_mode else 0.6
        body_strength = abs(curr['close'] - curr['open']) >= strength_req * (curr['high'] - curr['low'])
        bos_long = curr['close'] > highest_high or (curr['close'] > curr['open'] and curr['close'] > df.iloc[t-1]['high'] and body_strength)
        bos_short = curr['close'] < lowest_low or (curr['close'] < curr['open'] and curr['close'] < df.iloc[t-1]['low'] and body_strength)
        
        turbo_long = self.aggressive_mode and cross_fresh_long and mom_long and adx_strength_ok and atr_expansion_ok
        turbo_short = self.aggressive_mode and cross_fresh_short and mom_short and adx_strength_ok and atr_expansion_ok
        
        # Cooldowns
        bar_cooldown_ok = (t - self.last_signal_idx) >= self.cooldown_bars
        time_cooldown_ok = True
        if self.last_signal_time is not None:
            last_time = self.last_signal_time.to_pydatetime() if hasattr(self.last_signal_time, 'to_pydatetime') else pd.to_datetime(self.last_signal_time)
            time_diff = (current_time - last_time).total_seconds() / 3600
            time_cooldown_ok = time_diff >= self.min_hours_between_trades
        can_trade = bar_cooldown_ok and time_cooldown_ok

        # === ENTRY LOGIC (FIXED) ===
        # Much stricter entry conditions
        if can_trade and long_filters_pass:
            # Only enter if ALL conditions met
            if (cross_fresh_long and pb_long and mom_long and bos_long and 
                curr['adx14'] > 25 and curr['h1_rsi14'] > 60):
                sl_dist = self.sl_atr_mult * curr['atr14']
                risk_amount = 10000 * self.risk_pct
                position_size = self.calculate_position_size(risk_amount, curr['close'], curr['close'] - sl_dist)
                if position_size <= 0.01:
                    return {'action': 'HOLD', 'reason': 'Position size too small'}
                return {
                    'action': 'BUY',
                    'entry': curr['close'],
                    'sl': curr['close'] - sl_dist,
                    'tp': curr['close'] + (self.tp_rr * sl_dist),
                    'size': position_size,
                    'reason': 'PHANTOM NODE LONG (Fixed)',
                    'confluence_score': 9.0,
                    'grade': 'A+',
                    'factors': ['H1 Bull', 'Strong ADX', 'High RSI', 'Fresh Cross', 'Pullback', 'BOS'],
                    'atr': curr['atr14']
                }
                
        if can_trade and short_filters_pass:
            # Only enter if ALL conditions met
            if (cross_fresh_short and pb_short and mom_short and bos_short and 
                curr['adx14'] > 25 and curr['h1_rsi14'] < 40):
                sl_dist = self.sl_atr_mult * curr['atr14']
                risk_amount = 10000 * self.risk_pct
                position_size = self.calculate_position_size(risk_amount, curr['close'], curr['close'] + sl_dist)
                if position_size <= 0.01:
                    return {'action': 'HOLD', 'reason': 'Position size too small'}
                return {
                    'action': 'SELL',
                    'entry': curr['close'],
                    'sl': curr['close'] + sl_dist,
                    'tp': curr['close'] - (self.tp_rr * sl_dist),
                    'size': position_size,
                    'reason': 'PHANTOM NODE SHORT (Fixed)',
                    'confluence_score': 9.0,
                    'grade': 'A+',
                    'factors': ['H1 Bear', 'Strong ADX', 'Low RSI', 'Fresh Cross', 'Pullback', 'BOS'],
                    'atr': curr['atr14']
                }

        # HOLD with diagnostics
        return {
            'action': 'HOLD',
            'reason': 'Filters not met',
            'debug': {
                'adx': float(curr['adx14']),
                'h1_rsi': float(curr['h1_rsi14']),
                'chop': float(curr['chop14']),
                'atr_ratio': float(atr_ratio)
            }
        }