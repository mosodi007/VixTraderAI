import { useTheme } from '../contexts/ThemeContext';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';
import { CheckCircle2, Shield, Zap, LineChart, Settings2, Headphones, TrendingUp, Hand, Target } from 'lucide-react';

const FeatureItem = ({ title, description }: { title: string; description: string }) => (
  <div className="flex gap-3">
    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
    </div>
  </div>
);

const Step = ({ number, title, description }: { number: string; title: string; description: string }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-900 dark:text-white">{number}</span>
      </div>
      <p className="text-base font-bold text-slate-900 dark:text-white">{title}</p>
    </div>
    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
  </div>
);

const FaqItem = ({ q, a }: { q: string; a: string }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6">
    <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">{q}</p>
    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{a}</p>
  </div>
);

export function Landing() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
      <header className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <img
              src={theme === 'dark' ? logoDark : logoLight}
              alt="VixAI"
              className="h-9 w-auto rounded-lg object-contain"
            />
          </a>

          <div className="flex items-center gap-2">
            <a
              href="#login"
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              Login
            </a>
            <a
              href="#signup"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors text-sm font-medium"
            >
              Sign Up
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-4 pt-14 pb-10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-700 dark:text-slate-300 mb-4">
                <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Volatility Index Trading • High Probability Signals
              </p>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                AI Copy Trader & Trading Signals for Volatility Index
              </h1>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Get AI-generated trade setups and connect your MT5 Expert Advisor to execute trades automatically.
                Start in demo, tune your risk and filters, then switch to live when you’re ready.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="#signup"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
                >
                  Get Started
                  <LineChart className="w-4 h-4" />
                </a>
                <a
                  href="#login"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-semibold transition-colors"
                >
                  Log in
                </a>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400">Mode</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Demo → Live</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400">Market</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Deriv MT5</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400">Control</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Risk filters</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-6">
              <div className="grid gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-5 flex gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">High Win Rates</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Our strategy is designed to maximize win rates with a low risk of loss.
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-5 flex gap-3">
                  <Hand className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Hands-Free Trading</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Let the AI do the heavy lifting. You can set your risk/reward ratio and let the EA execute trades automatically.
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-5 flex gap-3">
                  <Target className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Live Signals</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Get live signals and email notifications for trades.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Trading involves risk. Past performance is not indicative of future results. Use demo mode to test before
                trading live funds.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">How it works</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">A simple flow from setup to execution.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Step
              number="1"
              title="Create your MT5 account"
              description="Create a Deriv MT5 account (demo or live), then log in to VixAI to connect it."
            />
            <Step
              number="2"
              title="Set your trade rules"
              description="Choose the minimum AI confidence, enable symbols, and set your lot sizing preferences."
            />
            <Step
              number="3"
              title="Run the EA on MT5"
              description="Attach the EA to a chart. It will poll for instructions and execute trades automatically."
            />
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-10">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-6">What you get</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-6">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-4">Core features</p>
              <div className="space-y-4">
                <FeatureItem
                  title="AI-generated signals"
                  description="Signals generated with confidence scoring to help you filter quality."
                />
                <FeatureItem
                  title="EA connectivity dashboard"
                  description="Know when your EA is online, and see your latest activity and performance."
                />
                <FeatureItem
                  title="Per-symbol controls"
                  description="Enable/disable trading per symbol and set lot sizing independently."
                />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-6">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-4">Risk & transparency</p>
              <div className="space-y-4">
                <FeatureItem
                  title="Demo-first workflow"
                  description="Test strategies and settings in demo mode before switching to live."
                />
                <FeatureItem
                  title="Confidence threshold filter"
                  description="Trade only when the AI confidence meets your minimum requirement."
                />
                <FeatureItem
                  title="You stay in control"
                  description="Pause the EA anytime and adjust filters without changing code."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Trading strategy</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                A confidence-filtered, risk-first workflow designed for the Volatility Index.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">1) AI signal generation</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                The platform analyzes volatility index setups and generates BUY/SELL signals with a confidence score.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">2) Confidence threshold filter</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Your EA executes only when the signal confidence is at or above your minimum (default: 50%).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">3) Risk/reward (1:3)</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Stop Loss and Take Profit follow a 1:3 structure (TP points = 3× SL points) per symbol.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">4) Symbol & lot controls</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Enable/disable symbols and choose fixed lots or % balance sizing to control trade volume.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6 md:col-span-2 lg:col-span-3">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">5) EA executes from instructions</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Your MT5 EA polls the platform for active instructions and only places orders that match your filters.
                Demo mode helps you validate the full flow before switching to live.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">FAQ</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Quick answers to common questions.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FaqItem
              q="Do I need to code to use VixAI?"
              a="No. You connect your MT5 account, download the EA, and set your preferences in the app."
            />
            <FaqItem
              q="Can I use demo and live?"
              a="Yes. Use the Demo/Live toggle to keep your demo testing separate from your live metrics."
            />
            <FaqItem
              q="How does the EA execute trades?"
              a="The EA polls for instructions from the platform and executes market orders using your configured lot sizing."
            />
            <FaqItem
              q="Is there a minimum confidence required?"
              a="You can set your own minimum AI confidence threshold in Settings (default is 50%)."
            />
            <FaqItem
              q="Is my money safe?"
              a="Trading involves risk. Use demo mode first, trade with discipline, and only risk what you can afford to lose."
            />
            <FaqItem
              q="Where do I get an MT5 account?"
              a="Create it on Deriv, then connect your MT5 login in Settings."
            />
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Start in demo today</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Connect a demo MT5 account, configure your filters, and run the EA to see it in action.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="#signup"
                className="px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
              >
                Create an account
              </a>
              <a
                href="#login"
                className="px-5 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-900 dark:text-white font-semibold transition-colors"
              >
                Log in
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-10 grid gap-6 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={theme === 'dark' ? logoDark : logoLight}
                alt="VixAI"
                className="h-5 w-auto rounded-lg object-contain"
              />
              {/* <p className="text-sm font-bold text-slate-900 dark:text-white">VixAI</p> */}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Trading involves risk. Signals are for informational purposes only and are not financial advice.
              Use demo mode first and consider your risk tolerance before trading with real funds.
            </p>
          </div>
          <div className="md:text-right">
            <p className="text-sm text-slate-600 dark:text-slate-400">Support</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">support@vixai.trade</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">© {new Date().getFullYear()} VixAI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

