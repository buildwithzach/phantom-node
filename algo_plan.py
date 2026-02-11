import pandas as pd
import numpy as np
import requests
from datetime import datetime, timedelta
import time

# --- CONFIGURATION ---
API_KEY = "YOUR_FMP_API_KEY"
SYMBOL = "USDJPY"
TIMEFRAME = "15min"
RISK_PER_TRADE = 0.01
ATR_MULTIPLIER_SL = 1.5
RR_TARGET = 2.0

# --- DATA FETCHING ---
def fetch_ohlc(symbol, timeframe, limit=500):
    url = f"https://financialmodelingprep.com/api/v3/historical-chart/{timeframe}/{symbol}?apikey={API_KEY}"
    response = requests.get(url)
    data = response.json()
    df = pd.DataFrame(data)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    return df

def fetch_economic_calendar(from_date, to_date):
    url = f"https://financialmodelingprep.com/api/v3/economic_calendar?from={from_date}&to={to_date}&apikey={API_KEY}"
    response = requests.get(url)
    return pd.DataFrame(response.json())

# --- TECHNICAL ANALYSIS ---
def calculate_indicators(df):
    # EMAs
    df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    # RSI
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # ATR
    high_low = df['high'] - df['low']
    high_cp = np.abs(df['high'] - df['close'].shift())
    low_cp = np.abs(df['low'] - df['close'].shift())
    df['tr'] = pd.concat([high_low, high_cp, low_cp], axis=1).max(axis=1)
    df['atr'] = df['tr'].rolling(window=14).mean()
    
    return df

# --- NEWS FILTERING ---
def is_news_safe(current_time, calendar_df, buffer_minutes=60):
    """
    Returns True if no high-impact USD or JPY news is within the buffer.
    """
    if calendar_df.empty:
        return True
        
    current_time = pd.to_datetime(current_time)
    start_buffer = current_time - timedelta(minutes=buffer_minutes)
    end_buffer = current_time + timedelta(minutes=buffer_minutes)
    
    relevant_news = calendar_df[
        (calendar_df['country'].isin(['US', 'JP'])) & 
        (calendar_df['impact'] == 'High')
    ]
    
    for _, event in relevant_news.iterrows():
        event_time = pd.to_datetime(event['date'])
        if start_buffer <= event_time <= end_buffer:
            return False
            
    return True

# --- SIGNAL GENERATION ---
def generate_signals(df, calendar_df):
    df = calculate_indicators(df)
    last_row = df.iloc[-1]
    prev_row = df.iloc[-2]
    
    # 1. News Check
    if not is_news_safe(last_row['date'], calendar_df):
        return "HOLD", "High Impact News Buffer"
        
    # 2. Trend Filter
    is_long_trend = last_row['close'] > last_row['ema200']
    is_short_trend = last_row['close'] < last_row['ema200']
    
    # 3. Momentum Filter
    is_long_mom = last_row['rsi'] > 50
    is_short_mom = last_row['rsi'] < 50
    
    # 4. Entry Logic (EMA Crossover)
    is_long_cross = prev_row['ema9'] <= prev_row['ema21'] and last_row['ema9'] > last_row['ema21']
    is_short_cross = prev_row['ema9'] >= prev_row['ema21'] and last_row['ema9'] < last_row['ema21']
    
    if is_long_cross and is_long_trend and is_long_mom:
        return "BUY", f"EMA Cross + Trend + RSI:{last_row['rsi']:.1f}"
    
    if is_short_cross and is_short_trend and is_short_mom:
        return "SELL", f"EMA Cross + Trend + RSI:{last_row['rsi']:.1f}"
        
    return "HOLD", "No Signal"

# --- MAIN LOOP (SIMULATED) ---
def run_algo():
    print("Starting USD/JPY News-Aware Algo...")
    # Fetch calendar for the week
    today = datetime.now().strftime('%Y-%m-%d')
    next_week = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    calendar = fetch_economic_calendar(today, next_week)
    
    while True:
        try:
            df = fetch_ohlc(SYMBOL, TIMEFRAME)
            signal, reason = generate_signals(df, calendar)
            
            timestamp = datetime.now().strftime('%H:%M:%S')
            print(f"[{timestamp}] Signal: {signal} | Reason: {reason}")
            
            # Here you would add OANDA API execution logic
            # if signal == "BUY": execute_trade("LONG", ...)
            
            time.sleep(60) # Poll every minute
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    # run_algo() # Uncomment to run
    pass
