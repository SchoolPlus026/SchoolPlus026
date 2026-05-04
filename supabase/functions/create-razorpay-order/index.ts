import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Create Supabase client with user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // We also need a service role client to bypass RLS for secure inserts/fetches if necessary,
    // but the user's client is safer for ensuring they own the school. Let's use service_role
    // for trusted operations.
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { plan_id, school_id } = await req.json();

    if (!plan_id || !school_id) {
      throw new Error('plan_id and school_id are required');
    }

    // 1. Verify the user has access to this school_id
    // This assumes the user is authenticated and we can check if they belong to this school
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    const { data: userData, error: userCheckError } = await supabaseAdmin
      .from('users')
      .select('school_id')
      .eq('id', user.id)
      .single();
    
    if (userCheckError || userData.school_id !== school_id) {
       // Wait, sometimes a user might manage multiple schools or the frontend might send tenant_id.
       // We'll trust the RLS on school_settings if the user can read it.
       const { data: schoolCheck, error: schoolErr } = await supabaseClient
         .from('school_settings')
         .select('school_id')
         .eq('school_id', school_id)
         .single();
       if (schoolErr || !schoolCheck) {
         throw new Error('Unauthorized to perform actions for this school');
       }
    }

    // 2. Fetch plan securely from DB
    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      throw new Error('Invalid or inactive subscription plan');
    }

    // 3. Create Razorpay Order
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    
    if (!keyId || !keySecret) {
      throw new Error('Razorpay keys not configured');
    }

    const authString = btoa(`${keyId}:${keySecret}`);
    
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: plan.amount_paise,
        currency: 'INR',
        receipt: `receipt_${school_id.substring(0, 8)}_${Date.now()}`,
      }),
    });

    const orderData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      console.error('Razorpay Error:', orderData);
      throw new Error('Failed to create Razorpay order');
    }

    // 4. Record Transaction as PENDING in our ledger
    const { error: txError } = await supabaseAdmin
      .from('subscription_transactions')
      .insert({
        school_id,
        plan_id,
        razorpay_order_id: orderData.id,
        amount_paise: plan.amount_paise,
        status: 'PENDING'
      });

    if (txError) {
      console.error('Transaction Insert Error:', txError);
      throw new Error('Failed to record transaction');
    }

    return new Response(JSON.stringify({ 
      order_id: orderData.id,
      amount: plan.amount_paise,
      currency: 'INR',
      key_id: keyId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
