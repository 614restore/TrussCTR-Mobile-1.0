import React from 'react';
import { ChevronLeft, MessageCircle, Mail, Phone, Book, Search, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function HelpSupport() {
  const navigate = useNavigate();

  const faqs = [
    { q: 'How do I create a new work order?', a: 'Go to Field Tools > Work Orders and tap the "+" button in the bottom right.' },
    { q: 'Can I use the app offline?', a: 'Yes, most features work offline and will sync once you are back online.' },
    { q: 'How do I update a job status?', a: 'Open the contact from the Pipeline and use the "Job Status" tab to move them through the stages.' },
    { q: 'Where are my documents stored?', a: 'All documents are securely stored in your company\'s private Supabase storage bucket.' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Help & Support</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search help articles..."
            className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Contact Support */}
        <div className="space-y-3">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact Support</h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="card p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                <MessageCircle size={20} />
              </div>
              <span className="text-xs font-bold text-primary">Live Chat</span>
            </button>
            <button className="card p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                <Mail size={20} />
              </div>
              <span className="text-xs font-bold text-primary">Email Us</span>
            </button>
          </div>
        </div>

        {/* FAQs */}
        <div className="space-y-3">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="card p-4 space-y-2">
                <p className="text-sm font-bold text-primary">{faq.q}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-3">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Resources</h2>
          <div className="card divide-y divide-slate-50">
            <button className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <Book size={18} className="text-slate-400" />
                <span className="text-sm font-bold text-primary">User Manual</span>
              </div>
              <ExternalLink size={16} className="text-slate-300" />
            </button>
            <button className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <Phone size={18} className="text-slate-400" />
                <span className="text-sm font-bold text-primary">Call Support</span>
              </div>
              <ExternalLink size={16} className="text-slate-300" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
