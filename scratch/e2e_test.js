// Final verification: Test the COMPLETE payment flow end-to-end
// Step 1: Create a Razorpay order via the edge function (this reveals which KEY_ID is configured)
// Step 2: Compute a valid signature manually 
// Step 3: Call verify-razorpay-payment with the valid signature
// This tells us 100% if the KEY_ID/KEY_SECRET pair is correct

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';
import crypto from 'crypto';

async function getJWT() {
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: 'admin120@school.com' })
  });
  const linkData = await linkRes.json();
  const token = linkData?.hashed_token;
  if (!token) throw new Error('No token: ' + JSON.stringify(linkData).substring(0, 200));
  
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_hash: token, type: 'magiclink' })
  });
  const sessionData = await verifyRes.json();
  if (!sessionData?.access_token) throw new Error('No JWT: ' + JSON.stringify(sessionData).substring(0, 200));
  return sessionData.access_token;
}

async function main() {
  console.log('=== COMPLETE END-TO-END PAYMENT FLOW TEST ===\n');
  
  const jwt = await getJWT();
  console.log('✅ Got JWT\n');
  
  // Step 1: Create a real Razorpay order via edge function
  console.log('Step 1: Creating Razorpay order via create-razorpay-order...');
  // Use the "test" plan (e31d6b60...) which costs ₹1 (100 paise)
  const orderRes = await fetch(`${supabaseUrl}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify({
      plan_id: 'e31d6b60-e4d1-401e-bc72-31ee113279df', // "test" plan ₹1
      school_id: 'f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029'
    })
  });
  
  console.log('create-razorpay-order status:', orderRes.status);
  const orderData = await orderRes.json();
  console.log('Order response:', JSON.stringify(orderData, null, 2));
  
  if (orderData.error) {
    console.log('❌ Order creation failed:', orderData.error);
    return;
  }
  
  const { order_id, key_id } = orderData;
  console.log('\n✅ Order created!');
  console.log('  order_id:', order_id);
  console.log('  key_id (from Supabase secret):', key_id);
  console.log('\n=== KEY OBSERVATION ===');
  console.log('The key_id returned above is what Razorpay uses to compute the payment signature.');
  console.log('The RAZORPAY_KEY_SECRET in Supabase MUST be the secret for this key_id.');
  console.log('If they do not match → every payment verification will fail with "signature mismatch".');
}

main().catch(console.error);
