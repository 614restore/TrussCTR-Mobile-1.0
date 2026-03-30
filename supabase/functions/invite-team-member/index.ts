/**
 * Supabase Edge Function — invite-team-member
 *
 * Sends a Supabase auth invite to a new team member with role + company
 * metadata embedded. This requires the service role key, which cannot be
 * used client-side, so it lives here as a server-side function.
 *
 * Request body (JSON):
 *   { email: string, role: string }
 *
 * The caller's JWT is used to look up their profile and verify:
 *   1. They are authenticated
 *   2. They have the 'owner' or 'admin' role
 *   3. Their company has available seats (seat limit not exceeded)
 *
 * On success the invited user receives a Supabase-generated email with a
 * magic link. When they click it, AcceptInvite.tsx handles account creation
 * using the embedded metadata (role, company_id, company_name).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_LIMITS: Record<string, number> = {
  trial:    2,
  starter:  2,
  pro:      5,
  business: 15,
  scale:    Infinity,
};

const ALLOWED_ROLES = ['owner', 'admin', 'sales_rep', 'crew_lead', 'crew_member'];

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Parse request ──────────────────────────────────────────────────────
    const { email, role } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'A valid email address is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!role || !ALLOWED_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be one of: ' + ALLOWED_ROLES.join(', ') }),
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

    const supabaseUrl          = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey      = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Caller client — uses the user's JWT to identify who is making the request
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth:   { persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Load caller's profile + company ───────────────────────────────────
    // Use service role to bypass RLS for the lookup
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, company_id, companies(name, subscription_plan)')
      .eq('id', caller.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Could not load your profile.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Verify caller has permission to invite ────────────────────────────
    if (profile.role !== 'owner' && profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only owners and admins can invite team members.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!profile.company_id) {
      return new Response(
        JSON.stringify({ error: 'Your account is not linked to a company.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 5. Check seat limits ─────────────────────────────────────────────────
    const company = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies as any;
    const plan    = company?.subscription_plan ?? 'trial';
    const limit   = USER_LIMITS[plan] ?? 2;

    if (limit !== Infinity) {
      const { count, error: countError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('is_active', true);

      if (countError) {
        return new Response(
          JSON.stringify({ error: 'Could not verify seat availability.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if ((count ?? 0) >= limit) {
        return new Response(
          JSON.stringify({
            error: `Your ${plan} plan allows up to ${limit} team member${limit !== 1 ? 's' : ''}. Upgrade to add more.`,
            seatLimitReached: true,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── 6. Send the invite ───────────────────────────────────────────────────
    const companyName = company?.name ?? '';

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      {
        data: {
          role,
          company_id:   profile.company_id,
          company_name: companyName,
        },
      },
    );

    if (inviteError) {
      // Surface Supabase's own message (e.g. "User already registered")
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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
