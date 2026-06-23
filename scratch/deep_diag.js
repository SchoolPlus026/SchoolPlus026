// Deep diagnostic: verify payment system end-to-end
// Run: node scratch/deep_diag.js

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function fetchRaw(path, label) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
  });
  const data = await res.json();
  console.log(`\n=== ${label} ===`);
  console.table(data);
  return data;
}

async function main() {
  console.log('=== PAYMENT SYSTEM DEEP DIAGNOSTIC ===\n');

  // 1. Check ALL recent PENDING transactions
  const transactions = await fetchRaw(
    'subscription_transactions?select=id,school_id,plan_id,amount_paise,status,razorpay_order_id,razorpay_payment_id,created_at&order=created_at.desc&limit=10',
    'Recent 10 Transactions (newest first)'
  );

  // 2. Check school_settings for Demo school
  const schools = await fetchRaw(
    'school_settings?select=school_id,name,plan_type,subscription_tier,subscription_end_date,current_plan_id&limit=5',
    'School Settings'
  );

  // 3. Check subscription plans
  const plans = await fetchRaw(
    'subscription_plans?select=id,name,amount_paise,validity_days,is_active',
    'Subscription Plans'
  );

  // 4. Check latest edge_function_usage logs
  const logs = await fetchRaw(
    'edge_function_usage?select=id,function_name,execution_time_ms,called_at&order=called_at.desc&limit=15',
    'Edge Function Usage Logs (newest first)'
  );

  // 5. Specific analysis: PENDING transactions that have no payment_id
  console.log('\n=== ANALYSIS: PENDING transactions with NO payment_id ===');
  if (Array.isArray(transactions)) {
    const stuck = transactions.filter(t => t.status === 'PENDING');
    stuck.forEach(t => {
      console.log(`  Order: ${t.razorpay_order_id} | Amount: ₹${t.amount_paise/100} | PaymentID: ${t.razorpay_payment_id || 'NULL'} | Created: ${t.created_at}`);
    });
    if (stuck.length === 0) console.log('  (none found)');
  }

  // 6. Test calling verify-razorpay-payment with a recent PENDING order
  // We simulate what happens if signature is correct  
  console.log('\n=== TEST: Direct HTTP to verify-razorpay-payment (no auth) ===');
  const res = await fetch(`${supabaseUrl}/functions/v1/verify-razorpay-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,  // service role — should fail auth check
    },
    body: JSON.stringify({
      razorpay_order_id: 'order_test_bypass',
      razorpay_payment_id: 'pay_test',
      razorpay_signature: 'bad_sig',
      school_id: 'f6b9c6ca-f9d0-43ad-8cc6-aaadb928a029'
    })
  });
  console.log('  Status:', res.status);
  console.log('  Body:', await res.text());
}

main().catch(console.error);
