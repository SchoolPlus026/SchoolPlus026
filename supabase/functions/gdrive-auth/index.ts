import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, school_id } = await req.json()
    
    if (!code || !school_id) {
      return new Response(JSON.stringify({ error: 'Missing code or school_id' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')

    if (!clientId || !clientSecret || !redirectUri) {
       return new Response(JSON.stringify({ error: 'Server configuration missing' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }

    // 1. Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('Token Exchange Error:', tokenData)
      return new Response(JSON.stringify({ error: 'Failed to exchange token', details: tokenData }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const { refresh_token, access_token } = tokenData
    
    if (!refresh_token) {
        return new Response(JSON.stringify({ error: 'No refresh token received. User might need to revoke access and try again.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // 2. Create 'SchoolOS_Gallery' folder
    const folderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'SchoolOS_Gallery',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    const folderData = await folderResponse.json();
    if (!folderResponse.ok) {
       console.error('Folder Creation Error:', folderData)
       return new Response(JSON.stringify({ error: 'Failed to create Drive folder', details: folderData }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const folder_id = folderData.id;

    // 3. Save to Supabase school_settings
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const gdrive_config = {
      refresh_token,
      folder_id,
      connected_at: new Date().toISOString()
    }

    const { error: dbError } = await supabaseClient
      .from('school_settings')
      .update({ gdrive_config })
      .eq('school_id', school_id)

    if (dbError) throw dbError

    return new Response(
      JSON.stringify({ success: true, folder_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
