const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function testInvoke() {
  console.log("=== TESTING EDGE FUNCTION INVOCATION ===");
  try {
    const url = `${supabaseUrl}/functions/v1/verify-razorpay-payment`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_123',
        razorpay_signature: 'sig_test_123',
        school_id: '00000000-0000-0000-0000-000000000000' // dummy UUID
      })
    });
    console.log("Status Code:", res.status);
    console.log("Headers:", Object.fromEntries(res.headers.entries()));
    console.log("Body:", await res.text());
  } catch (err) {
    console.error("Invocation failed:", err.message);
  }
}

testInvoke();
