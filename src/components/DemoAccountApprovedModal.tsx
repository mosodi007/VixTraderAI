import { Download, BookOpen, X, ExternalLink } from 'lucide-react';

const MT5_DOWNLOAD_URL = 'https://www.metatrader5.com/en/download';
const DEMO_EA_PATH = '/VixAi-Trader-Demo.ex5';
const EA_INSTRUCTIONS_PATH = '/EA-Instructions.pdf';

interface DemoAccountApprovedModalProps {
  open: boolean;
  onClose: () => void;
}

export function DemoAccountApprovedModal({ open, onClose }: DemoAccountApprovedModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-approved-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 pt-12 sm:pt-10">
          <h2
            id="demo-approved-title"
            className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white pr-8"
          >
            Your Deriv Demo Account is Approved
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Download and install the <span className="font-semibold text-slate-900 dark:text-white">VixAI-Trader-Demo</span>{' '}
            EA in your MT5 to start copying trades.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href={DEMO_EA_PATH}
              download
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              Download EA
            </a>
            <a
              href={EA_INSTRUCTIONS_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 border border-slate-300 dark:border-slate-600 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold text-sm transition-colors"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              EA Instructions
            </a>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Don&apos;t have MT5?</p>
            <a
              href={MT5_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sky-600 dark:text-sky-400 font-medium hover:underline"
            >
              Download MetaTrader 5
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-8 w-full rounded-xl py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
