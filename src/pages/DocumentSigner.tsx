import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Share2, Download, Check, PenLine,
  FileText, Shield, Eraser
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { handleAutoMove } from '../lib/store';

const DOC_CONTENT: Record<string, { title: string; subtitle: string; text: string }> = {
  contingency: {
    title: 'Contingency Agreement',
    subtitle: 'Insurance Claim Representation & Scope of Work',
    text: `1. AUTHORIZATION\n\nThe Homeowner hereby authorizes TrussCTR to act as their representative in negotiations with the insurance carrier regarding storm damage. This includes inspecting the property and discussing scope with the insurance adjuster.\n\n2. SCOPE & PRICE\n\nTrussCTR agrees to perform work as specified in the insurance carrier's Summary of Loss for the replacement price approved by the insurance company. Homeowner is only responsible for the applicable insurance deductible and any agreed-upon upgrades.\n\n3. CONTINGENCY\n\nThis agreement is contingent upon the approval of the insurance claim. If the claim is denied in its entirety, this agreement becomes null and void at no cost to the homeowner.\n\nNOTICE OF CANCELLATION\n\nYou, the buyer, may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction.`,
  },
  csa: {
    title: 'Customer Service Agreement',
    subtitle: 'Retail Sales & Installation Contract',
    text: `1. PROJECT SPECIFICATIONS\n\nContractor agrees to remove existing roof coverings and install new 30-Year Architectural Shingles. Work includes new synthetic underlayment, ice and water shield in valleys, and new pipe boots.\n\n2. PAYMENT TERMS\n\nDeposit of 50% required prior to material order. Remaining balance due upon completion of work and homeowner sign-off.\n\n3. WARRANTY\n\nTrussCTR provides a 5-Year Workmanship Warranty. Material warranties are provided by the manufacturer (GAF, Owens Corning, etc.).\n\n4. CHANGES\n\nAny changes to the approved scope of work must be authorized by the homeowner via a signed Change Order before work commences.`,
  },
  rescind: {
    title: 'Notice of Cancellation',
    subtitle: '3-Day Right to Rescind',
    text: `NOTICE OF CANCELLATION\n\nYou, the buyer, may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction.\n\nTo cancel this transaction, mail or deliver a signed and dated copy of this cancellation notice, or any other written notice, or send a telegram to TrussCTR at the address above, NOT LATER THAN MIDNIGHT of the third business day.\n\nIf you cancel, any payments made by you under the contract or sale will be returned within 10 business days following receipt by the seller of your cancellation notice.\n\nI HEREBY CANCEL THIS TRANSACTION (if applicable):\n\nDate: _______________\n\nBuyer's Signature: _______________`,
  },
  completion: {
    title: 'Completion Certificate',
    subtitle: 'Work Satisfaction Sign-Off',
    text: `CERTIFICATE OF COMPLETION\n\nI hereby certify that all work performed by TrussCTR at the property location listed on the original agreement has been completed to my satisfaction.\n\nThe property has been inspected by the homeowner and found to be free of construction debris. All terms of the original contract have been met.\n\nBy signing below, the homeowner authorizes the release of the final insurance proceeds check to TrussCTR and confirms that no outstanding work remains.\n\nDate of Completion: _______________`,
  },
  'change-order': {
    title: 'Change Order',
    subtitle: 'Scope or Price Adjustment',
    text: `CHANGE ORDER\n\nThis document modifies the original Customer Service Agreement between the homeowner and TrussCTR.\n\nReason for Change: Found rotted decking upon tear-off requiring replacement.\n\nAdditional Scope: Replace 4 sheets of 7/16" OSB decking.\n\nAdditional Cost: $380.00\n\nBy signing below, the homeowner authorizes TrussCTR to proceed with the additional scope of work and agrees to the adjusted final invoice total.`,
  },
};

export default function DocumentSigner() {
  const { id, docType } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [signed, setSigned] = useState(false);
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const doc = DOC_CONTENT[docType || ''] || {
    title: 'Document',
    subtitle: '',
    text: 'Document content not found.',
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 60) {
        setHasReadToBottom(true);
      }
    }
  };

  const handleFinalSign = async () => {
    if (!id || !docType || !profile) return;
    setSaving(true);

    try {
      // 1. Create a signed document record as a text blob stored in Supabase Storage
      const signedContent = [
        `DOCUMENT: ${doc.title}`,
        `CONTACT ID: ${id}`,
        `COMPANY ID: ${profile.company_id}`,
        `SIGNED BY: ${profile.full_name || profile.email}`,
        `TIMESTAMP: ${new Date().toISOString()}`,
        `IP: (captured server-side in production)`,
        '',
        '--- DOCUMENT CONTENT ---',
        '',
        doc.text,
      ].join('\n');

      const blob = new Blob([signedContent], { type: 'text/plain' });
      const fileName = `${docType}_signed_${Date.now()}.txt`;
      const filePath = `${id}/${fileName}`;

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob);

      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // 2. Insert a record into the documents table
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          contact_id: id,
          company_id: profile.company_id,
          name: `${docType}_${doc.title}`,
          type: 'contract',
          url: publicUrl,
          size: blob.size,
          uploaded_by: profile.full_name || profile.email,
        } as any);

      if (dbError) throw dbError;

      // 3. Log to communications timeline
      await supabase.from('communications').insert({
        contact_id: id,
        company_id: profile.company_id,
        type: 'note',
        content: `✅ Document signed: ${doc.title} — ${new Date().toLocaleString()}`,
        user_id: profile.id,
        direction: 'outbound',
      } as any);

      // 4. Auto-move pipeline status
      if (docType === 'contingency') await handleAutoMove(id, 'sign_contingency');
      if (docType === 'csa') await handleAutoMove(id, 'sign_csa');
      if (docType === 'completion') await handleAutoMove(id, 'sign_completion');

      setSigned(true);
    } catch (err) {
      console.error('Error saving signed document:', err);
      alert('Failed to save document. Please check Supabase storage bucket "documents" exists.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col max-w-[480px] mx-auto">
      {/* Navbar */}
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="font-bold text-sm text-primary leading-tight">{doc.title}</h1>
            <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 uppercase">
              <Shield size={10} /> Secure Document
            </p>
          </div>
        </div>
        <button className="p-2 text-slate-400">
          <Download size={20} />
        </button>
      </nav>

      {/* Document Scroll Viewport */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 bg-slate-100"
      >
        <div className="bg-white p-6 shadow-md border border-slate-200 rounded-sm">
          {/* Letterhead */}
          <div className="flex justify-between items-start mb-10 border-b pb-6">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tighter text-primary">TrussCTR</h2>
              <p className="text-[8px] text-slate-500 leading-tight">
                Licensed • Bonded • Insured
              </p>
            </div>
            <FileText size={32} className="text-slate-200" />
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-primary underline decoration-accent decoration-2 underline-offset-4">
              {doc.title}
            </h3>
            <p className="text-xs text-slate-400 mt-1">{doc.subtitle}</p>
          </div>

          <div className="text-sm text-slate-700 leading-relaxed font-serif whitespace-pre-line">
            {doc.text}
          </div>

          <div className="mt-12 pt-8 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest text-center">
              — End of Document —
            </p>
          </div>

          {signed && (
            <div className="mt-8 p-4 border-2 border-dashed border-emerald-500 rounded-xl bg-emerald-50 flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center bg-emerald-500 text-white rounded-full shrink-0">
                <Check size={24} />
              </div>
              <div>
                <p className="font-bold text-emerald-700 text-sm">Digitally Signed & Saved</p>
                <p className="text-[10px] text-emerald-600">{new Date().toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Signature Controls */}
      <div className="bg-white p-6 border-t border-slate-100 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
        {!signed ? (
          <div className="space-y-4">
            {!hasReadToBottom ? (
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center gap-3">
                <div className="p-2 bg-amber-500 text-white rounded-full shrink-0">
                  <FileText size={16} />
                </div>
                <p className="text-xs font-bold text-amber-800">
                  Please scroll down to review the full agreement before signing
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-2 text-slate-900">
                    <PenLine size={16} className="text-accent" />
                    <span className="text-xs font-black uppercase italic">Sign Here</span>
                  </div>
                  <button className="text-[10px] font-bold text-slate-400 underline uppercase flex items-center gap-1">
                    <Eraser size={12} /> Clear
                  </button>
                </div>

                <div
                  onClick={() => !saving && setHasReadToBottom(true)}
                  className="w-full h-32 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-200 relative overflow-hidden active:bg-slate-100 cursor-crosshair"
                >
                  <span className="font-serif italic text-3xl opacity-30">X_________________</span>
                </div>

                <button
                  onClick={handleFinalSign}
                  disabled={saving}
                  className="w-full bg-primary text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Confirm & Save Signature'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="bg-emerald-500 p-1 rounded-full text-white">
                <Check size={16} />
              </div>
              <p className="text-sm font-bold text-emerald-800">Document Signed & Stored in Supabase</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex-1 bg-slate-100 text-slate-700 font-bold py-4 rounded-xl"
              >
                Back to Docs
              </button>
              <button className="flex-1 bg-accent text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
                <Share2 size={18} /> Send Copy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
