# PhantomNode V10 Trading Strategy

## Strategy Overview
PhantomNode V10 is a balanced profit day trading strategy designed for USD/JPY on 15-minute timeframes, targeting 2-5 trades per day with 1% risk per trade.

## Entry Conditions

### LONG (BUY) Signal Requirements
1. **Trend Confirmation**
   - EMA 9 > EMA 21 > EMA 50 (uptrend)
   - Price above EMA 200 (long-term bullish)

2. **Momentum & Strength**
   - ADX > 5 (trend strength minimum)
   - DI+ > DI- (bullish momentum)
   - DI spread > 0.5 (minimum directional movement)

3. **Reversal Entry**
   - RSI between 30-70 (not overextended)
   - Stochastic oversold cross (K crosses D upward)
   - Price pulls back to EMA 9/21 zone

4. **Volatility Filter**
   - ATR > 0.10 (sufficient volatility)
   - Price within 2x ATR of recent swing high/low

5. **Time & Session**
   - Active during London (7-16 UTC), NY (13-22 UTC), or Tokyo (0-9 UTC)
   - Minimum 4 bars since last trade (1-hour cooldown)

### SHORT (SELL) Signal Requirements
1. **Trend Confirmation**
   - EMA 9 < EMA 21 < EMA 50 (downtrend)
   - Price below EMA 200 (long-term bearish)

2. **Momentum & Strength**
   - ADX > 5 (trend strength minimum)
   - DI- > DI+ (bearish momentum)
   - DI spread > 0.5 (minimum directional movement)

3. **Reversal Entry**
   - RSI between 30-70 (not overextended)
   - Stochastic overbought cross (K crosses D downward)
   - Price pulls back to EMA 9/21 zone

4. **Volatility Filter**
   - ATR > 0.10 (sufficient volatility)
   - Price within 2x ATR of recent swing high/low

5. **Time & Session**
   - Active during London, NY, or Tokyo sessions
   - Minimum 4 bars since last trade (1-hour cooldown)

## Exit Management

### Stop Loss
- **Initial Stop**: 2x ATR below entry (long) or above entry (short)
- **Trailing Stop**: Activates after 1x ATR profit, trails at 1.5x ATR
- **Time Stop**: Close trade after 24 hours if not profitable

### Take Profit
- **Primary Target**: 1.5x risk (3x ATR from entry)
- **Partial Profits**: Close 50% at 1x risk, let remainder run
- **Momentum Exit**: Close if RSI > 70 (long) or < 30 (short)

## Risk Management

### Position Sizing
```
Position Size = (Account Balance × 1%) / (Entry Price - Stop Loss)
Maximum Position = 5% of Account Balance
Daily Loss Limit = $500
```

### Portfolio Rules
- Maximum 2 open trades simultaneously
- No new trades if daily loss > $500
- Minimum 4 bars between trades (1-hour spacing)
- Maximum 5 trades per day

## Signal Scoring System

### Grade A (9-10 points) - Highest Probability
- Strong trend alignment (all EMAs aligned)
- ADX > 15 (strong trend)
- Multiple indicator confluence
- Key support/resistance level

### Grade B (7-8 points) - High Probability
- Good trend alignment
- ADX > 10
- Good indicator confluence
- Minor support/resistance

### Grade C (5-6 points) - Medium Probability
- Basic trend alignment
- ADX > 5
- Some indicator confluence
- No clear S/R levels

### Grade D/F (0-4 points) - Low Probability
- Weak trend alignment
- ADX < 5
- Poor indicator confluence
- Avoid trading

## Technical Indicators Used

### Trend Indicators
- **EMA 9/21/50/200**: Trend direction and strength
- **ADX (14)**: Trend strength measurement
- **DI+/DI-**: Directional movement

### Momentum Indicators
- **RSI (14)**: Overbought/oversold conditions
- **Stochastic (14,3,3)**: Momentum reversals
- **MACD (12,26,9)**: Trend confirmation

### Volatility Indicators
- **ATR (14)**: Volatility and stop loss calculation
- **Bollinger Bands (20,2)**: Volatility bands

### Volume Indicators
- **Volume Profile**: Trading activity confirmation
- **VWAP**: Volume-weighted price levels

## Trading Sessions

### Active Hours (UTC)
- **Tokyo**: 00:00-09:00
- **London**: 07:00-16:00
- **New York**: 13:00-22:00

### Best Trading Times
- **London/NY Overlap**: 13:00-16:00 (highest volatility)
- **Tokyo/London Overlap**: 07:00-09:00 (good momentum)
- **Avoid**: Weekend gaps, major news releases

## Market Conditions

### Favorable Conditions
- Trending markets (ADX > 10)
- Moderate volatility (ATR 0.10-0.30)
- Clear support/resistance levels
- High volume sessions

### Avoid Trading
- Sideways/choppy markets (ADX < 5)
- Extreme volatility (ATR > 0.50)
- Major news releases
- Illiquid conditions

## Example Trade Setups

### Bullish Setup
1. Price above EMA 200, 9 > 21 > 50 EMAs
2. Pullback to EMA 21 with bullish candle
3. RSI 40-60, stochastic crossing up from oversold
4. ADX > 8, DI+ > DI-
5. Enter on break of pullback high
6. Stop 2x ATR below entry
7. Target 3x ATR above entry

### Bearish Setup
1. Price below EMA 200, 9 < 21 < 50 EMAs
2. Pullback to EMA 21 with bearish candle
3. RSI 40-60, stochastic crossing down from overbought
4. ADX > 8, DI- > DI+
5. Enter on break of pullback low
6. Stop 2x ATR above entry
7. Target 3x ATR below entry

## Performance Metrics

### Target Performance
- **Win Rate**: 45-55%
- **Profit Factor**: 1.2-1.5
- **Max Drawdown**: < 5%
- **Average Win**: 2.5x risk
- **Average Loss**: 1.0x risk

### Risk/Reward
- **Minimum R:R**: 1:1.5
- **Target R:R**: 1:2.0
- **Maximum Risk**: 1% per trade

## Optimization Parameters

### Entry Optimization
- ADX threshold: 5-15 (default 5)
- DI spread: 0.3-1.0 (default 0.5)
- RSI range: 25-75 (default 30-70)
- Cooldown bars: 2-8 (default 4)

### Exit Optimization
- Stop loss multiplier: 1.5-3.0x ATR (default 2.0)
- Take profit multiplier: 1.0-2.5x risk (default 1.5)
- Trailing stop activation: 0.5-1.5x ATR (default 1.0)

This is the complete PhantomNode V10 trading strategy with all entry/exit rules, risk management, and optimization parameters.
