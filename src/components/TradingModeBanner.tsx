import { AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { DERIV_MT5_CREATE_URL } from '../constants/deriv';

export function TradingModeBanner() {
  const { tradingMode, hasVerifiedLiveMt5 } = useAuth();

  if (tradingMode === 'demo') {
    return (
      <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-emerald-600/10 p-2">
            <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Demo mode</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You can connect a Deriv <span className="font-semibold">demo</span> MT5 account and view live signals. Email notifications are disabled in Demo.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <a
              href="#settings"
              className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Add MT5 login
            </a>
            <a
              href={DERIV_MT5_CREATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:underline"
            >
              Create on Deriv
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (tradingMode === 'live' && !hasVerifiedLiveMt5) {
    return (
      <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-yellow-500/20 p-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Live mode requires verification</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Submit your Deriv MT5 <span className="font-semibold">real</span> account for verification to enable Live features.
            </p>
          </div>
          <a
            href="#settings"
            className="shrink-0 text-sm font-semibold text-yellow-700 dark:text-yellow-300 hover:underline"
          >
            Verify MT5
          </a>
        </div>
      </div>
    );
  }

  return null;
}

