import React, { useState, useEffect } from 'react';
import { Users, Mail, Shield, ChevronLeft, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function Team() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (profile?.company_id) {
      fetchMembers();
    }
  }, [profile?.company_id]);

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('first_name');
      
      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter(m => 
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Team Members</h1>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search team..."
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-accent text-white p-3 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-transform">
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : filteredMembers.length > 0 ? (
          filteredMembers.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 flex items-center gap-4"
            >
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-bold">
                {member.first_name?.[0]}{member.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-primary truncate">{member.first_name} {member.last_name}</h3>
                <div className="flex items-center gap-2 text-slate-500 text-xs mt-0.5">
                  <Mail size={12} />
                  <span className="truncate">{member.email}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                  <Shield size={10} />
                  {member.role || 'Member'}
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <Users size={32} />
            </div>
            <p className="text-slate-400 text-sm">No team members found</p>
          </div>
        )}
      </div>
    </div>
  );
}
