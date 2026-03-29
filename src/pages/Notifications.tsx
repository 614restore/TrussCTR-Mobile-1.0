import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Bell, MessageSquare, Calendar, AlertCircle, Check, CloudRain, Wind } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Notifications() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id || !profile?.company_id) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase.from('notifications') as any)
        .select('*')
        .eq('company_id', profile.company_id)
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.warn('Notifications table unavailable:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, profile?.company_id]);

  useEffect(() => {
    fetchNotifications();

    // Supabase realtime — refresh list on any change for this company
    const channel = profile?.company_id
      ? supabase
          .channel(`notifications:${profile.company_id}`)
          .on(
            'postgres_changes' as any,
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `company_id=eq.${profile.company_id}`,
            },
            () => { fetchNotifications(); }
          )
          .subscribe()
      : null;

    // Check push notification permission status without re-registering
    // (Registration is handled once at app startup, not on every page visit)
    const checkPushStatus = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const status = await PushNotifications.checkPermissions();
        setPushEnabled(status.receive === 'granted');
      } catch {
        // Capacitor not available (browser) — silently skip
      }
    };
    checkPushStatus();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchNotifications, profile?.company_id]);

  const handleMarkAllRead = async () => {
    if (!user?.id || markingRead || notifications.length === 0) return;
    setMarkingRead(true);
    try {
      await (supabase.from('notifications') as any)
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('company_id', profile?.company_id)
        .or(`user_id.eq.${user.id},user_id.is.null`);
      await fetchNotifications();
    } catch (err) {
      console.warn('Mark-as-read failed:', err);
    } finally {
      setMarkingRead(false);
    }
  };

  const getNotificationIcon = (type: string, metadata?: any) => {
    switch (type) {
      case 'mention':               return { icon: MessageSquare, color: 'bg-emerald-500' };
      case 'unassigned_appointment': return { icon: Calendar,     color: 'bg-amber-500'   };
      case 'lead_assignment':        return { icon: Bell,         color: 'bg-blue-500'    };
      case 'hail_alert':             return { icon: CloudRain,    color: 'bg-red-500'     };
      case 'storm_alert': {
        const evType = metadata?.event_type;
        return evType === 'WIND'
          ? { icon: Wind,      color: 'bg-blue-600' }
          : { icon: CloudRain, color: 'bg-red-500'  };
      }
      default:                       return { icon: AlertCircle,  color: 'bg-slate-800'   };
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
          <h1 className="text-xl font-bold text-primary flex-1">Notifications</h1>
          {pushEnabled && (
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Push On</span>
          )}
        </div>
      </div>

      <div className="w-full max-w-full p-6 space-y-4 overflow-x-hidden">
        {/* Storm History shortcut */}
        <button
          onClick={() => navigate('/storm-history')}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center">
              <CloudRain size={18} className="text-red-500" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-primary">Storm History</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">NOAA + HailTrace · Last 12 months</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
        {loading ? (
          [1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-2xl border border-slate-100 bg-white" />
          ))
        ) : notifications.length > 0 ? (
          notifications.map((n) => {
            const { icon: Icon, color } = getNotificationIcon(String(n.type || ''), n.metadata);
            return (
              <div key={n.id} className={`card p-4 flex items-start gap-4 active:bg-slate-50 transition-colors ${n.read ? 'opacity-60' : ''}`}>
                <div className={`${color} h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0`}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-bold text-primary">{n.title || 'Notification'}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {n.read && <Check size={12} className="text-emerald-400" />}
                      <span className="text-[10px] text-slate-400">
                        {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{n.message || 'No message available'}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center">
            <Bell size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-400">No notifications</p>
            <p className="text-xs text-slate-300 mt-1">You're all caught up</p>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="text-center py-4">
            <button
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className="text-accent text-xs font-bold uppercase tracking-widest disabled:opacity-50"
            >
              {markingRead ? 'Marking...' : 'Mark all as read'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
