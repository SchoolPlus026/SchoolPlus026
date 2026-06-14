import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Activates premium subscription for a school after a verified payment.
 * Called by both verify-razorpay-payment (frontend) and razorpay-webhook (Razorpay).
 * Uses idempotency: if already SUCCESSFUL, returns early.
 */
async function activatePremium(
  supabaseAdmin: any,
  razorpay_order_id: string,
  razorpay_payment_id: string
): Promise<{ success: boolean; message: string }> {
  // 1. Find the transaction by order_id
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('subscription_transactions')
    .select('*, subscription_plans(validity_days)')
    .eq('razorpay_order_id', razorpay_order_id)
    .single();

  if (txError || !transaction) {
    throw new Error(`Transaction not found for order: ${razorpay_order_id}`);
  }

  // 2. Idempotency — already processed
  if (transaction.status === 'SUCCESSFUL') {
    return { success: true, message: 'Already activated' };
  }

  // 3. Mark transaction as SUCCESSFUL
  const { error: updateTxError } = await supabaseAdmin
    .from('subscription_transactions')
    .update({
      status: 'SUCCESSFUL',
      razorpay_payment_id: razorpay_payment_id,
    })
    .eq('id', transaction.id);

  if (updateTxError) throw new Error('Failed to update transaction status');

  // 4. Fetch school settings for subscription stacking
  const { data: schoolSettings, error: schoolError } = await supabaseAdmin
    .from('school_settings')
    .select('subscription_end_date, trial_start_date, plan_type')
    .eq('school_id', transaction.school_id)
    .single();

  if (schoolError || !schoolSettings) throw new Error('School settings not found');

  const validityDays = transaction.subscription_plans?.validity_days || 28;
  const now = new Date();
  let baseDate = now;

  // Stack on existing premium end date if still in the future
  if (schoolSettings.subscription_end_date) {
    const existingEnd = new Date(schoolSettings.subscription_end_date);
    if (existingEnd > baseDate) baseDate = existingEnd;
  }

  // Stack on remaining trial days if applicable
  if (schoolSettings.plan_type === 'trial' && schoolSettings.trial_start_date) {
    const trialEnd = new Date(schoolSettings.trial_start_date);
    trialEnd.setDate(trialEnd.getDate() + 28); // 28-day trial
    if (trialEnd > baseDate) baseDate = trialEnd;
  }

  const newEndDate = new Date(baseDate);
  newEndDate.setDate(newEndDate.getDate() + validityDays);

  // 5. Update school to Premium
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

  console.log(`[verify-razorpay-payment] ✅ Premium activated for school: ${transaction.school_id}, expires: ${newEndDate.toISOString()}`);
  return { success: true, message: 'Payment verified and premium activated' };
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let supabaseAdmin: any = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error('Razorpay API credentials not configured');
    }

    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // ── 1. Authenticate the caller (must be a logged-in user) ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseClient = createClient(supabaseUrl, anonKey!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // ── 2. Parse body ──
    const { razorpay_order_id, razorpay_payment_id, school_id } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !school_id) {
      throw new Error('Missing required parameters: razorpay_order_id, razorpay_payment_id, school_id');
    }

    // ── 3. Verify user belongs to this school ──
    const { data: userData, error: userCheckError } = await supabaseAdmin
      .from('users')
      .select('school_id')
      .eq('id', user.id)
      .single();

    if (userCheckError || !userData || userData.school_id !== school_id) {
      throw new Error('Unauthorized: user does not belong to this school');
    }

    // ── 4. SERVER-TO-SERVER: Call Razorpay API to verify payment ──
    // This is the definitive check — no signature needed, Razorpay confirms it server-side.
    const razorpayAuthHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayRes = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        method: 'GET',
        headers: { Authorization: razorpayAuthHeader },
      }
    );

    if (!razorpayRes.ok) {
      const errBody = await razorpayRes.text();
      console.error('[verify] Razorpay API error:', razorpayRes.status, errBody);
      throw new Error(`Payment not found or Razorpay API error (HTTP ${razorpayRes.status})`);
    }

    const payment = await razorpayRes.json();
    console.log(`[verify] Razorpay payment ${razorpay_payment_id}: status=${payment.status}, order_id=${payment.order_id}`);

    // ── 5. Validate payment fields ──
    if (payment.status !== 'captured') {
      throw new Error(`Payment not captured. Status: ${payment.status}`);
    }
    if (payment.order_id !== razorpay_order_id) {
      throw new Error(`Order ID mismatch: expected ${razorpay_order_id}, got ${payment.order_id}`);
    }

    // ── 6. Activate Premium ──
    const result = await activatePremium(supabaseAdmin, razorpay_order_id, razorpay_payment_id);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[verify-razorpay-payment] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } finally {
    const duration = Date.now() - startTime;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceRoleKey) {
        const loggingClient = createClient(supabaseUrl, serviceRoleKey);
        await loggingClient.from('edge_function_usage').insert({
          function_name: 'verify-razorpay-payment',
          execution_time_ms: duration,
        });
      }
    } catch (logErr: any) {
      console.error('[verify] Logging failed:', logErr.message);
    }
  }
});
