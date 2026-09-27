import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW registered:', reg);
      
      // Request periodic sync if supported
      if ('periodicSync' in reg) {
        (reg.periodicSync as any).register('matrix-periodic-automation', {
          minInterval: 15 * 60 * 1000 // 15 minutes
        }).catch((e: any) => console.log('Periodic sync could not be registered', e));
      }
    }).catch(err => console.log('SW registration failed:', err));
  });
}
