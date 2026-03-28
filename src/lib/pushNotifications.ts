import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/**
 * Request push permission (if not already granted) and register the device
 * token with Supabase. Safe to call multiple times — Capacitor deduplicates
 * listener registrations and the upsert is idempotent.
 *
 * Returns:
 *   'granted'  — permission was already granted or user just allowed it
 *   'denied'   — user denied (or previously denied in iOS Settings)
 *   'web'      — not a native platform, nothing to do
 */
export async function registerPushToken(): Promise<'granted' | 'denied' | 'web'> {
  if (!Capacitor.isNativePlatform()) return 'web';

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return 'denied';

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

    return 'granted';
  } catch (err) {
    console.warn('[Push] Push notification setup failed:', err);
    return 'denied';
  }
}

/**
 * Check whether push notifications are currently permitted without
 * prompting the user.
 */
export async function checkPushPermission(): Promise<'granted' | 'denied' | 'web'> {
  if (!Capacitor.isNativePlatform()) return 'web';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const status = await PushNotifications.checkPermissions();
    return status.receive === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
