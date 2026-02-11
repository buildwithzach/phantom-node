import pandas as pd
import numpy as np
import datetime
import logging
from ml_strategy import MLForexStrategy
from strategy import UsdJpyQuantStrategy
import json
import os

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('ModelTraining')

def load_and_prepare_data(file_path, lookback_days=365):
    """Load and prepare historical data for training"""
    try:
        # Load data
        df = pd.read_json(file_path)
        
        # Convert timestamp to datetime
        df['time'] = pd.to_datetime(df['time'], unit='ms')
        
        # Filter for recent data
        cutoff_date = datetime.datetime.now() - datetime.timedelta(days=lookback_days)
        df = df[df['time'] >= cutoff_date]
        
        logger.info(f"Loaded {len(df)} rows of historical data")
        return df
        
    except Exception as e:
        logger.error(f"Error loading data: {str(e)}")
        raise

def optimize_hyperparameters(df):
    """Optimize XGBoost hyperparameters using grid search"""
    from sklearn.model_selection import GridSearchCV
    
    # Prepare features and labels
    ml_strategy = MLForexStrategy({})
    X = ml_strategy.prepare_features(df)
    df = ml_strategy.create_labels(df)
    y = df['target']
    
    # Define parameter grid
    param_grid = {
        'n_estimators': [500, 1000],
        'learning_rate': [0.01, 0.05],
        'max_depth': [3, 5, 7],
        'subsample': [0.8, 1.0],
        'colsample_bytree': [0.8, 1.0]
    }
    
    # Initialize model
    model = xgb.XGBClassifier(
        objective='multi:softprob',
        num_class=3,
        random_state=42,
        n_jobs=-1
    )
    
    # Perform grid search
    grid_search = GridSearchCV(
        estimator=model,
        param_grid=param_grid,
        cv=3,
        scoring='f1_weighted',
        verbose=2,
        n_jobs=-1
    )
    
    logger.info("Starting hyperparameter optimization...")
    grid_search.fit(X, y)
    
    logger.info(f"Best parameters: {grid_search.best_params_}")
    logger.info(f"Best score: {grid_search.best_score_:.4f}")
    
    return grid_search.best_estimator_

def main():
    # Load configuration
    with open('config.json', 'r') as f:
        config = json.load(f)
    
    # Load data
    data_file = 'historical_data.json'  # Update with your data file
    df = load_and_prepare_data(data_file)
    
    # Initialize strategy
    strategy = UsdJpyQuantStrategy(config)
    
    # Train initial model
    logger.info("Training initial ML model...")
    strategy.ml_strategy.train_model(df)
    
    # Optional: Hyperparameter optimization (takes longer)
    if config.get('enable_hyperparameter_optimization', False):
        logger.info("Optimizing hyperparameters...")
        best_model = optimize_hyperparameters(df)
        strategy.ml_strategy.model = best_model
    
    logger.info("ML model training complete!")

if __name__ == "__main__":
    main()
