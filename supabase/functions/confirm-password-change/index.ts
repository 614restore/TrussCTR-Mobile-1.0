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

    // ── 3. Validate JWT and look up user ─────────────────────────────────────
    // Use adminClient.auth.getUser(token) — passing the token explicitly is
    // required in Deno edge functions because there is no session storage.
    // Passing global.headers to a separate client and calling getUser() without
    // arguments does NOT work — it checks storage (empty) instead of the header.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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
