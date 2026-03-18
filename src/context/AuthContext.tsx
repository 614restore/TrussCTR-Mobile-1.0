import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../types/supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type CompanyRow = Database['public']['Tables']['companies']['Row'];

export interface AppProfile extends ProfileRow {
  companies?: CompanyRow | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: AppProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
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

        const currentSession = data?.session ?? null;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          lastUserId.current = currentSession.user.id;
          await fetchProfile(currentSession.user.id, currentSession.user.email);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'INITIAL_SESSION' && hasInitialized.current) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        if (lastUserId.current === currentSession.user.id && isFetchingProfile.current) return;
        lastUserId.current = currentSession.user.id;
        await fetchProfile(currentSession.user.id, currentSession.user.email);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string, email?: string) => {
    if (isFetchingProfile.current) return;
    isFetchingProfile.current = true;

    try {
      const cleanEmail = email?.trim();

      const fetchById = async () =>
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

      let { data, error } = await fetchById();
      if (error?.message?.includes('Lock was stolen')) {
        await new Promise((r) => setTimeout(r, 250));
        ({ data, error } = await fetchById());
      }

      if (error) console.error('Error fetching profile by id:', error);

      if (!data && cleanEmail) {
        const fetchByEmail = async () =>
          supabase
            .from('profiles')
            .select('*')
            .eq('email', cleanEmail)
            .maybeSingle();

        let { data: emailData, error: emailError } = await fetchByEmail();
        if (emailError?.message?.includes('Lock was stolen')) {
          await new Promise((r) => setTimeout(r, 250));
          ({ data: emailData, error: emailError } = await fetchByEmail());
        }

        if (!emailError && emailData) data = emailData;
      }

      if (data) {
        const profileData = data as ProfileRow;
        if (profileData.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', profileData.company_id)
            .maybeSingle();

          setProfile(companyData ? { ...profileData, companies: companyData } : profileData);
        } else {
          setProfile(profileData);
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      isFetchingProfile.current = false;
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      setLoading(true);
      isFetchingProfile.current = false;
      await fetchProfile(user.id, user.email ?? undefined);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
