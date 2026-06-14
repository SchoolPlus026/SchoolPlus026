import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

/**
 * Activates premium subscription for a school after a verified payment.
 * Uses idempotency: if already SUCCESSFUL, returns early.
 */
async function activatePremium(
  supabaseAdmin: any,
  razorpay_order_id: string,
  razorpay_payment_id: string
): Promise<{ success: boolean; message: string; schoolId?: string }> {
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('subscription_transactions')
    .select('*, subscription_plans(validity_days)')
    .eq('razorpay_order_id', razorpay_order_id)
    .single();

  if (txError || !transaction) {
    throw new Error(`Transaction not found for order: ${razorpay_order_id}`);
  }

  if (transaction.status === 'SUCCESSFUL') {
    return { success: true, message: 'Already activated', schoolId: transaction.school_id };
  }

  const { error: updateTxError } = await supabaseAdmin
    .from('subscription_transactions')
    .update({ status: 'SUCCESSFUL', razorpay_payment_id })
    .eq('id', transaction.id);

  if (updateTxError) throw new Error('Failed to update transaction status');

  const { data: schoolSettings, error: schoolError } = await supabaseAdmin
    .from('school_settings')
    .select('subscription_end_date, trial_start_date, plan_type')
    .eq('school_id', transaction.school_id)
    .single();

  if (schoolError || !schoolSettings) throw new Error('School settings not found');

  const validityDays = transaction.subscription_plans?.validity_days || 28;
  const now = new Date();
  let baseDate = now;

  if (schoolSettings.subscription_end_date) {
    const existingEnd = new Date(schoolSettings.subscription_end_date);
    if (existingEnd > baseDate) baseDate = existingEnd;
  }

  if (schoolSettings.plan_type === 'trial' && schoolSettings.trial_start_date) {
    const trialEnd = new Date(schoolSettings.trial_start_date);
    trialEnd.setDate(trialEnd.getDate() + 28);
    if (trialEnd > baseDate) baseDate = trialEnd;
  }

  const newEndDate = new Date(baseDate);
  newEndDate.setDate(newEndDate.getDate() + validityDays);

  const { error: updateSchoolError } = await supabaseAdmin
    .from('school_settings')
    .update({
      subscription_end_date: newEndDate.toISOString(),
      current_plan_id: transaction.plan_id,
      plan_type: 'premium',
      subscription_tier: 'Premium',
      billing_cycle: validityDays >= 365 ? 'yearly' : 'monthly',
    })
    .eq('school_id', transaction.school_id);

  if (updateSchoolError) throw new Error('Failed to update school subscription');

  console.log(`[webhook] ✅ Premium activated for school: ${transaction.school_id}, expires: ${newEndDate.toISOString()}`);
  return { success: true, message: 'Premium activated via webhook', schoolId: transaction.school_id };
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // IMPORTANT: Always return 200 to Razorpay to prevent infinite retries.
  // We handle all errors gracefully internally.

  try {
    const rawBody = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      console.error('[webhook] Invalid JSON body');
      return new Response('OK', { status: 200 }); // 200 to stop Razorpay retrying
    }

    // ── Optional: Verify Razorpay webhook signature ──
    // If RAZORPAY_WEBHOOK_SECRET is set and matches, great.
    // If not, we still process via direct API call (fallback).
    const incomingSignature = req.headers.get('x-razorpay-signature');
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    let signatureValid = false;

    if (incomingSignature && webhookSecret) {
      try {
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          encoder.encode(webhookSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(rawBody));
        const expectedSig = Array.from(new Uint8Array(sigBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        signatureValid = expectedSig === incomingSignature;
        if (!signatureValid) {
          console.warn('[webhook] Signature mismatch — proceeding via Razorpay API verification fallback.');
        }
      } catch (sigErr: any) {
        console.warn('[webhook] Signature check error:', sigErr.message);
      }
    } else {
      console.warn('[webhook] No signature or webhook secret configured — using API verification fallback.');
    }

    // We only process payment events
    if (payload.event !== 'order.paid' && payload.event !== 'payment.captured') {
      console.log(`[webhook] Ignoring event: ${payload.event}`);
      return new Response('OK', { status: 200 });
    }

    const paymentEntity = payload?.payload?.payment?.entity;
    if (!paymentEntity?.id || !paymentEntity?.order_id) {
      console.error('[webhook] Missing payment entity fields');
      return new Response('OK', { status: 200 });
    }

    const { id: payment_id, order_id } = paymentEntity;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // ── SERVER-TO-SERVER: Verify payment status via Razorpay API ──
    // This is the ground truth. We trust Razorpay's own API, not just the webhook body.
    const razorpayAuthHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayRes = await fetch(
      `https://api.razorpay.com/v1/payments/${payment_id}`,
      { method: 'GET', headers: { Authorization: razorpayAuthHeader } }
    );

    if (!razorpayRes.ok) {
      console.error(`[webhook] Razorpay API returned ${razorpayRes.status} for payment ${payment_id}`);
      return new Response('OK', { status: 200 });
    }

    const confirmedPayment = await razorpayRes.json();
    console.log(`[webhook] Payment ${payment_id}: status=${confirmedPayment.status}, order=${confirmedPayment.order_id}`);

    if (confirmedPayment.status !== 'captured') {
      console.warn(`[webhook] Payment ${payment_id} not captured yet (status: ${confirmedPayment.status}). Skipping.`);
      return new Response('OK', { status: 200 });
    }

    if (confirmedPayment.order_id !== order_id) {
      console.error(`[webhook] Order ID mismatch: webhook=${order_id}, Razorpay API=${confirmedPayment.order_id}`);
      return new Response('OK', { status: 200 });
    }

    // ── Activate Premium ──
    const result = await activatePremium(supabaseAdmin, order_id, payment_id);
    console.log(`[webhook] Result: ${result.message}`);

    return new Response(JSON.stringify({ success: true, message: result.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[razorpay-webhook] Unhandled error:', error.message);
    // Always 200 to prevent Razorpay from retrying indefinitely
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } finally {
    const duration = Date.now() - startTime;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceRoleKey) {
        const loggingClient = createClient(supabaseUrl, serviceRoleKey);
        await loggingClient.from('edge_function_usage').insert({
          function_name: 'razorpay-webhook',
          execution_time_ms: duration,
        });
      }
    } catch (logErr: any) {
      console.error('[webhook] Logging failed:', logErr.message);
    }
  }
});
