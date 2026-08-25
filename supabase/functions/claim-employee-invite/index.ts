import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return json({ error: 'Server identity is not configured.' }, 500);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 12) return json({ error: 'Use a valid invite and a password of at least 12 characters.' }, 400);

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const tokenHash = await hash(token);
  const { data: invite, error: inviteError } = await admin.from('employee_invites').select('*').eq('token_hash', tokenHash).is('accepted_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (inviteError || !invite) return json({ error: 'This invite is invalid, has expired, or has already been used.' }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invite.email, password, email_confirm: true, user_metadata: { full_name: invite.full_name },
  });
  if (createError || !created.user) return json({ error: createError?.message ?? 'Account could not be created.' }, 400);

  const { data: consumed, error: consumeError } = await admin.from('employee_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: created.user.id })
    .eq('id', invite.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
  if (consumeError || !consumed) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'This invite has already been used or expired.' }, 400);
  }

  const { error: profileError } = await admin.from('profiles').update({ full_name: invite.full_name, role: invite.role, active: true }).eq('id', created.user.id);
  if (profileError) return json({ error: 'Account was created but profile activation failed. Contact an administrator.' }, 500);
  if (invite.role === 'driver' && invite.dispatcher_id) {
    const { error: assignmentError } = await admin.from('driver_dispatcher_assignments').insert({ driver_id: created.user.id, dispatcher_id: invite.dispatcher_id, active: true });
    if (assignmentError) return json({ error: 'Account was created but dispatcher assignment failed. Contact an administrator.' }, 500);
  }
  return json({ email: invite.email, message: 'Account created. You can sign in now.' });
});
