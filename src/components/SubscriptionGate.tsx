import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Crown, Lock } from 'lucide-react';

interface SubscriptionGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function SubscriptionGate({ children, fallback }: SubscriptionGateProps) {
  const { hasActiveSubscription, isTrialing, profile } = useAuth();

  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (hasActiveSubscription) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 text-center border border-slate-700">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 rounded-full mb-4">
        <Lock className="w-8 h-8 text-emerald-500" />
      </div>
      <h3 className="text-2xl font-bold text-white mb-2">Premium Feature</h3>
      {isTrialing && trialDaysLeft === 0 ? (
        <p className="text-slate-300 mb-6">
          Your free trial has expired. Subscribe to continue accessing this feature.
        </p>
      ) : (
        <p className="text-slate-300 mb-6">
          Subscribe to unlock this premium feature and get full access to all trading signals.
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => window.location.hash = 'pricing'}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-lg transition-all shadow-lg"
        >
          <Crown className="w-5 h-5" />
          View Pricing Plans
        </button>
      </div>
    </div>
  );
}
