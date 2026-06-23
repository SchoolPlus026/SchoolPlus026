const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function testWebhook() {
  console.log("=== TESTING WEBHOOK FUNCTION INVOCATION ===");
  try {
    const url = `${supabaseUrl}/functions/v1/razorpay-webhook`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'sig_test_123'
      },
      body: JSON.stringify({
        event: 'order.paid',
        payload: {
          payment: {
            entity: {
              order_id: 'order_test_123',
              id: 'pay_test_123'
            }
          }
        }
      })
    });
    console.log("Status Code:", res.status);
    console.log("Headers:", Object.fromEntries(res.headers.entries()));
    console.log("Body:", await res.text());
  } catch (err) {
    console.error("Invocation failed:", err.message);
  }
}

testWebhook();
