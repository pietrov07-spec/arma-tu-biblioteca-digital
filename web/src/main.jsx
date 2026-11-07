import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/instrument-sans';
import './estilos.css';

createRoot(document.getElementById('root')).render(<App />);

// App instalable: solo en el sitio publicado (en local estorbaría a Vite)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
