# Always-On Algo Architecture

This plan establishes the "Always-On" architecture for the trading systems, ensuring that both the Quant Engine (Auto-Execution) and Signal Matrix (Intelligence) remain online and functional as long as the project is running. User-facing toggles for system availability have been removed to prevent accidental or unauthorized downtime.

## 🛠️ Implementation Details

### 1. Hard-Coded System State
- **Config Lockdown**: Update `python_algo/config.json` and `main.py` defaults to enforce `quant_active: true` and `signal_active: true`.
- **Logic Validation**: The Python execution loop will treat these activations as permanent, only checking for numerical parameter updates (risk, R:R).

### 2. UI Refactoring (Ops Center)
- **Status Indicators**: Replace interactive buttons with static status badges ("Always Active", "System Online").
- **Focused Control**: Shift the Ops Center dashboard to focus exclusively on:
    - Real-time Log Monitoring
    - Numerical Parameter Tuning (Risk %, Max Daily Loss, etc.)
    - Emergency Protocol Execution (Kill Switch)

### 3. Integrated Backtesting
- **Config Sync**: Maintain the direct link between `config.json` and the Backtest API so historical simulations match the "Always-On" live settings.

## ✅ Verification
- Verify that both Quant and Signal cards in the Ops Center show as active.
- Confirm clicking them no longer toggles their state.
- Confirm the Python algo logs activity for both modules immediately on startup.
