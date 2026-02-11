# Operational Assurance & Live Telemetry

This plan implements a "Live Heartbeat" and telemetry system to provide immediate proof that the trading bots are operational, scanning, and calculating logic in real-time, even when those calculations do not result in a trade.

## User Review Required
> [!IMPORTANT]
> This change introduces a high-frequency status update (every 10-15 seconds) to ensure the 'Heartbeat' is responsive. This will increase local file I/O slightly but is necessary for live operational transparency.

## Proposed Changes

### [Backend] python_algo
#### [MODIFY] [main.py](file:///Users/zchester/Desktop/Agents/forex-dashboard/python_algo/main.py)
- Update `write_status` to include a `heartbeat` field (ISO timestamp).
- Capture and persist live telemetry on every loop:
    - Current Market Price
    - Strategy Confluence Score
    - Technical Analysis Summary (Signal Grade)
- Enhance logging to explicitly state the reason for no-trade (e.g., "Skipping: Confluence 1.8 too low").

### [Frontend] src/components
#### [MODIFY] [AlgoOpsCenter.tsx](file:///Users/zchester/Desktop/Agents/forex-dashboard/src/components/AlgoOpsCenter.tsx)
- Add a **Live Telemetry** deck to the 'Control' tab.
- Implement a pulsing "Live Heartbeat" indicator that syncs with the backend scan time.
- Display real-time confluence scores and price data.

## Verification Plan

### Automated Verification
- Run the Python algo and monitor the `status.json` file in a terminal:
  ```bash
  watch -n 1 cat /Users/zchester/Desktop/Agents/forex-dashboard/python_algo/status.json
  ```
- Confirm `heartbeat` timestamp updates on every loop.

### Manual Verification
- Open the **Ops Center** on the dashboard.
- Verify the "Live Heartbeat" is pulsing green.
- Confirm the "Telemetry" data reflects the current market price and confluence scores.
- Check the "Logs" tab to see the new "Skipping: [Reason]" log entries.
