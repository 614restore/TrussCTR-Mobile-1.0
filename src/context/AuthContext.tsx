import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    const initAuth = async () => {
      // Set a safety timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        if (loading) {
          console.warn('Auth initialization timed out');
          setLoading(false);
        }
      }, 10000);

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id, session.user.email);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
        setLoading(false);
      } finally {
        clearTimeout(timeout);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, email?: string) => {
    try {
      const cleanEmail = email?.trim();
      console.log('Fetching profile for:', { userId, cleanEmail });
      
      // 1. Try fetching from 'profiles' table by id (which is the user_id)
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching from profiles by id:', error);
      }
      
      // 2. If not found by id, try fetching by email
      if (!data && cleanEmail) {
        console.log('Profile not found by id, trying email in profiles...');
        const { data: emailData, error: emailError } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();
        
        if (!emailError && emailData) {
          console.log('Profile found by email, updating id to match user_id...');
          // Note: In some setups, the id is the user_id. If they differ, we might need a user_id column.
          // But based on the schema probe, 'id' is the primary key.
          data = emailData;
        }
      }
      
      if (data) {
        const profileData = data as any;
        setProfile(profileData);
        
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', profileData.company_id)
          .maybeSingle();
        
        if (companyData) {
          setProfile({ ...profileData, companies: companyData });
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      setLoading(true);
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
