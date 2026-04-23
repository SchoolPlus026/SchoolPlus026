import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify user
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Get school_id from profile
    const { data: profile } = await supabaseClient.from('users').select('school_id').eq('id', user.id).single()
    if (!profile || !profile.school_id) throw new Error('No school linked')

    // Get gdrive_config
    const { data: settings } = await supabaseClient.from('school_settings').select('gdrive_config').eq('school_id', profile.school_id).single()
    if (!settings || !settings.gdrive_config || !settings.gdrive_config.refresh_token) {
        throw new Error('Google Drive not connected for this school')
    }

    const { refresh_token, folder_id } = settings.gdrive_config

    // Get new access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const tokenData = await tokenResponse.json()
    if (!tokenData.access_token) throw new Error('Failed to refresh Google token')
    const accessToken = tokenData.access_token

    // The frontend sends the file as base64 in JSON payload to avoid complex multipart parsing in Deno std 0.168
    const { fileName, mimeType, fileBase64 } = await req.json()
    if (!fileName || !fileBase64) throw new Error('Missing file data')

    // Upload to Google Drive using multipart upload
    const boundary = '-------314159265358979323846'
    const delimiter = "\r\n--" + boundary + "\r\n"
    const close_delim = "\r\n--" + boundary + "--"

    const metadata = {
      name: fileName,
      parents: [folder_id]
    }

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + mimeType + '\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      fileBase64 +
      close_delim

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink,thumbnailLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    })

    const uploadData = await uploadResponse.json()
    if (!uploadResponse.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`)

    // Make file public so it can be viewed in Gallery
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    })

    // Return the link (thumbnail or fallback to webViewLink)
    // Drive thumbnails look like: https://lh3.googleusercontent.com/d/FILE_ID
    const publicLink = uploadData.thumbnailLink 
      ? uploadData.thumbnailLink.replace(/=s220/, '') // remove the size limit to get full res
      : uploadData.webViewLink

    return new Response(JSON.stringify({ 
      success: true, 
      id: uploadData.id, 
      link: publicLink 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
