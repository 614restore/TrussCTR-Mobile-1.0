import React, { useState, useRef } from 'react';
import { Building2, Mail, Phone, MapPin, Globe, ChevronLeft, Save, Camera, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function CompanyProfile() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: profile?.companies?.name || '',
    email: profile?.companies?.email || '',
    phone: profile?.companies?.phone || '',
    address: profile?.companies?.address || '',
    city: (profile?.companies as any)?.city || '',
    state: (profile?.companies as any)?.state || '',
    zip: (profile?.companies as any)?.zip || '',
    google_review_url: profile?.companies?.google_review_url || '',
  });

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!profile?.company_id) {
      alert('Company not loaded yet — please wait a moment and try again.');
      return;
    }

    // Client-side size check (1 MB)
    if (file.size > 1024 * 1024) {
      alert('Image must be under 1 MB. Please choose a smaller file.');
      return;
    }

    // Show preview immediately
    setLogoPreview(URL.createObjectURL(file));
    setUploadingLogo(true);

    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${profile.company_id}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(path);

      const { error: updateError } = await (supabase.from('companies') as any)
        .update({ logo_url: publicUrl })
        .eq('id', profile.company_id);

      if (updateError) throw updateError;

      await refreshProfile();
    } catch (err: any) {
      console.error('Logo upload failed:', err);
      alert('Logo upload failed: ' + (err?.message ?? 'Unknown error'));
      setLogoPreview(null);
    } finally {
      setUploadingLogo(false);
      // Reset input so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { error } = await (supabase.from('companies') as any)
        .update(formData)
        .eq('id', profile.company_id);
      if (error) throw error;
      await refreshProfile();
      navigate(-1);
    } catch (err) {
      console.error('Error updating company:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentLogoUrl = logoPreview || profile?.companies?.logo_url;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-primary">Company Profile</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-accent text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save
          </button>
        </div>
      </div>

      <div className="w-full max-w-full p-6 space-y-6 overflow-x-hidden">
        {/* Logo Section */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative">
            <div className="h-24 w-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-xl border border-slate-100 overflow-hidden">
              {uploadingLogo ? (
                <Loader2 size={32} className="text-slate-300 animate-spin" />
              ) : currentLogoUrl ? (
                <img src={currentLogoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Building2 size={40} className="text-slate-200" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
              className="absolute bottom-0 right-0 h-8 w-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white active:scale-90 transition-transform disabled:opacity-50"
            >
              <Camera size={14} />
            </button>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {uploadingLogo ? 'Uploading…' : 'Tap camera to change logo'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Company Name</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Business Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="tel"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Street Address</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="123 Main St"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">City</label>
            <input
              type="text"
              placeholder="Denver"
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-accent/20"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">State</label>
              <input
                type="text"
                placeholder="CO"
                maxLength={2}
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-accent/20 uppercase"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ZIP Code</label>
              <input
                type="text"
                placeholder="80201"
                maxLength={10}
                inputMode="numeric"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-accent/20"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Google Review URL</label>
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="url"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                placeholder="https://g.page/r/..."
                value={formData.google_review_url}
                onChange={(e) => setFormData({ ...formData, google_review_url: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
