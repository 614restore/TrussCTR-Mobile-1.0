import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import trussLogo from '../assets/trussctr-logo.png';

// Shown when must_change_password = true (temp password), after a Supabase
// PASSWORD_RECOVERY event (web reset link), or when the user taps Change Password
// in Settings. In all cases the user is already authenticated.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { profile, clearRecoverySession } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const clearRecoveryParamsFromUrl = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    const establishRecoverySession = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const searchParams = new URLSearchParams(window.location.search);

      try {
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const code = searchParams.get('code');
        const tokenHash = searchParams.get('token_hash');
        const type = searchParams.get('type');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          clearRecoveryParamsFromUrl();
          if (isMounted) setSessionReady(true);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          clearRecoveryParamsFromUrl();
          if (isMounted) setSessionReady(true);
          return;
        }

        if (tokenHash && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (error) throw error;
          clearRecoveryParamsFromUrl();
          if (isMounted) setSessionReady(true);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) setSessionReady(!!session);
      } catch (err: any) {
        console.error('Error establishing password recovery session:', err);
        if (isMounted) {
          setError(err?.message || 'Failed to validate reset link. Please request a new reset link.');
          setSessionReady(false);
        }
      } finally {
        if (isMounted) setCheckingSession(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    void establishRecoverySession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Use the admin-API edge function to change the password.
      // Direct supabase.auth.updateUser() is blocked by "Secure password change"
      // unless the session is a PASSWORD_RECOVERY session — temp-password logins
      // are normal SIGNED_IN sessions, so we bypass via the service role instead.
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/confirm-password-change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to update password.');
      }

      clearRecoverySession();
      setSuccess(true);
      setTimeout(() => navigate('/'), 1800);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10">
        <div className="text-center space-y-4">
          <div className="mx-auto h-24 w-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-xl border border-slate-100 overflow-hidden">
            <img src={trussLogo} alt="TrussCTR" className="h-full w-full object-cover" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-primary tracking-tight">Set New Password</h1>
            <p className="text-slate-500 text-sm font-medium">
              {(profile as any)?.must_change_password
                ? 'You signed in with a temporary password. Please set a permanent one to continue.'
                : 'Choose a new password for your account.'}
            </p>
          </div>
        </div>

        {success ? (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-6 rounded-2xl flex flex-col items-center gap-3 text-center">
            <CheckCircle size={32} className="text-emerald-500" />
            <p className="font-bold text-sm">Password updated successfully!</p>
            <p className="text-xs text-emerald-600">Redirecting you to sign in...</p>
          </div>
        ) : checkingSession ? (
          <div className="bg-slate-100 border border-slate-200 text-slate-600 p-5 rounded-2xl flex items-center gap-3 text-sm">
            <div className="h-5 w-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
            <span className="font-medium">
              Validating your reset link...
            </span>
          </div>
        ) : !sessionReady ? (
          <div className="bg-amber-50 border border-amber-100 text-amber-700 p-5 rounded-2xl flex items-center gap-3 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <span className="font-medium">
              No recovery session found. Please use the password reset link from your email.
            </span>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm">
                <AlertCircle size={18} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoFocus
                    className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Set Password'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
