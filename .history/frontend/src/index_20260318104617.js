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