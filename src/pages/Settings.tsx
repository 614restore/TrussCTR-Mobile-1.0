import React, { useState } from 'react';
import { ChevronLeft, Bell, Shield, Smartphone, Globe, Moon, HelpCircle, Images, ChevronRight, KeyRound, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getInspectionPhotoStorageMode, setInspectionPhotoStorageMode, type InspectionPhotoStorageMode } from '../lib/photoPreferences';

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [inspectionPhotoStorageMode, setMode] = useState<InspectionPhotoStorageMode>(() => getInspectionPhotoStorageMode());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('notif_enabled') !== 'false');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === 'true');
  const [pwResetSent, setPwResetSent] = useState(false);
  const [pwResetLoading, setPwResetLoading] = useState(false);

  const handleToggleNotifications = () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    localStorage.setItem('notif_enabled', String(next));
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
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
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
            {/* Notifications toggle */}
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-4">
                <Bell size={20} className="text-blue-500" />
                <span className="text-sm font-bold text-primary">Notifications</span>
              </div>
              <button
                onClick={handleToggleNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationsEnabled ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
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
            <button onClick={handleChangePassword} disabled={pwResetLoading || pwResetSent} className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors disabled:opacity-60">
              <div className="flex items-center gap-4">
                <KeyRound size={20} className="text-rose-500" />
                <span className="text-sm font-bold text-primary">
                  {pwResetSent ? 'Reset email sent!' : pwResetLoading ? 'Sending...' : 'Change Password'}
                </span>
              </div>
              {pwResetSent ? <CheckCircle size={18} className="text-emerald-500" /> : <ChevronRight size={16} className="text-slate-300" />}
            </button>
            {pwResetSent && (
              <p className="px-4 pb-3 text-xs text-slate-400">Check {user?.email} for a password reset link.</p>
            )}
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
