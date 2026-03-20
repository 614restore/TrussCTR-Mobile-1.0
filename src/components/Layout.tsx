import React, { useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Wrench, MoreHorizontal } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function registerPushToken() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async ({ value: token }) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profileRow } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .maybeSingle();

        const companyId = profileRow ? (profileRow as any).company_id : null;

        // Cast to any: device_tokens is not yet in the generated types —
        // it will be added after the 002_create_device_tokens migration is run.
        await (supabase.from('device_tokens') as any).upsert(
          {
            user_id:    user.id,
            company_id: companyId,
            token,
            platform:   Capacitor.getPlatform(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' }
        );
      } catch (err) {
        console.warn('[Push] Token registration failed:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] Registration error:', err);
    });
  } catch (err) {
    console.warn('[Push] Push notification setup failed:', err);
  }
}

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    registerPushToken();
  }, []);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Contacts', path: '/contacts' },
    { icon: Calendar, label: 'Calendar', path: '/calendar' },
    { icon: Wrench, label: 'Tools', path: '/tools' },
    { icon: MoreHorizontal, label: 'More', path: '/more' },
  ];

  return (
    <div className="fixed inset-0 relative mx-auto flex w-full max-w-md touch-pan-y flex-col overflow-hidden bg-slate-50 shadow-2xl">
      {/* Safe area top spacer — pushes content below iOS status bar */}
      <div style={{ height: 'env(safe-area-inset-top)' }} className="bg-slate-50 shrink-0" />
      {/* Main Content */}
      <main className="flex-1 min-h-0 w-full max-w-full touch-pan-y overflow-y-auto overflow-x-hidden no-scrollbar scrollable" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      {/* Bottom Navigation — locked to viewport */}
      <nav
        className="fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-md items-center justify-between border-t border-slate-100 bg-white px-6 pt-3 z-50"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'bottom-nav-item',
                isActive && 'active'
              )}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
