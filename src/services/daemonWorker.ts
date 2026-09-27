/**
 * Matrix Web Worker - Background Anti-Throttling & Lifecycle Daemon
 * 
 * Runs periodic background cycles that are immune to browser tab throttling
 * (which typically throttles background main-thread window.setInterval to 1m+).
 */

let timer: any = null;
let cycleIntervalMs = 25000; // 25s background heartbeat

self.onmessage = (e: MessageEvent) => {
  const { action, intervalMs } = e.data;

  if (action === 'START_DAEMON') {
    if (intervalMs) cycleIntervalMs = intervalMs;
    if (timer) clearInterval(timer);

    timer = setInterval(() => {
      (self as any).postMessage({ type: 'DAEMON_TICK', timestamp: Date.now() });
    }, cycleIntervalMs);

    (self as any).postMessage({ type: 'DAEMON_STARTED', intervalMs: cycleIntervalMs });
  } else if (action === 'STOP_DAEMON') {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    (self as any).postMessage({ type: 'DAEMON_STOPPED' });
  }
};
