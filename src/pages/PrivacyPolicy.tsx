import { useTheme } from '../contexts/ThemeContext';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';

export function PrivacyPolicy() {
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
        <h1 className="text-3xl font-extrabold tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
          Effective date: <span className="font-semibold">March 20, 2026</span>
        </p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mb-2">1. Scope</h2>
            <p>
              This Privacy Policy explains how VixAI collects, uses, and shares personal information when you use
              Vixai.trade and related services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Data we collect</h2>
            <p className="mb-2">
              Depending on how you use the Service, we may collect:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account information (e.g., name, email address)</li>
              <li>MT5-related information you provide when linking accounts (e.g., MT5 login identifiers)</li>
              <li>Trading preferences and settings (e.g., risk filters, lot configuration)</li>
              <li>Signal and trade activity records (e.g., entries, outcomes, timestamps)</li>
              <li>Communication data (e.g., emails related to signals/alerts)</li>
              <li>Technical data (e.g., device/browser information, IP address, basic usage analytics)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. How we use your data</h2>
            <p>
              We process personal data to provide the Service, deliver alerts, maintain your account, prevent fraud,
              and improve performance and reliability. We also use data to comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. Legal basis</h2>
            <p>
              Where applicable, we process data based on contract necessity, legitimate interests, and/or consent.
              Specific legal bases may vary by jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Sharing and affiliates</h2>
            <p>
              VixAI is an affiliate to Deriv (BVI) Ltd. When you link your MT5 account to our Introducing Broker (IB)
              via our platform, we may earn commission.
            </p>
            <p className="mt-2">
              We may share personal information with service providers who help us operate the Service (for example,
              hosting/database and email delivery). We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. Data retention</h2>
            <p>
              We keep personal data only for as long as needed for the purposes described in this policy, including
              to meet legal, accounting, or reporting requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Your rights</h2>
            <p>
              Depending on where you live, you may have rights such as access, correction, deletion, portability, and
              objection to processing. You can contact us using the details below to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Security</h2>
            <p>
              We use reasonable technical and organizational measures designed to protect personal data against
              unauthorized access, alteration, disclosure, or destruction.
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

          <section>
            <h2 className="text-lg font-bold mb-2">10. Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. The updated version will be posted on this page
              with an updated effective date.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

