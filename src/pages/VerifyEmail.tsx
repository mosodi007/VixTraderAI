import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getEdgeFunctionHeaders, supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';

const SEND_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-verification`;
const VERIFY_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-email-signup`;

function getTokenFromHash(): string | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const [route, query = ''] = hash.split('?');
  if (route !== 'verify-email') return null;
  if (!query) return null;
  const params = new URLSearchParams(query);
  return params.get('token');
}

export function VerifyEmail() {
  const { user, profile, session } = useAuth();
  const { theme } = useTheme();

  const token = useMemo(() => getTokenFromHash(), []);
  const [now, setNow] = useState<number>(() => Date.now());
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(() => {
    const raw = (profile as any)?.email_verification_expires_at as string | null | undefined;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const raw = (profile as any)?.email_verification_expires_at as string | null | undefined;
    if (!raw) {
      setExpiresAtMs(null);
      return;
    }
    const d = new Date(raw);
    setExpiresAtMs(Number.isNaN(d.getTime()) ? null : d.getTime());
  }, [profile?.email_verification_expires_at]);

  useEffect(() => {
    // If already verified, go home.
    if (profile?.email_verified_at) {
      window.location.hash = 'home';
    }
  }, [profile?.email_verified_at]);

  const remainingMs = expiresAtMs ? expiresAtMs - now : 0;
  const isExpired = expiresAtMs ? remainingMs <= 0 : true;
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const ss = String(remainingSeconds % 60).padStart(2, '0');

  const refetchVerificationExpiry = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('profiles').select('email_verification_expires_at').eq('id', user.id).maybeSingle();
    if (error) return;
    const raw = (data as any)?.email_verification_expires_at as string | null | undefined;
    if (!raw) {
      setExpiresAtMs(null);
      return;
    }
    const d = new Date(raw);
    setExpiresAtMs(Number.isNaN(d.getTime()) ? null : d.getTime());
  };

  useEffect(() => {
    // Right after sign-up + sending the email, profile data may not yet include the new expiry.
    if (user && !expiresAtMs) {
      refetchVerificationExpiry();
    }
    // Intentionally omit refetchVerificationExpiry from deps; we only want this one-shot behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, expiresAtMs]);

  const resend = async () => {
    setResending(true);
    setMessage(null);
    try {
      // Fetch a fresh session token if available, but don't block resend on JWT availability.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      let emailToSend = profile?.email || user?.email || '';
      if (!emailToSend && user?.id) {
        const { data, error } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', user.id)
          .maybeSingle();
        if (!error && data?.email) {
          emailToSend = data.email;
        }
      }
      if (!emailToSend) {
        throw new Error('Missing email address for verification resend. Please sign out and sign in again.');
      }

      const response = await fetch(SEND_ENDPOINT, {
        method: 'POST',
        headers: {
          ...getEdgeFunctionHeaders(accessToken),
        },
        body: JSON.stringify({ email: emailToSend.trim().toLowerCase() }),
      });

      const rawText = await response.text().catch(() => '');
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        const detailBits: string[] = [];
        if (data?.details) detailBits.push(String(data.details));
        if (typeof data?.jwtLength === 'number') detailBits.push(`jwtLength=${data.jwtLength}`);
        const detail = detailBits.length ? ` (${detailBits.join(', ')})` : '';
        const msg = data?.error || data?.message || rawText || 'Failed to resend verification email.';
        throw new Error(`${msg}${detail ? detail : ''}`);
      }

      if (data?.message) {
        setMessage({ type: 'success', text: String(data.message) });
      } else if (data?.already_verified) {
        setMessage({ type: 'success', text: 'Email is already verified. No verification email was needed.' });
      } else {
        setMessage({ type: 'success', text: `Verification email sent to ${user?.email || 'your inbox'}.` });
      }
      await refetchVerificationExpiry();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Failed to resend verification email.' });
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setVerifying(true);
      setMessage(null);
      try {
        const response = await fetch(VERIFY_ENDPOINT, {
          method: 'POST',
          headers: {
            ...getEdgeFunctionHeaders(),
          },
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success !== true) {
          throw new Error(data?.error || data?.message || 'Verification failed.');
        }

        setMessage({ type: 'success', text: 'Email verified successfully.' });
        // Ensure App gating sees updated profile.
        window.location.reload();
      } catch (e: any) {
        setMessage({ type: 'error', text: e?.message || 'Verification failed.' });
      } finally {
        setVerifying(false);
      }
    };

    run();
    // We intentionally run only once for the token in the initial URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
          <a
            href="#login"
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            Back to login
          </a>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Verify your email</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
          A verification email has been sent to{' '}
          <span className="font-semibold">{user?.email || 'your email'}</span>, go to your inbox and confirm
          your email.
        </p>

        {expiresAtMs && (
          <div className="bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              This verification link expires in{' '}
              <span className="font-mono font-semibold">
                {mm}:{ss}
              </span>
              .
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isExpired ? 'Expired. You can resend below.' : 'If it expires, resend to get a fresh link.'}
            </p>
          </div>
        )}

        {message && (
          <div
            className={`rounded-lg p-3 mb-4 border ${
              message.type === 'success'
                ? 'bg-emerald-600/10 border-emerald-600/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-600/10 border-red-600/30 text-red-700 dark:text-red-400'
            }`}
          >
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        <button
          type="button"
          onClick={resend}
          disabled={resending || verifying || !isExpired}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors mb-2"
        >
          {resending ? 'Sending...' : 'Resend verification email'}
        </button>

        <p className="text-xs text-slate-600 dark:text-slate-400 text-center mt-2">
          For help, contact{' '}
          <a className="underline" href="mailto:support@vixai.trade">
            support@vixai.trade
          </a>
          .
        </p>
      </main>
    </div>
  );
}

