"""
Macro Bias Engine for USDJPY

Implements the 3-question predictive framework:
1️⃣ Are US yields rising or falling?
2️⃣ Are stocks risk-on or risk-off?
3️⃣ Any BoJ / Japan drama?

If 2/3 agree → that's the directional bias
"""

import requests
import os
import datetime
from datetime import timedelta
from typing import Optional, Dict, Any

# Load environment
def load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"').strip("'")

load_env()

FRED_API_KEY = os.getenv('NEXT_PUBLIC_FRED_API_KEY', '')
FRED_BASE_URL = 'https://api.stlouisfed.org/fred'

# FRED Series IDs
MACRO_SERIES = {
    'US_10Y_YIELD': 'DGS10',
    'VIX': 'VIXCLS',
    'FED_RATE': 'FEDFUNDS',
    'CPI': 'CPIAUCSL',
    'UNEMPLOYMENT': 'UNRATE',
    'OIL_WTI': 'DCOILWTICO',
    'JAPAN_CPI': 'JPNCPIALLMINMEI',
}


class MacroBiasEngine:
    """
    Calculates USDJPY directional bias based on macro fundamentals.
    
    Uses a simple 3-question framework:
    1. Yield direction (US 10Y / Fed Rate)
    2. Risk sentiment (VIX)
    3. BoJ/Japan volatility
    
    If 2/3 agree, that's the directional bias.
    """
    
    def __init__(self):
        self.indicators: Dict[str, Dict[str, Any]] = {}
        self.last_fetch: Optional[datetime] = None
        self.cache_duration = timedelta(hours=1)  # Cache FRED data for 1 hour
        
    def fetch_fred_series(self, series_id: str, limit: int = 5) -> list:
        """Fetch observations from FRED API."""
        try:
            url = f"{FRED_BASE_URL}/series/observations"
            params = {
                'series_id': series_id,
                'api_key': FRED_API_KEY,
                'file_type': 'json',
                'sort_order': 'desc',
                'limit': limit,
            }
            
            response = requests.get(url, params=params, timeout=10)
            if response.status_code != 200:
                print(f"[MacroBias] FRED API error for {series_id}: {response.status_code}")
                return []
            
            data = response.json()
            return data.get('observations', [])
        except Exception as e:
            print(f"[MacroBias] Error fetching {series_id}: {e}")
            return []
    
    def get_signal_for_indicator(
        self, 
        series_id: str, 
        trend: str, 
        current_value: float
    ) -> str:
        """Determine bullish/bearish/neutral signal based on indicator type."""
        
        if series_id == MACRO_SERIES['US_10Y_YIELD']:
            # Rising yields = USD bullish (wider rate differential)
            if trend == 'rising':
                return 'bullish'
            elif trend == 'falling':
                return 'bearish'
            return 'neutral'
        
        elif series_id == MACRO_SERIES['VIX']:
            # High VIX = Risk-off = JPY strength = USDJPY bearish
            if current_value > 25:
                return 'bearish'
            if current_value < 15:
                return 'bullish'
            if trend == 'falling':
                return 'bullish'
            if trend == 'rising':
                return 'bearish'
            return 'neutral'
        
        elif series_id == MACRO_SERIES['FED_RATE']:
            # Rising Fed rate = USD bullish
            if trend == 'rising':
                return 'bullish'
            elif trend == 'falling':
                return 'bearish'
            return 'neutral'
        
        elif series_id == MACRO_SERIES['CPI']:
            # Hot inflation = Fed hawkish = USD bullish
            if trend == 'rising':
                return 'bullish'
            elif trend == 'falling':
                return 'bearish'
            return 'neutral'
        
        elif series_id == MACRO_SERIES['UNEMPLOYMENT']:
            # Falling unemployment = Strong economy = USD bullish
            if trend == 'falling':
                return 'bullish'
            elif trend == 'rising':
                return 'bearish'
            return 'neutral'
        
        elif series_id == MACRO_SERIES['JAPAN_CPI']:
            # Rising Japan CPI = BoJ may tighten = JPY strong = USDJPY bearish
            if trend == 'rising':
                return 'bearish'
            elif trend == 'falling':
                return 'bullish'
            return 'neutral'
        
        return 'neutral'
    
    def fetch_indicator(self, series_id: str, name: str) -> Optional[Dict[str, Any]]:
        """Fetch and process a single indicator."""
        observations = self.fetch_fred_series(series_id, limit=5)
        
        if len(observations) < 2:
            return None
        
        # Filter valid observations
        valid_obs = [o for o in observations if o['value'] != '.' and o['value']]
        if len(valid_obs) < 2:
            return None
        
        latest = valid_obs[0]
        previous = valid_obs[1]
        
        current_value = float(latest['value'])
        prev_value = float(previous['value'])
        change = current_value - prev_value
        percent_change = (change / prev_value) * 100 if prev_value != 0 else 0
        
        # Determine trend
        if abs(percent_change) < 0.5:
            trend = 'stable'
        elif change > 0:
            trend = 'rising'
        else:
            trend = 'falling'
        
        signal = self.get_signal_for_indicator(series_id, trend, current_value)
        
        return {
            'name': name,
            'series_id': series_id,
            'value': current_value,
            'previous_value': prev_value,
            'change': percent_change,
            'trend': trend,
            'signal': signal,
            'last_updated': latest['date'],
        }
    
    def fetch_all_indicators(self) -> Dict[str, Dict[str, Any]]:
        """Fetch all macro indicators from FRED."""
        now = datetime.datetime.now()
        
        # Use cache if available and fresh
        if self.last_fetch and (now - self.last_fetch) < self.cache_duration:
            return self.indicators
        
        print(f"[MacroBias] Fetching fresh macro data from FRED...")
        
        indicator_configs = [
            (MACRO_SERIES['US_10Y_YIELD'], 'US 10-Year Treasury Yield'),
            (MACRO_SERIES['VIX'], 'VIX (Fear Index)'),
            (MACRO_SERIES['FED_RATE'], 'Fed Funds Rate'),
            (MACRO_SERIES['CPI'], 'US CPI'),
            (MACRO_SERIES['UNEMPLOYMENT'], 'US Unemployment'),
            (MACRO_SERIES['JAPAN_CPI'], 'Japan CPI'),
        ]
        
        for series_id, name in indicator_configs:
            indicator = self.fetch_indicator(series_id, name)
            if indicator:
                self.indicators[series_id] = indicator
        
        self.last_fetch = now
        return self.indicators
    
    def calculate_bias(self) -> Dict[str, Any]:
        """
        Calculate overall USDJPY bias using the 3-question framework.
        
        Returns:
            Dictionary with bias, score, confidence, and indicator details.
        """
        indicators = self.fetch_all_indicators()
        
        if not indicators:
            return {
                'bias': 'NEUTRAL',
                'score': 0,
                'confidence': 'LOW',
                'yield_signal': 'neutral',
                'risk_signal': 'neutral',
                'boj_volatility': False,
                'agreement_count': 0,
                'recommendation': 'Unable to fetch macro data - proceed with caution',
                'gate_trades': False,
            }
        
        # 1️⃣ Yield Signal - Based on US 10Y and Fed Rate
        yield_indicators = [
            indicators.get(MACRO_SERIES['US_10Y_YIELD']),
            indicators.get(MACRO_SERIES['FED_RATE']),
        ]
        yield_indicators = [i for i in yield_indicators if i]
        
        yield_bullish = sum(1 for i in yield_indicators if i['signal'] == 'bullish')
        yield_bearish = sum(1 for i in yield_indicators if i['signal'] == 'bearish')
        
        if yield_bullish > yield_bearish:
            yield_signal = 'bullish'
        elif yield_bearish > yield_bullish:
            yield_signal = 'bearish'
        else:
            yield_signal = 'neutral'
        
        # 2️⃣ Risk Signal - Based on VIX
        vix = indicators.get(MACRO_SERIES['VIX'])
        risk_signal = vix['signal'] if vix else 'neutral'
        
        # 3️⃣ BoJ Volatility - Based on Japan CPI movement
        japan_cpi = indicators.get(MACRO_SERIES['JAPAN_CPI'])
        boj_volatility = abs(japan_cpi['change']) > 1 if japan_cpi else False
        
        # Count agreement
        bullish_count = 0
        bearish_count = 0
        
        if yield_signal == 'bullish':
            bullish_count += 1
        elif yield_signal == 'bearish':
            bearish_count += 1
        
        if risk_signal == 'bullish':
            bullish_count += 1
        elif risk_signal == 'bearish':
            bearish_count += 1
        
        # Calculate overall bias
        agreement_count = max(bullish_count, bearish_count)
        
        if bullish_count >= 2:
            bias = 'BULLISH'
            score = 50 + (bullish_count * 25)
        elif bearish_count >= 2:
            bias = 'BEARISH'
            score = -50 - (bearish_count * 25)
        else:
            bias = 'NEUTRAL'
            score = (bullish_count - bearish_count) * 25
        
        # Adjust for BoJ volatility
        if boj_volatility:
            score = int(score * 0.8)
        
        # Confidence level
        if agreement_count >= 2 and not boj_volatility:
            confidence = 'HIGH'
        elif agreement_count >= 2 or bullish_count + bearish_count >= 2:
            confidence = 'MEDIUM'
        else:
            confidence = 'LOW'
        
        # Generate recommendation
        if bias == 'BULLISH' and confidence == 'HIGH':
            recommendation = 'Strong USDJPY Long Bias - Yields rising + Risk-on sentiment align'
            gate_trades = True  # Allow longs, gate shorts
        elif bias == 'BEARISH' and confidence == 'HIGH':
            recommendation = 'Strong USDJPY Short Bias - Yields falling + Risk-off sentiment align'
            gate_trades = True  # Allow shorts, gate longs
        elif bias == 'BULLISH':
            recommendation = 'Moderate USDJPY Long Bias - Consider reduced position size'
            gate_trades = False
        elif bias == 'BEARISH':
            recommendation = 'Moderate USDJPY Short Bias - Consider reduced position size'
            gate_trades = False
        elif boj_volatility:
            recommendation = 'Neutral with BoJ Volatility Risk - Wait for clarity'
            gate_trades = False
        else:
            recommendation = 'No Clear Bias - Wait for macro alignment'
            gate_trades = False
        
        return {
            'bias': bias,
            'score': score,
            'confidence': confidence,
            'yield_signal': yield_signal,
            'risk_signal': risk_signal,
            'boj_volatility': boj_volatility,
            'agreement_count': agreement_count,
            'recommendation': recommendation,
            'gate_trades': gate_trades,
            'indicators': indicators,
            'timestamp': datetime.datetime.now().isoformat(),
        }
    
    def should_allow_trade(self, action: str) -> tuple[bool, str]:
        """
        Determine if a trade should be allowed based on macro bias.
        
        Args:
            action: 'BUY' or 'SELL'
            
        Returns:
            Tuple of (allowed: bool, reason: str)
        """
        bias_result = self.calculate_bias()
        
        bias = bias_result['bias']
        confidence = bias_result['confidence']
        
        # HIGH confidence = strict gating
        if confidence == 'HIGH':
            if bias == 'BULLISH' and action == 'SELL':
                return False, f"Macro bias is strongly BULLISH - SELL signal blocked"
            if bias == 'BEARISH' and action == 'BUY':
                return False, f"Macro bias is strongly BEARISH - BUY signal blocked"
        
        # MEDIUM confidence = allow with warning
        if confidence == 'MEDIUM':
            if (bias == 'BULLISH' and action == 'SELL') or (bias == 'BEARISH' and action == 'BUY'):
                return True, f"Warning: Trade against {bias} macro bias (medium confidence)"
        
        # LOW confidence or aligned = allow
        return True, f"Trade aligned or no strong macro bias"
    
    def get_position_size_multiplier(self) -> float:
        """
        Get position size multiplier based on macro confluence.
        
        Returns:
            1.0 for high confluence
            0.75 for medium confluence
            0.5 for low confluence or counter-trend
        """
        bias_result = self.calculate_bias()
        
        if bias_result['confidence'] == 'HIGH' and bias_result['agreement_count'] >= 2:
            return 1.0
        elif bias_result['confidence'] == 'MEDIUM':
            return 0.75
        else:
            return 0.5


# Singleton instance for the algo
_bias_engine: Optional[MacroBiasEngine] = None


def get_bias_engine() -> MacroBiasEngine:
    """Get or create the singleton MacroBiasEngine instance."""
    global _bias_engine
    if _bias_engine is None:
        _bias_engine = MacroBiasEngine()
    return _bias_engine


if __name__ == "__main__":
    # Test the bias engine
    engine = MacroBiasEngine()
    result = engine.calculate_bias()
    
    print("\n" + "="*60)
    print("MACRO BIAS ENGINE - USDJPY")
    print("="*60)
    print(f"\nBias: {result['bias']} (Score: {result['score']})")
    print(f"Confidence: {result['confidence']}")
    print(f"\n1️⃣ Yield Signal: {result['yield_signal']}")
    print(f"2️⃣ Risk Signal: {result['risk_signal']}")
    print(f"3️⃣ BoJ Volatility: {'Yes' if result['boj_volatility'] else 'No'}")
    print(f"\nAgreement: {result['agreement_count']}/2")
    print(f"Recommendation: {result['recommendation']}")
    print("\nIndicators:")
    for key, ind in result.get('indicators', {}).items():
        print(f"  - {ind['name']}: {ind['value']:.2f} ({ind['trend']}) → {ind['signal']}")
