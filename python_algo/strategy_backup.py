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
        # M15 Parameters
        self.ema_fast_len = config.get('ema_fast', 9)
        self.ema_slow_len = config.get('ema_slow', 21)
        self.atr_len = config.get('atr_len', 14)
        self.adx_len = config.get('adx_len', 14)
        self.atr_sma_len = config.get('atr_sma_len', 20)
        
        # H1 Proxy Parameters (on M15 bars)
        self.h1_ema_len = config.get('h1_ema_len', 800)
        self.h1_rsi_len = config.get('h1_rsi_len', 56)
        
        # State tracking for frequency control
        self.last_signal_idx = -1
        self.last_signal_time = None
        self.cooldown_bars = config.get('signal_cooldown', 48) # 12 hours by default
        self.min_hours_between_trades = config.get('min_hours_between_trades', 12)
        
        # User thresholds from config (The "Ops Panel")
        self.h1_rsi_long_thresh = config.get('h1_rsi_long', 55)
        self.h1_rsi_short_thresh = config.get('h1_rsi_short', 45)
        self.adx_min_strength = config.get('adx_min', 22)
        self.atr_expansion_required = config.get('atr_expansion_enabled', True)
        
        # Entry Logic Constants
        self.n_cross_fresh = config.get('n_cross_fresh', 24)
        self.bos_lookback = config.get('bos_lookback', 10)
        
        # Risk Parameters
        self.risk_pct = config.get('risk_per_trade', 0.01)
        self.sl_atr_mult = config.get('atr_multiplier_sl', 2.1)
        self.tp_rr = config.get('rr_ratio', 3.0)
        self.aggressive_mode = config.get('aggressive_mode', False)
        
        # PHANTOM NODE Trailing Stop Parameters
        self.trailing_stop_enabled = config.get('trailing_stop_enabled', True)
        self.trailing_stop_start_rr = config.get('trailing_stop_start_rr', 2.2)
        
        # PHANTOM NODE Time Stop Parameters
        self.time_stop_enabled = config.get('time_stop_enabled', True)
        self.time_stop_hours = config.get('time_stop_hours', 8)
        self.time_stop_min_rr = config.get('time_stop_min_rr', 1.5)

    def is_good_trading_hour(self, dt):
        """Only trade during high probability hours"""
        if isinstance(dt, (int, float)):
            dt = pd.to_datetime(dt, unit='ms')
        hour = dt.hour
        # Trade during London/NY overlap and Asian session
        london_open = 8 <= hour < 16  # 3am-11am EST
        asian_session = 0 <= hour < 6  # 7pm-1am EST
        return london_open or asian_session
        
    def calculate_position_size(self, risk_amount, entry, sl):
        """Calculate position size with proper risk management"""
        if entry == 0 or sl == 0:
            return 0
            
        # Calculate position size in lots (1 lot = 100,000 units)
        risk_pips = abs(entry - sl) * 100  # Convert to pips
        pip_value = 0.88  # USD per pip for 1 standard lot (100,000 units)
        
        if risk_pips == 0:
            return 0
            
        position_size = (risk_amount / risk_pips) / pip_value
        
        # Cap position size to 1 standard lot max
        return min(position_size, 1.0)
        
    def calculate_indicators(self, df):
        df = df.copy()
        # Ensure we have a 'time' column (live data uses 'date')
        if 'date' in df.columns and 'time' not in df.columns:
            df['time'] = df['date']
        elif 'timestamp' in df.columns and 'time' not in df.columns:
            df['time'] = pd.to_datetime(df['timestamp'], unit='ms')
        # M15 EMAs
        df['ema9'] = df['close'].ewm(span=self.ema_fast_len, adjust=False).mean()
        df['ema21'] = df['close'].ewm(span=self.ema_slow_len, adjust=False).mean()
        # Add aliases for compatibility
        df['ema_fast'] = df['ema9']
        df['ema_medium'] = df['ema21']
        
        # H1 Proxy Trend (EMA200 on H1 = EMA800 on M15)
        df['h1_ema200'] = df['close'].ewm(span=self.h1_ema_len, adjust=False).mean()
        # Now set ema_slow alias
        df['ema_slow'] = df['h1_ema200']
        
        # H1 Proxy RSI (RSI14 on H1 = RSI56 on M15)
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=self.h1_rsi_len).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=self.h1_rsi_len).mean()
        rs = gain / (loss + 1e-10)
        df['h1_rsi14'] = 100 - (100 / (1 + rs))
        
        # Standard RSI14 for M15
        delta_m15 = df['close'].diff()
        gain_m15 = (delta_m15.where(delta_m15 > 0, 0)).rolling(window=14).mean()
        loss_m15 = (-delta_m15.where(delta_m15 < 0, 0)).rolling(window=14).mean()
        rs_m15 = gain_m15 / (loss_m15 + 1e-10)
        df['rsi'] = 100 - (100 / (1 + rs_m15))
        
        # ATR 14 & ATR SMA 20
        high_low = df['high'] - df['low']
        high_cp = np.abs(df['high'] - df['close'].shift())
        low_cp = np.abs(df['low'] - df['close'].shift())
        df['tr'] = pd.concat([high_low, high_cp, low_cp], axis=1).max(axis=1)
        df['atr14'] = df['tr'].rolling(window=self.atr_len).mean()
        df['atr_ma20'] = df['atr14'].rolling(window=self.atr_sma_len).mean()
        
        # ADX 14
        df['plus_dm'] = np.where((df['high'] - df['high'].shift() > df['low'].shift() - df['low']) & (df['high'] - df['high'].shift() > 0), df['high'] - df['high'].shift(), 0)
        df['minus_dm'] = np.where((df['low'].shift() - df['low'] > df['high'] - df['high'].shift()) & (df['low'].shift() - df['low'] > 0), df['low'].shift() - df['low'], 0)
        
        tr_sum = df['tr'].rolling(window=self.adx_len).sum()
        plus_di = 100 * (df['plus_dm'].rolling(window=self.adx_len).sum() / (tr_sum + 1e-10))
        minus_di = 100 * (df['minus_dm'].rolling(window=self.adx_len).sum() / (tr_sum + 1e-10))
        dx = (np.abs(plus_di - minus_di) / (plus_di + minus_di + 1e-10)) * 100
        df['adx14'] = dx.rolling(window=self.adx_len).mean()
        df['adx'] = df['adx14']  # Alias for compatibility
        df['+di14'] = plus_di
        df['-di14'] = minus_di
        
        # Choppiness Index (CHOP)
        # 100 * LOG10( SUM(ATR, n) / ( MaxHi(n) - MinLo(n) ) ) / LOG10(n)
        chop_len = 14
        chop_sum_atr = df['tr'].rolling(window=chop_len).sum()
        chop_max_hi = df['high'].rolling(window=chop_len).max()
        chop_min_lo = df['low'].rolling(window=chop_len).min()
        chop_range = chop_max_hi - chop_min_lo
        # Avoid division by zero
        df['chop14'] = 100 * np.log10(chop_sum_atr / (chop_range + 1e-10)) / np.log10(chop_len)
        
        return df

    def calculate_trailing_stop(self, position, current_price, current_atr, entry_price):
        """
        PHANTOM NODE Trailing Stop Logic
        Starts trailing when position reaches 2.2R, uses 2.1x ATR
        """
        if not self.trailing_stop_enabled:
            return position['sl']
        
        # Calculate current R multiple
        if position['action'] == 'BUY':
            current_rr = (current_price - entry_price) / (entry_price - position['sl'])
        else:  # SELL
            current_rr = (entry_price - current_price) / (position['sl'] - entry_price)
        
        # Only start trailing after 2.2R
        if current_rr < self.trailing_stop_start_rr:
            return position['sl']
        
        # Calculate trailing stop distance
        trailing_distance = self.sl_atr_mult * current_atr
        
        if position['action'] == 'BUY':
            new_sl = current_price - trailing_distance
            # Only move stop up, never down
            return max(new_sl, position['sl'])
        else:  # SELL
            new_sl = current_price + trailing_distance
            # Only move stop down, never up
            return min(new_sl, position['sl'])

    def check_time_stop(self, position, entry_time, current_time, entry_price):
        """
        PHANTOM NODE Time Stop Logic
        Soft kill after 8 hours for runners > 1.5R
        """
        if not self.time_stop_enabled:
            return False
        
        # Calculate time elapsed in hours
        if hasattr(entry_time, 'to_pydatetime'):
            entry_dt = entry_time.to_pydatetime()
        else:
            entry_dt = pd.to_datetime(entry_time)
            
        if hasattr(current_time, 'to_pydatetime'):
            current_dt = current_time.to_pydatetime()
        else:
            current_dt = pd.to_datetime(current_time)
            
        time_elapsed = (current_dt - entry_dt).total_seconds() / 3600
        
        # Check if time stop condition is met
        if time_elapsed >= self.time_stop_hours:
            # Calculate current R multiple
            if position['action'] == 'BUY':
                current_price = position.get('current_price', entry_price)
                current_rr = (current_price - entry_price) / (entry_price - position['sl'])
            else:  # SELL
                current_price = position.get('current_price', entry_price)
                current_rr = (entry_price - current_price) / (position['sl'] - entry_price)
            
            # Only apply time stop if we're at least 1.5R in profit
            if current_rr >= self.time_stop_min_rr:
                return True
        
        return False

    def generate_signal(self, df):
        # Directly use the original signal generation
        return self._generate_original_signal(df)
        
    def _generate_original_signal(self, df):
        if len(df) < 400:
            return {'action': 'HOLD', 'reason': f'Need 400 bars, have {len(df)}'}
            
        # Check trading hours with extended window for London/NY overlap
        current_time = df['time'].iloc[-1]
        if isinstance(current_time, (int, float)):
            current_time = pd.to_datetime(current_time, unit='ms')
        if not self.is_good_trading_hour(current_time):
            return {'action': 'HOLD', 'reason': 'Outside trading hours'}
            
        # Enhanced volatility check with dynamic threshold
        current_atr = df['atr14'].iloc[-1]
        atr_ma = df['atr14'].rolling(50).mean().iloc[-1]
        atr_ratio = current_atr / atr_ma
        
        # Dynamic volatility threshold based on market hours
        if isinstance(current_time, (int, float)):
            current_time = pd.to_datetime(current_time, unit='ms')
        hour = current_time.hour
        if 13 <= hour <= 17:  # High volatility hours (London/NY overlap)
            vol_threshold = 0.9
        else:
            vol_threshold = 0.8
            
        if atr_ratio < vol_threshold:
            return {'action': 'HOLD', 'reason': f'Low volatility (ATR ratio: {atr_ratio:.2f} < {vol_threshold})'}

        # Calculate indicators with optimized parameters
        df = self.calculate_indicators(df)
        curr = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else curr
        t = len(df) - 1
        
        # --- ENHANCED REGIME FILTERS ---
        # 1. Check for strong trend using ADX and EMAs
        strong_uptrend = (curr['adx'] > self.adx_min_strength and 
                         curr['ema_fast'] > curr['ema_medium'] > curr['ema_slow'] and
                         curr['ema_fast'] > prev['ema_fast'])
                         
        strong_downtrend = (curr['adx'] > self.adx_min_strength and 
                           curr['ema_fast'] < curr['ema_medium'] < curr['ema_slow'] and
                           curr['ema_fast'] < prev['ema_fast'])
        
        # 2. Check for pullback in trend
        pullback_bullish = (strong_uptrend and 
                           curr['close'] > curr['ema_medium'] and 
                           curr['rsi'] < self.h1_rsi_long_thresh)
                           
        pullback_bearish = (strong_downtrend and 
                           curr['close'] < curr['ema_medium'] and 
                           curr['rsi'] > self.h1_rsi_short_thresh)
        
        # 3. Volume confirmation
        volume_ma = df['volume'].rolling(20).mean().iloc[-1]
        volume_confirmation = curr['volume'] > volume_ma * 1.2
        
        # 4. Price action confirmation
        bullish_engulfing = (curr['close'] > curr['open'] and 
                            prev['close'] < prev['open'] and
                            curr['open'] < prev['close'] and 
                            curr['close'] > prev['open'])
                            
        bearish_engulfing = (curr['close'] < curr['open'] and 
                             prev['close'] > prev['open'] and
                             curr['open'] > prev['close'] and 
                             curr['close'] < prev['open'])
        
        # --- SIGNAL GENERATION ---
        # Dynamic damping based on market volatility
        vol_ratio = current_atr / atr_ma
        vol_adjusted_damp = max(0.85, min(1.0, 1.1 - (vol_ratio * 0.2)))  # More aggressive in high vol
        damper = vol_adjusted_damp if self.aggressive_mode else 1.0
        
        # A) Enhanced Trend Analysis with Multiple Timeframes
        # H1 Trend Alignment
        h1_ema_dist = (curr['close'] - curr['h1_ema200']) / curr['h1_ema200']
        h1_trend_strength = abs(curr['h1_rsi14'] - 50) / 50  # 0 to 1 scale
        
        h1_long_ok = (curr['close'] > curr['h1_ema200'] and 
                     curr['h1_rsi14'] >= (self.h1_rsi_long_thresh * damper) and
                     h1_ema_dist > 0.001)  # Ensure price is sufficiently above EMA
                     
        h1_short_ok = (curr['close'] < curr['h1_ema200'] and 
                      curr['h1_rsi14'] <= (self.h1_rsi_short_thresh / damper) and
                      h1_ema_dist < -0.001)  # Ensure price is sufficiently below EMA
        
        # B) Enhanced ADX Analysis with Trend Confirmation
        adx_rising = curr['adx14'] > df['adx14'].iloc[-5:-1].mean()  # ADX rising
        adx_strength_ok = (curr['adx14'] >= (self.adx_min_strength * damper) and 
                          ((curr['+di14'] > curr['-di14'] and h1_long_ok) or 
                           (curr['-di14'] > curr['+di14'] and h1_short_ok)))
        
        # C) Price Action Confirmation
        body_size = abs(curr['close'] - curr['open'])
        upper_wick = curr['high'] - max(curr['open'], curr['close'])
        lower_wick = min(curr['open'], curr['close']) - curr['low']
        
        # Strong bullish candle: small/no upper wick, large body, small lower wick
        strong_bullish = (curr['close'] > curr['open'] and 
                         body_size > (upper_wick * 2) and 
                         body_size > (lower_wick * 3) and
                         body_size > (current_atr * 0.5))
                         
        # Strong bearish candle: small/no lower wick, large body, small upper wick
        strong_bearish = (curr['close'] < curr['open'] and 
                         body_size > (lower_wick * 2) and 
                         body_size > (upper_wick * 3) and
                         body_size > (current_atr * 0.5))
        
        # D) Volume Analysis
        volume_confirmation = curr['volume'] > (volume_ma * 1.3)  # Stronger volume requirement
        
        # E) Time-based Filters
        if isinstance(current_time, (int, float)):
            current_time = pd.to_datetime(current_time, unit='ms')
        current_hour = current_time.hour
        london_session = 7 <= current_hour <= 16  # 7 AM to 4 PM UTC
        ny_session = 12 <= current_hour <= 21    # 12 PM to 9 PM UTC
        overlap_session = 12 <= current_hour <= 16  # London/NY overlap
        
        # Adjust risk parameters based on session
        if overlap_session:
            position_size_multiplier = 1.2
            rr_ratio = self.tp_rr * 1.1  # Slightly better RR in high liquidity
        elif london_session or ny_session:
            position_size_multiplier = 1.0
            rr_ratio = self.tp_rr
        else:
            position_size_multiplier = 0.8  # Reduce size in off-hours
            rr_ratio = self.tp_rr * 1.2    # Require better RR in low liquidity
        
        # --- TRADE EXECUTION LOGIC ---
        sl_atr_mult = self.sl_atr_mult * (0.9 if overlap_session else 1.0)  # Tighter stops in overlap
        
        # Calculate risk per trade based on recent performance
        risk_multiplier = 1.0
        if hasattr(self, 'last_trade_pnl'):
            # Scale risk based on recent performance
            if self.last_trade_pnl > 0:
                risk_multiplier = min(1.2, 1.0 + (self.last_trade_pnl * 0.5))  # Increase risk after wins
            else:
                risk_multiplier = max(0.8, 1.0 + (self.last_trade_pnl * 0.2))  # Decrease risk after losses
        
        # Final position sizing
        position_size = self.risk_pct * position_size_multiplier * risk_multiplier
        position_size = min(0.05, max(0.01, position_size))  # Keep within 1-5% risk range
        
        # Rising over last 3 candles: ADX(t) > ADX(t-3)
        # RELAXATION: If ADX is already strong (> 25), we don't need it to be rising.
        if curr['adx14'] > 25:
             adx_rising_ok = True
        elif t >= 3:
            # If aggressive, we only care that it's not falling sharply
            if self.aggressive_mode:
                adx_rising_ok = curr['adx14'] >= df.iloc[t-1]['adx14'] - 0.5
            else:
                adx_rising_ok = curr['adx14'] > df.iloc[t-3]['adx14']
        else:
             adx_rising_ok = False
            
        # C) ATR Expansion
        if self.atr_expansion_required:
            atr_expansion_ok = curr['atr14'] > curr['atr_ma20'] * damper
        else:
            atr_expansion_ok = True
            
        # D) Chop Filter (Optimization 2026)
        # CHOP > 61.8 = Consolidation (Do not trade)
        # CHOP < 38.2 = Strong Trend
        # We require CHOP < 62 to filter pure chop, or < 50 for aggressive high-quality entries
        chop_ok = curr['chop14'] < 62.0
        
        # Store for telemetry/diagnostics
        long_filters_pass = h1_long_ok and adx_strength_ok and adx_rising_ok and atr_expansion_ok and chop_ok
        short_filters_pass = h1_short_ok and adx_strength_ok and adx_rising_ok and atr_expansion_ok and chop_ok
        
        filters = {
            'h1_trend': 'BULL' if h1_long_ok else 'BEAR' if h1_short_ok else 'NEUTRAL',
            'adx_ok': adx_strength_ok and adx_rising_ok,
            'atr_expansion': atr_expansion_ok,
            'chop_ok': chop_ok
        }

        # --- ENTRY LOGIC ---
        # 1) EMA Cross Freshness
        bull_cross_idx = -1
        bear_cross_idx = -1
        
        # Increase lookback to match fresh_window (max 100)
        lookback = int(self.n_cross_fresh * 2) 
        for i in range(max(1, t - lookback), t + 1):
            prev_ema9 = df.iloc[i-1]['ema9']
            prev_ema21 = df.iloc[i-1]['ema21']
            curr_ema9 = df.iloc[i]['ema9']
            curr_ema21 = df.iloc[i]['ema21']
            
            if prev_ema9 <= prev_ema21 and curr_ema9 > curr_ema21:
                bull_cross_idx = i
            if prev_ema9 >= prev_ema21 and curr_ema9 < curr_ema21:
                bear_cross_idx = i
        
        # If aggressive, we extend the freshness window significantly
        # Standard: 24 bars (6 hours), Aggressive: 48 bars (12 hours)
        fresh_window = self.n_cross_fresh * (2.0 if self.aggressive_mode else 1.0)
        cross_fresh_long = bull_cross_idx != -1 and (t - bull_cross_idx) < fresh_window
        cross_fresh_short = bear_cross_idx != -1 and (t - bear_cross_idx) < fresh_window
        
        # FALLBACK: EMA Alignment (If trend is strong, we don't need a fresh cross)
        # If ADX > 30 and EMAs are aligned for > 20 bars, we consider it "Fresh enough"
        alignment_long = curr['ema9'] > curr['ema21'] and adx_strength_ok and curr['adx14'] > 25
        alignment_short = curr['ema9'] < curr['ema21'] and adx_strength_ok and curr['adx14'] > 25

        setup_long = cross_fresh_long or alignment_long
        setup_short = cross_fresh_short or alignment_short

        # 2) Pullback to EMA21 Zone
        # Aggressive mode allows a slightly wider pullback band
        band_mult = 0.25 if self.aggressive_mode else 0.15
        band = band_mult * curr['atr14']
        pb_long = curr['low'] <= curr['ema21'] + band and curr['close'] >= curr['ema21'] - band
        pb_short = curr['high'] >= curr['ema21'] - band and curr['close'] <= curr['ema21'] + band
        
        # 3) Momentum Gate
        mom_mult = 0.10 if self.aggressive_mode else 0.15
        momentum_thresh = mom_mult * curr['atr14']
        mom_long = (curr['close'] - curr['ema21']) > momentum_thresh
        mom_short = (curr['ema21'] - curr['close']) > momentum_thresh
        
        # 4) BOS Confirmation (Trigger)
        lookback_slice = df.iloc[t - self.bos_lookback : t]
        highest_high = lookback_slice['high'].max()
        lowest_low = lookback_slice['low'].min()
        
        # Aggressive mode loosens body strength requirement
        strength_req = 0.4 if self.aggressive_mode else 0.6
        body_strength = abs(curr['close'] - curr['open']) >= strength_req * (curr['high'] - curr['low'])
        
        bos_long = curr['close'] > highest_high or (curr['close'] > curr['open'] and curr['close'] > df.iloc[t-1]['high'] and body_strength)
        bos_short = curr['close'] < lowest_low or (curr['close'] < curr['open'] and curr['close'] < df.iloc[t-1]['low'] and body_strength)
        
        # --- TRANSPARENCY: Calculate Raw Confluence regardless of filters ---
        raw_long_conf = 0
        if h1_long_ok: raw_long_conf += 1
        if adx_strength_ok: raw_long_conf += 1
        if adx_rising_ok: raw_long_conf += 1
        if atr_expansion_ok: raw_long_conf += 1
        if cross_fresh_long: raw_long_conf += 1
        if pb_long: raw_long_conf += 1
        if mom_long: raw_long_conf += 1
        if bos_long: raw_long_conf += 1

        raw_short_conf = 0
        if h1_short_ok: raw_short_conf += 1
        if adx_strength_ok: raw_short_conf += 1
        if adx_rising_ok: raw_short_conf += 1
        if atr_expansion_ok: raw_short_conf += 1
        if cross_fresh_short: raw_short_conf += 1
        if pb_short: raw_short_conf += 1
        if mom_short: raw_short_conf += 1
        if bos_short: raw_short_conf += 1

        # 5) Turbo Entry Gate (Target: 1-3 trades/day)
        # Narrower window + requires Volume & ADX to pass
        turbo_long = self.aggressive_mode and cross_fresh_long and mom_long and adx_strength_ok and atr_expansion_ok
        turbo_short = self.aggressive_mode and cross_fresh_short and mom_short and adx_strength_ok and atr_expansion_ok

        # Final Quant Decision - Must pass Regime Filters (H1 Trend)
        current_time = df.iloc[-1]['date'] if hasattr(df.iloc[-1]['date'], 'to_pydatetime') else pd.to_datetime(df.iloc[-1]['date'])
        
        # Check bar-based cooldown
        bar_cooldown_ok = (t - self.last_signal_idx) >= self.cooldown_bars
        
        # Check time-based cooldown (12 hours minimum between trades)
        time_cooldown_ok = True
        if self.last_signal_time is not None:
            if hasattr(self.last_signal_time, 'to_pydatetime'):
                last_time = self.last_signal_time.to_pydatetime()
            else:
                last_time = pd.to_datetime(self.last_signal_time)
            time_diff = (current_time - last_time).total_seconds() / 3600
            time_cooldown_ok = time_diff >= self.min_hours_between_trades
        
        can_trade = bar_cooldown_ok and time_cooldown_ok

        if can_trade and long_filters_pass and ((cross_fresh_long and pb_long and mom_long and bos_long) or turbo_long):
            self.last_signal_idx = t
            self.last_signal_time = current_time
            sl_dist = self.sl_atr_mult * curr['atr14']
            
            # PHANTOM NODE Enhanced Signal
            # Calculate position size
            risk_amount = 10000 * self.risk_pct  # 1% of $10,000 account
            position_size = self.calculate_position_size(
                risk_amount, 
                curr['close'], 
                curr['close'] - sl_dist
            )
            
            if position_size <= 0.01:  # Minimum 0.01 lots
                return {'action': 'HOLD', 'reason': 'Position size too small'}
                
            signal = {
                'action': 'BUY',
                'entry': curr['close'],
                'sl': curr['close'] - sl_dist,
                'tp': curr['close'] + (self.tp_rr * sl_dist),
                'size': position_size,
                'reason': 'PHANTOM NODE LONG: H1 Bull + ADX + ATR + Cross + PB + BOS',
                'confluence_score': float(raw_long_conf),
                'grade': 'A',
                'factors': ['H1 Trend', 'ADX Strength', 'ATR Exp', 'EMA Cross', 'Pullback', 'BOS trigger'],
                'atr': curr['atr14'],
                'phantom_node': {
                    'trailing_stop': {
                        'enabled': self.trailing_stop_enabled,
                        'start_rr': self.trailing_stop_start_rr,
                        'atr_multiplier': self.sl_atr_mult
                    },
                    'time_stop': {
                        'enabled': self.time_stop_enabled,
                        'hours': self.time_stop_hours,
                        'min_rr': self.time_stop_min_rr
                    }
                }
            }
            return signal
            
        if can_trade and (short_filters_pass and ((cross_fresh_short and pb_short and mom_short and bos_short) or turbo_short)):
            self.last_signal_idx = t
            self.last_signal_time = current_time
            sl_dist = self.sl_atr_mult * curr['atr14']
            
            # PHANTOM NODE Enhanced Signal
            # Calculate position size
            risk_amount = 10000 * self.risk_pct  # 1% of $10,000 account
            position_size = self.calculate_position_size(
                risk_amount, 
                curr['close'], 
                curr['close'] + sl_dist
            )
            
            if position_size <= 0.01:  # Minimum 0.01 lots
                return {'action': 'HOLD', 'reason': 'Position size too small'}
                
            signal = {
                'action': 'SELL',
                'entry': curr['close'],
                'sl': curr['close'] + sl_dist,
                'tp': curr['close'] - (self.tp_rr * sl_dist),
                'size': position_size,
                'reason': 'PHANTOM NODE SHORT: H1 Bear + ADX + ATR + Cross + PB + BOS',
                'confluence_score': float(raw_short_conf),
                'grade': 'A',
                'factors': ['H1 Trend', 'ADX Strength', 'ATR Exp', 'EMA Cross', 'Pullback', 'BOS trigger'],
                'atr': curr['atr14'],
                'phantom_node': {
                    'trailing_stop': {
                        'enabled': self.trailing_stop_enabled,
                        'start_rr': self.trailing_stop_start_rr,
                        'atr_multiplier': self.sl_atr_mult
                    },
                    'time_stop': {
                        'enabled': self.time_stop_enabled,
                        'hours': self.time_stop_hours,
                        'min_rr': self.time_stop_min_rr
                    }
                }
            }
            return signal
            
        # No trade, provide granular Quant diagnostics
        reasons = []
        if not (h1_long_ok or h1_short_ok): reasons.append("H1 Filtr")
        elif not (adx_strength_ok and adx_rising_ok): reasons.append("ADX Wait")
        elif not atr_expansion_ok: reasons.append("Vol Gap")
        elif not (cross_fresh_long or cross_fresh_short): reasons.append("EMA Setup")
        elif not (pb_long or pb_short): reasons.append("No PB")
        elif not (mom_long or mom_short): reasons.append("Low Mom")
        elif not (bos_long or bos_short): reasons.append("Wait BOS")
        
        return {
            'action': 'HOLD',
            'reason': f"QUANT: {', '.join(reasons[:2])}" if reasons else "Quant: Neutral",
            'long_score': float(raw_long_conf),
            'short_score': float(raw_short_conf),
            'debug_reasons': reasons,
            'factors': [
                f"H1 Trend: {'OK' if h1_long_ok or h1_short_ok else 'FAIL'}",
                f"ADX: {'OK' if adx_strength_ok else 'LOW'}",
                f"Vol: {'OK' if atr_expansion_ok else 'LOW'}"
            ],
            'debug': {
                'adx': float(curr['adx14']),
                'h1_rsi': float(curr['h1_rsi14']),
                'atr_ratio': float(curr['atr14'] / (curr['atr_ma20'] + 1e-10))
            }
        }
