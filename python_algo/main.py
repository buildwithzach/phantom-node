import time
import json
import pandas as pd
import numpy as np
import requests
import os
import logging
import datetime
import sys
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALGO_ROOT = os.path.join(PROJECT_ROOT, 'python_algo')
if ALGO_ROOT not in sys.path:
    sys.path.append(ALGO_ROOT)

from strategy_v10 import PhantomNodeV10
from macro_bias import get_bias_engine, MacroBiasEngine

STATUS_PATH = os.path.join(PROJECT_ROOT, '.algo-status.json')
CONFIG_PATH = os.path.join(ALGO_ROOT, 'config.json')
LOG_PATH = os.path.join(ALGO_ROOT, 'algo.log')

# Setup logging to both file and console with local timezone
import datetime
import pytz

class LocalTimeFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.datetime.fromtimestamp(record.created, tz=pytz.utc)
        local_tz = datetime.datetime.now(datetime.timezone.utc).astimezone().tzinfo
        local_dt = dt.astimezone(local_tz)
        if datefmt:
            return local_dt.strftime(datefmt)
        return local_dt.strftime('%Y-%m-%d %H:%M:%S')

# Create formatter with local time
formatter = LocalTimeFormatter(
    fmt='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S %Z%z'
)

# Configure root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Remove any existing handlers
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

# Add file handler
file_handler = logging.FileHandler(LOG_PATH)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

# Add console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)
logger = logging.getLogger('AlgoRunner')

def load_config():
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading config: {e}")
    return {}

def load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"').strip("'")

load_env()

def write_status(
    running=True,
    last_scan=None,
    last_signal=None,
    error=None,
    circuit_breaker_tripped=False,
    circuit_breaker_date=None,
    daily_pnl=None,
    macro_bias=None,
    telemetry=None
):
    try:
        last_scan_str = None
        if last_scan:
            s = last_scan.isoformat()
            last_scan_str = f"{s}Z" if "Z" not in s and "+" not in s else s
        
        payload = {
            "running": running,
            "lastScan": last_scan_str,
            "heartbeat": datetime.datetime.utcnow().isoformat() + "Z",
            "lastSignal": last_signal,
            "error": str(error) if error else None,
            "circuitBreakerTripped": circuit_breaker_tripped,
            "circuitBreakerDate": circuit_breaker_date,
            "dailyPnl": round(daily_pnl, 2) if daily_pnl is not None else None,
            "macroBias": macro_bias,
            "telemetry": telemetry or {}
        }
        with open(STATUS_PATH, "w") as f:
            json.dump(payload, f, indent=2)
    except Exception as e:
        logger.error(f"Status write error: {e}")

OANDA_API_KEY = os.getenv('NEXT_PUBLIC_OANDA_API_KEY')
OANDA_ACCOUNT_ID = os.getenv('NEXT_PUBLIC_OANDA_ACCOUNT_ID')
OANDA_ENV = os.getenv('NEXT_PUBLIC_OANDA_ENVIRONMENT', 'practice')
WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '') # Optional

OANDA_URL = "https://api-fxtrade.oanda.com/v3" if OANDA_ENV == 'live' else "https://api-fxpractice.oanda.com/v3"

# Default config (overridden by load_config)
MAX_DAILY_LOSS_USD = 1000.0
RISK_PER_TRADE = 0.01
QUANT_ACTIVE = True

def calc_units_usdjpy(balance: float, risk_pct: float, entry: float, sl: float, action: str) -> int:
    """Position size in OANDA units for USD/JPY. Risk = risk_pct * balance."""
    sl_dist = abs(entry - sl)
    if sl_dist <= 0:
        return 0
    risk_amount = balance * risk_pct
    # USD/JPY: dollar risk = sl_dist * units / entry => units = risk_amount * entry / sl_dist
    raw = risk_amount * entry / sl_dist
    
    # Dynamic position sizing limits
    # Max units adjusted for small accounts (1000-5000 range)
    max_units_by_balance = min(100_000, int(balance * 20))  # Max 20x balance leverage
    max_units_by_risk = min(50_000, int(risk_amount * 1000))   # Loosened cap for small accounts
    
    units = max(1, min(max_units_by_balance, max_units_by_risk, int(round(raw))))
    return units if action == "BUY" else -units

class OandaBroker:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {OANDA_API_KEY}",
            "Content-Type": "application/json"
        }

    def log_alert(self, message):
        logger.info(message)
        if WEBHOOK_URL:
            try:
                requests.post(WEBHOOK_URL, json={"content": f"🚀 **Sniper Elite v23**: {message}"})
            except Exception as e:
                logger.error(f"Webhook Error: {e}")

    def fetch_candles(self, instrument, granularity="M15", count=1000):
        url = f"{OANDA_URL}/instruments/{instrument}/candles"
        params = {"granularity": granularity, "count": count, "price": "M"}
        
        for attempt in range(3):
            try:
                res = requests.get(url, headers=self.headers, params=params, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    candles = []
                    for c in data['candles']:
                        if not c['complete']: continue
                        candles.append({
                            'date': pd.to_datetime(c['time']),
                            'open': float(c['mid']['o']),
                            'high': float(c['mid']['h']),
                            'low': float(c['mid']['l']),
                            'close': float(c['mid']['c']),
                            'volume': int(c['volume'])
                        })
                    return pd.DataFrame(candles)
                elif res.status_code == 429:
                    logger.warning(f"OANDA Rate Limit (429) hit for {instrument}. Retrying in 2s...")
                    time.sleep(2)
                else:
                    logger.error(f"Error fetching candles for {instrument}: {res.status_code} - {res.text[:100]}")
                    time.sleep(0.5)
            except Exception as e:
                logger.error(f"Request Exception for {instrument}: {e}")
                time.sleep(0.5)
                
        return pd.DataFrame()

    def get_account_summary(self):
        """Fetch balance etc. for daily PnL and circuit breaker."""
        url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/summary"
        res = requests.get(url, headers=self.headers)
        if res.status_code != 200:
            return None
        acc = res.json().get("account", {})
        return {
            "balance": float(acc.get("balance", 0)),
            "pl": float(acc.get("pl", 0)),
            "unrealizedPL": float(acc.get("unrealizedPL", 0)),
        }

    def get_open_trades(self):
        url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/openTrades"
        res = requests.get(url, headers=self.headers)
        if res.status_code != 200:
            return []
        return res.json().get('trades', [])

    def execute_order(self, instrument, units, sl_price, tp_price):
        url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/orders"
        data = {
            "order": {
                "units": str(units),
                "instrument": instrument,
                "timeInForce": "FOK",
                "type": "MARKET",
                "positionFill": "DEFAULT",
                "stopLossOnFill": {"price": f"{sl_price:.3f}"},
                "takeProfitOnFill": {"price": f"{tp_price:.3f}"}
            }
        }
        res = requests.post(url, headers=self.headers, json=data)
        if res.status_code == 201:
            self.log_alert(f"LIVE ORDER EXECUTED: {instrument} | Units: {units} | SL: {sl_price:.3f} | TP: {tp_price:.3f}")
            return res.json()
        else:
            self.log_alert(f"ORDER FAILED: {res.text}")
            return None

    def close_trade(self, trade_id):
        url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/trades/{trade_id}/close"
        res = requests.put(url, headers=self.headers)
        return res.status_code == 200

    def update_sl(self, trade_id, new_sl):
        url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/trades/{trade_id}/orders"
        data = {
            "stopLoss": {
                "timeInForce": "GTC",
                "price": f"{new_sl:.3f}"
            }
        }
        try:
            res = requests.put(url, headers=self.headers, json=data, timeout=10)
            if res.status_code in [200, 201]:
                logger.info(f"SUCCESS: SL for trade {trade_id} updated to {new_sl:.3f}")
                return True
            else:
                logger.error(f"FAILED to update SL for trade {trade_id}: {res.status_code} - {res.text}")
                return False
        except Exception as e:
            logger.error(f"SL Update Exception: {e}")
            return False
        return False

class PerformanceTracker:
    def __init__(self, broker, risk_manager=None):
        self.broker = broker
        self.risk_manager = risk_manager  # NEW: Link to adaptive risk manager
        self.consecutive_losses = 0
        self.daily_losses = 0
        self.last_check = datetime.datetime.utcnow()
        self.risk_reduction_active = False

    def update_streak(self):
        """Analyze recent transactions to determine current streak."""
        try:
            url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/transactions?count=20"
            res = requests.get(url, headers=self.broker.headers)
            if res.status_code != 200: return
            
            txs = res.json().get('transactions', [])
            losses = 0
            daily_loss_count = 0
            today = datetime.datetime.utcnow().date()
            
            # Get current account balance for risk manager
            account = self.broker.get_account_summary()
            current_balance = account["balance"] if account else 0
            
            for tx in txs:
                if tx['type'] == 'ORDER_FILL':
                    pl = float(tx.get('pl', 0))
                    tx_date = pd.to_datetime(tx['time']).date()
                    
                    # Update AdaptiveRiskManager with trade results
                    if self.risk_manager and pl != 0:
                        trade_result = 'LOSS' if pl < 0 else 'WIN'
                        self.risk_manager.update_performance(trade_result, pl, current_balance)
                    
                    if pl < 0:
                        losses += 1
                        if tx_date == today:
                            daily_loss_count += 1
                    elif pl > 0:
                        break # Streak broken by a win
                        
            self.consecutive_losses = losses
            self.daily_losses = daily_loss_count
            
            # Auto risk reduction after 2+ consecutive losses
            if losses >= 2:
                self.risk_reduction_active = True
                logger.warning(f"DEFENSIVE MODE: {losses} consecutive losses. Risk reduced by 50%.")
            else:
                self.risk_reduction_active = False
                
        except Exception as e:
            logger.error(f"Streak Update Error: {e}")

    def get_risk_multiplier(self):
        if self.consecutive_losses >= 3: return 0.25 # Aggressive throttle
        if self.consecutive_losses >= 2: return 0.5  # Standard throttle
        if self.risk_reduction_active: return 0.75  # Auto reduction
        return 1.0

    def get_threshold_adj(self):
        if self.consecutive_losses >= 2: return 1.0 # Raise threshold significantly
        if self.risk_reduction_active: return 0.5   # Moderate threshold increase
        return 0.0

class AdaptiveRiskManager:
    def __init__(self, broker):
        self.broker = broker
        # Performance tracking
        self.recent_trades = []  # Last 20 trades
        self.consecutive_losses = 0
        self.consecutive_wins = 0
        self.daily_pnl = 0.0
        self.max_drawdown = 0.0
        self.account_peak = 0.0
        
        # Adaptive thresholds
        self.base_cooldown = 5  # minutes
        self.max_cooldown = 60  # minutes
        self.loss_threshold = 0.02  # 2% account loss trigger
        self.consecutive_loss_limit = 3
        
        # State tracking
        self.last_trade_time = {}  # direction -> timestamp
        self.adaptive_cooldowns = {}  # direction -> minutes
        self.lockout_reasons = {}  # direction -> reason
        
    def update_performance(self, trade_result, pnl, account_balance):
        """Update performance metrics after each trade"""
        self.recent_trades.append({
            'result': trade_result,
            'pnl': pnl,
            'timestamp': datetime.datetime.utcnow(),
            'account_balance': account_balance
        })
        
        # Keep only last 20 trades
        if len(self.recent_trades) > 20:
            self.recent_trades = self.recent_trades[-20:]
        
        # Update consecutive counters
        if trade_result == 'LOSS':
            self.consecutive_losses += 1
            self.consecutive_wins = 0
        elif trade_result == 'WIN':
            self.consecutive_wins += 1
            self.consecutive_losses = 0
            
        # Update account metrics
        self.daily_pnl += pnl
        if account_balance > self.account_peak:
            self.account_peak = account_balance
        current_drawdown = (self.account_peak - account_balance) / self.account_peak
        self.max_drawdown = max(self.max_drawdown, current_drawdown)
        
    def calculate_win_rate(self, window=10):
        """Calculate win rate over last N trades"""
        if len(self.recent_trades) < window:
            window = len(self.recent_trades)
        if window == 0:
            return 0.5
            
        recent = self.recent_trades[-window:]
        wins = sum(1 for t in recent if t['result'] == 'WIN')
        return wins / window
        
    def calculate_avg_win_loss_ratio(self):
        """Calculate average win to loss ratio"""
        wins = [t['pnl'] for t in self.recent_trades if t['result'] == 'WIN']
        losses = [abs(t['pnl']) for t in self.recent_trades if t['result'] == 'LOSS']
        
        if not wins or not losses:
            return 1.0
        avg_win = sum(wins) / len(wins)
        avg_loss = sum(losses) / len(losses)
        return avg_win / avg_loss if avg_loss > 0 else 1.0
        
    def should_adapt_cooldown(self, direction):
        """Determine if cooldown should be adapted based on performance"""
        current_cooldown = self.adaptive_cooldowns.get(direction, self.base_cooldown)
        
        # Factors that increase cooldown
        factors = []
        
        # Consecutive losses
        if self.consecutive_losses >= 3:
            factors.append(2.0)  # Double cooldown
        elif self.consecutive_losses >= 2:
            factors.append(1.5)  # 50% increase
            
        # High drawdown
        if self.max_drawdown > 0.05:  # 5% drawdown
            factors.append(1.5)
        elif self.max_drawdown > 0.03:  # 3% drawdown
            factors.append(1.3)
            
        # Low win rate
        win_rate = self.calculate_win_rate()
        if win_rate < 0.3:  # Below 30%
            factors.append(1.4)
        elif win_rate < 0.4:  # Below 40%
            factors.append(1.2)
            
        # Poor win/loss ratio
        if self.calculate_avg_win_loss_ratio() < 1.0:
            factors.append(1.3)
            
        # Recent volatility (if losing rapidly)
        if len(self.recent_trades) >= 5:
            recent = self.recent_trades[-5:]
            losses = sum(1 for t in recent if t['result'] == 'LOSS')
            if losses >= 4:  # 4+ losses in last 5 trades
                factors.append(2.0)
                
        # Calculate adaptive cooldown
        multiplier = max(factors) if factors else 1.0
        new_cooldown = min(current_cooldown * multiplier, self.max_cooldown)
        
        # Factors that decrease cooldown (good performance)
        if self.consecutive_wins >= 3:
            new_cooldown = max(new_cooldown * 0.7, self.base_cooldown)  # Reduce but not below base
        elif win_rate > 0.6 and self.calculate_avg_win_loss_ratio() > 1.5:
            new_cooldown = max(new_cooldown * 0.8, self.base_cooldown)
            
        self.adaptive_cooldowns[direction] = new_cooldown
        return new_cooldown
        
    def is_locked_out(self, direction, account_balance=None):
        """Smart lockout detection based on adaptive risk management"""
        
        # Emergency account protection
        if account_balance:
            if self.account_peak > 0:
                current_drawdown = (self.account_peak - account_balance) / self.account_peak
                if current_drawdown > self.loss_threshold:  # 2% loss
                    return True, f"EMERGENCY: Account drawdown {current_drawdown*100:.1f}% exceeds limit"
                    
        # Consecutive loss protection
        if self.consecutive_losses >= self.consecutive_loss_limit:
            return True, f"PROTECTION: {self.consecutive_losses} consecutive losses"
            
        # Adaptive cooldown check
        last_trade = self.last_trade_time.get(direction)
        if last_trade:
            cooldown_minutes = self.should_adapt_cooldown(direction)
            time_since_last = (datetime.datetime.utcnow() - last_trade).total_seconds() / 60
            if time_since_last < cooldown_minutes:
                remaining = cooldown_minutes - time_since_last
                reason = f"Adaptive cooldown: {remaining:.1f}min (win rate: {self.calculate_win_rate():.1%})"
                return True, reason
                
        return False, ""
        
    def register_trade(self, direction):
        """Register new trade and update timing"""
        self.last_trade_time[direction] = datetime.datetime.utcnow()
        
    def get_status(self):
        """Get current risk management status"""
        return {
            'consecutive_losses': self.consecutive_losses,
            'consecutive_wins': self.consecutive_wins,
            'win_rate': self.calculate_win_rate(),
            'win_loss_ratio': self.calculate_avg_win_loss_ratio(),
            'max_drawdown': self.max_drawdown,
            'daily_pnl': self.daily_pnl,
            'adaptive_cooldowns': self.adaptive_cooldowns,
            'recent_trades_count': len(self.recent_trades)
        }

class PositionManager:
    def __init__(self, broker):
        self.broker = broker
        # State for trailing management
        self.trail_active = {} # trade_id -> bool
        self.first_touch_2_2r = {} # trade_id -> timestamp
        # State for trade limits
        self.trades_today = 0
        self.last_reset_date = datetime.datetime.utcnow().date()
        self.lockouts = {} # direction -> datetime
        self.last_trade_time = {} # direction -> timestamp

    def _update_limits(self):
        today = datetime.datetime.utcnow().date()
        if today > self.last_reset_date:
            self.trades_today = 0
            self.last_reset_date = today

    def is_locked_out(self, direction):
        self._update_limits()
        
        # Add cooldown between trades in the same direction (5 minutes)
        last_trade = self.last_trade_time.get(direction)
        if last_trade:
            time_since_last = (datetime.datetime.utcnow() - last_trade).total_seconds() / 60  # in minutes
            if time_since_last < 5:  # 5-minute cooldown between same-direction trades
                remaining = 5 - time_since_last
                return True, f"{direction} cooldown: {remaining:.1f} minutes remaining"
        
        return False, ""

    def register_trade(self, direction):
        self.trades_today += 1
        self.last_trade_time[direction] = datetime.datetime.utcnow()

    def sync_and_manage(self, instrument, current_candle):
        """v23 Sticky Exits: 1:3 RR, 2.2R Trailing (1-bar delay), 4h/8h Time Stops."""
        trades = self.broker.get_open_trades()
        now_utc = datetime.datetime.utcnow()
        
        for t in trades:
            if t['instrument'] != instrument: continue
            
            trade_id = t['id']
            entry_price = float(t['price'])
            units = float(t['currentUnits'])
            direction = "BUY" if units > 0 else "SELL"
            current_sl = float(t.get('stopLossOrder', {}).get('price', 0))
            
            # SL distance for R calculation (Use atr from current candle)
            atr = current_candle.get('atr', 0.02)
            # Match the strategy's risk profile (usually 3.5 ATR)
            strategy_multiplier = self.broker.config.get('atr_multiplier_sl', 3.5)
            one_r = strategy_multiplier * atr
            
            profit = (current_candle['close'] - entry_price) if direction == "BUY" else (entry_price - current_candle['close'])
            current_r = profit / one_r if one_r > 0 else 0
            
            open_time = pd.to_datetime(t['openTime']).replace(tzinfo=None)
            time_in_trade = (now_utc - open_time).total_seconds() / 3600
            
            # 1. TIME STOPS (v23 Logic)
            # 4h Soft Kill
            if 4.0 <= time_in_trade < 8.0:
                if current_r < 1.0:
                    if abs(current_r) < 0.2: # Only kill truly flat trades (-0.2R to +0.2R)
                        self.broker.close_trade(trade_id)
                        self.broker.log_alert(f"4h FLAT KILL: R={current_r:.1f}. Closed {trade_id}")
                        continue
            
            # 8h Hard Kill (with Runner mode)
            if time_in_trade >= 8.0:
                if current_r < 1.5:
                    self.broker.close_trade(trade_id)
                    self.broker.log_alert(f"8h HARD KILL: R={current_r:.1f}. Closed {trade_id}")
                    continue
                else:
                    # Runner mode: Allow to continue
                    pass

            # 2. SMART TRAILING v25.0 (Multi-Stage ROI Protection)
            profit_pips = profit * 100.0
            
            # STAGE 1: THE FLOOR (Guarantees Green ROI)
            # As soon as we are +5 pips in profit, move SL to Entry + 0.5 pips.
            if profit_pips >= 5.0:
                roi_protect_price = entry_price + (0.005 if direction == "BUY" else -0.005)
                if (direction == "BUY" and current_sl < roi_protect_price) or (direction == "SELL" and (current_sl == 0 or current_sl > roi_protect_price)):
                    if self.broker.update_sl(trade_id, roi_protect_price):
                        self.broker.log_alert(f"ROI PROTECT: {trade_id} moved to Entry+0.5 (Green ROI guaranteed)")

            # STAGE 2: SMART GAP (Dynamic Trailing)
            # We use a tightening window to capture more as it runs.
            if profit_pips >= 12.0:
                # Calculate 'Smart Gap' based on current profit levels
                if profit_pips >= 40.0:
                    smart_gap_pips = 8.0   # Tight leash for big runners
                elif profit_pips >= 25.0:
                    smart_gap_pips = 10.0  # Moderate tightening
                else:
                    smart_gap_pips = 12.0  # Initial trail gap
                
                trail_dist_price = smart_gap_pips / 100.0
                potential_sl = current_candle['close'] - trail_dist_price if direction == "BUY" else current_candle['close'] + trail_dist_price
                
                # Never move SL backwards, only ratschet forward
                if (direction == "BUY" and potential_sl > current_sl) or (direction == "SELL" and (current_sl == 0 or potential_sl < current_sl)):
                    self.broker.update_sl(trade_id, potential_sl)
                    self.broker.log_alert(f"SMART TRAIL (+{profit_pips:.1f}pips): {trade_id} ratcheted to {potential_sl:.3f} ({smart_gap_pips}p gap)")

def main():
    if not OANDA_API_KEY or not OANDA_ACCOUNT_ID:
        print("CRITICAL: OANDA API Key or Account ID missing. Check .env.local")
        write_status(running=False, error="OANDA API Key or Account ID missing")
        return

    strategy = PhantomNodeV10(None)  # Create instance to get version
    print(f"--- PHANTOM NODE {strategy.version} LIVE (OANDA {OANDA_ENV.upper()}) ---")
    print(f"--- MACRO BIAS ENGINE ENABLED ---")
    write_status(running=True)

    broker = OandaBroker()
    # Share config with broker for easy access
    broker.config = load_config()
    strategy = PhantomNodeV10(broker.config)
    manager = PositionManager(broker)
    risk_manager = AdaptiveRiskManager(broker)  # NEW: Intelligent risk management
    perf_tracker = PerformanceTracker(broker, risk_manager)  # NEW: Link performance to risk management
    macro_engine = get_bias_engine()
    
    # Initial streak check
    perf_tracker.update_streak()
    
    pairs = ['USD_JPY']
    now = None
    last_signal_persisted = None
    last_macro_bias = None

    # Circuit breaker: daily PnL cap
    balance_at_reset = None
    reset_date_utc = None
    circuit_breaker_tripped = False
    circuit_breaker_date = None

    # Reload trip state from status file (survives restarts)
    if os.path.exists(STATUS_PATH):
        try:
            with open(STATUS_PATH, "r") as f:
                prev = json.load(f)
            
            # Restore operational state
            last_signal_persisted = prev.get("lastSignal")
            last_macro_bias = prev.get("macroBias")
            
            if prev.get("circuitBreakerTripped") and prev.get("circuitBreakerDate"):
                d = prev["circuitBreakerDate"]
                if d == datetime.datetime.utcnow().date().isoformat():
                    circuit_breaker_tripped = True
                    circuit_breaker_date = d
                    print(f"[CIRCUIT BREAKER] Reloaded trip state for {d}; no new trades until next session.")
        except Exception as e:
            print(f"Could not load state from status file: {e}")

    RESET_CACHE_PATH = os.path.join(PROJECT_ROOT, '.balance-reset.json')

    def _ensure_reset(account):
        nonlocal balance_at_reset, reset_date_utc, circuit_breaker_tripped, circuit_breaker_date
        today = datetime.datetime.utcnow().date()
        today_str = today.isoformat()

        # Try to load from cache first
        if balance_at_reset is None and os.path.exists(RESET_CACHE_PATH):
            try:
                with open(RESET_CACHE_PATH, "r") as f:
                    cache = json.load(f)
                if cache.get("date") == today_str:
                    balance_at_reset = cache["balance"]
                    reset_date_utc = today
                    print(f"Loaded starting balance for {today_str}: ${balance_at_reset}")
            except:
                pass

        if reset_date_utc is None or today > reset_date_utc:
            balance_at_reset = account["balance"]
            reset_date_utc = today
            circuit_breaker_tripped = False
            circuit_breaker_date = None
            # Save to cache
            try:
                with open(RESET_CACHE_PATH, "w") as f:
                    json.dump({"date": today_str, "balance": balance_at_reset}, f)
                print(f"New daily reset. Day Start Balance: ${balance_at_reset}")
            except:
                pass

    while True:
        try:
            # EMERGENCY KILL SWITCH
            if os.path.exists(os.path.join(PROJECT_ROOT, '.kill-algo')):
                logger.error("MANUAL KILL SWITCH DETECTED (.kill-algo). Shutting down...")
                write_status(running=False, error="Manual Kill Switch Activated")
                # Flatten all positions
                for pair in pairs:
                    for t in broker.get_open_trades():
                        if t["instrument"] == pair: broker.close_trade(t["id"])
                break

            # 1. Load Dynamic Config
            config = load_config()
            broker.config = config
            QUANT_ACTIVE = config.get('quant_active', False)
            MAX_DAILY_LOSS_USD = config.get('max_daily_loss', 1000.0)
            RISK_PER_TRADE = config.get('risk_per_trade', 0.01)
            
            # Update strategy in real-time
            strategy.config = config
            strategy.atr_multiplier_sl = config.get('atr_multiplier_sl', 1.8)
            strategy.rr_ratio = config.get('rr_ratio', 3.0)
            strategy.aggressive_mode = config.get('aggressive_mode', False)
            min_confluence_config = config.get('min_confluence_score', 4.5)

            now = datetime.datetime.utcnow()
            hour_utc = now.hour
            is_session_active = 8 <= hour_utc < 21
            
            account = broker.get_account_summary()

            if account is None:
                write_status(
                    running=True, last_scan=now, last_signal=last_signal_persisted,
                    error="Failed to fetch account; skipping scan",
                    circuit_breaker_tripped=circuit_breaker_tripped,
                    circuit_breaker_date=circuit_breaker_date
                )
                time.sleep(60)
                continue

            _ensure_reset(account)
            current_nav = account["balance"] + account["unrealizedPL"]
            daily_pnl = current_nav - balance_at_reset

            # v23 circuit breaker logic (Threshold now dynamic from config/Ops Panel)
            if daily_pnl <= -MAX_DAILY_LOSS_USD:
                if not circuit_breaker_tripped:
                    circuit_breaker_tripped = True
                    circuit_breaker_date = reset_date_utc.isoformat()
                    broker.log_alert(f"V23 CIRCUIT BREAKER: Daily PnL ${daily_pnl:.2f} limit hit (-{MAX_DAILY_LOSS_USD}).")

            # Reset breaker if PnL recovered or day changed
            if circuit_breaker_tripped and daily_pnl > -MAX_DAILY_LOSS_USD:
                circuit_breaker_tripped = False
                circuit_breaker_date = None
                logger.info(f"Circuit breaker reset: Daily PnL ${daily_pnl:.2f} is within limits.")

            # SCAN AND TELEMETRY (ALWAYS RUN)
            for pair in pairs:
                try:
                    # Flatten active positions if breaker just tripped
                    if circuit_breaker_tripped:
                        for t in broker.get_open_trades():
                            if t["instrument"] == pair: broker.close_trade(t["id"])
                    
                    logger.info(f"Scanning {pair}...")
                    df = broker.fetch_candles(pair)
                    if df is None or df.empty:
                        logger.warning(f"No candle data for {pair}")
                        continue

                    # Enriched DF with indicators
                    df = strategy.calculate_indicators(df)
                    signal = strategy.generate_signal(df)
                    row = df.iloc[-1]
                    
                    current_telemetry = {
                        "price": row['close'],
                        "long_score": signal.get('long_score', 0) if signal['action'] == 'HOLD' else signal.get('confluence_score', 0),
                        "short_score": signal.get('short_score', 0) if signal['action'] == 'HOLD' else signal.get('confluence_score', 0),
                        "factors": signal.get('factors', []),
                        "reason": signal.get('reason', 'Scanning...'),
                        "atr": row.get('atr', 0),
                        "debug": signal.get('debug', {})
                    }

                    # === QUANT TRADER ONLY ===
                    if QUANT_ACTIVE:
                        # Normal Quant Logic
                        manager.sync_and_manage(pair, row)
                        
                        # Check for new execution - allow multiple concurrent trades and hedging
                        open_trades = broker.get_open_trades()
                        current_pair_trades = [t for t in open_trades if t['instrument'].replace('_', '/') == pair.replace('_', '/')]
                        
                        # Allow up to 2 concurrent trades per pair (reduced from 3)
                        if len(current_pair_trades) < 2 and signal['action'] in ['BUY', 'SELL']:
                            # Check if this is a hedge (opposite direction to existing trades)
                            existing_directions = [("BUY" if float(t['currentUnits']) > 0 else "SELL") for t in current_pair_trades]
                            is_hedge = (signal['action'] == 'BUY' and 'SELL' in existing_directions) or \
                                      (signal['action'] == 'SELL' and 'BUY' in existing_directions)
                            
                            # If same direction, only allow if first trade is in profit (scaling-in)
                            if not is_hedge and len(current_pair_trades) > 0:
                                first_trade = current_pair_trades[0]
                                t_pnl = float(first_trade.get('unrealizedPL', 0))
                                if t_pnl <= 0:
                                    logger.info(f"SCALING-IN BLOCKED: Existing {signal['action']} is in loss (${t_pnl}). No averaging down.")
                                    continue

                            # Allow hedges with lower threshold, scale-ins with normal threshold
                            min_confluence = 3.5 if is_hedge else min_confluence_config
                            # Intelligent Risk Management (NEW)
                            is_locked, lock_reason = risk_manager.is_locked_out(signal['action'], account["balance"])
                            if is_locked:
                                logger.info(f"ADAPTIVE RISK GATE: {lock_reason}")
                                continue

                            risk_mult = perf_tracker.get_risk_multiplier()
                            # Adaptive Penalty: +1.0 threshold if on losing streak
                            threshold_adj = 1.0 if perf_tracker.consecutive_losses >= 2 else 0.0
                            
                            confluence_score = signal.get('confluence_score', 0)
                            required_score = min_confluence + threshold_adj  # Use dynamic threshold
                            
                            # Log hedge opportunities
                            if is_hedge:
                                logger.info(f"HEDGE OPPORTUNITY: {signal['action']} vs existing {existing_directions} | Score: {confluence_score:.1f} (Req: {required_score:.1f})")
                            
                            if confluence_score >= required_score:
                                adjusted_risk = RISK_PER_TRADE * risk_mult
                                res = None
                                allowed, gate_reason = macro_engine.should_allow_trade(signal['action'])
                                
                                # STRICT GATE: Only Grade A can bypass macro if allowed is False
                                is_grade_a = signal.get('grade') == 'A'
                                if not allowed and not is_grade_a:
                                    logger.info(f"MACRO GATE BLOCKED: {gate_reason} (Grade {signal.get('grade')})")
                                    continue
                                    
                                if not allowed and is_grade_a:
                                    adjusted_risk *= 0.5
                                    logger.info(f"MACRO WARNING: Half-risk Grade A trade against bias: {gate_reason}")

                                # Use virtual balance for testing/practice if configured
                                base_balance = account["balance"]
                                if config.get('use_virtual_balance'):
                                    base_balance = float(config.get('virtual_balance_amount', 1000))
                                
                                size_mult = macro_engine.get_position_size_multiplier()
                                effective_risk_pct = adjusted_risk * size_mult
                                units = calc_units_usdjpy(base_balance, effective_risk_pct, signal["entry"], signal["sl"], signal["action"])
                                
                                # DIAGNOSTIC LOGGING
                                sl_dist_diag = abs(signal["entry"] - signal["sl"])
                                logger.info(f"CALC POSITION: Bal={base_balance}, Risk%={effective_risk_pct:.4f}, SL_Dist={sl_dist_diag:.4f}, Units={units}")

                                res = broker.execute_order(pair, units, signal['sl'], signal['tp'])

                                if res:
                                    manager.register_trade(signal['action'])
                                    risk_manager.register_trade(signal['action'])  # NEW: Track for adaptive risk
                                    last_signal_persisted = {
                                        "action": signal['action'], "entry": signal['entry'],
                                        "stopLoss": signal['sl'], "takeProfit1": signal['tp'], "takeProfit2": signal['tp'],
                                        "timestamp": int(pd.Timestamp(row['date']).timestamp() * 1000), 
                                        "reason": signal['reason'], "size": abs(units),
                                        "grade": signal.get('grade', 'C'), 
                                        "confluenceScore": confluence_score, 
                                        "factors": signal.get('factors', []),
                                    }

                    # Heartbeat
                    write_status(
                        running=True, last_scan=now, last_signal=last_signal_persisted,
                        circuit_breaker_tripped=circuit_breaker_tripped,
                        circuit_breaker_date=circuit_breaker_date,
                        daily_pnl=daily_pnl, macro_bias=last_macro_bias,
                        telemetry=current_telemetry
                    )

                except Exception as e:
                    logger.error(f"Error processing {pair}: {e}")

            # Performance Streak check
            if datetime.datetime.utcnow().minute % 15 == 0 and datetime.datetime.utcnow().second < 15:
                perf_tracker.update_streak()

            time.sleep(3)  # Scan every 3 seconds for faster updates

        except KeyboardInterrupt:
            print("Stopping Sniper Elite...")
            write_status(running=False)
            break
        except Exception as e:
            logger.error(f"Critical Engine Error: {e}")
            write_status(
                running=True,
                last_scan=now or datetime.datetime.utcnow(),
                last_signal=last_signal_persisted,
                error=str(e),
                circuit_breaker_tripped=circuit_breaker_tripped,
                circuit_breaker_date=circuit_breaker_date,
                daily_pnl=daily_pnl
            )
            time.sleep(10)

if __name__ == "__main__":
    main()
