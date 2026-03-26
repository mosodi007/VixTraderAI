import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type TradingMode = 'demo' | 'live';

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'unpaid';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  trading_mode: TradingMode;
  email_verified_at?: string | null;
  email_verification_expires_at?: string | null;
  subscription_status?: SubscriptionStatus | 'inactive' | null;
  trial_ends_at?: string | null;
  trial_started_at?: string | null;
  stripe_customer_id?: string | null;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tradingMode: TradingMode;
  hasVerifiedLiveMt5: boolean;
  hasActiveSubscription: boolean;
  isTrialing: boolean;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error: Error | null; session?: Session | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  setTradingMode: (mode: TradingMode) => Promise<{ error: Error | null }>;
  /** Opens Google OAuth; browser redirects away on success. */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tradingMode, setTradingModeState] = useState<TradingMode>('demo');
  const [hasVerifiedLiveMt5, setHasVerifiedLiveMt5] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isTrialing, setIsTrialing] = useState(false);
  const [loading, setLoading] = useState(true);

  const isGoogleUser = (u: User) =>
    !!u.identities?.some((i) => i.provider === 'google') ||
    (u.app_metadata as Record<string, unknown> | undefined)?.provider === 'google';

  const loadProfileAndStatus = async (nextUser: User | null) => {
    if (!nextUser) {
      setProfile(null);
      setTradingModeState('demo');
      setHasVerifiedLiveMt5(false);
      setHasActiveSubscription(false);
      setIsTrialing(false);
      return;
    }

    let { data: prof } = await supabase
      .from('profiles')
      .select('id,email,full_name,trading_mode,email_verified_at,email_verification_expires_at,subscription_status,trial_ends_at,trial_started_at,stripe_customer_id')
      .eq('id', nextUser.id)
      .maybeSingle();

    const google = isGoogleUser(nextUser);
    const meta = nextUser.user_metadata as Record<string, unknown> | undefined;
    const metaFullName =
      (typeof meta?.full_name === 'string' && meta.full_name) ||
      (typeof meta?.name === 'string' && meta.name) ||
      null;

    // OAuth (Google): create profile row; Google already verified the email.
    if (!prof?.id) {
      const { error: upsertErr } = await supabase.from('profiles').upsert(
        {
          id: nextUser.id,
          email: (nextUser.email ?? '').trim().toLowerCase(),
          full_name: metaFullName,
          trading_mode: 'demo',
          email_verified_at: google ? new Date().toISOString() : null,
          subscription_status: 'inactive',
        },
        { onConflict: 'id' },
      );
      if (!upsertErr) {
        const { data: again } = await supabase
          .from('profiles')
          .select('id,email,full_name,trading_mode,email_verified_at,email_verification_expires_at,subscription_status,trial_ends_at,trial_started_at,stripe_customer_id')
          .eq('id', nextUser.id)
          .maybeSingle();
        prof = again;
      }
    } else if (google && !(prof as any).email_verified_at) {
      // Linked Google sign-in: mark custom verification so app gating matches Auth.
      await supabase
        .from('profiles')
        .update({
          email_verified_at: new Date().toISOString(),
          email_verification_token: null,
          email_verification_expires_at: null,
          ...(metaFullName && !(prof as any).full_name ? { full_name: metaFullName } : {}),
        })
        .eq('id', nextUser.id);
      const { data: again } = await supabase
        .from('profiles')
        .select('id,email,full_name,trading_mode,email_verified_at,email_verification_expires_at,subscription_status,trial_ends_at,trial_started_at,stripe_customer_id')
        .eq('id', nextUser.id)
        .maybeSingle();
      prof = again;
    }

    // Ensure profile exists; keep this resilient for older users.
    if (!prof?.id) {
      const fallback: Profile = {
        id: nextUser.id,
        email: nextUser.email ?? '',
        full_name: null,
        trading_mode: 'demo',
        email_verified_at: null,
        email_verification_expires_at: null,
        subscription_status: 'inactive',
        trial_ends_at: null,
        trial_started_at: null,
      };
      setProfile(fallback);
      setTradingModeState(fallback.trading_mode);
      setIsTrialing(false);
      setHasActiveSubscription(false);
    } else {
      const mode = (prof as any).trading_mode === 'live' ? 'live' : 'demo';
      const subscriptionStatus = (prof as any).subscription_status;
      const trialEndsAt = (prof as any).trial_ends_at;
      const trialStartedAt = (prof as any).trial_started_at;
      const isInTrial = subscriptionStatus === 'trialing' && trialEndsAt && new Date(trialEndsAt) > new Date();
      const hasActiveSub = subscriptionStatus === 'active' || isInTrial;

      const nextProfile: Profile = {
        id: prof.id,
        email: prof.email ?? nextUser.email ?? '',
        full_name: (prof as any).full_name ?? null,
        trading_mode: mode,
        email_verified_at: (prof as any).email_verified_at ?? null,
        email_verification_expires_at: (prof as any).email_verification_expires_at ?? null,
        subscription_status: subscriptionStatus ?? 'inactive',
        trial_ends_at: trialEndsAt ?? null,
        trial_started_at: trialStartedAt ?? null,
        stripe_customer_id: (prof as any).stripe_customer_id ?? null,
      };
      setProfile(nextProfile);
      setTradingModeState(nextProfile.trading_mode);
      setIsTrialing(isInTrial);
      setHasActiveSubscription(hasActiveSub);
    }

    const { data: liveAcct } = await supabase
      .from('mt5_accounts')
      .select('id')
      .eq('user_id', nextUser.id)
      .eq('account_type', 'real')
      .eq('verified', true)
      .limit(1);
    setHasVerifiedLiveMt5(!!(liveAcct && liveAcct.length > 0));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfileAndStatus(session?.user ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(true);
        await loadProfileAndStatus(session?.user ?? null);
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Avoid using '#...' here because Supabase confirmation links may include auth tokens in the hash.
          // The client-side app will route to '#verify-email' after a successful sign-up.
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: data.user.id,
              email: data.user.email!,
              full_name: fullName || null,
              trading_mode: 'demo',
              email_verified_at: null,
            },
            { onConflict: 'id' },
          );

        if (profileError) throw profileError;
      }

      return { error: null, session: data.session ?? null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname || '/'}`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const setTradingMode = async (mode: TradingMode) => {
    try {
      if (!user) throw new Error('Not signed in');
      const nextMode: TradingMode = mode === 'live' ? 'live' : 'demo';

      const { error } = await supabase
        .from('profiles')
        .update({ trading_mode: nextMode, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, trading_mode: nextMode } : prev));
      setTradingModeState(nextMode);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        tradingMode,
        hasVerifiedLiveMt5,
        hasActiveSubscription,
        isTrialing,
        loading,
        signUp,
        signIn,
        signOut,
        setTradingMode,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
