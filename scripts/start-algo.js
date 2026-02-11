#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const script = path.join(root, 'python_algo', 'main.py');
const py = process.platform === 'win32' ? 'python' : 'python3';

function startAlgo() {
  console.log('[algo] Starting trading algorithm...');
  
  const child = spawn(py, [script], {
    stdio: 'inherit',
    cwd: root,
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      const fallback = 'python';
      console.error(`[algo] ${py} not found, trying ${fallback}...`);
      const c2 = spawn(fallback, [script], { stdio: 'inherit', cwd: root });
      c2.on('error', (e2) => {
        console.error(`[algo] Neither ${py} nor ${fallback} found. Install Python and ensure it is on PATH.`);
        process.exit(1);
      });
      c2.on('exit', (code) => {
        console.log(`[algo] Process exited with code ${code}, restarting in 5 seconds...`);
        setTimeout(startAlgo, 5000);
      });
      return;
    }
    console.error('[algo]', err);
    console.log('[algo] Restarting in 5 seconds...');
    setTimeout(startAlgo, 5000);
  });

  child.on('exit', (code, sig) => {
    console.log(`[algo] Process exited (code: ${code}, signal: ${sig}), restarting in 5 seconds...`);
    setTimeout(startAlgo, 5000);
  });
}

// Start the algorithm
startAlgo();
