import React from 'react';
import { createRoot } from 'react-dom/client';
import DesignSystem from './ui/DesignSystem.jsx';
import '../../styles.css';
import '../../engine.js';
import '../../keepsake.js';
import App from './App.jsx';
import './ui/product.css';
import './ui/landscape-theme.css';

createRoot(document.getElementById('root')).render(<DesignSystem><App /></DesignSystem>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
