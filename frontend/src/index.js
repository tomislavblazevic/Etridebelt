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
      // registered
      // console.log('ServiceWorker registered: ', registration);
    }).catch((err) => {
      // console.warn('ServiceWorker registration failed: ', err);
    });
  });
}