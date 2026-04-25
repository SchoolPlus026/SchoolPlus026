-- Phase 33 Hotfix: Add Storage RLS Policy for payment-screenshots

-- 1. Make sure the bucket exists and is public (just in case)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-screenshots', 'payment-screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Allow anyone (or authenticated users) to upload payment screenshots
--    Since this is a public upload form for school admins, we allow authenticated users to INSERT
CREATE POLICY "Allow public uploads to payment-screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
);

-- 3. Allow public read of payment-screenshots
CREATE POLICY "Allow public read of payment-screenshots"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'payment-screenshots'
);
