import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type TradingMode = 'demo' | 'live';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  trading_mode: TradingMode;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tradingMode: TradingMode;
  hasVerifiedLiveMt5: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  setTradingMode: (mode: TradingMode) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tradingMode, setTradingModeState] = useState<TradingMode>('demo');
  const [hasVerifiedLiveMt5, setHasVerifiedLiveMt5] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfileAndStatus = async (nextUser: User | null) => {
    if (!nextUser) {
      setProfile(null);
      setTradingModeState('demo');
      setHasVerifiedLiveMt5(false);
      return;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('id,email,full_name,trading_mode')
      .eq('id', nextUser.id)
      .maybeSingle();

    // Ensure profile exists; keep this resilient for older users.
    if (!prof?.id) {
      const fallback: Profile = {
        id: nextUser.id,
        email: nextUser.email ?? '',
        full_name: null,
        trading_mode: 'demo',
      };
      setProfile(fallback);
      setTradingModeState(fallback.trading_mode);
    } else {
      const mode = (prof as any).trading_mode === 'live' ? 'live' : 'demo';
      const nextProfile: Profile = {
        id: prof.id,
        email: prof.email ?? nextUser.email ?? '',
        full_name: (prof as any).full_name ?? null,
        trading_mode: mode,
      };
      setProfile(nextProfile);
      setTradingModeState(nextProfile.trading_mode);
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
      });

      if (error) throw error;

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email!,
            full_name: fullName || null,
            trading_mode: 'demo',
          });

        if (profileError) throw profileError;
      }

      return { error: null };
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
    <AuthContext.Provider value={{ user, session, profile, tradingMode, hasVerifiedLiveMt5, loading, signUp, signIn, signOut, setTradingMode }}>
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
