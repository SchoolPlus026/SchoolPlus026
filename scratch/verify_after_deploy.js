// Final verification test: Simulate exactly what the new edge function will do.
// This tests the server-to-server API call path using a real captured payment.
// Payment IDs from Razorpay dashboard: pay_T1YTc20UWrYfNO (order: order_T1YSjcNKYyynec)

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

// Real captured payments from Razorpay dashboard:
const REAL_PAYMENTS = [
  { payment_id: 'pay_T1YTc20UWrYfNO', order_id: 'order_T1YSjcNKYyynec' },
  { payment_id: 'pay_T1XsXOCC53LMgm', order_id: 'order_T1XsFSjp3WNPJT' },
  { payment_id: 'pay_T1WuCilewxc2QI', order_id: 'order_T1WtuCseGDP5HF' },
];

async function getJWT() {
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: 'admin120@school.com' })
  });
  const linkData = await linkRes.json();
  const token = linkData?.hashed_token;
  if (!token) throw new Error('No token');
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_hash: token, type: 'magiclink' })
  });
  const sd = await verifyRes.json();
  if (!sd.access_token) throw new Error('No JWT: ' + JSON.stringify(sd));
  return sd.access_token;
}

async function main() {
  console.log('=== POST-DEPLOYMENT VERIFICATION TEST ===\n');
  console.log('Testing with REAL captured Razorpay payment IDs...\n');

  const jwt = await getJWT();
  console.log('✅ Got authenticated JWT\n');

  for (const p of REAL_PAYMENTS) {
    console.log(`\n--- Testing: ${p.payment_id} (order: ${p.order_id}) ---`);
    const res = await fetch(`${supabaseUrl}/functions/v1/verify-razorpay-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        razorpay_order_id: p.order_id,
        razorpay_payment_id: p.payment_id,
        school_id: 'f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029',
      })
    });
    const body = await res.text();
    const ok = res.status === 200;
    console.log(`  Status: ${res.status} ${ok ? '✅' : '❌'}`);
    console.log(`  Response: ${body}`);
  }

  // Check if school_settings was updated to premium
  console.log('\n=== Checking school_settings after verification ===');
  const settingsRes = await fetch(`${supabaseUrl}/rest/v1/school_settings?select=school_id,name,plan_type,subscription_tier,subscription_end_date&school_id=eq.f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
  });
  const settings = await settingsRes.json();
  console.table(settings);

  // Check transaction statuses
  console.log('\n=== Checking transaction statuses ===');
  const txRes = await fetch(`${supabaseUrl}/rest/v1/subscription_transactions?select=razorpay_order_id,razorpay_payment_id,status,amount_paise&school_id=eq.f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029&order=created_at.desc&limit=5`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
  });
  const txs = await txRes.json();
  console.table(txs);
  
  const allSuccess = txs.every(t => t.status === 'SUCCESSFUL');
  console.log(allSuccess ? '\n✅ ALL TRANSACTIONS ARE SUCCESSFUL!' : '\n⚠️  Some transactions still PENDING');
  const school = settings[0];
  if (school?.plan_type === 'premium') {
    console.log(`✅ School is now PREMIUM! Expires: ${school.subscription_end_date}`);
  } else {
    console.log(`❌ School still shows: plan_type=${school?.plan_type}`);
  }
}

main().catch(console.error);
