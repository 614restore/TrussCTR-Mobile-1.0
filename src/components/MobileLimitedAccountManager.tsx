// Limited Account Management for Mobile App
import React, { useState, useEffect } from 'react';
import { Plus, Users, Clock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types/userRoles';

interface LimitedAccount {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'canvasser' | 'field_contractor';
  created_at: string;
  account_expires_at: string | null;
  is_active: boolean;
}

interface CreateAccountData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: 'canvasser' | 'field_contractor';
  expires_at: string | null;
}

export default function MobileLimitedAccountManager() {
  const [accounts, setAccounts] = useState<LimitedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [seatUsage, setSeatUsage] = useState({ total: 5, used: 0, available: 5 });

  const [newAccount, setNewAccount] = useState<CreateAccountData>({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'canvasser',
    expires_at: null
  });

  useEffect(() => {
    loadAccounts();
    loadSeatUsage();
  }, []);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('limited_accounts_view')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Load accounts error:', error);
      alert('Failed to load accounts');
    }
  };

  const loadSeatUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) return;

      const { data, error } = await supabase
        .from('companies')
        .select('limited_seats_total, limited_seats_used')
        .eq('id', profile.company_id)
        .single();

      if (error) throw error;

      setSeatUsage({
        total: data?.limited_seats_total || 5,
        used: data?.limited_seats_used || 0,
        available: (data?.limited_seats_total || 5) - (data?.limited_seats_used || 0)
      });
    } catch (error) {
      console.error('Load seat usage error:', error);
    }
  };

  const createAccount = async () => {
    if (!newAccount.email || !newAccount.password || !newAccount.first_name) {
      alert('Please fill in all required fields');
      return;
    }

    if (seatUsage.available <= 0) {
      alert('No available seats. Maximum 5 limited accounts allowed.');
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', authUser.id)
        .single();

      if (!profile?.company_id) throw new Error('Company ID not found');

      // Call the database function to create limited account
      const { data, error } = await supabase.rpc('create_limited_account', {
        p_email: newAccount.email,
        p_password: newAccount.password,
        p_first_name: newAccount.first_name,
        p_last_name: newAccount.last_name,
        p_role: newAccount.role,
        p_company_id: profile.company_id,
        p_expires_at: newAccount.expires_at,
        p_created_by: authUser.id
      });

      if (error) throw error;

      if (data.success) {
        alert(`Account created successfully!\nLogin: ${newAccount.email}\nPassword: ${newAccount.password}\nRole: ${newAccount.role}`);
        setNewAccount({
          email: '',
          password: '',
          first_name: '',
          last_name: '',
          role: 'canvasser',
          expires_at: null
        });
        setShowCreateForm(false);
        loadAccounts();
        loadSeatUsage();
      } else {
        throw new Error(data.error || 'Failed to create account');
      }
    } catch (error) {
      console.error('Create account error:', error);
      alert(`Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewAccount({ ...newAccount, password });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="mt-2 text-slate-600">Loading accounts...</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Limited Permission Accounts</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-slate-600">
            <span className="flex items-center">
              <Users size={16} className="mr-1" />
              {seatUsage.used} / {seatUsage.total} seats used
            </span>
            <span className={`px-2 py-1 rounded-md text-xs ${seatUsage.available > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {seatUsage.available} available
            </span>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            disabled={seatUsage.available <= 0}
            className={`px-4 py-2 rounded-md text-sm flex items-center space-x-2 ${
              seatUsage.available > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Plus size={16} />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-slate-50 border rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-slate-800 mb-4">Create Limited Account</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={newAccount.first_name}
                  onChange={(e) => setNewAccount({ ...newAccount, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={newAccount.last_name}
                  onChange={(e) => setNewAccount({ ...newAccount, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                value={newAccount.email}
                onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newAccount.password}
                  onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={generatePassword}
                  className="px-3 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 text-sm"
                >
                  Generate
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
              <select
                value={newAccount.role}
                onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value as 'canvasser' | 'field_contractor' })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="canvasser">Canvasser (Add contacts, schedule inspections)</option>
                <option value="field_contractor">Field Contractor (Add notes, upload photos to assigned jobs)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account Expires</label>
              <input
                type="date"
                value={newAccount.expires_at || ''}
                onChange={(e) => setNewAccount({ ...newAccount, expires_at: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Leave blank for no expiration</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={createAccount}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      {/* Accounts List */}
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Users size={48} className="mx-auto mb-4 text-slate-300" />
            <p>No limited accounts created yet</p>
            <p className="text-sm">Create accounts for canvassers or field contractors</p>
          </div>
        ) : (
          accounts.map((account) => (
            <div key={account.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h4 className="font-medium text-slate-800">
                      {account.first_name} {account.last_name}
                    </h4>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      account.role === 'canvasser' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {account.role === 'canvasser' ? 'Canvasser' : 'Field Contractor'}
                    </span>
                    {!account.is_active && (
                      <span className="px-2 py-1 rounded-md text-xs bg-red-100 text-red-800">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{account.email}</p>
                  <div className="flex items-center space-x-4 text-xs text-slate-500 mt-2">
                    <span>Created: {formatDate(account.created_at)}</span>
                    <span className="flex items-center">
                      <Clock size={12} className="mr-1" />
                      Expires: {formatDate(account.account_expires_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}