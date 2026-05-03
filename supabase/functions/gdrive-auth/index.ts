import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function processDriveAuth(code: string, school_id: string, redirect_uri: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Server configuration missing')

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok) throw new Error(`Failed to exchange token: ${JSON.stringify(tokenData)}`)
  
  const { refresh_token, access_token } = tokenData
  if (!refresh_token) throw new Error('No refresh token received. User might need to revoke access and try again.')

  // Create Root Folder in Google Drive
  const folderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `SchoolOS Gallery - ${school_id}`, mimeType: 'application/vnd.google-apps.folder' })
  });
  if (!folderResponse.ok) throw new Error('Failed to create Drive folder')
  const folderData = await folderResponse.json();

  // Make folder public
  await fetch(`https://www.googleapis.com/drive/v3/files/${folderData.id}/permissions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  // Fetch user email and quota
  const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const aboutData = await aboutResponse.json();
  const email = aboutData.user?.emailAddress || 'Unknown Account';
  const storageQuota = aboutData.storageQuota || null;

  // Save securely using Service Role Key (Bypass RLS)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: currentSettings } = await supabaseAdmin.from('school_settings').select('gdrive_config').eq('school_id', school_id).single();

  let existingConfig = currentSettings?.gdrive_config || [];
  if (!Array.isArray(existingConfig)) existingConfig = [existingConfig];
  existingConfig = existingConfig.filter(Boolean);

  if (existingConfig.some((d: any) => d.email === email)) {
    throw new Error(`Google account ${email} is already connected.`)
  }

  existingConfig.push({
    id: crypto.randomUUID(),
    email,
    refresh_token,
    folder_id: folderData.id,
    storageQuota,
    connected_at: new Date().toISOString()
  });

  const { error: dbError } = await supabaseAdmin.from('school_settings').update({ gdrive_config: existingConfig }).eq('school_id', school_id)
  if (dbError) throw dbError

  return { folder_id: folderData.id, email }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)

    // MOBILE CAPACITOR FLOW (GET Request)
    if (req.method === 'GET') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state') // school_id
      
      if (!code || !state) return new Response('Missing code or state parameters.', { status: 400 })
      
      const school_id = state
      const redirect_uri = `${url.origin}/functions/v1/gdrive-auth`

      try {
         await processDriveAuth(code, school_id, redirect_uri)
         return new Response(
           `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:white;font-family:sans-serif;text-align:center;margin:0;">
            <div style="padding: 24px;">
               <div style="background:#10b981;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color:white;"><polyline points="20 6 9 17 4 12"></polyline></svg>
               </div>
               <h2 style="margin:0 0 10px;font-size:24px;">Connected Successfully!</h2>
               <p style="color:#94a3b8;margin:0;line-height:1.5;">Your Google Drive is now linked.<br/>You can close this window and return to the app.</p>
            </div>
            </body></html>`,
           { headers: { 'Content-Type': 'text/html' } }
         )
      } catch (err: any) {
         return new Response(
           `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:white;font-family:sans-serif;text-align:center;margin:0;">
            <div style="padding: 24px;">
               <div style="background:#ef4444;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color:white;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
               </div>
               <h2 style="margin:0 0 10px;font-size:24px;">Connection Failed</h2>
               <p style="color:#94a3b8;margin:0;line-height:1.5;">${err.message}<br/><br/>You can close this window and try again.</p>
            </div>
            </body></html>`,
           { headers: { 'Content-Type': 'text/html' } }
         )
      }
    }

    // WEB FLOW (POST Request)
    if (req.method === 'POST') {
      const { code, school_id, redirect_uri } = await req.json()
      if (!code || !school_id || !redirect_uri) return new Response(JSON.stringify({ error: 'Missing code, school_id, or redirect_uri' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })

      const authHeader = req.headers.get('Authorization')
      if (!authHeader) throw new Error('Missing Authorization header')
      const supabaseUserClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
      const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
      if (authError || !user) throw new Error('Unauthorized or invalid token')

      const result = await processDriveAuth(code, school_id, redirect_uri)
      return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    return new Response('Method not allowed', { status: 405 })
  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
