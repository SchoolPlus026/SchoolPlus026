// Test what exactly supabase.functions.invoke returns when verify-razorpay-payment 
// returns a 400 error with { error: "Payment signature verification failed" }
// This tells us whether the frontend sees `verifyErr` or `verifyData.error`

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODU3OTQsImV4cCI6MjA5MTc2MTc5NH0.a1m-__iXn4Y96ZmhrGDJHlw9YO3hc2OJypZbe2WRqdM';

// Simulate what supabase.functions.invoke does internally
// The Supabase JS SDK wraps 4xx responses in FunctionsHttpError
// and returns { data: null, error: FunctionsHttpError }
// But since ManageSubscription.jsx calls supabase.functions.invoke directly 
// (NOT safeInvokeEdgeFn), the error is a FunctionsHttpError object

// The key question: when `if (verifyErr) throw verifyErr` is hit on line 238,
// what does err.message contain? Does it contain the JSON body message?

async function main() {
  const hashedToken = 'e4caa0c10d520ef60bcbd3a6fe43f98382803a4377bf0a3beaf4acaa';
  
  // Get a fresh token - need to generate a new one since previous was consumed
  const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';
  
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'magiclink', email: 'admin120@school.com' })
  });
  const linkData = await linkRes.json();
  const newHashedToken = linkData?.hashed_token;
  if (!newHashedToken) { console.error('No token', JSON.stringify(linkData).substring(0, 200)); return; }
  
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_hash: newHashedToken, type: 'magiclink' })
  });
  const sessionData = await verifyRes.json();
  const jwt = sessionData?.access_token;
  if (!jwt) { console.error('No JWT', JSON.stringify(sessionData).substring(0, 200)); return; }
  
  console.log('✅ Got fresh JWT\n');
  
  // Now simulate EXACTLY what supabase.functions.invoke does in the browser
  // The JS SDK calls: POST /functions/v1/{name} with Authorization: Bearer {jwt}
  // and returns { data, error } where error is FunctionsHttpError on non-2xx
  
  // Case 1: What does the SDK return for a 400 response?
  const funcRes = await fetch(`${supabaseUrl}/functions/v1/verify-razorpay-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      razorpay_order_id: 'order_T1YSjcNKYyynec',
      razorpay_payment_id: 'pay_FAKE',
      razorpay_signature: 'bad_sig',
      school_id: 'f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029'
    })
  });
  
  console.log('=== Raw HTTP response from Edge Function ===');
  console.log('Status:', funcRes.status);
  const responseText = await funcRes.text();
  console.log('Raw body:', responseText);
  console.log('Content-Type:', funcRes.headers.get('content-type'));
  
  // The Supabase JS SDK behavior:
  // - Status >= 200 && < 300 → { data: parsedBody, error: null }
  // - Status >= 400 → { data: null, error: FunctionsHttpError }
  // The FunctionsHttpError.message is "Edge Function returned a non-2xx status code"
  // The actual error body is in error.context (the Response object)
  
  // This means in ManageSubscription.jsx line 238:
  // `if (verifyErr) throw verifyErr;` 
  // verifyErr.message = "Edge Function returned a non-2xx status code"
  // NOT the actual { error: "Payment signature verification failed" }
  
  // AND CRUCIALLY: `verifyData` will be NULL (not { error: "..." })
  // So line 239: `if (verifyData?.success)` evaluates to FALSE
  // Line 251: `throw new Error(verifyData?.error || 'Verification failed')`
  //   = throw new Error(null?.error || 'Verification failed')
  //   = throw new Error('Verification failed')
  
  // BUT THIS IS JUST ERROR HANDLING. The REAL question is:
  // WHY is the signature failing in production when the user pays successfully?
  
  // Possible causes for signature mismatch in PRODUCTION:
  // 1. The Razorpay Key Secret used in the edge function DOES NOT MATCH the Key ID used in the frontend
  // 2. The order_id sent to the edge function is wrong (using data.order_id instead of response.razorpay_order_id)
  // 3. The response from the Razorpay native Android plugin may have different field names

  console.log('\n=== WHAT RAZORPAY HANDLER SENDS vs WHAT EDGE FN EXPECTS ===');
  console.log('Frontend ManageSubscription.jsx line 232:');
  console.log('  razorpay_order_id: response.razorpay_order_id || data.order_id');
  console.log('  razorpay_payment_id: response.razorpay_payment_id');
  console.log('  razorpay_signature: response.razorpay_signature');
  console.log('');
  console.log('For web (window.Razorpay), response = { razorpay_order_id, razorpay_payment_id, razorpay_signature }');
  console.log('For Android native (RazorpayCheckout), successResponse may differ.');
  console.log('');
  console.log('🔍 Android RazorpayCheckout.open success callback receives:');
  console.log('  { razorpay_order_id, razorpay_payment_id, razorpay_signature } ← SAME fields');
  console.log('');
  console.log('=== KEY QUESTION: Is RAZORPAY_KEY_ID in Supabase the same as key used in frontend? ===');
  console.log('The create-razorpay-order function returns key_id from Deno.env.get("RAZORPAY_KEY_ID")');
  console.log('The frontend uses this returned key_id for the checkout session.');
  console.log('The signature is computed by Razorpay using the secret associated with that key_id.');
  console.log('The verify function uses Deno.env.get("RAZORPAY_KEY_SECRET") to verify.');
  console.log('If KEY_ID and KEY_SECRET are from different key pairs → SIGNATURE MISMATCH EVERY TIME');
}

main().catch(console.error);
