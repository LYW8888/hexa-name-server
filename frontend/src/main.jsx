import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles.css';
import '../../engine.js';
import '../../keepsake.js';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
