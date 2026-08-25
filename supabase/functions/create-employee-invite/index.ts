import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !serviceRole) return json({ error: 'Server identity is not configured.' }, 500);

  const authorization = request.headers.get('Authorization') ?? '';
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: 'Sign in as an administrator first.' }, 401);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: inviter } = await admin.from('profiles').select('id, role, active').eq('id', user.id).maybeSingle();
  if (!inviter || inviter.role !== 'admin' || !inviter.active) return json({ error: 'Only active administrators can issue employee invites.' }, 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const role = body?.role === 'driver' || body?.role === 'dispatcher' ? body.role : null;
  const dispatcherId = typeof body?.dispatcherId === 'string' && body.dispatcherId ? body.dispatcherId : null;
  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || !role) return json({ error: 'Name, valid email, and Driver or Dispatcher role are required.' }, 400);
  if (role === 'driver' && !dispatcherId) return json({ error: 'A driver must be assigned to a dispatcher before an invite is created.' }, 400);

  if (dispatcherId) {
    const { data: dispatcher } = await admin.from('profiles').select('id').eq('id', dispatcherId).eq('role', 'dispatcher').eq('active', true).maybeSingle();
    if (!dispatcher) return json({ error: 'Select an active dispatcher.' }, 400);
  }

  const token = randomToken();
  const { data: invite, error } = await admin.from('employee_invites').insert({
    email, full_name: fullName, role, dispatcher_id: role === 'driver' ? dispatcherId : null,
    token_hash: await hash(token), created_by: inviter.id,
  }).select('id, expires_at').single();
  if (error) return json({ error: error.code === '23505' ? 'An unused invite already exists for this email.' : error.message }, 400);

  const inviteUrl = `primetruckingusa://invite?token=${token}`;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('INVITE_FROM_EMAIL');
  let emailed = false;
  if (resendApiKey && from) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'Your Prime Trucking USA app invite', html: `<p>Hello ${fullName},</p><p>Use this one-time link to create your ${role} account. It expires in 8 hours.</p><p><a href="${inviteUrl}">Set up your account</a></p>` }),
    });
    emailed = response.ok;
  }
  return json({ id: invite.id, expiresAt: invite.expires_at, inviteUrl, emailed });
});
