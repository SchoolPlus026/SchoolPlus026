// Use the hashed_token from the previous run to get a real JWT and test verify-razorpay-payment
const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

const hashedToken = 'e4caa0c10d520ef60bcbd3a6fe43f98382803a4377bf0a3beaf4acaa';
const schoolId = 'f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029';

async function main() {
  // Exchange the hashed token for a JWT session
  console.log('Exchanging magic link token for JWT...');
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token_hash: hashedToken,
      type: 'magiclink'
    })
  });

  console.log('Verify status:', verifyRes.status);
  const verifyData = await verifyRes.json();
  
  const accessToken = verifyData?.access_token;
  if (!accessToken) {
    console.error('No access_token in response. Full response:');
    console.log(JSON.stringify(verifyData, null, 2));
    return;
  }
  
  console.log('✅ Got JWT! Testing edge function with real authenticated user...\n');
  console.log('JWT (first 60 chars):', accessToken.substring(0, 60) + '...');
  
  await testEdgeFunction(accessToken);
}

async function testEdgeFunction(jwt) {
  // Test 1: with intentionally wrong signature - to see which stage we reach
  const res = await fetch(`${supabaseUrl}/functions/v1/verify-razorpay-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      razorpay_order_id: 'order_T1YSjcNKYyynec',
      razorpay_payment_id: 'pay_FAKE_test_123',
      razorpay_signature: 'fake_signature_intentionally_wrong',
      school_id: schoolId
    })
  });
  
  console.log('\n=== TEST: verify-razorpay-payment with REAL JWT ===');
  console.log('Status:', res.status);
  const body = await res.text();
  console.log('Body:', body);
  
  console.log('\n=== DIAGNOSIS ===');
  if (body.includes('Not authenticated')) {
    console.log('❌ PROBLEM: Auth session check FAILS even with a real user JWT from Supabase.');
    console.log('   This means supabaseClient.auth.getUser() is failing inside the Edge Function.');
    console.log('   Likely cause: the function uses SUPABASE_ANON_KEY env var which is different from VITE_SUPABASE_ANON_KEY');
    console.log('   OR: The JWT audience/issuer mismatch in Deno Supabase client.');
    
    // Let's also check: What does the ANON_KEY env var resolve to inside the function?
    // We can test by seeing what happens if we call auth.getUser() with the JWT directly to Supabase REST
    const restRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM',
        'Authorization': `Bearer ${jwt}`
      }
    });
    const restUser = await restRes.json();
    console.log('\n   Direct REST auth/v1/user check:');
    console.log('   Status:', restRes.status, '| User ID:', restUser?.id || 'null', '| Email:', restUser?.email || 'null');
  } else if (body.includes('Razorpay secret key not configured')) {
    console.log('❌ CRITICAL: RAZORPAY_KEY_SECRET is NOT SET as a Supabase Edge Function Secret!');
    console.log('   Fix: Go to Supabase Dashboard → Settings → Edge Functions → Add secret RAZORPAY_KEY_SECRET');
  } else if (body.includes('Payment signature verification failed')) {
    console.log('✅ AUTH OK! RAZORPAY_KEY_SECRET OK! Function reaches signature check correctly.');
    console.log('   The frontend IS sending valid auth but something is wrong with the Razorpay signature.');
    console.log('   Possible cause: order_id/payment_id mismatch or frontend is sending wrong fields.');
  } else if (body.includes('Unauthorized for this school')) {
    console.log('⚠️  Auth OK but school ID mismatch. Admin user school_id differs from passed school_id.');
  } else if (body.includes('Transaction not found')) {
    console.log('✅ All auth/secret/school checks PASSED. Transaction lookup is the issue.');
  }
}

main().catch(console.error);
