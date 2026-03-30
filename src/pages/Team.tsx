import React, { useState, useEffect } from 'react';
import { Users, Mail, Shield, ChevronLeft, Plus, Search, X, AlertCircle, CheckCircle, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const ROLE_OPTIONS = [
  { value: 'admin',       label: 'Admin' },
  { value: 'sales_rep',   label: 'Sales Rep' },
  { value: 'crew_lead',   label: 'Crew Lead' },
  { value: 'crew_member', label: 'Crew Member' },
];

const USER_LIMITS: Record<string, number> = {
  starter:  2,
  pro:      5,
  business: 15,
  scale:    Infinity,
  trial:    2,
};

export default function Team() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [inviteEmail, setInviteEmail]       = useState('');
  const [inviteRole, setInviteRole]         = useState('sales_rep');
  const [inviteSending, setInviteSending]   = useState(false);
  const [inviteSuccess, setInviteSuccess]   = useState(false);
  const [inviteError, setInviteError]       = useState<string | null>(null);

  const canInvite = profile?.role === 'owner' || profile?.role === 'admin';

  const subscriptionPlan: string = profile?.companies?.subscription_plan ?? 'trial';
  const planLimit = USER_LIMITS[subscriptionPlan] ?? 2;
  const atSeatLimit = planLimit !== Infinity && members.length >= planLimit;

  useEffect(() => {
    if (profile?.company_id) {
      fetchMembers();
    }
  }, [profile?.company_id]);

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('first_name');
      
      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setLoading(false);
    }
  };

  const openInviteModal = () => {
    setInviteEmail('');
    setInviteRole('sales_rep');
    setInviteError(null);
    setInviteSuccess(false);
    setShowLimitModal(true);
  };

  const closeInviteModal = () => {
    setShowLimitModal(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-team-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send invite. Please try again.');
      }
      setInviteSuccess(true);
      // Refresh member list in case the invited user was already registered
      fetchMembers();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite.');
    } finally {
      setInviteSending(false);
    }
  };

  const filteredMembers = members.filter(m =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
    {/* Invite / seat-limit modal */}
    {showLimitModal && (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={closeInviteModal}>
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-lg rounded-t-3xl bg-white p-8 space-y-5"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-primary">Invite Team Member</h2>
            <button onClick={closeInviteModal} className="p-2 text-slate-400 active:scale-90 transition-transform">
              <X size={22} />
            </button>
          </div>

          {/* Seat limit reached */}
          {atSeatLimit ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-100 p-4">
                <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Seat limit reached</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Your <span className="font-semibold capitalize">{subscriptionPlan}</span> plan allows up to {planLimit} team member{planLimit !== 1 ? 's' : ''}.
                    You currently have {members.length} active member{members.length !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-500 text-center">
                To add more members, upgrade your plan under{' '}
                <span className="font-bold text-accent">Settings → My Plan</span>.
              </p>
              <button onClick={closeInviteModal} className="w-full bg-primary text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                Got it
              </button>
            </div>

          /* No invite permission (not admin/owner) */
          ) : !canInvite ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <Shield size={20} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-700">Admin access required</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Only owners and admins can invite new team members. Contact your team admin to send an invite.
                  </p>
                </div>
              </div>
              <button onClick={closeInviteModal} className="w-full bg-primary text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                OK
              </button>
            </div>

          /* Invite sent successfully */
          ) : inviteSuccess ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle size={28} className="text-emerald-500" />
                </div>
                <div>
                  <p className="font-bold text-primary">Invite sent!</p>
                  <p className="text-sm text-slate-500 mt-1">
                    <span className="font-semibold">{inviteEmail}</span> will receive an email with a link to create their account.
                  </p>
                </div>
              </div>
              <button onClick={closeInviteModal} className="w-full bg-primary text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                Done
              </button>
            </div>

          /* Invite form */
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              <p className="text-xs text-slate-400">
                {planLimit === Infinity
                  ? `${members.length} member${members.length !== 1 ? 's' : ''} on your team`
                  : `${members.length} / ${planLimit} seats used · ${subscriptionPlan} plan`}
              </p>

              {inviteError && (
                <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-100 p-4">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{inviteError}</p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Role</label>
                <div className="relative">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  >
                    {ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={inviteSending}
                className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {inviteSending ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={16} />
                    Send Invite
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    )}

    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Team Members</h1>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search team..."
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={openInviteModal}
            className="bg-accent text-white p-3 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : filteredMembers.length > 0 ? (
          filteredMembers.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 flex items-center gap-4"
            >
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-bold">
                {member.first_name?.[0]}{member.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-primary truncate">{member.first_name} {member.last_name}</h3>
                <div className="flex items-center gap-2 text-slate-500 text-xs mt-0.5">
                  <Mail size={12} />
                  <span className="truncate">{member.email}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                  <Shield size={10} />
                  {member.role || 'Member'}
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <Users size={32} />
            </div>
            <p className="text-slate-400 text-sm">No team members found</p>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
