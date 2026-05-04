import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { HmacSha256 } from 'https://deno.land/std@0.160.0/hash/sha256.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

    if (!signature || !secret) {
      console.error('Missing signature or secret');
      return new Response('Unauthorized', { status: 401 });
    }

    // Verify Signature
    const hmac = new HmacSha256(secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.toString();

    if (expectedSignature !== signature) {
      console.error('Invalid signature');
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    
    // We only care about order.paid
    if (payload.event !== 'order.paid') {
      return new Response('Event ignored', { status: 200 });
    }

    const paymentEntity = payload.payload.payment.entity;
    const order_id = paymentEntity.order_id;
    const payment_id = paymentEntity.id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Idempotency Check
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('subscription_transactions')
      .select('*, subscription_plans(validity_days)')
      .eq('razorpay_order_id', order_id)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found', txError);
      return new Response('Transaction not found', { status: 404 });
    }

    if (transaction.status === 'SUCCESSFUL') {
      console.log('Webhook already processed for this order');
      return new Response('Already processed', { status: 200 });
    }

    // 2. Mark as SUCCESSFUL
    const { error: updateTxError } = await supabaseAdmin
      .from('subscription_transactions')
      .update({
        status: 'SUCCESSFUL',
        razorpay_payment_id: payment_id
      })
      .eq('id', transaction.id);

    if (updateTxError) {
      console.error('Failed to update transaction', updateTxError);
      throw new Error('Failed to update transaction');
    }

    // 3. Extend Subscription End Date
    const { data: schoolSettings, error: schoolError } = await supabaseAdmin
      .from('school_settings')
      .select('subscription_end_date')
      .eq('school_id', transaction.school_id)
      .single();

    if (schoolError || !schoolSettings) {
      console.error('School not found', schoolError);
      throw new Error('School not found');
    }

    const validityDays = transaction.subscription_plans.validity_days;
    let newEndDate = new Date();

    if (schoolSettings.subscription_end_date) {
      const currentEnd = new Date(schoolSettings.subscription_end_date);
      if (currentEnd > newEndDate) {
        newEndDate = currentEnd;
      }
    }
    
    // Add validity days
    newEndDate.setDate(newEndDate.getDate() + validityDays);

    const { error: updateSchoolError } = await supabaseAdmin
      .from('school_settings')
      .update({
        subscription_end_date: newEndDate.toISOString(),
        current_plan_id: transaction.plan_id,
        subscription_tier: 'Premium', // Automatically upgrade to premium upon successful payment
      })
      .eq('school_id', transaction.school_id);

    if (updateSchoolError) {
      console.error('Failed to update school settings', updateSchoolError);
      throw new Error('Failed to update school settings');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
