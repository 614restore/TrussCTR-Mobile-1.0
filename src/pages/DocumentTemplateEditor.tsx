import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, RotateCcw, Save, Shield, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_DOC_CONTENT,
  PLACEHOLDER_CTX,
  loadCustomTemplates,
  saveCustomTemplates,
} from '../lib/documentTemplates';

const TEMPLATE_IDS = ['contingency', 'csa', 'rescind', 'completion', 'change-order'] as const;

const PLACEHOLDERS = [
  { key: '{today}',           label: "Today's date" },
  { key: '{cancelDeadline}',  label: '3-day cancellation deadline (business days, excl. weekends)' },
  { key: '{propertyAddress}', label: 'Customer property address (street, city, state, zip)' },
  { key: '{propertyState}',   label: "Customer's state code — drives state-specific legal language (e.g. OH)" },
  { key: '{companyAddress}',  label: 'Your company address' },
  { key: '{companyState}',    label: 'Your company state code' },
  { key: '{projectValue}',    label: 'Project value / contract amount' },
  { key: '{deductible}',      label: 'Insurance deductible amount' },
  { key: '{contractorName}',  label: 'Contractor / company name (from Company Profile)' },
  { key: '{contractorPhone}', label: 'Contractor phone number (from Company Profile)' },
];

/** Templates that use dynamic state-specific content and can't be fully overridden here */
const STATE_AWARE_TEMPLATES = new Set(['rescind']);

function getDefaultSections(templateId: string): string[] {
  const def = DEFAULT_DOC_CONTENT[templateId];
  if (!def) return [];
  return def.sections(PLACEHOLDER_CTX);
}

export default function DocumentTemplateEditor() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [saved, setSaved] = useState(false);
  // sections[templateId] = array of section strings
  const [sections, setSections] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    for (const id of TEMPLATE_IDS) {
      defaults[id] = getDefaultSections(id);
    }
    return defaults;
  });

  const canEdit = profile?.role === 'owner' || profile?.role === 'admin';

  useEffect(() => {
    if (!profile?.company_id) return;
    const custom = loadCustomTemplates(profile.company_id);
    if (custom) {
      setSections((prev) => {
        const merged = { ...prev };
        for (const id of TEMPLATE_IDS) {
          if (Array.isArray(custom[id]) && custom[id].length > 0) {
            merged[id] = custom[id];
          }
        }
        return merged;
      });
    }
  }, [profile?.company_id]);

  const updateSection = (templateId: string, sectionIndex: number, value: string) => {
    setSections((prev) => {
      const updated = [...(prev[templateId] || [])];
      updated[sectionIndex] = value;
      return { ...prev, [templateId]: updated };
    });
    setSaved(false);
  };

  const addSection = (templateId: string) => {
    setSections((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] || []), ''],
    }));
    setSaved(false);
  };

  const removeSection = (templateId: string, index: number) => {
    setSections((prev) => ({
      ...prev,
      [templateId]: prev[templateId].filter((_, i) => i !== index),
    }));
    setSaved(false);
  };

  const resetTemplate = (templateId: string) => {
    setSections((prev) => ({
      ...prev,
      [templateId]: getDefaultSections(templateId),
    }));
    setSaved(false);
  };

  const handleSave = () => {
    if (!profile?.company_id) return;
    saveCustomTemplates(profile.company_id, sections);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!canEdit) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <nav className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ArrowLeft size={24} />
          </button>
          <h1 className="font-bold text-primary">Document Templates</h1>
        </nav>
        <div className="p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
            <Shield size={24} className="text-amber-500" />
          </div>
          <p className="font-bold text-primary">Owner / Admin Access Only</p>
          <p className="text-sm text-slate-400">Document template editing is restricted to company owners and administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <nav className="p-4 bg-white border-b border-slate-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="font-bold text-primary">Document Templates</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Company-wide • Admin Only</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              saved ? 'bg-emerald-500 text-white' : 'bg-accent text-white'
            }`}
          >
            <Save size={15} />
            {saved ? 'Saved!' : 'Save All'}
          </button>
        </div>
      </nav>

      <div className="p-5 space-y-4">
        {/* Placeholder reference */}
        <button
          onClick={() => setShowPlaceholders((v) => !v)}
          className="w-full flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-2xl"
        >
          <div className="flex items-center gap-3">
            <Info size={18} className="text-blue-500" />
            <span className="text-sm font-bold text-blue-700">Available Placeholders</span>
          </div>
          {showPlaceholders ? <ChevronDown size={16} className="text-blue-400" /> : <ChevronRight size={16} className="text-blue-400" />}
        </button>

        {showPlaceholders && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              Use these tokens in your template text — they'll be replaced automatically when the document is generated:
            </p>
            {PLACEHOLDERS.map((p) => (
              <div key={p.key} className="flex items-start gap-3">
                <code className="text-[11px] font-bold bg-slate-100 text-accent px-2 py-0.5 rounded font-mono shrink-0">
                  {p.key}
                </code>
                <span className="text-xs text-slate-500">{p.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Templates */}
        {TEMPLATE_IDS.map((templateId) => {
          const def = DEFAULT_DOC_CONTENT[templateId];
          const isOpen = expandedTemplate === templateId;
          const templateSections = sections[templateId] || [];
          const isCustomized = JSON.stringify(templateSections) !== JSON.stringify(getDefaultSections(templateId));

          return (
            <div key={templateId} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedTemplate(isOpen ? null : templateId)}
                className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Shield size={18} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="font-bold text-primary text-sm">{def?.title || templateId}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tight font-medium">{def?.subtitle || ''}</p>
                    {isCustomized && (
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight mt-0.5">● Customized</p>
                    )}
                  </div>
                </div>
                {isOpen ? <ChevronDown size={18} className="text-slate-300 shrink-0" /> : <ChevronRight size={18} className="text-slate-300 shrink-0" />}
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 p-4 space-y-4">
                  {/* State-aware notice for rescind / Notice of Cancellation */}
                  {STATE_AWARE_TEMPLATES.has(templateId) && (
                    <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                      <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-blue-800">State-Specific Template</p>
                        <p className="text-[11px] text-blue-700 mt-1 leading-relaxed">
                          This document uses <strong>state-specific legal language</strong> driven by the customer's
                          state (<code className="bg-blue-100 px-1 rounded font-mono">{'{propertyState}'}</code>).
                          Ohio customers automatically receive Ohio HSSA (R.C. §1345.21) all-caps language.
                          All other states receive the generic multi-state version below.
                          Custom text entered here will override the state-specific language — only edit
                          if your attorney has reviewed the changes.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Reset button */}
                  {isCustomized && (
                    <button
                      onClick={() => resetTemplate(templateId)}
                      className="flex items-center gap-2 text-xs font-bold text-amber-600 px-3 py-1.5 bg-amber-50 rounded-xl"
                    >
                      <RotateCcw size={13} />
                      Reset to Default
                    </button>
                  )}

                  {/* Section editors */}
                  {templateSections.map((sectionText, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Section {idx + 1}</p>
                        {templateSections.length > 1 && (
                          <button
                            onClick={() => removeSection(templateId, idx)}
                            className="text-[10px] font-bold text-red-400 px-2 py-1 rounded-lg hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <textarea
                        value={sectionText}
                        onChange={(e) => updateSection(templateId, idx, e.target.value)}
                        rows={Math.max(4, sectionText.split('\n').length + 1)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono leading-relaxed resize-y"
                        placeholder="Enter section text... Use {placeholders} for dynamic values."
                      />
                    </div>
                  ))}

                  {/* Add section */}
                  <button
                    onClick={() => addSection(templateId)}
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-accent hover:text-accent transition-colors"
                  >
                    + Add Section
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-xs text-amber-700 font-medium leading-relaxed">
            <span className="font-bold">Important:</span> These templates apply company-wide. Changes take effect immediately for all future documents. Signed documents already generated are not affected. Consult your attorney before modifying legal language.
          </p>
        </div>
      </div>
    </div>
  );
}
