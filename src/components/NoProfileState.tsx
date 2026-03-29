import React, { useState, useEffect } from 'react';
import { Building2, RefreshCw, LogOut, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function NoProfileState() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProfile();
    setIsRefreshing(false);
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Error signing out:', err);
      localStorage.clear();
      window.location.reload();
    } finally {
      setIsSigningOut(false);
    }
  };

  const hasProfileButNoCompany = !!profile && !profile.company_id;

  const [debugLog, setDebugLog] = useState<string[]>([]);
  const addLog = (msg: string) => setDebugLog(prev => [...prev.slice(-4), msg]);

  const testConnection = async () => {
    addLog('Testing connection...');
    try {
      // 1. Check team_members schema by intentionally failing
      const { error: schemaError } = await supabase
        .from('team_members')
        .select('non_existent_column_to_force_error')
        .limit(1);
      
      if (schemaError) {
        addLog(`Schema Hint: ${schemaError.message}`);
      }

      // 2. Check if 'profiles' table exists
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
      
      if (profileError) {
        addLog(`Profiles Table: ${profileError.message}`);
      } else {
        addLog('Profiles table exists!');
        if (profiles && profiles.length > 0) {
          addLog(`Profile columns: ${Object.keys(profiles[0]).join(', ')}`);
        }
      }

      // 3. Check companies count
      const { count: companyCount } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });

      addLog(`Companies: ${companyCount || 0}`);
    } catch (err: any) {
      addLog(`Fatal: ${err.message}`);
    }
  };

  const attemptDeepLink = async () => {
    addLog('Attempting Deep Link...');
    try {
      const cleanEmail = user?.email?.trim();
      if (!cleanEmail) return addLog('Error: No email found');

      // Try to find ANY member with this email, ignoring RLS if possible 
      // (Note: This will still respect RLS, but we try different filters)
      const { data, error } = await (supabase.from('team_members') as any)
        .select('id, email, name, company_id')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (error) {
        addLog(`Search Error: ${error.message}`);
      } else if (data) {
        addLog(`Found record! ID: ${data.id}`);
        addLog('Linking to your User ID...');
        const { error: linkError } = await (supabase.from('team_members') as any)
          .update({ user_id: user.id })
          .eq('id', data.id);
        
        if (linkError) {
          addLog(`Link Failed: ${linkError.message}`);
        } else {
          addLog('Success! Refreshing...');
          await refreshProfile();
        }
      } else {
        addLog('No record found even with deep search.');
        addLog('Checking for domain match...');
        const domain = cleanEmail.split('@')[1];
        const { data: domainData } = await (supabase.from('team_members') as any)
          .select('email')
          .ilike('email', `%@${domain}`)
          .limit(1);
        
        if (domainData && domainData.length > 0) {
          addLog(`Found other users with @${domain}`);
          addLog(`Check if your email is ${domainData[0].email}`);
        }
      }
    } catch (err: any) {
      addLog(`Fatal: ${err.message}`);
    }
  };

  const linkToCompany = async (companyId: string, companyName: string) => {
    addLog(`Linking to ${companyName}...`);
    try {
      const payload = {
        id: user.id,
        company_id: companyId,
        email: user.email,
        first_name: user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Owner',
        last_name: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        role: 'owner',
        is_active: true
      };
      
      addLog('Creating profile record...');
      
      const { data, error } = await (supabase.from('profiles') as any)
        .insert(payload)
        .select();

      if (error) {
        addLog(`Link Error: ${error.message}`);
        if (error.message.includes('unique constraint')) {
          addLog('Profile already exists! Updating...');
          await (supabase.from('profiles') as any).update({ company_id: companyId }).eq('id', user.id);
          await refreshProfile();
        }
      } else {
        addLog('Success! Profile created.');
        await refreshProfile();
      }
    } catch (err: any) {
      addLog(`Fatal: ${err.message}`);
    }
  };

  const [companies, setCompanies] = useState<any[]>([]);
  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('id, name').limit(10);
    if (data) setCompanies(data);
  };

  useEffect(() => {
    if (showDebug) fetchCompanies();
  }, [showDebug]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50 text-center">
      <div className="w-full max-w-sm space-y-10">
        <div className="mx-auto h-24 w-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-xl border border-slate-100">
          <Building2 className="text-accent" size={48} />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-primary tracking-tight">Welcome to TrussCTR</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your account is active, but you haven't been linked to a company yet. 
            Please select your company from the list below to get started.
          </p>
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Available Companies</h2>
            
            {companies.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {companies.map((c) => (
                  <button 
                    key={c.id} 
                    onClick={() => linkToCompany(c.id, c.name)}
                    className="w-full bg-slate-50 border border-slate-100 text-primary text-sm font-bold p-4 rounded-2xl shadow-sm active:scale-[0.98] transition-all hover:bg-white hover:border-accent/30 flex items-center justify-between group"
                  >
                    <span>{c.name}</span>
                    <RefreshCw size={16} className="text-slate-300 group-hover:text-accent transition-colors" />
                  </button>
                ))}
              </div>
            ) : (
              <button 
                onClick={() => { setShowDebug(true); fetchCompanies(); }}
                className="w-full py-4 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-accent transition-colors"
              >
                Tap to load companies
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Checking...' : 'Check Again'}
            </button>

            <button 
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-error transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {showDebug && (
          <div className="p-4 bg-slate-100 rounded-2xl text-left space-y-2">
            <p className="text-[9px] font-mono text-slate-500 break-all"><b>User ID:</b> {user?.id}</p>
            <p className="text-[9px] font-mono text-slate-500 break-all"><b>Email:</b> {user?.email}</p>
            <div className="pt-2 border-t border-slate-200">
              {debugLog.map((log, i) => (
                <p key={i} className="text-[8px] font-mono text-slate-400 leading-tight">› {log}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
