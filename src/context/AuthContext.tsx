import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

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

    // Hard deadline: if auth init hasn't finished in 10 s, unblock the app so
    // the user reaches the login screen rather than staring at a spinner forever.
    const initTimeout = window.setTimeout(() => {
      if (isMounted) {
        console.warn('[Auth] Init timed out — forcing loading=false');
        setLoading(false);
      }
    }, 10000);

    const init = async () => {
      try {
        // Race getSession against a 8 s timeout so a hung token-refresh
        // doesn't stall the entire cold start.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null }; error: null }>(resolve =>
            setTimeout(() => resolve({ data: { session: null }, error: null }), 8000)
          ),
        ]);

        const { data, error } = sessionResult;
        if (error) console.error('Error getting session:', error);
        if (!isMounted) return;

        const session = data?.session ?? null;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          lastUserId.current = session.user.id;
          await fetchProfile(session.user.id, session.user.email);
        } else {
          setProfile(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (isMounted) setLoading(false);
      } finally {
        clearTimeout(initTimeout);
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
        setProfile(null);
        setLoading(false);
      }
    });

    // Re-check profile when app returns from background / tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session?.user) return;
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
      clearTimeout(initTimeout);
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

      // Wrap a Supabase query so it rejects after `ms` milliseconds.
      // Using Promise.resolve() converts PostgREST thenables to real Promises.
      const withTimeout = <T,>(thenable: PromiseLike<T>, ms: number): Promise<T> =>
        Promise.race([
          Promise.resolve(thenable),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Profile query timed out')), ms)
          ),
        ]);

      // Fetch profile + company in a single round trip using a join
      const queryById = () =>
        supabase.from('profiles').select('*, companies(*)').eq('id', userId).maybeSingle();

      let { data, error } = await withTimeout(queryById(), 7000);
      if (error?.message?.includes('Lock was stolen')) {
        await new Promise((r) => setTimeout(r, 250));
        ({ data, error } = await withTimeout(queryById(), 7000));
      }

      if (error) console.error('Error fetching profile by id:', error);

      if (!data && cleanEmail) {
        const queryByEmail = () =>
          supabase.from('profiles').select('*, companies(*)').eq('email', cleanEmail).maybeSingle();

        let { data: emailData, error: emailError } = await withTimeout(queryByEmail(), 7000);
        if (emailError?.message?.includes('Lock was stolen')) {
          await new Promise((r) => setTimeout(r, 250));
          ({ data: emailData, error: emailError } = await withTimeout(queryByEmail(), 7000));
        }
        if (!emailError && emailData) data = emailData;
      }

      if (data) setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      isFetchingProfile.current = false;
      setLoading(false);
    }
  };

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
