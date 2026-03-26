import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Lock, Building2, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import trussLogo from '../assets/trussctr-logo.png';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  sales_rep: 'Sales Rep',
  crew_lead: 'Crew Lead',
  crew_member: 'Crew Member',
};

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [inviteSession, setInviteSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    // Supabase processes the invite token from the URL automatically when
    // detectSessionInUrl is true (web/browser context). Listen for that event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user?.invited_at) {
        const meta = session.user.user_metadata || {};
        setInviteSession(session);
        setFirstName(meta.first_name || '');
        setLastName(meta.last_name || '');
        setLoading(false);
      }
    });

    // Also check if a session is already present (e.g. page was refreshed after
    // Supabase processed the token on first load).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.invited_at) {
        const meta = session.user.user_metadata || {};
        setInviteSession(session);
        setFirstName(meta.first_name || '');
        setLastName(meta.last_name || '');
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      // Set the user's password and update name metadata
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { first_name: firstName, last_name: lastName },
      });
      if (updateError) throw updateError;

      // Upsert the profile record so the mobile app can load it immediately
      const user = inviteSession.user;
      const meta = user.user_metadata || {};
      const { error: profileError } = await (supabase.from('profiles') as any).upsert({
        id: user.id,
        email: user.email,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role: meta.role || 'sales_rep',
        company_id: meta.company_id || null,
        is_active: true,
      });
      if (profileError) throw profileError;

      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to create your account. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const user = inviteSession?.user;
  const meta = user?.user_metadata || {};
  const roleLabel = meta.role ? (ROLE_LABELS[meta.role] || meta.role) : null;
  const companyName = meta.company_name as string | undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!inviteSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto h-24 w-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-xl border border-slate-100 overflow-hidden">
            <img src={trussLogo} alt="TrussCTR" className="h-full w-full object-cover" />
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-3 text-left">
            <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">Invalid or expired invite link</p>
              <p className="text-xs text-amber-700 mt-1">
                This invite link has expired or already been used. Please ask your team admin to send a new invite.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-24 w-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-xl border border-slate-100 overflow-hidden">
            <img src={trussLogo} alt="TrussCTR" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">You're Invited!</h1>
            <p className="text-slate-500 text-sm mt-1">Create your TrussCTR account to get started.</p>
          </div>
        </div>

        {/* Invite details */}
        <div className="card p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Your Invite Details</p>

          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <User size={16} className="text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Invited Email</p>
              <p className="text-sm font-bold text-primary truncate">{user.email}</p>
            </div>
          </div>

          {companyName && (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-accent/10 rounded-xl flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-accent" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Company</p>
                <p className="text-sm font-bold text-primary">{companyName}</p>
              </div>
            </div>
          )}

          {roleLabel && (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                <Shield size={16} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Your Role</p>
                <p className="text-sm font-bold text-primary">{roleLabel}</p>
              </div>
            </div>
          )}
        </div>

        {success ? (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-6 rounded-2xl flex flex-col items-center gap-3 text-center">
            <CheckCircle size={32} className="text-emerald-500" />
            <p className="font-bold text-sm">Account created!</p>
            <p className="text-xs text-emerald-600">Taking you to your dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm">
                <AlertCircle size={18} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Your Name</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    required
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Create Password</p>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create My Account'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Already have an account? Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
