import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler
import joblib
import os

class MLForexStrategy:
    def __init__(self, config):
        self.config = config
        self.model_path = 'models/forex_xgb_model.pkl'
        self.scaler_path = 'models/scaler.pkl'
        self.model = None
        self.scaler = StandardScaler()
        self.load_model()
        
    def load_model(self):
        """Load pre-trained model and scaler if they exist"""
        if os.path.exists(self.model_path) and os.path.exists(self.scaler_path):
            self.model = joblib.load(self.model_path)
            self.scaler = joblib.load(self.scaler_path)
        
    def prepare_features(self, df):
        """Prepare features for ML model"""
        # Technical indicators
        df['returns'] = df['close'].pct_change()
        df['sma_20'] = df['close'].rolling(window=20).mean()
        df['sma_50'] = df['close'].rolling(window=50).mean()
        df['rsi'] = self.calculate_rsi(df['close'], 14)
        df['atr'] = self.calculate_atr(df, 14)
        df['macd'], df['signal_line'] = self.calculate_macd(df['close'])
        
        # Volatility
        df['volatility'] = df['returns'].rolling(window=20).std() * np.sqrt(252)
        
        # Price action features
        df['high_low'] = df['high'] - df['low']
        df['close_open'] = df['close'] - df['open']
        
        # Drop NaN values
        df = df.dropna()
        
        # Define features and target
        features = ['returns', 'sma_20', 'sma_50', 'rsi', 'atr', 'macd', 
                   'signal_line', 'volatility', 'high_low', 'close_open']
        
        return df[features]
    
    def create_labels(self, df, window=5):
        """Create target labels based on future price movement"""
        future_returns = df['close'].pct_change(window).shift(-window)
        df['target'] = np.where(future_returns > 0.001, 1, 
                              np.where(future_returns < -0.001, -1, 0))
        return df
    
    def train_model(self, df):
        """Train XGBoost model"""
        # Prepare features and labels
        X = self.prepare_features(df)
        df = self.create_labels(df)
        y = df['target']
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, shuffle=False
        )
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train model
        self.model = xgb.XGBClassifier(
            n_estimators=1000,
            learning_rate=0.01,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8,
            objective='multi:softprob',
            num_class=3,
            random_state=42
        )
        
        self.model.fit(
            X_train_scaled, y_train,
            eval_set=[(X_train_scaled, y_train), (X_test_scaled, y_test)],
            eval_metric='mlogloss',
            early_stopping_rounds=50,
            verbose=10
        )
        
        # Evaluate
        y_pred = self.model.predict(X_test_scaled)
        print("\nModel Evaluation:")
        print(classification_report(y_test, y_pred))
        
        # Save model and scaler
        os.makedirs('models', exist_ok=True)
        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)
        
        return self.model
    
    def generate_signal(self, df):
        """Generate trading signal using ML model"""
        if self.model is None:
            return {'action': 'HOLD', 'reason': 'Model not trained'}
            
        # Prepare features for prediction
        X = self.prepare_features(df)
        if len(X) == 0:
            return {'action': 'HOLD', 'reason': 'Insufficient data'}
            
        # Get the most recent data point
        X_scaled = self.scaler.transform(X.iloc[[-1]])
        
        # Predict probabilities for each class
        proba = self.model.predict_proba(X_scaled)[0]
        confidence = np.max(proba)
        prediction = self.model.predict(X_scaled)[0]
        
        # Generate signal based on prediction
        if prediction == 1 and confidence > 0.6:  # Buy signal
            return {
                'action': 'BUY',
                'confidence': float(confidence),
                'reason': f'ML Buy Signal (Confidence: {confidence:.2f})',
                'proba': {
                    'buy': float(proba[2]),
                    'hold': float(proba[1]),
                    'sell': float(proba[0])
                }
            }
        elif prediction == -1 and confidence > 0.6:  # Sell signal
            return {
                'action': 'SELL',
                'confidence': float(confidence),
                'reason': f'ML Sell Signal (Confidence: {confidence:.2f})',
                'proba': {
                    'buy': float(proba[2]),
                    'hold': float(proba[1]),
                    'sell': float(proba[0])
                }
            }
        
        return {'action': 'HOLD', 'reason': 'No high-confidence ML signal'}
    
    # Helper methods for technical indicators
    def calculate_rsi(self, series, period=14):
        delta = series.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))
    
    def calculate_atr(self, df, period=14):
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = np.max(ranges, axis=1)
        return true_range.rolling(period).mean()
    
    def calculate_macd(self, series, fast=12, slow=26, signal=9):
        exp1 = series.ewm(span=fast, adjust=False).mean()
        exp2 = series.ewm(span=slow, adjust=False).mean()
        macd = exp1 - exp2
        signal_line = macd.ewm(span=signal, adjust=False).mean()
        return macd, signal_line
