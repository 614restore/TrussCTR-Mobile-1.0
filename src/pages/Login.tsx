import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
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
        setError('Unable to reach the server. Check your connection and try again.');
      } else {
        setError(msg || 'Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email address first.'); return; }
    setForgotLoading(true);
    setError(null);
    try {
      const redirectTo = getPasswordResetRedirectUrl();
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
        setError('Unable to reach the server. Check your connection and try again.');
      } else {
        setError(msg || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const BG_DARK = '#0a1628';
  const CARD_BG = 'rgba(255,255,255,0.07)';
  const INPUT_BG = 'rgba(255,255,255,0.08)';
  const INPUT_BORDER = 'rgba(255,255,255,0.12)';

  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden relative"
      style={{ background: `linear-gradient(160deg, #0d1f3c 0%, ${BG_DARK} 60%)` }}
    >
      {/* Safe area top */}
      <div style={{ height: 'env(safe-area-inset-top)' }} />

      {/* Watermark logo */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden
      >
        <img
          src={trussLogo}
          alt=""
          className="w-80 h-80 object-contain"
          style={{ opacity: 0.04 }}
        />
      </div>

      {/* Hero wordmark */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-4 relative z-10">
        <div className="flex flex-col items-center gap-3">
          <img src={trussLogo} alt="TrussCTR" className="h-20 w-20 object-contain rounded-2xl" />
          <div className="text-center space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="text-white">Truss</span><span style={{ color: '#3B82F6' }}>CTR</span>
            </h1>
            <p
              className="text-xs font-bold uppercase tracking-[0.25em]"
              style={{ color: '#3B82F6' }}
            >
              Contractor CRM · Mobile
            </p>
          </div>
        </div>
      </div>

      {/* Glass card */}
      <div
        className="relative z-10 w-full px-5 pb-6"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div
          className="rounded-3xl px-6 pt-6 pb-7"
          style={{
            background: CARD_BG,
            border: `1px solid ${INPUT_BORDER}`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}
        >

          {/* ── Reset sent confirmation ── */}
          {forgotSent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle size={48} style={{ color: '#3B82F6' }} />
              <div className="space-y-1">
                <p className="text-white font-bold text-lg">Check your inbox</p>
                <p className="text-white/60 text-sm leading-relaxed">
                  We sent a reset link to{' '}
                  <span className="text-white font-semibold">{email}</span>.
                  Follow the link to set a new password.
                </p>
              </div>
              <button
                onClick={() => { setForgotMode(false); setForgotSent(false); setError(null); }}
                className="mt-2 w-full py-4 rounded-2xl font-bold text-white text-base active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #1E3A5F)', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}
              >
                Back to Sign In
              </button>
            </div>

          /* ── Forgot password form ── */
          ) : forgotMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-0.5">
                <h2 className="text-white text-xl font-bold">Reset Password</h2>
                <p className="text-white/50 text-sm">Enter your email to receive a reset link.</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 text-red-300 px-4 py-3 rounded-2xl text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type="email"
                  required
                  autoFocus
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full py-4 pl-11 pr-4 rounded-2xl text-white text-sm outline-none transition-all"
                  style={{
                    background: INPUT_BG,
                    border: `1px solid ${INPUT_BORDER}`,
                    caretColor: '#3B82F6',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.6)')}
                  onBlur={e => (e.target.style.borderColor = INPUT_BORDER)}
                />
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-4 rounded-2xl font-bold text-white text-base active:scale-95 transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #1E3A5F)', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}
              >
                {forgotLoading
                  ? <span className="flex items-center justify-center gap-2"><span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /></span>
                  : 'Send Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => { setForgotMode(false); setError(null); }}
                className="w-full text-center text-white/40 text-xs font-bold uppercase tracking-widest py-1 active:opacity-60 transition-opacity"
              >
                Back to Sign In
              </button>
            </form>

          /* ── Sign in form ── */
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Tab-style header — matches QuoteMGR aesthetic */}
              <div className="flex border-b pb-4" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex-1 text-center">
                  <span
                    className="text-base font-bold pb-3 inline-block border-b-2"
                    style={{ color: '#3B82F6', borderColor: '#3B82F6' }}
                  >
                    Sign In
                  </span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 text-red-300 px-4 py-3 rounded-2xl text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email field */}
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type="email"
                  required
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full py-4 pl-11 pr-4 rounded-2xl text-white text-sm outline-none transition-all"
                  style={{
                    background: INPUT_BG,
                    border: `1px solid ${INPUT_BORDER}`,
                    caretColor: '#3B82F6',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.6)')}
                  onBlur={e => (e.target.style.borderColor = INPUT_BORDER)}
                />
              </div>

              {/* Password field */}
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-4 pl-11 pr-12 rounded-2xl text-white text-sm outline-none transition-all"
                  style={{
                    background: INPUT_BG,
                    border: `1px solid ${INPUT_BORDER}`,
                    caretColor: '#3B82F6',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.6)')}
                  onBlur={e => (e.target.style.borderColor = INPUT_BORDER)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-opacity active:opacity-60"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Forgot password */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setError(null); }}
                  className="text-sm font-medium transition-opacity active:opacity-60"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  Forgot Password?
                </button>
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl font-bold text-white text-base active:scale-95 transition-all disabled:opacity-60 mt-1"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  boxShadow: '0 4px 24px rgba(59,130,246,0.45)',
                }}
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /></span>
                  : 'Sign In'}
              </button>

              {/* Invite note */}
              <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Need access?{' '}
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Contact your company admin.</span>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
