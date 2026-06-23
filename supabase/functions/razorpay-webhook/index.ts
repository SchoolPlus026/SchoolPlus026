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
    .select('*, subscription_plans(name, validity_days)')
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
    .select('name, subscription_end_date, trial_start_date, plan_type')
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

  // ── Notify School Admin ──
  await supabaseAdmin.from('app_notifications_queue').insert({
    school_id: transaction.school_id,
    target_role: 'admin',
    title: '✨ Premium Activated',
    body: `Your school premium subscription is now active! Valid until ${newEndDate.toLocaleDateString(undefined, { dateStyle: 'long' })}.`,
    route: '/settings',
    is_ephemeral: false,
    status: 'pending'
  });

  // ── Notify Platform Super-Admin ──
  const schoolName = schoolSettings.name || 'A school';
  await supabaseAdmin.from('app_notifications_queue').insert({
    school_id: transaction.school_id,
    target_role: 'platform_admin',
    title: '💰 Subscription Upgraded',
    body: `${schoolName} has upgraded to Premium. Expires on ${newEndDate.toLocaleDateString(undefined, { dateStyle: 'long' })}.`,
    route: '/super_admin',
    is_ephemeral: false,
    status: 'pending'
  });

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // ── Handle payment.failed ──
    if (payload.event === 'payment.failed') {
      const paymentEntity = payload?.payload?.payment?.entity;
      const order_id = paymentEntity?.order_id;
      const payment_id = paymentEntity?.id;
      const amount = paymentEntity?.amount ? (paymentEntity.amount / 100) : 0;
      
      if (order_id) {
        const { data: tx } = await supabaseAdmin
          .from('subscription_transactions')
          .update({ status: 'FAILED', razorpay_payment_id: payment_id })
          .eq('razorpay_order_id', order_id)
          .select()
          .single();
        
        if (tx) {
          await supabaseAdmin.from('app_notifications_queue').insert({
            school_id: tx.school_id,
            target_role: 'admin',
            title: '💳 Payment Failed',
            body: `Your online payment of ₹${amount.toLocaleString()} for subscription renewal failed. Please try again.`,
            route: '/settings',
            is_ephemeral: false,
            status: 'pending'
          });
        }
      }
      return new Response(JSON.stringify({ success: true, message: 'Processed payment.failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ── Handle dispute.created ──
    if (payload.event === 'dispute.created' || payload.event === 'payment.disputed') {
      const disputeEntity = payload?.payload?.dispute?.entity || payload?.payload?.payment?.entity;
      const payment_id = disputeEntity?.payment_id || disputeEntity?.id;
      
      if (payment_id) {
        const { data: tx } = await supabaseAdmin
          .from('subscription_transactions')
          .update({ status: 'DISPUTED' })
          .eq('razorpay_payment_id', payment_id)
          .select()
          .single();
        
        if (tx) {
          const { data: schoolDetail } = await supabaseAdmin
            .from('school_settings')
            .select('name')
            .eq('school_id', tx.school_id)
            .single();
          const schoolName = schoolDetail?.name || 'A school';

          await supabaseAdmin.from('app_notifications_queue').insert({
            school_id: tx.school_id,
            target_role: 'admin',
            title: '⚠️ Payment Disputed',
            body: `The payment of ₹${(tx.amount_paise / 100).toLocaleString()} has been marked as DISPUTED. Your premium access may be suspended.`,
            route: '/settings',
            is_ephemeral: false,
            status: 'pending'
          });

          await supabaseAdmin.from('app_notifications_queue').insert({
            school_id: tx.school_id,
            target_role: 'platform_admin',
            title: '🚨 Subscription Dispute Raised',
            body: `Dispute raised for payment ${payment_id} by ${schoolName}.`,
            route: '/super_admin',
            is_ephemeral: false,
            status: 'pending'
          });
        }
      }
      return new Response(JSON.stringify({ success: true, message: 'Processed dispute.created' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // We only process payment events for premium activation
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
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    // ── SERVER-TO-SERVER: Verify payment status via Razorpay API ──
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
