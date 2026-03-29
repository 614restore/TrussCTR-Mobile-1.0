import React, { useState, useEffect } from 'react';
import { ChevronLeft, Bell, Shield, Smartphone, Globe, Moon, HelpCircle, Images, ChevronRight, KeyRound, CheckCircle, FileText, CreditCard, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getInspectionPhotoStorageMode, setInspectionPhotoStorageMode, type InspectionPhotoStorageMode } from '../lib/photoPreferences';
import { registerPushToken, checkPushPermission } from '../lib/pushNotifications';
import { Capacitor } from '@capacitor/core';
import { getPasswordResetRedirectUrl } from '../lib/authRedirect';

export default function Settings() {
  const navigate = useNavigate();
  const { user, requestPasswordChange, profile } = useAuth();
  const [inspectionPhotoStorageMode, setMode] = useState<InspectionPhotoStorageMode>(() => getInspectionPhotoStorageMode());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === 'true');
  const [pwResetLoading, setPwResetLoading] = useState(false);
  const [pwResetSent, setPwResetSent] = useState(false);

  // Financing links state
  const [financingLinks, setFinancingLinks] = useState<{ name: string; url: string }[]>([]);
  const [financingLoading, setFinancingLoading] = useState(false);
  const [financingSaving, setFinancingSaving] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const canManageFinancing = profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager';

  useEffect(() => {
    if (!canManageFinancing || !profile?.company_id) return;
    setFinancingLoading(true);
    (supabase.from('companies') as any)
      .select('financing_links')
      .eq('id', profile.company_id)
      .single()
      .then(({ data }: any) => {
        if (data?.financing_links) setFinancingLinks(data.financing_links);
      })
      .finally(() => setFinancingLoading(false));
  }, [profile?.company_id, canManageFinancing]);

  const saveFinancingLinks = async (links: { name: string; url: string }[]) => {
    if (!profile?.company_id) return;
    setFinancingSaving(true);
    try {
      await (supabase.from('companies') as any)
        .update({ financing_links: links })
        .eq('id', profile.company_id);
      setFinancingLinks(links);
    } catch (err) {
      console.error('Error saving financing links:', err);
      alert('Unable to save financing links.');
    } finally {
      setFinancingSaving(false);
    }
  };

  const addFinancingLink = () => {
    const name = newLinkName.trim();
    const url = newLinkUrl.trim();
    if (!name || !url) return;
    const updated = [...financingLinks, { name, url }];
    setNewLinkName('');
    setNewLinkUrl('');
    saveFinancingLinks(updated);
  };

  const removeFinancingLink = (index: number) => {
    const updated = financingLinks.filter((_, i) => i !== index);
    saveFinancingLinks(updated);
  };

  // Push notification state
  const isNative = Capacitor.isNativePlatform();
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'web' | 'loading'>('loading');
  const [pushRegistering, setPushRegistering] = useState(false);

  useEffect(() => {
    checkPushPermission().then(setPushStatus);
  }, []);

  const handleTogglePush = async () => {
    if (pushRegistering) return;
    if (pushStatus === 'granted') {
      // iOS does not allow revoking push permission programmatically.
      // Direct the user to iOS Settings.
      alert('To turn off notifications, go to iPhone Settings → TrussCTR → Notifications and disable Allow Notifications.');
      return;
    }
    // Status is denied or we haven't asked yet — request permission
    setPushRegistering(true);
    const result = await registerPushToken();
    setPushStatus(result);
    setPushRegistering(false);
    if (result === 'denied') {
      alert('Notifications were not allowed. To enable them, go to iPhone Settings → TrussCTR → Notifications and turn on Allow Notifications.');
    }
  };

  const handleToggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('dark_mode', String(next));
    document.documentElement.classList.toggle('dark', next);
  };

  const handleChangePassword = async () => {
    if (!user?.email || pwResetLoading) return;
    setPwResetLoading(true);
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      if (!redirectTo) {
        throw new Error('Password reset is not configured for this app build. Set VITE_APP_URL to your deployed app URL.');
      }
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo,
      });
      setPwResetSent(true);
    } catch (err) {
      console.error('Password reset error:', err);
    } finally {
      setPwResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Settings</h1>
        </div>
      </div>

      <div className="w-full max-w-full p-6 space-y-8 overflow-x-hidden">
        {/* Inspection Photo Storage */}
        <div className="space-y-3">
          <h2 className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Inspection Photos</h2>
          <div className="card space-y-4 p-4">
            <div className="flex items-start gap-4">
              <Images size={20} className="mt-0.5 text-emerald-500" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary">Inspection Photo Save Location</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Choose whether inspection photos stay inside the app files or also get copied into the device photo library.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button type="button"
                onClick={() => { setMode('app_files'); setInspectionPhotoStorageMode('app_files'); }}
                className={`rounded-2xl border p-4 text-left transition ${inspectionPhotoStorageMode === 'app_files' ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-primary">App Files</p>
                    <p className="mt-1 text-xs text-slate-500">Recommended. Keeps customer property photos out of personal library.</p>
                  </div>
                  {inspectionPhotoStorageMode === 'app_files' && (
                    <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">Selected</span>
                  )}
                </div>
              </button>
              <button type="button"
                onClick={() => { setMode('photo_library'); setInspectionPhotoStorageMode('photo_library'); }}
                className={`rounded-2xl border p-4 text-left transition ${inspectionPhotoStorageMode === 'photo_library' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-primary">Photo Library</p>
                    <p className="mt-1 text-xs text-slate-500">Also saves inspection photos to the device camera roll.</p>
                  </div>
                  {inspectionPhotoStorageMode === 'photo_library' && (
                    <span className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">Selected</span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* App Preferences */}
        <div className="space-y-3">
          <h2 className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">App Settings</h2>
          <div className="card divide-y divide-slate-50">
            {/* Push Notifications */}
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-4">
                <Bell size={20} className="text-blue-500" />
                <div>
                  <span className="text-sm font-bold text-primary">Push Notifications</span>
                  {isNative && (
                    <p className="text-[11px] mt-0.5 text-slate-400">
                      {pushStatus === 'loading'    ? 'Checking…'
                       : pushStatus === 'granted'  ? 'Enabled — tap to manage in Settings'
                       : pushStatus === 'denied'   ? 'Tap to enable'
                       : 'Not available on this device'}
                    </p>
                  )}
                </div>
              </div>
              {isNative ? (
                <button
                  onClick={handleTogglePush}
                  disabled={pushRegistering || pushStatus === 'loading' || pushStatus === 'web'}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                    pushStatus === 'granted' ? 'bg-primary' : 'bg-slate-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    pushStatus === 'granted' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              ) : (
                <span className="text-xs text-slate-300 font-medium">iOS only</span>
              )}
            </div>
            {/* Dark Mode toggle */}
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-4">
                <Moon size={20} className="text-indigo-500" />
                <span className="text-sm font-bold text-primary">Dark Mode</span>
              </div>
              <button
                onClick={handleToggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Account / Security */}
        <div className="space-y-3">
          <h2 className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Account</h2>
          <div className="card divide-y divide-slate-50">
            {/* Change Password */}
            <button onClick={handleChangePassword} className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <KeyRound size={20} className="text-rose-500" />
                <span className="text-sm font-bold text-primary">Change Password</span>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
            {/* Privacy Policy */}
            <button onClick={() => navigate('/help')} className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <Shield size={20} className="text-slate-600" />
                <span className="text-sm font-bold text-primary">Privacy Policy</span>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          </div>
        </div>

        {/* Document Templates — owner/admin only */}
        {(profile?.role === 'owner' || profile?.role === 'admin') && (
          <div className="space-y-3">
            <h2 className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Legal Documents</h2>
            <button
              onClick={() => navigate('/settings/document-templates')}
              className="w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <FileText size={20} className="text-violet-500" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-primary text-sm">Document Templates</p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Edit legal document text</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          </div>
        )}

        {/* Financing Links — owner/admin/manager only */}
        {canManageFinancing && (
          <div className="space-y-3">
            <h2 className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Financing</h2>
            <div className="card p-4 space-y-4">
              <div className="flex items-start gap-3">
                <CreditCard size={20} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-primary">Financing Links</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add your lender application links (GoodLeap, Hearth, Wisetack, etc.). Your team can send them to homeowners directly from a contact record.
                  </p>
                </div>
              </div>

              {financingLoading ? (
                <p className="text-xs text-slate-400">Loading...</p>
              ) : (
                <div className="space-y-2">
                  {financingLinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-primary truncate">{link.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{link.url}</p>
                      </div>
                      <button
                        onClick={() => removeFinancingLink(i)}
                        disabled={financingSaving}
                        className="p-1.5 text-rose-400 active:scale-90 transition-transform disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {financingLinks.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">No financing links added yet.</p>
                  )}
                </div>
              )}

              {/* Add new link form */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add a Lender</p>
                <input
                  className="w-full bg-slate-50 rounded-xl p-3 text-sm border border-slate-100"
                  placeholder="Label (e.g. GoodLeap — Acme Roofing)"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                />
                <input
                  className="w-full bg-slate-50 rounded-xl p-3 text-sm border border-slate-100"
                  placeholder="Application URL"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <button
                  onClick={addFinancingLink}
                  disabled={!newLinkName.trim() || !newLinkUrl.trim() || financingSaving}
                  className="w-full bg-emerald-500 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-transform"
                >
                  <Plus size={16} />
                  {financingSaving ? 'Saving...' : 'Add Lender'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Support */}
        <div className="space-y-3">
          <h2 className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Support</h2>
          <div className="card">
            <button onClick={() => navigate('/help')} className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <HelpCircle size={20} className="text-amber-500" />
                <span className="text-sm font-bold text-primary">Help Center</span>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          </div>
        </div>

        <div className="text-center py-8">
          <p className="text-[10px] text-slate-300 uppercase font-bold tracking-widest">Version 1.0.4 (Build 42)</p>
        </div>
      </div>
    </div>
  );
}
