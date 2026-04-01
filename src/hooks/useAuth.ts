// Mobile Authentication Hook with Role Support
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types/userRoles';

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  company_id: string;
  is_active: boolean;
  is_limited_account?: boolean;
  account_expires_at?: string;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Profile load error:', error);
        setProfile(null);
      } else {
        // Check if limited account is expired
        if (data.is_limited_account && data.account_expires_at) {
          const expiryDate = new Date(data.account_expires_at);
          const now = new Date();
          
          if (now > expiryDate) {
            console.warn('Limited account expired, signing out');
            await supabase.auth.signOut();
            setProfile(null);
            setLoading(false);
            return;
          }
        }

        setProfile(data);
      }
    } catch (error) {
      console.error('Profile load error:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (requiredRoles: UserRole[]): boolean => {
    return profile ? requiredRoles.includes(profile.role) : false;
  };

  const isLimitedAccount = (): boolean => {
    return profile?.is_limited_account === true;
  };

  const canManageLimitedAccounts = (): boolean => {
    if (!profile) return false;
    return ['owner', 'admin', 'manager'].includes(profile.role);
  };

  // Permissions for limited roles
  const canAddContacts = (): boolean => {
    if (!profile) return false;
    return ['owner', 'admin', 'manager', 'user', 'canvasser'].includes(profile.role);
  };

  const canScheduleInspections = (): boolean => {
    if (!profile) return false;
    return ['owner', 'admin', 'manager', 'user', 'canvasser'].includes(profile.role);
  };

  const canUploadPhotos = (): boolean => {
    if (!profile) return false;
    return ['owner', 'admin', 'manager', 'user', 'field_contractor'].includes(profile.role);
  };

  const canAddNotes = (): boolean => {
    if (!profile) return false;
    return ['owner', 'admin', 'manager', 'user', 'field_contractor'].includes(profile.role);
  };

  const canViewFullCRM = (): boolean => {
    if (!profile) return false;
    return !['canvasser', 'field_contractor'].includes(profile.role);
  };

  return {
    user,
    profile,
    loading,
    signOut,
    hasRole,
    isLimitedAccount,
    canManageLimitedAccounts,
    canAddContacts,
    canScheduleInspections,
    canUploadPhotos,
    canAddNotes,
    canViewFullCRM
  };
}