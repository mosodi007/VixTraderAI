import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import faviconUrl from './assets/favicon.ico';

// Ensure the browser uses our favicon (Vite will fingerprint this asset in production).
const iconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
if (iconLink) {
  iconLink.href = faviconUrl;
} else {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/x-icon';
  link.href = faviconUrl;
  document.head.appendChild(link);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
