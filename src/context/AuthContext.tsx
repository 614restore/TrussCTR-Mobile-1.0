import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: any;
  user: any;
  profile: any;
  loading: boolean;
  isRecoverySession: boolean;
  clearRecoverySession: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isRecoverySession: false,
  clearRecoverySession: () => {},
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

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
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
      console.log('Fetching profile for:', { userId, cleanEmail });

      const fetchById = async () => {
        return await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
      };

      let { data, error } = await fetchById();
      if (error?.message?.includes('Lock was stolen')) {
        await new Promise((r) => setTimeout(r, 250));
        ({ data, error } = await fetchById());
      }

      if (error) {
        console.error('Error fetching from profiles by id:', error);
      }

      if (!data && cleanEmail) {
        console.log('Profile not found by id, trying email in profiles...');
        const fetchByEmail = async () => {
          return await supabase
            .from('profiles')
            .select('*')
            .eq('email', cleanEmail)
            .maybeSingle();
        };

        let { data: emailData, error: emailError } = await fetchByEmail();
        if (emailError?.message?.includes('Lock was stolen')) {
          await new Promise((r) => setTimeout(r, 250));
          ({ data: emailData, error: emailError } = await fetchByEmail());
        }

        if (!emailError && emailData) {
          data = emailData;
        }
      }

      if (data) {
        const profileData = data as any;
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', profileData.company_id)
          .maybeSingle();

        setProfile(companyData ? { ...profileData, companies: companyData } : profileData);
      }
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

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isRecoverySession, clearRecoverySession, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
