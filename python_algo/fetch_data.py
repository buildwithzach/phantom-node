import os
import requests
import json
import pandas as pd
import datetime

# Read from environment (same vars as main.py)
OANDA_API_KEY = os.getenv('NEXT_PUBLIC_OANDA_API_KEY', '')
OANDA_ACCOUNT_ID = os.getenv('NEXT_PUBLIC_OANDA_ACCOUNT_ID', '')
OANDA_ENV = os.getenv('NEXT_PUBLIC_OANDA_ENVIRONMENT', 'practice')
OANDA_BASE_URL = f"https://api-fx{'practice' if OANDA_ENV == 'practice' else 'trade'}.oanda.com/v3"

def fetch_oanda_candles(instrument, granularity, from_time, count=5000):
    url = f"{OANDA_BASE_URL}/instruments/{instrument}/candles"
    headers = {
        "Authorization": f"Bearer {OANDA_API_KEY}",
        "Content-Type": "application/json",
        "Accept-Datetime-Format": "UNIX"
    }
    params = {
        "price": "M",
        "granularity": granularity,
        "from": from_time,
        "count": count
    }
    
    response = requests.get(url, headers=headers, params=params)
    if response.status_code != 200:
        print(f"Error: {response.status_code} {response.text}")
        return []
    
    data = response.json()
    return [{
        "timestamp": int(float(c['time']) * 1000),
        "open": float(c['mid']['o']),
        "high": float(c['mid']['h']),
        "low": float(c['mid']['l']),
        "close": float(c['mid']['c']),
        "volume": int(c['volume'])
    } for c in data.get('candles', [])]

def fetch_historical_data(instrument, granularity, days):
    all_candles = []
    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=days)
    
    current_from = str(int(start_date.timestamp()))
    end_ts = int(end_date.timestamp() * 1000)
    
    print(f"Fetching {days} days of {instrument} {granularity}...")
    
    while True:
        candles = fetch_oanda_candles(instrument, granularity, current_from)
        if not candles:
            break
            
        all_candles.extend(candles)
        last_ts = candles[-1]['timestamp']
        
        if last_ts >= end_ts:
            break
            
        current_from = str(int(last_ts / 1000) + 1)
        print(f"Fetched {len(all_candles)} candles so far...")
        
        if len(candles) < 5000:
            break
            
    # Deduplicate and sort
    df = pd.DataFrame(all_candles)
    df = df.drop_duplicates(subset=['timestamp']).sort_values('timestamp')
    return df.to_dict('records')

if __name__ == "__main__":
    instrument = "USD_JPY"
    granularity = "M15"
    days = 31 # Fetch a bit more for warmup
    
    data = fetch_historical_data(instrument, granularity, days)
    
    output_file = "python_algo/backtest_data.json"
    with open(output_file, "w") as f:
        json.dump(data, f)
    
    print(f"Saved {len(data)} candles to {output_file}")
