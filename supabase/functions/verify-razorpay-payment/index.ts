import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { HmacSha256 } from 'https://deno.land/std@0.160.0/hash/sha256.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAdmin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 1. Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // 2. Parse request payload
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, school_id } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !school_id) {
      throw new Error('Missing required parameters');
    }

    // 3. Verify user belongs to the school
    const { data: userData, error: userCheckError } = await supabaseAdmin
      .from('users')
      .select('school_id')
      .eq('id', user.id)
      .single();
    if (userCheckError || userData.school_id !== school_id) {
      throw new Error('Unauthorized for this school');
    }

    // 4. Verify Razorpay Signature
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      throw new Error('Razorpay secret key not configured');
    }

    const hmac = new HmacSha256(keySecret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expectedSignature = hmac.toString();

    if (expectedSignature !== razorpay_signature) {
      throw new Error('Payment signature verification failed');
    }

    // 5. Fetch and update the transaction (Idempotent check)
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('subscription_transactions')
      .select('*, subscription_plans(validity_days)')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (txError || !transaction) {
      throw new Error('Transaction not found for order ID');
    }

    if (transaction.status === 'SUCCESSFUL') {
      return new Response(JSON.stringify({ success: true, message: 'Already verified' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Mark transaction as successful
    const { error: updateTxError } = await supabaseAdmin
      .from('subscription_transactions')
      .update({
        status: 'SUCCESSFUL',
        razorpay_payment_id: razorpay_payment_id
      })
      .eq('id', transaction.id);

    if (updateTxError) throw new Error('Failed to update transaction status');

    // 6. Extend Subscription End Date (Stacking Logic)
    const { data: schoolSettings, error: schoolError } = await supabaseAdmin
      .from('school_settings')
      .select('subscription_end_date, trial_start_date, plan_type')
      .eq('school_id', school_id)
      .single();

    if (schoolError || !schoolSettings) throw new Error('School settings not found');

    const validityDays = transaction.subscription_plans?.validity_days || 30;
    const now = new Date();
    let baseDate = now;

    // Stack on existing premium end date if it is in the future
    if (schoolSettings.subscription_end_date) {
      const existingEnd = new Date(schoolSettings.subscription_end_date);
      if (existingEnd > baseDate) {
        baseDate = existingEnd;
      }
    }

    // Stack on remaining trial days if applicable
    if (schoolSettings.plan_type === 'trial' && schoolSettings.trial_start_date) {
      const trialEnd = new Date(schoolSettings.trial_start_date);
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial
      if (trialEnd > baseDate) {
        baseDate = trialEnd;
      }
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
        billing_cycle: validityDays >= 365 ? 'yearly' : 'monthly'
      })
      .eq('school_id', school_id);

    if (updateSchoolError) throw new Error('Failed to update school subscription settings');

    return new Response(JSON.stringify({ success: true, message: 'Payment verified successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Verification error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  } finally {
    // Log edge function usage
    const duration = Date.now() - startTime;
    await supabaseAdmin
      .from('edge_function_usage')
      .insert({
        function_name: 'verify-razorpay-payment',
        execution_time_ms: duration
      })
      .catch((e) => console.error('Logging failed:', e.message));
  }
});
