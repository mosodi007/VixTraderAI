import { useTheme } from '../contexts/ThemeContext';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';

export function TermsOfService() {
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

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-4">Terms of Service</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
          Effective date: <span className="font-semibold">March 20, 2026</span>
        </p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mb-2">1. Who we are</h2>
            <p>
              Vixai.trade (\"VixAI\", \"we\", \"us\") is an affiliate to Deriv (BVI) Ltd. If you link your MT5 account to
              our Introducing Broker (IB) via our platform, we may earn commission for that affiliation.
            </p>
            <p className="mt-2">
              If you have questions, contact us at{' '}
              <a className="underline" href="mailto:support@vixai.trade">
                support@vixai.trade
              </a>
              .
              {` `}
              For complaints, email{' '}
              <a className="underline" href="mailto:complains@vixai.trade">
                complains@vixai.trade
              </a>
              .
            </p>
            <p className="mt-2">
              Address: Kopli 51, 13520 Tallinn, Estonia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Acceptance</h2>
            <p>
              By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. Trading risk</h2>
            <p>
              Trading involves risk. Signals and analytics provided by VixAI are for informational purposes only and
              do not guarantee performance. You are solely responsible for any trading decisions and outcomes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. Affiliate disclosure</h2>
            <p>
              VixAI earns commission when your MT5 account is linked to our IB (Deriv affiliate program). This does not
              change your account terms with Deriv, and it is not intended to be a recommendation to trade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Account linking and eligibility</h2>
            <p>
              Some features require linking an MT5 account. By linking, you authorize us to process the information
              necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. Service availability</h2>
            <p>
              We may modify, suspend, or discontinue the Service at any time, including if we believe it is necessary
              for security, compliance, or operational reasons.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential,
              or punitive damages arising out of or related to your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Governing law</h2>
            <p>
              These Terms are governed by the laws of Estonia, unless applicable mandatory law requires otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">9. Contact</h2>
            <p>
              Support: <a className="underline" href="mailto:support@vixai.trade">support@vixai.trade</a>
              <br />
              Complaints: <a className="underline" href="mailto:complains@vixai.trade">complains@vixai.trade</a>
              <br />
              Address: Kopli 51, 13520 Tallinn, Estonia
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

