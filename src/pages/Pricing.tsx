import { useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Pricing() {
  const { user, profile } = useAuth();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasActiveSubscription = profile?.subscription_status === 'active';
  const isTrialing = profile?.subscription_status === 'trialing';
  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  const monthlyPrice = 19.99;
  const yearlyPrice = 191;
  const yearlyMonthlyEquivalent = (yearlyPrice / 12).toFixed(2);

  const handleSubscribe = async (planType: 'monthly' | 'yearly') => {
    if (!user) {
      window.location.hash = 'login';
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to continue');
      }

      const priceId = planType === 'monthly'
        ? import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID
        : import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID;

      if (!priceId?.trim() || priceId.includes('xxxxxxxxxxxxx')) {
        throw new Error(
          'Stripe price IDs are missing. In Stripe Dashboard → Products, copy each recurring Price ID (price_…) into .env as VITE_STRIPE_MONTHLY_PRICE_ID and VITE_STRIPE_YEARLY_PRICE_ID, then restart the dev server.',
        );
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            price_id: priceId,
            success_url: `${window.location.origin}/#settings`,
            cancel_url: `${window.location.origin}/#pricing`,
            mode: 'subscription',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Stripe checkout error response:', errorData);
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      const url = typeof data?.url === 'string' ? data.url : '';
      if (!url) {
        throw new Error('Checkout session did not return a payment URL. Please try again or contact support.');
      }
      localStorage.setItem('stripe_checkout_started', 'true');
      window.location.href = url;
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'Failed to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    'Real-time AI-powered trading signals',
    'Multi-timeframe analysis',
    'ICT strategy integration',
    'MT5 account integration',
    'Live market monitoring',
    'Advanced technical indicators',
    'Email signal notifications',
    'Performance analytics',
    'Trade history tracking',
    '24/7 support',
  ];

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h1>

          {!hasActiveSubscription && !isTrialing && (
            <p className="text-xl text-slate-300 mb-8">
              Subscribe anytime, or connect your MT5 account to start a 3-day free trial first
            </p>
          )}

          {isTrialing && trialDaysLeft > 0 && (
            <div className="inline-block bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-6 py-3 mb-8">
              <p className="text-emerald-400 font-medium">
                You have {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in your free trial
              </p>
            </div>
          )}

          {hasActiveSubscription && (
            <div className="inline-block bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-6 py-3 mb-8">
              <p className="text-emerald-400 font-medium">
                You have an active Pro subscription
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mb-12">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={`px-6 py-3 rounded-lg font-medium transition-all relative ${
                billingInterval === 'yearly'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto mb-8 bg-red-500/10 border border-red-500/30 rounded-lg px-6 py-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">Pro Plan</h2>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-bold text-white">
                  ${billingInterval === 'monthly' ? monthlyPrice : yearlyMonthlyEquivalent}
                </span>
                <span className="text-slate-400 text-lg">/month</span>
              </div>
              {billingInterval === 'yearly' && (
                <p className="text-slate-400 mt-2">
                  Billed ${yearlyPrice} annually
                </p>
              )}
              <p className="text-emerald-400 font-medium mt-4 text-lg">
                3-day free trial when you connect MT5 (optional before subscribing)
              </p>
            </div>

            <div className="space-y-4 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">{feature}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleSubscribe(billingInterval)}
              disabled={loading || hasActiveSubscription}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                hasActiveSubscription
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg hover:shadow-emerald-500/25'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </span>
              ) : hasActiveSubscription ? (
                'Already Subscribed'
              ) : (
                'Subscribe Now'
              )}
            </button>

            {hasActiveSubscription && (
              <button
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                      throw new Error('Please sign in to continue');
                    }

                    const response = await fetch(
                      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                          return_url: `${window.location.origin}/#pricing`,
                        }),
                      }
                    );

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || 'Failed to open billing portal');
                    }

                    const { url } = await response.json();
                    if (url) {
                      window.location.href = url;
                    }
                  } catch (err: any) {
                    console.error('Portal error:', err);
                    setError(err.message || 'Failed to open billing portal. Please try again.');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full mt-3 py-3 px-6 rounded-lg font-medium text-base transition-all bg-slate-700 hover:bg-slate-600 text-white"
              >
                Manage Subscription
              </button>
            )}

            <p className="text-center text-slate-400 text-sm mt-4">
              Cancel anytime. No questions asked.
            </p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold text-white mb-8">Frequently Asked Questions</h3>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 text-left">
              <h4 className="text-lg font-semibold text-white mb-2">How does the free trial work?</h4>
              <p className="text-slate-300">
                When you connect your MT5 account, you get 3 days of full access to all Pro features at no cost.
                No credit card required for the trial. After the trial ends, subscribe to continue receiving signals.
              </p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 text-left">
              <h4 className="text-lg font-semibold text-white mb-2">Can I cancel anytime?</h4>
              <p className="text-slate-300">
                Yes! You can cancel your subscription at any time from your settings. You'll continue
                to have access until the end of your billing period.
              </p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 text-left">
              <h4 className="text-lg font-semibold text-white mb-2">What payment methods do you accept?</h4>
              <p className="text-slate-300">
                We accept all major credit cards through our secure payment processor, Stripe.
              </p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 text-left">
              <h4 className="text-lg font-semibold text-white mb-2">How much do I save with the annual plan?</h4>
              <p className="text-slate-300">
                The annual plan saves you 20% compared to paying monthly. That's over $48 in savings per year!
              </p>
            </div>
          </div>
        </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
