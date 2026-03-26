import { useEffect } from 'react';

const TAWK_SCRIPT_ID = 'tawk-widget-script';
const TAWK_EMBED_SRC = 'https://embed.tawk.to/69bd93521f2eee1c3a8ff055/1jk68euv3';

/** Opens the floating Tawk live chat (e.g. from the dashboard header). */
export function openTawkChat() {
  if (typeof window === 'undefined') return;
  const api = window.Tawk_API;
  if (api?.maximize) api.maximize();
  else if (api?.toggle) api.toggle();
}

/**
 * Loads the Tawk.to live chat widget once for the entire app (all routes).
 */
export function TawkWidget() {
  useEffect(() => {
    if (document.getElementById(TAWK_SCRIPT_ID)) return;

    const s = document.createElement('script');
    s.id = TAWK_SCRIPT_ID;
    s.async = true;
    s.src = TAWK_EMBED_SRC;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.body.appendChild(s);
  }, []);

  return null;
}
