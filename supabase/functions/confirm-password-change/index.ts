/**
 * Supabase Edge Function — confirm-password-change
 *
 * Updates a user's password using the service role key, bypassing Supabase's
 * "Secure password change" restriction. That restriction blocks
 * supabase.auth.updateUser() for normal SIGNED_IN sessions (e.g. temp-password
 * logins where must_change_password = true). This function is called by
 * ResetPassword.tsx for all password-change flows.
 *
 * Request body (JSON):
 *   { password: string }
 *
 * Authorization: Bearer <user_access_token>
 *
 * On success:
 *   - Updates the user's auth password via admin API
 *   - Clears must_change_password on the user's profile row
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Parse request ──────────────────────────────────────────────────────
    const { password } = await req.json();

    if (!password || typeof password !== 'string' || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Authenticate the caller ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl        = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the caller's JWT is valid
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth:   { persistSession: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Update password via service role ───────────────────────────────────
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password },
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Clear must_change_password flag ────────────────────────────────────
    // Fire-and-forget — password is already updated, don't fail the response
    // if the profile update has a hiccup.
    await adminClient
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
