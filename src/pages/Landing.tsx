import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, X, ChevronDown, Menu, ClipboardList, FileText,
  DollarSign, Shield, Users, Zap, Star, ArrowRight, Phone, Mail,
  BarChart3, Camera, Wrench, TrendingUp,
} from 'lucide-react';
import trussLogo from '../assets/trussctr-logo.png';

// ─── Plan data (mirrors More.tsx) ─────────────────────────────────────────────
const PLANS = [
  {
    key: 'trial',
    label: 'Free Trial',
    price: '$0',
    period: '14 days',
    userLimit: '1–2 users',
    cta: 'Start Free Trial',
    highlight: false,
    features: ['Up to 2 users', 'Core CRM features', 'Pipeline board', 'Invoicing'],
  },
  {
    key: 'starter',
    label: 'Starter',
    price: '$49',
    period: '/mo',
    userLimit: '1–2 users',
    cta: 'Get Started',
    highlight: false,
    features: ['Up to 2 users', 'Unlimited contacts', 'Core CRM features', 'Pipeline board', 'Invoicing', 'Email support'],
  },
  {
    key: 'pro',
    label: 'Pro',
    price: '$99',
    period: '/mo',
    userLimit: 'Up to 5 users',
    cta: 'Get Started',
    highlight: true,
    badge: 'Most Popular',
    features: ['Up to 5 users', 'Unlimited contacts', 'Full pipeline visibility', 'Insurance claim tracking', 'Supplement tracking', 'Team reporting'],
  },
  {
    key: 'business',
    label: 'Business',
    price: '$199',
    period: '/mo',
    userLimit: 'Up to 15 users',
    cta: 'Get Started',
    highlight: false,
    features: ['Up to 15 users', 'Unlimited contacts', 'AI Smart Inspection', 'Advanced analytics', 'Material order templates', 'Priority support'],
  },
  {
    key: 'scale',
    label: 'Scale',
    price: '$349',
    period: '/mo',
    userLimit: 'Unlimited users',
    cta: 'Contact Sales',
    highlight: false,
    features: ['Unlimited users', 'Unlimited contacts', 'All features included', 'Custom onboarding', 'Dedicated support', 'QuickBooks sync'],
  },
];

// ─── Comparison chart ─────────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { feature: 'CRM & Pipeline Board',         trussctr: true,  spreadsheet: false, jobnimbus: true,  acculynx: true  },
  { feature: 'Insurance Claim Tracking',      trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: true  },
  { feature: 'Supplement Tracking',           trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: false },
  { feature: 'AI Smart Inspection',           trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: false },
  { feature: 'Photo Markup & Inspection PDF', trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: false },
  { feature: 'Digital Document Signing',      trussctr: true,  spreadsheet: false, jobnimbus: true,  acculynx: true  },
  { feature: 'Remote Homeowner e-Signature',  trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: false },
  { feature: 'Homeowner Financing Links',     trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: false },
  { feature: 'Built-in Estimating',           trussctr: true,  spreadsheet: true,  jobnimbus: true,  acculynx: true  },
  { feature: 'Work Orders & Crew Schedule',   trussctr: true,  spreadsheet: false, jobnimbus: true,  acculynx: true  },
  { feature: 'Hail Alert Notifications',      trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: false },
  { feature: 'Mobile App (iOS)',              trussctr: true,  spreadsheet: false, jobnimbus: true,  acculynx: true  },
  { feature: 'Built for Roofing/Restoration', trussctr: true,  spreadsheet: false, jobnimbus: false, acculynx: true  },
  { feature: 'Starting Price',               trussctr: '$49/mo', spreadsheet: 'Free', jobnimbus: '$99/mo', acculynx: '$150/mo' },
];

// ─── Feature highlights ───────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Pipeline & CRM',
    desc: 'Track every lead from first knock to final payment. Visual pipeline keeps your whole team on the same page.',
  },
  {
    icon: Shield,
    title: 'Insurance Claims',
    desc: 'Manage contingencies, CSA agreements, supplement tracking, and claim documentation — all in one place.',
  },
  {
    icon: Camera,
    title: 'AI Smart Inspection',
    desc: 'Capture damage photos, mark them up with annotations, and generate a professional inspection report in seconds.',
  },
  {
    icon: FileText,
    title: 'Digital Documents',
    desc: 'Send contracts to homeowners for remote e-signature. No printing, no scanning, no chasing signatures.',
  },
  {
    icon: DollarSign,
    title: 'Estimating & Invoicing',
    desc: 'Build detailed estimates, convert to invoices, and track payments without ever leaving the app.',
  },
  {
    icon: Zap,
    title: 'Hail Alerts',
    desc: 'Get notified the moment hail hits your market. Connect HailTrace and never miss a storm opportunity again.',
  },
  {
    icon: Wrench,
    title: 'Work Orders',
    desc: 'Create and assign work orders to crews, track materials, and keep production running on schedule.',
  },
  {
    icon: TrendingUp,
    title: 'Reports & Analytics',
    desc: 'See revenue, close rates, and team performance at a glance. Know your numbers without building a spreadsheet.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Opens native mail client as a simple no-backend solution
    const subject = encodeURIComponent(`TrussCTR inquiry from ${contactName}`);
    const body = encodeURIComponent(`Name: ${contactName}\nEmail: ${contactEmail}\n\n${contactMessage}`);
    window.location.href = `mailto:hello@trussctr.com?subject=${subject}&body=${body}`;
    setContactSent(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <img src={trussLogo} alt="TrussCTR" className="h-8 w-auto" />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button onClick={() => scrollTo('features')} className="hover:text-primary transition-colors">Features</button>
            <button onClick={() => scrollTo('compare')} className="hover:text-primary transition-colors">Compare</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-primary transition-colors">Pricing</button>
            <button onClick={() => scrollTo('about')} className="hover:text-primary transition-colors">About</button>
            <button onClick={() => scrollTo('contact')} className="hover:text-primary transition-colors">Contact</button>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/login')}
              className="bg-accent text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-blue-600 transition-colors"
            >
              Start Free Trial
            </button>
          </div>

          {/* Mobile menu button */}
          <button className="md:hidden p-2 text-slate-500" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-3">
            {['features', 'compare', 'pricing', 'about', 'contact'].map((id) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="block w-full text-left text-sm font-medium text-slate-600 py-2 capitalize"
              >
                {id}
              </button>
            ))}
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-accent text-white text-sm font-bold py-3 rounded-xl"
            >
              Start Free Trial
            </button>
          </div>
        )}
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-br from-slate-900 via-[#1E3A5F] to-slate-800 text-white text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <span className="inline-block bg-blue-500/20 text-blue-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-blue-400/30">
            Built for Roofing & Restoration Contractors
          </span>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Close More Jobs.<br />
            <span className="text-accent">Chase Less Paperwork.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto">
            TrussCTR is the all-in-one CRM built specifically for storm restoration contractors. From first knock to final payment — manage every job, document, and dollar in one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto bg-accent hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-2xl text-base flex items-center justify-center gap-2 transition-colors"
            >
              Start Free — 14 Days <ArrowRight size={18} />
            </button>
            <button
              onClick={() => scrollTo('pricing')}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-4 rounded-2xl text-base border border-white/20 transition-colors"
            >
              See Pricing
            </button>
          </div>
          <p className="text-xs text-slate-400">No credit card required. Cancel anytime.</p>
        </div>
      </section>

      {/* ── Social proof strip ──────────────────────────────────────────────── */}
      <section className="bg-slate-50 border-y border-slate-100 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-center">
          {[
            { stat: '100%', label: 'Built for storm restoration' },
            { stat: 'iOS', label: 'Native mobile app' },
            { stat: 'All-in-one', label: 'CRM, docs, estimates, inspections' },
            { stat: '14 days', label: 'Free trial, no card needed' },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-2xl font-black text-primary">{item.stat}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 space-y-3">
            <h2 className="text-3xl md:text-4xl font-black text-primary">Everything your crew needs</h2>
            <p className="text-slate-500 max-w-xl mx-auto">One app replaces your CRM, document folder, inspection form, estimating sheet, and crew board.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-slate-50 rounded-2xl p-5 space-y-3 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
                  <Icon size={20} className="text-accent" />
                </div>
                <h3 className="font-bold text-primary">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison ──────────────────────────────────────────────────────── */}
      <section id="compare" className="py-20 px-4 bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 space-y-3">
            <h2 className="text-3xl md:text-4xl font-black">How we stack up</h2>
            <p className="text-slate-400">TrussCTR vs. the alternatives contractors actually use.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-4 text-slate-400 font-semibold w-1/2">Feature</th>
                  <th className="p-4 text-accent font-bold text-center">TrussCTR</th>
                  <th className="p-4 text-slate-400 font-semibold text-center">Spreadsheets</th>
                  <th className="p-4 text-slate-400 font-semibold text-center">JobNimbus</th>
                  <th className="p-4 text-slate-400 font-semibold text-center">AccuLynx</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => (
                  <tr key={row.feature} className={`border-b border-slate-800 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="p-4 text-slate-300">{row.feature}</td>
                    {[row.trussctr, row.spreadsheet, row.jobnimbus, row.acculynx].map((val, j) => (
                      <td key={j} className="p-4 text-center">
                        {typeof val === 'boolean' ? (
                          val
                            ? <CheckCircle2 size={18} className={`mx-auto ${j === 0 ? 'text-accent' : 'text-emerald-400'}`} />
                            : <X size={18} className="mx-auto text-slate-600" />
                        ) : (
                          <span className={`text-xs font-bold ${j === 0 ? 'text-accent' : 'text-slate-400'}`}>{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 space-y-3">
            <h2 className="text-3xl md:text-4xl font-black text-primary">Simple, transparent pricing</h2>
            <p className="text-slate-500">Start free. Upgrade when your team grows.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`relative rounded-2xl p-5 flex flex-col gap-4 border-2 transition-shadow hover:shadow-lg ${
                  plan.highlight
                    ? 'bg-primary text-white border-primary shadow-xl scale-[1.02]'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>
                    {plan.label}
                  </p>
                  <div className="flex items-end gap-1 mt-1">
                    <span className="text-3xl font-black">{plan.price}</span>
                    <span className={`text-sm mb-1 ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>{plan.period}</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>{plan.userLimit}</p>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 size={13} className={`mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-blue-300' : 'text-accent'}`} />
                      <span className={plan.highlight ? 'text-blue-100' : 'text-slate-600'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/login')}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    plan.highlight
                      ? 'bg-white text-primary hover:bg-blue-50'
                      : 'bg-accent text-white hover:bg-blue-600'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">All plans include a 14-day free trial. No credit card required to start.</p>
        </div>
      </section>

      {/* ── About ───────────────────────────────────────────────────────────── */}
      <section id="about" className="py-20 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-5">
              <span className="text-xs font-bold text-accent uppercase tracking-widest">About TrussCTR</span>
              <h2 className="text-3xl md:text-4xl font-black text-primary leading-tight">
                Built by people who know the roofing business
              </h2>
              <p className="text-slate-600 leading-relaxed">
                TrussCTR was created because every other CRM was built for salespeople — not storm restoration contractors. We needed something that understood the insurance process, the supplement game, the door knock, and the job site.
              </p>
              <p className="text-slate-600 leading-relaxed">
                So we built it. TrussCTR handles the full lifecycle of a restoration job — from the first hail alert to the final payment — so your team can focus on closing jobs instead of chasing paperwork.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                {['Storm Restoration', 'Insurance Claims', 'Roofing CRM', 'Mobile-First'].map((tag) => (
                  <span key={tag} className="bg-accent/10 text-accent text-xs font-bold px-3 py-1.5 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Users, title: 'Team-Ready', desc: 'Role-based access for owners, managers, and sales reps.' },
                { icon: Shield, title: 'Secure', desc: 'All data encrypted and protected with row-level security.' },
                { icon: BarChart3, title: 'Data-Driven', desc: 'Real-time reports so you always know your numbers.' },
                { icon: Star, title: 'Always Improving', desc: 'New features shipped regularly based on contractor feedback.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-white rounded-2xl p-4 space-y-2 shadow-sm">
                  <Icon size={20} className="text-accent" />
                  <p className="font-bold text-sm text-primary">{title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-gradient-to-r from-primary to-accent text-white text-center">
        <div className="max-w-2xl mx-auto space-y-5">
          <h2 className="text-3xl md:text-4xl font-black">Ready to run a tighter operation?</h2>
          <p className="text-blue-100">Join contractors using TrussCTR to close more jobs and lose less to paperwork.</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-white text-primary font-bold px-8 py-4 rounded-2xl text-base hover:bg-blue-50 transition-colors inline-flex items-center gap-2"
          >
            Start Your Free Trial <ArrowRight size={18} />
          </button>
          <p className="text-xs text-blue-200">14 days free. No credit card. Cancel anytime.</p>
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-5">
              <span className="text-xs font-bold text-accent uppercase tracking-widest">Get In Touch</span>
              <h2 className="text-3xl font-black text-primary">Questions? We're here.</h2>
              <p className="text-slate-500 leading-relaxed">
                Whether you're evaluating TrussCTR for your team, need help with your account, or just want to talk shop — reach out.
              </p>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Mail size={16} className="text-accent flex-shrink-0" />
                  <span>hello@trussctr.com</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Phone size={16} className="text-accent flex-shrink-0" />
                  <span>Available via email and in-app chat</span>
                </div>
              </div>
            </div>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              {contactSent ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
                  <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
                  <p className="font-bold text-emerald-700">Message ready to send!</p>
                  <p className="text-sm text-emerald-600">Your mail app opened with the message pre-filled.</p>
                </div>
              ) : (
                <>
                  <input
                    required
                    type="text"
                    placeholder="Your name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email address"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <textarea
                    required
                    rows={4}
                    placeholder="How can we help?"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  />
                  <button
                    type="submit"
                    className="w-full bg-accent text-white font-bold py-3 rounded-xl text-sm hover:bg-blue-600 transition-colors"
                  >
                    Send Message
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={trussLogo} alt="TrussCTR" className="h-6 w-auto opacity-80" />
            <span className="text-sm">© {new Date().getFullYear()} TrussCTR. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-white transition-colors">Pricing</button>
            <button onClick={() => scrollTo('about')} className="hover:text-white transition-colors">About</button>
            <button onClick={() => scrollTo('contact')} className="hover:text-white transition-colors">Contact</button>
            <button onClick={() => navigate('/login')} className="hover:text-white transition-colors">Sign In</button>
          </div>
        </div>
      </footer>

    </div>
  );
}
