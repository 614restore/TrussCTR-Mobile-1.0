import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Plug, CheckCircle, AlertCircle, Eye, EyeOff,
  Loader2, ExternalLink, Shield, Zap, Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { testRoofHubConnection } from '../lib/integrations/roofhub';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IntegrationRow {
  roofr_api_key:            string | null;
  eagleview_api_key:        string | null;
  eagleview_client_id:      string | null;
  hailtrace_api_key:        string | null;
  hailtrace_enabled:        boolean;
  roofhub_integration_key:  string | null;
  roofhub_enabled:          boolean;
}

// ─── Sub-component: Key field with show/hide ──────────────────────────────────
function SecretInput({
  label, placeholder, value, onChange, disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-4 pr-12 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 active:scale-90 transition-transform"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-component: Integration card ─────────────────────────────────────────
function IntegrationCard({
  icon, title, description, learnMoreUrl, connected, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  learnMoreUrl?: string;
  connected: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-50 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-primary text-sm">{title}</p>
              {connected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wide">
                  <CheckCircle size={9} /> Connected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-slate-300 active:scale-90 transition-transform shrink-0"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {/* Body */}
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Integrations() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const db = supabase as any;

  const canManage = profile?.role === 'owner' || profile?.role === 'admin';

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null); // which integration is saving
  const [row,      setRow]      = useState<IntegrationRow | null>(null);
  const [rowId,    setRowId]    = useState<string | null>(null);

  // Local editable state for each integration
  const [roofrKey,      setRoofrKey]      = useState('');
  const [evKey,         setEvKey]         = useState('');
  const [evClientId,    setEvClientId]    = useState('');
  const [htKey,         setHtKey]         = useState('');
  const [rhKey,         setRhKey]         = useState('');

  // Test states
  const [rhTesting,   setRhTesting]   = useState(false);
  const [rhTestResult, setRhTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Save feedback
  const [savedIntegration, setSavedIntegration] = useState<string | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.company_id) return;
    setLoading(true);

    db.from('company_integrations')
      .select('*')
      .eq('company_id', profile.company_id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setRowId(data.id);
          setRow(data);
          setRoofrKey(data.roofr_api_key ?? '');
          setEvKey(data.eagleview_api_key ?? '');
          setEvClientId(data.eagleview_client_id ?? '');
          setHtKey(data.hailtrace_api_key ?? '');
          setRhKey(data.roofhub_integration_key ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, [profile?.company_id]);

  // ── Save helper ────────────────────────────────────────────────────────────
  const save = async (integrationName: string, patch: Partial<IntegrationRow>) => {
    if (!profile?.company_id || saving) return;
    setSaving(integrationName);
    try {
      const base = { company_id: profile.company_id, updated_at: new Date().toISOString() };
      if (rowId) {
        await db.from('company_integrations').update({ ...patch, ...base }).eq('id', rowId);
      } else {
        const { data } = await db
          .from('company_integrations')
          .insert({ ...patch, ...base })
          .select('id')
          .single();
        if (data?.id) setRowId(data.id);
      }
      setSavedIntegration(integrationName);
      setTimeout(() => setSavedIntegration(null), 2000);
    } catch (err) {
      console.error('[Integrations] save error:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  // ── Test Roof Hub connection ───────────────────────────────────────────────
  const testRoofHub = async () => {
    if (!rhKey.trim() || rhTesting) return;
    setRhTesting(true);
    setRhTestResult(null);
    try {
      const result = await testRoofHubConnection(rhKey.trim());
      setRhTestResult({ ok: result.connected, message: result.message });
    } catch (err: any) {
      setRhTestResult({ ok: false, message: err.message ?? 'Connection failed.' });
    } finally {
      setRhTesting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const rhConnected = !!(row?.roofhub_integration_key);
  const roofrConnected  = !!(row?.roofr_api_key);
  const evConnected     = !!(row?.eagleview_api_key);
  const htConnected     = !!(row?.hailtrace_api_key);

  if (!canManage) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-primary">Integrations</h1>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <Shield size={20} className="text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-700">Admin access required</p>
              <p className="text-xs text-slate-500 mt-1">Only owners and admins can manage integrations.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary">Integrations</h1>
            <p className="text-xs text-slate-400 mt-0.5">Connect third-party services to TrussCTR</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="p-6 space-y-5">

          {/* ── Roof Hub / SRS Distribution ─────────────────────────────── */}
          <IntegrationCard
            icon={<Package size={22} className="text-red-500" />}
            title="Roof Hub — SRS Distribution"
            description="Order roofing materials directly from SRS Distribution. Get real-time pricing and track deliveries from your Material Orders."
            learnMoreUrl="https://www.roofhub.pro"
            connected={rhConnected}
          >
            <p className="text-xs text-slate-500 leading-relaxed">
              Find your Integration Key in your Roof Hub account under{' '}
              <span className="font-bold text-primary">More → Integrations</span>, then copy and paste it below.
            </p>

            <SecretInput
              label="Integration Key"
              placeholder="Paste your Roof Hub Integration Key…"
              value={rhKey}
              onChange={(v) => { setRhKey(v); setRhTestResult(null); }}
              disabled={!canManage}
            />

            {rhTestResult && (
              <div className={`flex items-start gap-3 rounded-2xl p-3 ${
                rhTestResult.ok
                  ? 'bg-emerald-50 border border-emerald-100'
                  : 'bg-red-50 border border-red-100'
              }`}>
                {rhTestResult.ok
                  ? <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  : <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                }
                <p className={`text-xs font-medium ${rhTestResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {rhTestResult.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={testRoofHub}
                disabled={!rhKey.trim() || rhTesting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-95 transition-all disabled:opacity-40"
              >
                {rhTesting ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {rhTesting ? 'Testing…' : 'Test Connection'}
              </button>
              <button
                onClick={() => save('roofhub', {
                  roofhub_integration_key: rhKey.trim() || null,
                  roofhub_enabled: !!rhKey.trim(),
                })}
                disabled={saving === 'roofhub'}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-accent text-white text-sm font-bold active:scale-95 transition-all disabled:opacity-50 shadow-sm shadow-accent/20"
              >
                {saving === 'roofhub' ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : savedIntegration === 'roofhub' ? (
                  <><CheckCircle size={15} /> Saved!</>
                ) : (
                  'Save'
                )}
              </button>
            </div>

            {rhConnected && (
              <button
                onClick={() => { setRhKey(''); save('roofhub', { roofhub_integration_key: null, roofhub_enabled: false }); }}
                className="w-full py-2 text-xs font-bold text-rose-400 active:scale-95 transition-transform"
              >
                Disconnect Roof Hub
              </button>
            )}
          </IntegrationCard>

          {/* ── Roofr ───────────────────────────────────────────────────── */}
          <IntegrationCard
            icon={<span className="text-lg font-black text-slate-600">R</span>}
            title="Roofr"
            description="Order aerial roof measurement reports with precise square footage and pitch data."
            learnMoreUrl="https://www.roofr.com"
            connected={roofrConnected}
          >
            <SecretInput
              label="API Key"
              placeholder="Roofr API key…"
              value={roofrKey}
              onChange={(v) => setRoofrKey(v)}
              disabled={!canManage}
            />
            <button
              onClick={() => save('roofr', { roofr_api_key: roofrKey.trim() || null })}
              disabled={saving === 'roofr'}
              className="w-full py-3 rounded-2xl bg-accent text-white text-sm font-bold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving === 'roofr' ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : savedIntegration === 'roofr' ? (
                <><CheckCircle size={15} /> Saved!</>
              ) : (
                'Save'
              )}
            </button>
          </IntegrationCard>

          {/* ── EagleView ───────────────────────────────────────────────── */}
          <IntegrationCard
            icon={<span className="text-lg font-black text-blue-600">EV</span>}
            title="EagleView"
            description="High-accuracy aerial imagery and roof measurement reports for estimating and claims."
            learnMoreUrl="https://www.eagleview.com"
            connected={evConnected}
          >
            <SecretInput
              label="API Key"
              placeholder="EagleView API key…"
              value={evKey}
              onChange={(v) => setEvKey(v)}
              disabled={!canManage}
            />
            <SecretInput
              label="Client ID"
              placeholder="EagleView Client ID…"
              value={evClientId}
              onChange={(v) => setEvClientId(v)}
              disabled={!canManage}
            />
            <button
              onClick={() => save('eagleview', {
                eagleview_api_key:   evKey.trim() || null,
                eagleview_client_id: evClientId.trim() || null,
              })}
              disabled={saving === 'eagleview'}
              className="w-full py-3 rounded-2xl bg-accent text-white text-sm font-bold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving === 'eagleview' ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : savedIntegration === 'eagleview' ? (
                <><CheckCircle size={15} /> Saved!</>
              ) : (
                'Save'
              )}
            </button>
          </IntegrationCard>

          {/* ── HailTrace ───────────────────────────────────────────────── */}
          <IntegrationCard
            icon={<span className="text-lg font-black text-amber-500">HT</span>}
            title="HailTrace"
            description="Real-time hail event alerts for your service area. Get notified when hail hits near your contacts."
            learnMoreUrl="https://www.hailtrace.com"
            connected={htConnected}
          >
            <SecretInput
              label="API Key"
              placeholder="HailTrace API key…"
              value={htKey}
              onChange={(v) => setHtKey(v)}
              disabled={!canManage}
            />
            <button
              onClick={() => save('hailtrace', { hailtrace_api_key: htKey.trim() || null })}
              disabled={saving === 'hailtrace'}
              className="w-full py-3 rounded-2xl bg-accent text-white text-sm font-bold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving === 'hailtrace' ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : savedIntegration === 'hailtrace' ? (
                <><CheckCircle size={15} /> Saved!</>
              ) : (
                'Save'
              )}
            </button>
          </IntegrationCard>

          {/* Info note */}
          <div className="flex items-start gap-3 rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <Plug size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              API keys are stored securely per company and are never shared with other TrussCTR accounts.
              Keys are used only to communicate with each respective service on your behalf.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
