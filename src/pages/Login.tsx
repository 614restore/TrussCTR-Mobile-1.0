import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import trussLogo from '../assets/trussctr-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        email,
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      const msg: string = err?.message || '';
      // iOS WebKit reports network failures as "Load failed"; catch that and
      // other generic fetch errors so the user gets a helpful message.
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
      // Call the temp-password-reset edge function. It generates a temporary
      // password, emails it to the user, and sets must_change_password = true
      // in the profile. No redirect link is involved, so it works from any
      // device or email client without PKCE / cross-context issues.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/temp-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to send temporary password.');
      }
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
        setError(msg || 'Failed to send temporary password. Please try again.');
      }
    } finally {
      setForgotLoading(false);
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
            <h1 className="text-3xl font-bold text-primary tracking-tight">TrussCTR</h1>
            <p className="text-slate-500 text-sm font-medium">Contractor CRM Mobile Companion</p>
          </div>
        </div>

        {/* Forgot password confirmation */}
        {forgotSent ? (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-6 rounded-2xl flex flex-col items-center gap-3 text-center">
            <CheckCircle size={32} className="text-emerald-500" />
            <p className="font-bold text-sm">Temporary password sent!</p>
            <p className="text-xs text-emerald-600">Check your email for a temporary password, then sign in below. You'll be asked to set a new password right away.</p>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setForgotSent(false); setError(null); }}
              className="mt-2 text-emerald-700 text-xs font-bold uppercase tracking-widest hover:text-emerald-900 transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        ) : forgotMode ? (
          /* Forgot password form */
          <form onSubmit={handleForgotPassword} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm">
                <AlertCircle size={18} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center space-y-2">
              <p className="text-amber-800 text-sm font-medium">Please reset your password from the web browser.</p>
              <a
                href="https://crm-kanban-integrate.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent text-xs font-bold underline underline-offset-2"
              >
                crm-kanban-integrate.vercel.app
              </a>
            </div>
            <p className="text-slate-500 text-sm text-center">
              Or enter your email below to receive a temporary password.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="email"
                  required
                  autoFocus
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {forgotLoading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Send Reset Link'
              )}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setForgotMode(false); setError(null); }}
                className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        ) : (
          /* Sign in form */
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm animate-shake">
                <AlertCircle size={18} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="email"
                    required
                    className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="password"
                    required
                    className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Sign In to Dashboard'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setForgotMode(true); setError(null); }}
                className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
