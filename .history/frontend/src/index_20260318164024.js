import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Provjeri zove li se tvoja glavna komponenta App.js
import 'bootstrap/dist/css/bootstrap.min.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for basic PWA/offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;
    navigator.serviceWorker.register(swUrl).then((registration) => {
      // store registration so the app can trigger update activation
      window.__swRegistration = registration;

      // if there's already a waiting service worker, notify
      if (registration.waiting) {
        window.dispatchEvent(new Event('swUpdated'));
      }

      // listen for updatefound on the registration
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // new update available
              window.dispatchEvent(new Event('swUpdated'));
            }
          });
        }
      });
    }).catch(() => {
      // ignore registration errors silently
    });
  });
}