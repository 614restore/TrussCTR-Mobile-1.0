import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Mail, Lock, Eye, EyeOff, User, Building2,
  AlertCircle, CheckCircle, ArrowLeft,
} from 'lucide-react';
import trussLogo from '../assets/trussctr-logo.png';
import { getPasswordResetRedirectUrl } from '../lib/authRedirect';

/* ─── Brand tokens ─────────────────────────────────────────── */
const BG_TOP    = '#0d1f3c';
const BG_BOTTOM = '#071122';
const CARD_BG   = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.11)';
const INPUT_BG  = 'rgba(255,255,255,0.08)';
const INPUT_BORDER = 'rgba(255,255,255,0.13)';
const ACCENT    = '#2563EB';          // rich TrussCTR blue
const ACCENT2   = '#1d4ed8';          // darker stop for gradient
const DIM_TEXT  = 'rgba(255,255,255,0.4)';

type Tab = 'signin' | 'signup';
type ResetStep = 'idle' | 'form' | 'sent';

/* ─── Reusable icon-prefixed input ─────────────────────────── */
function Field({
  icon: Icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  right,
  autoCapitalize = 'none',
  autoCorrect = 'off',
  inputMode,
  required = true,
  autoFocus,
}: {
  icon: React.ElementType;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  right?: React.ReactNode;
  autoCapitalize?: string;
  autoCorrect?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <Icon
        size={17}
        className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: focused ? `${ACCENT}cc` : DIM_TEXT, transition: 'color 0.2s' }}
      />
      <input
        type={type}
        required={required}
        autoFocus={autoFocus}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full py-[14px] pl-11 pr-4 rounded-2xl text-white text-sm outline-none"
        style={{
          background: INPUT_BG,
          border: `1.5px solid ${focused ? `${ACCENT}88` : INPUT_BORDER}`,
          caretColor: ACCENT,
          transition: 'border-color 0.2s',
        }}
        placeholder-style={{ color: DIM_TEXT }}
      />
      {right && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">{right}</div>
      )}
    </div>
  );
}

/* ─── Spinner ───────────────────────────────────────────────── */
function Spinner() {
  return (
    <span
      className="inline-block h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin"
    />
  );
}

/* ─── Primary button ────────────────────────────────────────── */
function PrimaryBtn({
  children, loading, disabled, type = 'submit', onClick,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={loading || disabled}
      onClick={onClick}
      className="w-full py-4 rounded-2xl font-bold text-white text-base active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      style={{
        background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
        boxShadow: `0 4px 24px ${ACCENT}55`,
      }}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

/* ─── Ghost / text button ───────────────────────────────────── */
function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-center text-xs font-bold uppercase tracking-widest py-1 active:opacity-60 transition-opacity"
      style={{ color: DIM_TEXT }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════ */
export default function Login() {
  const [tab, setTab] = useState<Tab>('signin');
  const [resetStep, setResetStep] = useState<ResetStep>('idle');

  /* sign-in fields */
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError]     = useState<string | null>(null);

  /* sign-up fields */
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [company, setCompany]       = useState('');
  const [suEmail, setSuEmail]       = useState('');
  const [suPw, setSuPw]             = useState('');
  const [suPwConfirm, setSuPwConfirm] = useState('');
  const [showSuPw, setShowSuPw]     = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [signUpError, setSignUpError]     = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState<string | null>(null);

  /* reset */
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError]     = useState<string | null>(null);

  /* ── helpers ─────────────────────────────────────────────── */
  const netErr = (msg: string) =>
    msg.toLowerCase().includes('load failed') ||
    msg.toLowerCase().includes('failed to fetch') ||
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('fetch');

  const switchTab = (t: Tab) => {
    setTab(t);
    setSignInError(null);
    setSignUpError(null);
    setSignUpSuccess(null);
    setResetStep('idle');
  };

  /* ── Sign In ─────────────────────────────────────────────── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInLoading(true);
    setSignInError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      const msg: string = err?.message || '';
      setSignInError(
        netErr(msg)
          ? 'Unable to reach the server. Check your connection and try again.'
          : msg || 'Sign-in failed. Please try again.'
      );
    } finally {
      setSignInLoading(false);
    }
  };

  /* ── Sign Up ─────────────────────────────────────────────── */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError(null);
    setSignUpSuccess(null);

    if (suPw.length < 6) {
      setSignUpError('Password must be at least 6 characters.');
      return;
    }
    if (suPw !== suPwConfirm) {
      setSignUpError('Passwords do not match.');
      return;
    }

    setSignUpLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: suEmail.trim().toLowerCase(),
        password: suPw,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            company_name: company.trim(),
          },
        },
      });
      if (error) throw error;
      setSignUpSuccess('Account created! Check your email to verify, then sign in.');
      // auto-switch to sign-in after a beat
      setTimeout(() => switchTab('signin'), 2800);
    } catch (err: any) {
      const msg: string = err?.message || '';
      setSignUpError(
        netErr(msg)
          ? 'Unable to reach the server. Check your connection and try again.'
          : msg || 'Sign-up failed. Please try again.'
      );
    } finally {
      setSignUpLoading(false);
    }
  };

  /* ── Forgot password ─────────────────────────────────────── */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) { setResetError('Please enter your email address.'); return; }
    setResetLoading(true);
    setResetError(null);
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(
        resetEmail.trim().toLowerCase(),
        redirectTo ? { redirectTo } : {}
      );
      if (error) throw error;
      setResetStep('sent');
    } catch (err: any) {
      const msg: string = err?.message || '';
      setResetError(
        netErr(msg)
          ? 'Unable to reach the server. Check your connection and try again.'
          : msg || 'Failed to send reset email. Please try again.'
      );
    } finally {
      setResetLoading(false);
    }
  };

  /* ─── render ─────────────────────────────────────────────── */
  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden relative"
      style={{ background: `linear-gradient(160deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)` }}
    >
      {/* safe-area top */}
      <div style={{ height: 'env(safe-area-inset-top)' }} />

      {/* Watermark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden
      >
        <img src={trussLogo} alt="" className="w-[380px] h-[380px] object-contain" style={{ opacity: 0.045 }} />
      </div>

      {/* ── Hero wordmark ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-14 pb-6 relative z-10">
        <div className="flex flex-col items-center gap-4">
          {/* Logo icon */}
          <div
            className="w-20 h-20 rounded-[1.4rem] flex items-center justify-center overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1.5px solid ${CARD_BORDER}`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)`,
            }}
          >
            <img src={trussLogo} alt="TrussCTR" className="w-14 h-14 object-contain" />
          </div>

          {/* Wordmark */}
          <div className="text-center space-y-1">
            <h1 className="text-[2.6rem] font-extrabold tracking-tight leading-none">
              <span className="text-white">Truss</span>
              <span style={{ color: ACCENT }}>CTR</span>
            </h1>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: `${ACCENT}cc` }}
            >
              Contractor CRM · Mobile
            </p>
          </div>
        </div>
      </div>

      {/* ── Glass card ───────────────────────────────────────── */}
      <div
        className="relative z-10 w-full px-4"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: CARD_BG,
            border: `1.5px solid ${CARD_BORDER}`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
          }}
        >

          {/* ══ Reset-sent confirmation ════════════════════════ */}
          {resetStep === 'sent' && (
            <div className="px-6 py-8 flex flex-col items-center gap-5 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}44` }}
              >
                <CheckCircle size={32} style={{ color: ACCENT }} />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold text-lg">Check your inbox</p>
                <p className="text-sm leading-relaxed" style={{ color: DIM_TEXT }}>
                  Reset link sent to{' '}
                  <span className="text-white font-semibold">{resetEmail}</span>
                </p>
              </div>
              <PrimaryBtn
                type="button"
                onClick={() => { setResetStep('idle'); setResetError(null); }}
              >
                Back to Sign In
              </PrimaryBtn>
            </div>
          )}

          {/* ══ Reset form ══════════════════════════════════════ */}
          {resetStep === 'form' && (
            <div className="px-6 py-6 space-y-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setResetStep('idle'); setResetError(null); }}
                  className="p-2 rounded-xl active:opacity-60 transition-opacity"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <ArrowLeft size={18} style={{ color: DIM_TEXT }} />
                </button>
                <div>
                  <p className="text-white font-bold text-base leading-tight">Reset Password</p>
                  <p className="text-xs" style={{ color: DIM_TEXT }}>We'll send a link to your email</p>
                </div>
              </div>

              {resetError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <Field
                  icon={Mail}
                  type="email"
                  placeholder="Email address"
                  value={resetEmail}
                  onChange={setResetEmail}
                  inputMode="email"
                  autoFocus
                />
                <PrimaryBtn loading={resetLoading}>Send Reset Link</PrimaryBtn>
              </form>
            </div>
          )}

          {/* ══ Main tabs (Sign In / Sign Up) ═══════════════════ */}
          {resetStep === 'idle' && (
            <>
              {/* Tab bar */}
              <div
                className="flex"
                style={{ borderBottom: `1px solid ${CARD_BORDER}` }}
              >
                {(['signin', 'signup'] as Tab[]).map((t) => {
                  const active = tab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => switchTab(t)}
                      className="flex-1 py-4 text-sm font-bold tracking-wide relative transition-colors"
                      style={{ color: active ? '#fff' : DIM_TEXT }}
                    >
                      {t === 'signin' ? 'Sign In' : 'Sign Up'}
                      {active && (
                        <span
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] rounded-full"
                          style={{ width: '40%', background: ACCENT }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── Sign In panel ───────────────────────────── */}
              {tab === 'signin' && (
                <form onSubmit={handleSignIn} className="px-6 py-6 space-y-4">
                  {signInError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{signInError}</span>
                    </div>
                  )}

                  <Field
                    icon={Mail}
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={setEmail}
                    inputMode="email"
                    autoFocus
                  />

                  <Field
                    icon={Lock}
                    type={showPw ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={setPassword}
                    right={
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPw(v => !v)}
                        className="active:opacity-60 transition-opacity"
                        style={{ color: DIM_TEXT }}
                      >
                        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    }
                  />

                  {/* Forgot password — right-aligned */}
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => { setResetStep('form'); setResetEmail(email); setResetError(null); }}
                      className="text-xs font-semibold active:opacity-60 transition-opacity"
                      style={{ color: `${ACCENT}cc` }}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <PrimaryBtn loading={signInLoading}>Sign In</PrimaryBtn>

                  <p className="text-center text-[11px]" style={{ color: DIM_TEXT }}>
                    Need access?{' '}
                    <button
                      type="button"
                      className="font-semibold active:opacity-60"
                      style={{ color: `${ACCENT}cc` }}
                      onClick={() => switchTab('signup')}
                    >
                      Create an account
                    </button>
                  </p>
                </form>
              )}

              {/* ── Sign Up panel ───────────────────────────── */}
              {tab === 'signup' && (
                <form onSubmit={handleSignUp} className="px-6 py-6 space-y-4">
                  {signUpError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{signUpError}</span>
                    </div>
                  )}
                  {signUpSuccess && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                      style={{ background: 'rgba(37,99,235,0.15)', border: `1px solid ${ACCENT}44`, color: '#93c5fd' }}>
                      <CheckCircle size={15} className="shrink-0" />
                      <span>{signUpSuccess}</span>
                    </div>
                  )}

                  {/* First + Last name side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field icon={User} placeholder="First name" value={firstName} onChange={setFirstName} autoCapitalize="words" />
                    <div className="relative">
                      <input
                        type="text"
                        required
                        autoCapitalize="words"
                        autoCorrect="off"
                        autoComplete="off"
                        placeholder="Last name"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        className="w-full py-[14px] px-4 rounded-2xl text-white text-sm outline-none"
                        style={{
                          background: INPUT_BG,
                          border: `1.5px solid ${INPUT_BORDER}`,
                          caretColor: ACCENT,
                        }}
                      />
                    </div>
                  </div>

                  <Field
                    icon={Building2}
                    placeholder="Company name"
                    value={company}
                    onChange={setCompany}
                    autoCapitalize="words"
                  />

                  <Field
                    icon={Mail}
                    type="email"
                    placeholder="Email address"
                    value={suEmail}
                    onChange={setSuEmail}
                    inputMode="email"
                  />

                  <Field
                    icon={Lock}
                    type={showSuPw ? 'text' : 'password'}
                    placeholder="Password (min 6 chars)"
                    value={suPw}
                    onChange={setSuPw}
                    right={
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSuPw(v => !v)}
                        className="active:opacity-60 transition-opacity"
                        style={{ color: DIM_TEXT }}
                      >
                        {showSuPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    }
                  />

                  <Field
                    icon={Lock}
                    type={showSuPw ? 'text' : 'password'}
                    placeholder="Confirm password"
                    value={suPwConfirm}
                    onChange={setSuPwConfirm}
                  />

                  <PrimaryBtn loading={signUpLoading}>Create Account</PrimaryBtn>

                  <p className="text-center text-[11px]" style={{ color: DIM_TEXT }}>
                    By creating an account you agree to our Terms of Service.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
