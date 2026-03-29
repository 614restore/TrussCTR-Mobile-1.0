import React from 'react';
import {
  BarChart3, Users, Settings, CreditCard,
  LogOut, ChevronRight, Building2, Bell,
  HelpCircle, RefreshCw, X, CheckCircle2, CloudLightning
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function More() {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [showPlanModal, setShowPlanModal] = React.useState(false);
  
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Error signing out:', err);
      localStorage.clear();
      navigate('/login');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProfile();
    setIsRefreshing(false);
  };

  const menuGroups = [
    {
      title: 'Organization',
      items: [
        { label: 'Reports & Analytics', icon: BarChart3,       color: 'text-blue-500',   path: '/reports',        action: null },
        { label: 'Team Members',        icon: Users,           color: 'text-emerald-500', path: '/team',           action: null },
        { label: 'Company Profile',     icon: Building2,       color: 'text-amber-500',   path: '/company',        action: null },
        { label: 'Storm History',       icon: CloudLightning,  color: 'text-red-500',     path: '/storm-history',  action: null },
      ]
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Settings', icon: Settings, color: 'text-slate-600', path: '/settings', action: null },
        { label: 'Notifications', icon: Bell, color: 'text-indigo-500', path: '/notifications', action: null },
      ]
    },
    {
      title: 'Account',
      items: [
        { label: 'Subscription Plan', icon: CreditCard, color: 'text-slate-600', path: null, action: () => setShowPlanModal(true) },
        { label: 'Help & Support', icon: HelpCircle, color: 'text-slate-600', path: '/help', action: null },
      ]
    }
  ];


  return (
    <>
    <div className="w-full max-w-full overflow-x-hidden p-6 space-y-8">
      {/* Profile Header */}
        <div className="flex min-w-0 items-center gap-4">
        <div className="h-16 w-16 rounded-3xl bg-slate-200 border-4 border-white shadow-lg overflow-hidden">
          <img 
            src={profile?.avatar_url || `https://picsum.photos/seed/${user?.id}/200/200`} 
            alt="Avatar" 
            referrerPolicy="no-referrer" 
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-primary">{profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : profile?.name || user?.email?.split('@')[0]}</h1>
          <p className="truncate text-sm text-slate-500">
            {profile?.role?.replace('_', ' ').toUpperCase() || 'User'} • {profile?.companies?.name || 'No Company'}
          </p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-3 bg-slate-100 rounded-2xl text-slate-400 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Menu Groups */}
      {menuGroups.map((group) => (
        <div key={group.title} className="space-y-3">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">{group.title}</h2>
          <div className="card divide-y divide-slate-50">
            {group.items.map((item) => (
              <button 
                key={item.label}
                onClick={() => item.action ? item.action() : item.path && navigate(item.path)}
                className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className={`${item.color} h-5 w-5`}>
                    <item.icon size={20} />
                  </div>
                  <span className="truncate text-sm font-bold text-slate-700">{item.label}</span>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Sign Out */}
      <button 
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="w-full card p-4 flex items-center justify-center gap-3 text-error active:bg-error/5 transition-colors disabled:opacity-50"
      >
        {isSigningOut ? (
          <div className="h-5 w-5 border-2 border-error border-t-transparent rounded-full animate-spin" />
        ) : (
          <LogOut size={20} />
        )}
        <span className="font-bold">{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
      </button>

      <div className="text-center space-y-1">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">TrussCTR Mobile v1.0.4</p>
        <p className="text-[10px] text-slate-300">© 2026 ProjectCEO Inc.</p>
      </div>
    </div>

    {/* Subscription Plan Modal */}
    {showPlanModal && (() => {
      const rawPlan: string = profile?.companies?.subscription_plan ?? 'trial';
      const status: string  = profile?.companies?.subscription_status ?? 'trialing';

      const PLAN_META: Record<string, { label: string; features: string[]; userLimit: string }> = {
        starter:  { label: 'Starter',    userLimit: '1–2 users',       features: ['Up to 2 users', 'Unlimited contacts', 'Core CRM features', 'Pipeline board', 'Invoicing', 'Email support'] },
        pro:      { label: 'Pro',         userLimit: 'Up to 5 users',   features: ['Up to 5 users', 'Unlimited contacts', 'Full pipeline visibility', 'Insurance claim tracking', 'Supplement tracking', 'Team reporting'] },
        business: { label: 'Business',    userLimit: 'Up to 15 users',  features: ['Up to 15 users', 'Unlimited contacts', 'AI Smart Inspection', 'Advanced analytics', 'Material order templates', 'Priority support'] },
        scale:    { label: 'Scale',       userLimit: 'Unlimited users', features: ['Unlimited users', 'Unlimited contacts', 'All features included', 'Custom onboarding', 'Dedicated support', 'QuickBooks sync'] },
        trial:    { label: 'Free Trial',  userLimit: '1–2 users',       features: ['Up to 2 users', 'Core CRM features', 'Pipeline board', 'Invoicing'] },
      };
      const meta = PLAN_META[rawPlan] ?? PLAN_META.trial;

      const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
        active:   { label: 'Active',    cls: 'bg-emerald-500' },
        trialing: { label: 'Trial',     cls: 'bg-amber-500' },
        past_due: { label: 'Past Due',  cls: 'bg-red-500' },
        canceled: { label: 'Canceled',  cls: 'bg-slate-400' },
      };
      const badge = STATUS_BADGE[status] ?? { label: status, cls: 'bg-slate-400' };

      const PLAN_ORDER = ['trial', 'starter', 'pro', 'business', 'scale'] as const;

      return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPlanModal(false)}>
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white flex flex-col"
            style={{ maxHeight: 'min(88vh, calc(100dvh - env(safe-area-inset-top) - 1rem))' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-bold text-primary">Subscription Plans</h2>
                <p className="text-xs text-slate-400 mt-0.5">Your current plan is highlighted</p>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="p-2 text-slate-400 active:scale-90 transition-transform">
                <X size={22} />
              </button>
            </div>

            {/* Scrollable plan list */}
            <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
              {PLAN_ORDER.map((planKey) => {
                const planMeta = PLAN_META[planKey];
                if (!planMeta) return null;
                const isCurrent = planKey === rawPlan;
                return (
                  <div
                    key={planKey}
                    className={`rounded-2xl border-2 p-5 space-y-3 transition-all ${
                      isCurrent
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-100 bg-slate-50 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className={`text-base font-bold ${isCurrent ? 'text-primary' : 'text-slate-600'}`}>
                          TrussCTR {planMeta.label}
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">{planMeta.userLimit}</p>
                      </div>
                      {isCurrent && (
                        <span className={`rounded-full ${badge.cls} px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shrink-0`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {planMeta.features.map(feature => (
                        <div key={feature} className="flex items-center gap-2.5">
                          <CheckCircle2 size={14} className={`shrink-0 ${isCurrent ? 'text-emerald-500' : 'text-slate-300'}`} />
                          <span className={`text-sm ${isCurrent ? 'text-slate-600' : 'text-slate-400'}`}>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fixed footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-100" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              <p className="text-xs text-slate-400 text-center">
                To upgrade or manage billing, visit{' '}
                <span className="text-accent font-bold">trussctr.com</span>
                {' '}or contact{' '}
                <span className="text-accent font-bold">support@trussctr.com</span>
              </p>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
