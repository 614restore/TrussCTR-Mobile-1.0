import React from 'react';
import { ChevronLeft, Bell, Shield, Smartphone, Globe, Moon, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();

  const sections = [
    {
      title: 'App Settings',
      items: [
        { label: 'Notifications', icon: Bell, color: 'text-blue-500', value: 'Enabled' },
        { label: 'Dark Mode', icon: Moon, color: 'text-indigo-500', value: 'System' },
        { label: 'Language', icon: Globe, color: 'text-emerald-500', value: 'English' },
      ]
    },
    {
      title: 'Security',
      items: [
        { label: 'Biometric Login', icon: Smartphone, color: 'text-rose-500', value: 'Off' },
        { label: 'Privacy Policy', icon: Shield, color: 'text-slate-600', value: '' },
      ]
    },
    {
      title: 'Support',
      items: [
        { label: 'Help Center', icon: HelpCircle, color: 'text-amber-500', value: '' },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Settings</h1>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{section.title}</h2>
            <div className="card divide-y divide-slate-50">
              {section.items.map((item) => (
                <div key={item.label} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <item.icon size={20} className={item.color} />
                    <span className="text-sm font-bold text-primary">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.value && <span className="text-xs text-slate-400">{item.value}</span>}
                    <div className="h-5 w-5 rounded-full bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="text-center py-8">
          <p className="text-[10px] text-slate-300 uppercase font-bold tracking-widest">Version 1.0.4 (Build 42)</p>
        </div>
      </div>
    </div>
  );
}
