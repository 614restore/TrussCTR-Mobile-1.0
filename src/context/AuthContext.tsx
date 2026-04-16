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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const isFetchingProfile = useRef(false);
  const hasInitialized = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Hard timeout: always unblock the app within 1.5 seconds even if Supabase hangs.
    // On native, the splash covers ~2s — this ensures the app never gets stuck behind
    // a slow token refresh or network call.
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

        const session = data?.session ?? null;
        setSession(session);
        setUser(session?.user ?? null);

        // Unblock the app immediately — profile loads in background
        setLoading(false);

        if (session?.user) {
          lastUserId.current = session.user.id;
          fetchProfile(session.user.id, session.user.email); // no await — background
        } else {
          setProfile(null);
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
        // After dormancy: token refreshed but profile may be null — re-fetch if needed
        setProfile(prev => {
          if (!prev) {
            isFetchingProfile.current = false; // allow re-fetch
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
          return;
        }

        // If the token expires within the next 5 minutes, refresh it now
        // while the user is reading the screen — not mid-save when they tap
        // a button. This prevents the auth refresh from eating into the
        // write timeout budget on the next Supabase call.
        const expiresAt = session.expires_at ?? 0; // unix seconds
        const fiveMinutes = 5 * 60;
        if (expiresAt - Date.now() / 1000 < fiveMinutes) {
          supabase.auth.refreshSession().catch(() => {/* silent — will retry on next request */});
        }

        setSession(session);
        setUser(session.user);
        setProfile(prev => {
          if (!prev) {
            isFetchingProfile.current = false; // clear stale guard
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
    // Prevent duplicate simultaneous fetches
    if (isFetchingProfile.current) return;
    isFetchingProfile.current = true;

    try {
      const cleanEmail = email?.trim();

      // Single query: fetch profile + company in one round trip via join
      const tryFetch = async (filter: { field: string; value: string }) => {
        return supabase
          .from('profiles')
          .select('*, companies(*)')
          .eq(filter.field, filter.value)
          .maybeSingle();
      };

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
        setProfile(data as any);
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
      SplashScreen.hide().catch(() => {/* web/non-native, ignore */});
    }
  }, [loading]);

  // Safety-net: if user is present but profile is null after loading,
  // schedule a recovery re-fetch. This covers any edge case the event handlers miss.
  useEffect(() => {
    if (loading || !user || profile) return;
    const timer = window.setTimeout(() => {
      console.warn('[Auth] User present but profile missing — attempting recovery fetch.');
      isFetchingProfile.current = false; // bypass guard
      fetchProfile(user.id, user.email);
    }, 1500);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, profile]);

  const refreshProfile = async () => {
    if (user?.id) {
      setLoading(true);
      isFetchingProfile.current = false; // allow refresh to bypass guard
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
