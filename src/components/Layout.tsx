import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Wrench, MoreHorizontal } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const location = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Contacts', path: '/contacts' },
    { icon: Calendar, label: 'Calendar', path: '/calendar' },
    { icon: Wrench, label: 'Tools', path: '/tools' },
    { icon: MoreHorizontal, label: 'More', path: '/more' },
  ];

  return (
    <div className="flex flex-col fixed inset-0 max-w-md mx-auto bg-slate-50 shadow-2xl relative">
      {/* Safe area top spacer — pushes content below iOS status bar */}
      <div style={{ height: 'env(safe-area-inset-top)' }} className="bg-slate-50 shrink-0" />
      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar scrollable" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      {/* Bottom Navigation — locked to viewport */}
      <nav
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 pt-3 flex justify-between items-center z-50"
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
