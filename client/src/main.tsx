import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Initialize theme before first render to avoid flash
const storedTheme = (() => { try { return localStorage.getItem('btp-status-theme'); } catch { return null; } })();
document.documentElement.classList.toggle('dark', storedTheme !== 'light');

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
