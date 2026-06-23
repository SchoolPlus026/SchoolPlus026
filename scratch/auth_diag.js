// Test: What exactly is the razorpay-webhook returning, and why is verify-razorpay-payment 
// invoked but transactions remain PENDING?
// This script will examine what happens at 15:08:24 when verify-razorpay-payment ran.

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function main() {
  // 1. Get transactions that correspond to the time verify-razorpay-payment was called (15:08:24)
  // The order order_T1YSjcNKYyynec was created at 15:06:57 which is close to the 15:08:24 verify call
  const res = await fetch(`${supabaseUrl}/rest/v1/subscription_transactions?select=*&razorpay_order_id=eq.order_T1YSjcNKYyynec`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
  });
  const tx = await res.json();
  console.log('Transaction for order_T1YSjcNKYyynec:');
  console.table(tx);

  // 2. Check if RAZORPAY_KEY_SECRET is set by testing verify endpoint with correct structure
  // We'll send a request that passes auth but fails at signature stage - if we get "signature" error 
  // instead of "Razorpay secret key not configured", the secret IS set.
  // For this we need a valid user JWT - we'll sign in with admin credentials.
  
  // First, let's sign in as admin to get a real JWT
  console.log('\nAttempting sign-in as admin120@school.com to get real JWT...');
  const signInRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM'
    },
    body: JSON.stringify({ email: 'admin120@school.com', password: 'school123' })
  });
  
  const signInData = await signInRes.json();
  
  if (!signInData.access_token) {
    console.log('Sign-in failed. Trying different password...');
    console.log(signInData);
    
    // Try another admin
    const signInRes2 = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM'
      },
      body: JSON.stringify({ email: 'admin@globaltest.edu', password: 'school123' })
    });
    const sd2 = await signInRes2.json();
    if (!sd2.access_token) {
      console.log('Both admins failed. Cannot test with real JWT.');
      console.log(sd2);
      return;
    }
    await testWithJWT(sd2.access_token, '3edd19c5-67b5-415c-a9e7-87c166bfaf65');
  } else {
    await testWithJWT(signInData.access_token, 'f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029');
  }
}

async function testWithJWT(jwt, schoolId) {
  console.log('\nGot JWT! Testing verify-razorpay-payment with REAL auth token...');
  console.log('JWT (first 50 chars):', jwt.substring(0, 50) + '...');
  
  const verifyRes = await fetch(`${supabaseUrl}/functions/v1/verify-razorpay-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      razorpay_order_id: 'order_T1YSjcNKYyynec',
      razorpay_payment_id: 'pay_fake_test',
      razorpay_signature: 'bad_signature_to_see_which_error_we_get',
      school_id: schoolId
    })
  });
  
  console.log('\nverify-razorpay-payment response with REAL JWT:');
  console.log('  Status:', verifyRes.status);
  const body = await verifyRes.text();
  console.log('  Body:', body);
  
  // This tells us:
  // - If "Not authenticated" -> JWT is invalid or session not recognized by Deno
  // - If "Missing required parameters" -> auth passed but bad payload
  // - If "Unauthorized for this school" -> auth passed but school mismatch
  // - If "Razorpay secret key not configured" -> RAZORPAY_KEY_SECRET env var is MISSING in Supabase!
  // - If "Payment signature verification failed" -> Auth + school OK, secret OK, just bad sig (expected)
  // - If "Transaction not found" -> All OK, but wrong order id
}

main().catch(console.error);
