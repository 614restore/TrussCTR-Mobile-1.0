import React from 'react';
import { 
  BarChart3, Users, Settings, CreditCard, 
  LogOut, ChevronRight, Building2, Bell, 
  ShieldCheck, HelpCircle, Star, RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

import { useNavigate } from 'react-router-dom';

export default function More() {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error('Error signing out:', err);
      // Fallback: Clear session manually if sign out fails
      localStorage.clear();
      window.location.reload();
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
        { label: 'Reports & Analytics', icon: BarChart3, color: 'text-blue-500', path: '/reports' },
        { label: 'Team Members', icon: Users, color: 'text-emerald-500', path: '/team' },
        { label: 'Company Profile', icon: Building2, color: 'text-amber-500', path: '/company' },
      ]
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Settings', icon: Settings, color: 'text-slate-600', path: '/settings' },
        { label: 'Notifications', icon: Bell, color: 'text-indigo-500', path: '/notifications' },
        { label: 'Security & Privacy', icon: ShieldCheck, color: 'text-teal-500', path: '#' },
        { label: 'Google Review Link', icon: Star, color: 'text-yellow-500', path: '#' },
      ]
    },
    {
      title: 'Account',
      items: [
        { label: 'Subscription Plan', icon: CreditCard, color: 'text-slate-600', path: '#' },
        { label: 'Help & Support', icon: HelpCircle, color: 'text-slate-600', path: '/help' },
      ]
    }
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-3xl bg-slate-200 border-4 border-white shadow-lg overflow-hidden">
          <img 
            src={profile?.avatar_url || `https://picsum.photos/seed/${user?.id}/200/200`} 
            alt="Avatar" 
            referrerPolicy="no-referrer" 
          />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">{profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : profile?.name || user?.email?.split('@')[0]}</h1>
          <p className="text-slate-500 text-sm">
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
                onClick={() => item.path !== '#' && navigate(item.path)}
                className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`${item.color} h-5 w-5`}>
                    <item.icon size={20} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{item.label}</span>
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
  );
}
