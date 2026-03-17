import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: any;
  user: any;
  profile: any;
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
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isFetchingProfile = useRef(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Safety timeout
    const timeout = setTimeout(() => {
      console.warn('Auth initialization timed out');
      setLoading(false);
    }, 10000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip duplicate INITIAL_SESSION events
      if (event === 'INITIAL_SESSION') {
        if (hasInitialized.current) return;
        hasInitialized.current = true;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
        setLoading(false);
      }

      clearTimeout(timeout);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
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

  const refreshProfile = async () => {
    if (user?.id) {
      setLoading(true);
      isFetchingProfile.current = false; // allow refresh to bypass guard
      await fetchProfile(user.id, user.email);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
