import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    let amountPaise = 0;
    let planName = 'Custom Subscription Plan';
    let targetPlanId = plan_id;

    // 2. Fetch school_settings and subscription_plans to compute exact pricing
    const { data: schoolSettings } = await supabaseAdmin
      .from('school_settings')
      .select('*')
      .eq('school_id', school_id)
      .maybeSingle();

    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .maybeSingle();

    const { data: defaultPlan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, amount_paise, name')
      .eq('is_active', true)
      .order('amount_paise', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (plan) {
      targetPlanId = plan.id;
    } else if (defaultPlan) {
      targetPlanId = defaultPlan.id;
    }

    const customAmount = schoolSettings?.custom_billing_amount;
    const perUserRate = schoolSettings?.per_user_rate || 0;
    const contractedUsers = schoolSettings?.contracted_user_count || 0;

    let calcAmount = 0;
    if (typeof customAmount === 'number' && customAmount > 0) {
      // Priority 1: Custom billing amount assigned by Platform Admin for this school
      calcAmount = customAmount;
      planName = `${schoolSettings?.name || 'School'} Subscription Plan`;
    } else if (schoolSettings?.pricing_model === 'per_user' && perUserRate > 0 && contractedUsers > 0) {
      // Priority 2: Per-user rate pricing model
      calcAmount = perUserRate * contractedUsers;
      planName = `${schoolSettings?.name || 'School'} Subscription Plan`;
    } else if (plan) {
      // Priority 3: Selected subscription plan
      calcAmount = plan.amount_paise / 100;
      planName = plan.name;
    } else if (defaultPlan) {
      // Priority 4: Default active plan
      calcAmount = defaultPlan.amount_paise / 100;
      planName = defaultPlan.name;
    } else {
      calcAmount = 1;
    }

    amountPaise = Math.round(calcAmount * 100);

    if (!amountPaise || amountPaise <= 0) {
      throw new Error('Invalid subscription plan amount');
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
        amount: amountPaise,
        currency: 'INR',
        receipt: `receipt_${school_id.substring(0, 8)}_${Date.now()}`,
        notes: {
          school_id: school_id,
          plan_id: targetPlanId,
          tenant_id: school_id // For standard SaaS tracing
        }
      }),
    });

    const orderData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      console.error('Razorpay Error:', orderData);
      throw new Error('Failed to create Razorpay order');
    }

    const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const finalPlanIdForDb = isValidUUID(targetPlanId) ? targetPlanId : null;

    // 4. Record Transaction as PENDING in our ledger
    const { error: txError } = await supabaseAdmin
      .from('subscription_transactions')
      .insert({
        school_id,
        plan_id: finalPlanIdForDb,
        razorpay_order_id: orderData.id,
        amount_paise: amountPaise,
        status: 'PENDING'
      });

    if (txError) {
      console.error('Transaction Insert Error:', txError);
      throw new Error('Failed to record transaction');
    }

    return new Response(JSON.stringify({ 
      order_id: orderData.id,
      amount: amountPaise,
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
