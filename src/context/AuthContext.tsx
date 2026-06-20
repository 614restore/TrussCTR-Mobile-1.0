import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SplashScreen } from '@capacitor/splash-screen';

interface AuthContextType {
  session: any;
  user: any;
  profile: any;
  loading: boolean;
  isRecoverySession: boolean;
  clearRecoverySession: () => void;
  requestPasswordChange: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isRecoverySession: false,
  clearRecoverySession: () => {},
  requestPasswordChange: () => {},
  refreshProfile: async () => {},
});

const PROFILE_CACHE_KEY = 'trussctr_profile_v2';

function readProfileCache(): any | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeProfileCache(data: any) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data)); } catch {}
}

function clearProfileCache() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  // Seed profile from cache immediately so pages never flash placeholder data
  const [profile, setProfile] = useState<any>(() => readProfileCache());

  const [loading, setLoading] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const isFetchingProfile = useRef(false);
  const hasInitialized = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Hard timeout: always unblock the app within 1.5 seconds even if Supabase hangs.
    const loadingTimeout = window.setTimeout(() => {
      if (isMounted) {
        console.warn('[Auth] Loading timeout — forcing app unblock');
        setLoading(false);
      }
    }, 1500);

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error('Error getting session:', error);
        if (!isMounted) return;

        const currentSession = data?.session ?? null;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          lastUserId.current = currentSession.user.id;
          // Await profile so loading stays true until data is ready (hard timeout is safety net)
          await fetchProfile(currentSession.user.id, currentSession.user.email);
        } else {
          setProfile(null);
          clearProfileCache();
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (isMounted) setLoading(false);
      } finally {
        window.clearTimeout(loadingTimeout);
      }
    };

    init().finally(() => { hasInitialized.current = true; });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' && hasInitialized.current) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
        if (session?.user) {
          lastUserId.current = session.user.id;
          await fetchProfile(session.user.id, session.user.email);
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Re-fetch profile if it went missing during dormancy
        setProfile(prev => {
          if (!prev && !isFetchingProfile.current) {
            isFetchingProfile.current = false;
            fetchProfile(session.user.id, session.user.email);
          }
          return prev;
        });
        return;
      }

      if (session?.user) {
        if (lastUserId.current === session.user.id && isFetchingProfile.current) return;
        lastUserId.current = session.user.id;
        await fetchProfile(session.user.id, session.user.email);
      } else {
        lastUserId.current = null;
        isFetchingProfile.current = false;
        setProfile(null);
        clearProfileCache();
        setLoading(false);
      }
    });

    // Re-check profile when app returns from background / tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session?.user) {
          lastUserId.current = null;
          isFetchingProfile.current = false;
          setSession(null);
          setUser(null);
          setProfile(null);
          clearProfileCache();
          return;
        }

        // Proactively refresh the token if it expires within 5 minutes
        const expiresAt = session.expires_at ?? 0;
        const fiveMinutes = 5 * 60;
        if (expiresAt - Date.now() / 1000 < fiveMinutes) {
          supabase.auth.refreshSession().catch(() => {});
        }

        setSession(session);
        setUser(session.user);

        // Re-fetch profile in background if missing (e.g. after long dormancy)
        setProfile(prev => {
          if (!prev) {
            isFetchingProfile.current = false;
            fetchProfile(session.user.id, session.user.email);
          }
          return prev;
        });
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);


  const fetchProfile = async (userId: string, email?: string) => {
    if (isFetchingProfile.current) return;
    isFetchingProfile.current = true;

    try {
      const cleanEmail = email?.trim();

      const tryFetch = async (filter: { field: string; value: string }) => {
        return supabase
          .from('profiles')
          .select('*, companies(*)')
          .eq(filter.field, filter.value)
          .maybeSingle();
      };

      // Fetch profile (retry once on lock contention)
      let { data, error } = await tryFetch({ field: 'id', value: userId });
      if (error?.message?.includes('Lock was stolen')) {
        await new Promise((r) => setTimeout(r, 250));
        ({ data, error } = await tryFetch({ field: 'id', value: userId }));
      }
      if (error) console.error('Error fetching profile by id:', error);

      // Fallback: try by email if not found by id
      if (!data && cleanEmail) {
        let { data: emailData, error: emailError } = await tryFetch({ field: 'email', value: cleanEmail });
        if (emailError?.message?.includes('Lock was stolen')) {
          await new Promise((r) => setTimeout(r, 250));
          ({ data: emailData, error: emailError } = await tryFetch({ field: 'email', value: cleanEmail }));
        }
        if (!emailError && emailData) data = emailData;
      }

      if (data) {
        // Set profile immediately — if companies is missing the reconciler useEffect
        // will fetch it in the background without blocking login.
        setProfile(data as any);
        writeProfileCache(data);
      } else {
        // No profile row — auto-create company + profile from signup metadata on first login
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;

          const meta = authUser.user_metadata ?? {};
          const firstName = meta.first_name || cleanEmail?.split('@')[0] || 'Owner';
          const lastName  = meta.last_name  || '';
          const companyName = meta.company_name || `${firstName}'s Company`;

          const { data: newCompany, error: companyErr } = await (supabase.from('companies') as any)
            .insert({ name: companyName, email: cleanEmail })
            .select()
            .single();

          if (companyErr && !companyErr.message?.includes('duplicate')) {
            console.error('[Auth] Failed to create company:', companyErr);
            return;
          }

          const companyId = newCompany?.id;
          if (!companyId) return;

          const { data: newProfile, error: profileErr } = await (supabase.from('profiles') as any)
            .insert({
              id: userId,
              email: cleanEmail,
              first_name: firstName,
              last_name: lastName,
              company_id: companyId,
              role: 'owner',
              is_active: true,
            })
            .select('*, companies(*)')
            .single();

          if (profileErr) {
            console.error('[Auth] Failed to create profile:', profileErr);
            return;
          }

          setProfile(newProfile as any);
          writeProfileCache(newProfile);
        } catch (createErr) {
          console.error('[Auth] Auto-onboarding error:', createErr);
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      isFetchingProfile.current = false;
      setLoading(false);
    }
  };

  // Hide the native splash screen as soon as auth finishes loading
  useEffect(() => {
    if (!loading) {
      SplashScreen.hide().catch(() => {});
    }
  }, [loading]);

  // Safety-net: if user is present but profile is null after loading, schedule recovery re-fetch
  useEffect(() => {
    if (loading || !user || profile) return;
    const timer = window.setTimeout(() => {
      console.warn('[Auth] User present but profile missing — attempting recovery fetch.');
      isFetchingProfile.current = false;
      fetchProfile(user.id, user.email);
    }, 1500);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, profile]);

  // Reconciler: if profile exists but companies is missing despite company_id,
  // silently re-fetch the company row in the background (RLS race condition recovery)
  useEffect(() => {
    if (!profile?.company_id || profile?.companies) return;
    const timer = window.setTimeout(async () => {
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .maybeSingle();
      if (companyData) {
        const updated = { ...profile, companies: companyData };
        setProfile(updated as any);
        writeProfileCache(updated);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, profile?.companies]);

  const refreshProfile = async () => {
    if (user?.id) {
      setLoading(true);
      isFetchingProfile.current = false;
      await fetchProfile(user.id, user.email);
    }
  };

  const clearRecoverySession = () => setIsRecoverySession(false);
  const requestPasswordChange = () => setIsRecoverySession(true);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isRecoverySession, clearRecoverySession, requestPasswordChange, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
