import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Helper to verify the Lemon Squeezy signature
async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  const sigBuf = new Uint8Array(
    signature.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  
  const dataBuf = encoder.encode(rawBody);
  return await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const signature = req.headers.get('x-signature');
    const secret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET');

    const rawBody = await req.text();

    // Verify signature if secret is configured
    if (secret) {
      if (!signature) {
        return new Response('Missing Signature Header', { status: 401 });
      }
      const isValid = await verifySignature(rawBody, signature, secret);
      if (!isValid) {
        return new Response('Invalid Signature', { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload.meta?.event_name;
    const customData = payload.meta?.custom_data;
    const userId = customData?.user_id;
    const userEmail = payload.data?.attributes?.user_email || payload.data?.attributes?.customer_email;
    const status = payload.data?.attributes?.status;
    const endsAt = payload.data?.attributes?.ends_at;

    console.log(`Received event: ${eventName} for user: ${userId} (${userEmail}) status: ${status}`);

    // Initialize Supabase Client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine if user should have Pro status
    // Active statuses in Lemon Squeezy: 'active', 'on_trial', 'cancelled' (access remains until billing period ends)
    const isPro = ['active', 'on_trial', 'cancelled'].includes(status);

    if (userId) {
      // 1. Update by UUID
      const { error } = await supabase
        .from('profiles')
        .update({
          is_pro: isPro,
          ends_at: endsAt
        })
        .eq('id', userId);

      if (error) throw error;
    } else if (userEmail) {
      // 2. Fallback to Email if user_id was not passed
      const { error } = await supabase
        .from('profiles')
        .update({
          is_pro: isPro,
          ends_at: endsAt
        })
        .eq('email', userEmail);

      if (error) throw error;
    } else {
      return new Response('No identifier found in payload', { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
