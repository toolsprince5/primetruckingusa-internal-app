import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { StreamClient } from 'npm:@stream-io/node-sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return Response.json({ error: 'Missing authorization' }, { status: 401, headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  // A valid Supabase session is not enough: suspended or orphaned employee
  // accounts must not be able to mint fresh calling tokens.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile?.active) {
    return Response.json({ error: 'Calling is unavailable for this account' }, { status: 403, headers: corsHeaders });
  }

  const apiKey = Deno.env.get('STREAM_API_KEY');
  const apiSecret = Deno.env.get('STREAM_API_SECRET');
  if (!apiKey || !apiSecret) return Response.json({ error: 'Calling is not configured' }, { status: 503, headers: corsHeaders });

  const stream = new StreamClient(apiKey, apiSecret);
  const token = stream.generateUserToken({ user_id: user.id, validity_in_seconds: 60 * 60 * 4 });
  return Response.json({ token }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
