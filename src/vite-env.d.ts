/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_MONTHLY_PRICE_ID?: string;
  readonly VITE_STRIPE_YEARLY_PRICE_ID?: string;
}

interface TawkAPI {
  maximize?: () => void;
  minimize?: () => void;
  toggle?: () => void;
}

interface Window {
  Tawk_API?: TawkAPI;
}
