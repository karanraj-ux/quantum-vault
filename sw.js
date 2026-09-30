self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'matrix-automation-sync') {
    event.waitUntil(runBackgroundAutomations());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'matrix-periodic-automation') {
    event.waitUntil(runBackgroundAutomations());
  }
});

async function runBackgroundAutomations() {
  console.log('[Service Worker] Running background automations...');
}
