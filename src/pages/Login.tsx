import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, AlertCircle, CheckCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import trussLogo from '../assets/trussctr-logo.png';
import { getPasswordResetRedirectUrl } from '../lib/authRedirect';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      const msg: string = err?.message || '';
      if (
        msg.toLowerCase().includes('load failed') ||
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('fetch')
      ) {
        setError('Unable to reach the server. Check your internet connection and try again.');
      } else {
        setError(msg || 'Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setForgotLoading(true);
    setError(null);
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      // On Capacitor (native), redirectTo is null — omit it and let Supabase
      // use the redirect URL configured in the dashboard (Auth → URL Configuration).
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        ...(redirectTo ? { redirectTo } : {}),
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      const msg: string = err?.message || '';
      if (
        msg.toLowerCase().includes('load failed') ||
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('fetch')
      ) {
        setError('Unable to reach the server. Check your internet connection and try again.');
      } else {
        setError(msg || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1E3A5F 55%, #1e3a5f 100%)' }}>
      {/* Safe area top */}
      <div style={{ height: 'env(safe-area-inset-top)' }} />

      {/* Hero — logo + wordmark */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-6">
        <div className="flex flex-col items-center gap-5">
          {/* Logo with glow */}
          <div
            className="h-24 w-24 rounded-[2rem] overflow-hidden border border-white/10"
            style={{
              boxShadow: '0 0 40px rgba(59,130,246,0.35), 0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <img src={trussLogo} alt="TrussCTR" className="h-full w-full object-cover" />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-4xl font-bold text-white tracking-tight">TrussCTR</h1>
            <p className="text-blue-300/80 text-sm font-medium tracking-wide">Contractor CRM · Mobile</p>
          </div>
        </div>
      </div>

      {/* Form card — slides up from the bottom */}
      <div
        className="w-full rounded-t-[2.5rem] px-6 pt-8 pb-6"
        style={{
          background: 'rgba(255,255,255,0.97)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* ── Forgot sent confirmation ── */}
        {forgotSent ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 text-center py-4">
              <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle size={34} className="text-emerald-500" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-800 text-lg">Check your inbox</p>
                <p className="text-sm text-slate-500 leading-relaxed">
                  We sent a password reset link to <span className="font-semibold text-slate-700">{email}</span>. Follow the link in the email to set a new password.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setForgotSent(false); setError(null); }}
              className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all"
            >
              Back to Sign In
            </button>
          </div>

        /* ── Forgot password form ── */
        ) : forgotMode ? (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-800">Reset Password</h2>
              <p className="text-sm text-slate-500">Enter your email and we'll send a reset link.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm">
                <AlertCircle size={18} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  autoFocus
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {forgotLoading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Send Reset Link <ArrowRight size={18} /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setForgotMode(false); setError(null); }}
              className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest py-2 hover:text-slate-600 transition-colors"
            >
              Back to Sign In
            </button>
          </form>

        /* ── Sign in form ── */
        ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-800">Welcome back</h2>
              <p className="text-sm text-slate-500">Sign in to your account to continue.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm">
                <AlertCircle size={18} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-11 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => { setForgotMode(true); setError(null); }}
                className="text-accent text-xs font-semibold hover:text-accent/80 transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-white"
              style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1E3A5F 100%)', boxShadow: '0 4px 20px rgba(59,130,246,0.35)' }}
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight size={18} /></>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
