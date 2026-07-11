import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

// Helper to verify the Lemon Squeezy signature
async function verifyLemonSqueezySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
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

// Helper to verify the Polar (Standard Webhooks) signature
async function verifyPolarSignature(
  req: Request,
  rawBody: string,
  secret: string
): Promise<boolean> {
  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  // 1. Strip whsec_ prefix and base64-decode the secret
  const cleanedSecret = secret.startsWith("whsec_") ? secret.substring(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = decode(cleanedSecret);
  } catch (e) {
    console.error("Failed to decode Polar webhook secret as base64:", e);
    return false;
  }

  // 2. Import Key
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // 3. Prepare Signed Content
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const signedContentBytes = encoder.encode(signedContent);

  // 4. Extract v1 signatures from header (comma-separated list)
  const signatures = webhookSignature.split(" ").flatMap(part => part.split(","));
  const v1Signatures: string[] = [];
  for (let i = 0; i < signatures.length; i++) {
    if (signatures[i] === "v1" && i + 1 < signatures.length) {
      v1Signatures.push(signatures[i + 1]);
    }
  }

  if (v1Signatures.length === 0) {
    const rawParts = webhookSignature.split(",");
    if (rawParts[0] === "v1" && rawParts[1]) {
      v1Signatures.push(rawParts[1]);
    }
  }

  // 5. Verify signatures
  for (const sigBase64 of v1Signatures) {
    try {
      const sigBytes = decode(sigBase64);
      const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, signedContentBytes);
      if (isValid) return true;
    } catch (e) {
      console.warn("Signature verification failed for single signature part:", e);
    }
  }

  return false;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const rawBody = await req.text();
    let userId: string | null = null;
    let userEmail: string | null = null;
    let status: string | null = null;
    let endsAt: string | null = null;
    let isPro = false;

    // Detect if this is a Polar Webhook
    if (req.headers.has('webhook-signature')) {
      const secret = Deno.env.get('POLAR_WEBHOOK_SECRET');
      if (secret) {
        const isValid = await verifyPolarSignature(req, rawBody, secret);
        if (!isValid) {
          return new Response('Invalid Polar Signature', { status: 401 });
        }
      }

      const payload = JSON.parse(rawBody);
      const eventType = payload.type;
      
      // Extract data
      status = payload.data?.status;
      userId = payload.data?.custom_field_data?.user_id || null;
      userEmail = payload.data?.customer?.email || null;
      endsAt = payload.data?.ends_at || null;
      
      // Determine Pro membership
      if (eventType.startsWith('subscription.')) {
        isPro = ['active', 'trialing', 'canceled'].includes(status || '');
        if (eventType === 'subscription.revoked') {
          isPro = false;
        }
      } else {
        isPro = ['active', 'trialing'].includes(status || '');
      }

      console.log(`[Polar Webhook] Event: ${eventType} User: ${userId} Email: ${userEmail} Status: ${status} IsPro: ${isPro}`);

    } else {
      // Lemon Squeezy Webhook
      const signature = req.headers.get('x-signature');
      const secret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET');

      if (secret) {
        if (!signature) {
          return new Response('Missing Signature Header', { status: 401 });
        }
        const isValid = await verifyLemonSqueezySignature(rawBody, signature, secret);
        if (!isValid) {
          return new Response('Invalid Lemon Squeezy Signature', { status: 401 });
        }
      }

      const payload = JSON.parse(rawBody);
      const eventName = payload.meta?.event_name;
      const customData = payload.meta?.custom_data;
      
      userId = customData?.user_id || null;
      userEmail = payload.data?.attributes?.user_email || payload.data?.attributes?.customer_email || null;
      status = payload.data?.attributes?.status || null;
      endsAt = payload.data?.attributes?.ends_at || null;
      
      isPro = ['active', 'on_trial', 'cancelled'].includes(status || '');

      console.log(`[Lemon Squeezy Webhook] Event: ${eventName} User: ${userId} Email: ${userEmail} Status: ${status} IsPro: ${isPro}`);
    }

    // Initialize Supabase Client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
