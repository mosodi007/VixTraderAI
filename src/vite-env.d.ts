/// <reference types="vite/client" />

interface TawkAPI {
  maximize?: () => void;
  minimize?: () => void;
  toggle?: () => void;
}

interface Window {
  Tawk_API?: TawkAPI;
}
