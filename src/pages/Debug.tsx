import { useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export function Debug() {
  const { user } = useAuth();
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runTests = async () => {
    setTesting(true);
    const testResults: any = {
      timestamp: new Date().toISOString(),
      tests: [],
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();

      testResults.session = {
        exists: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        tokenPreview: session?.access_token?.substring(0, 20) + '...',
        expiresAt: session?.expires_at,
      };

      if (session) {
        const testSimple = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-simple`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        testResults.tests.push({
          name: 'test-simple (no JWT verification)',
          status: testSimple.status,
          ok: testSimple.ok,
          result: await testSimple.json(),
        });

        const testDeriv = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-deriv`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        testResults.tests.push({
          name: 'test-deriv (no JWT verification)',
          status: testDeriv.status,
          ok: testDeriv.ok,
          result: await testDeriv.json(),
        });

        const testGenerate = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-signals`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              symbols: ['R_10'],
              timeframe: 'M15',
              count: 1,
            }),
          }
        );

        const generateResult = testGenerate.ok ? await testGenerate.json() : await testGenerate.text();

        testResults.tests.push({
          name: 'generate-signals (with JWT verification)',
          status: testGenerate.status,
          ok: testGenerate.ok,
          result: generateResult,
        });
      }

      setResults(testResults);
    } catch (error: any) {
      testResults.error = error.message;
      setResults(testResults);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="settings">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-black dark:text-white mb-2">Debug & Diagnostics</h2>
              <p className="text-slate-600 dark:text-slate-400">Test edge functions and API connectivity</p>
            </div>
            <button
              onClick={runTests}
              disabled={testing}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Run Tests
                </>
              )}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-black dark:text-white mb-4">Current User</h3>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex gap-2">
                <span className="text-slate-600 dark:text-slate-400">Email:</span>
                <span className="text-black dark:text-white">{user?.email || 'Not logged in'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-600 dark:text-slate-400">User ID:</span>
                <span className="text-black dark:text-white">{user?.id || 'N/A'}</span>
              </div>
            </div>
          </div>

          {results && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-black dark:text-white mb-4">Test Results</h3>

              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h4 className="font-semibold text-black dark:text-white mb-2">Session Info</h4>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(results.session, null, 2)}
                  </pre>
                </div>

                {results.tests.map((test: any, index: number) => (
                  <div key={index} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-black dark:text-white">{test.name}</h4>
                      <div className="flex items-center gap-2">
                        {test.ok ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <span className="text-green-600 font-semibold">Success ({test.status})</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <span className="text-red-600 font-semibold">Failed ({test.status})</span>
                          </>
                        )}
                      </div>
                    </div>
                    <pre className="text-xs overflow-auto bg-black text-green-400 p-3 rounded">
                      {JSON.stringify(test.result, null, 2)}
                    </pre>
                  </div>
                ))}

                {results.error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h4 className="font-semibold text-red-900 dark:text-red-200 mb-2">Error</h4>
                    <pre className="text-xs text-red-800 dark:text-red-300">
                      {results.error}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {!results && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400">
                Click "Run Tests" to diagnose edge function connectivity
              </p>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
