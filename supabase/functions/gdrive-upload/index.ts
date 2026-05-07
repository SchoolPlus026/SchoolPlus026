import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: newSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const tokenData = await tokenResponse.json()
  if (!tokenData.access_token) throw new Error('Failed to refresh Google token')
  return tokenData.access_token
}

function newSearchParams(params: Record<string, string>): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const key in params) {
    searchParams.append(key, params[key])
  }
  return searchParams
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const { action, driveIndex, school_id } = body;
    
    if (!action) throw new Error('Action is required')

    // --- 1. Auth verification ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // --- 2. Fetch config securely using Admin key (Bypass RLS) ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Determine caller role from DB (authoritative)
    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    const isPlatformAdmin = callerProfile?.role === 'platform_admin'

    let targetDrive: any

    if (isPlatformAdmin) {
      // Platform Admin: read from platform_settings.pa_gdrive_config
      const { data: platData } = await supabaseAdmin
        .from('platform_settings')
        .select('pa_gdrive_config')
        .limit(1)
        .single()

      const paConfigArray = Array.isArray(platData?.pa_gdrive_config)
        ? platData.pa_gdrive_config.filter(Boolean)
        : []
      targetDrive = paConfigArray[driveIndex ?? 0]

      if (!targetDrive || !targetDrive.refresh_token) {
        throw new Error(`Platform Admin Drive config not found for index ${driveIndex ?? 0}. Connect a Drive account first.`)
      }
    } else {
      // School user: read from school_settings.gdrive_config
      const targetSchoolId = school_id || user.user_metadata?.school_id
      if (!targetSchoolId) throw new Error('Missing school_id')

      const { data: schoolData } = await supabaseAdmin
        .from('school_settings')
        .select('gdrive_config')
        .eq('school_id', targetSchoolId)
        .single()

      const configArray = Array.isArray(schoolData?.gdrive_config) ? schoolData.gdrive_config : []
      targetDrive = configArray[driveIndex ?? 0]

      if (!targetDrive || !targetDrive.refresh_token) {
        throw new Error(`Google Drive configuration not found for index ${driveIndex ?? 0}.`)
      }
    }

    // --- 3. Get fresh Access Token ---
    const accessToken = await getAccessToken(targetDrive.refresh_token)

    // --- Route actions ---
    if (action === 'get_quota') {
      const quotaRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const quotaData = await quotaRes.json()
      return new Response(JSON.stringify({ quota: quotaData.storageQuota }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_file') {
      const { fileId } = body
      if (!fileId) throw new Error('fileId required for deletion')
      // Use PATCH to move it to trash (safer than hard DELETE)
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      })
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'create_folder') {
      const { folderName } = body
      if (!folderName) throw new Error('folderName required')

      const folderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [targetDrive.folder_id]
        })
      })
      const folderData = await folderRes.json()
      if (!folderData.id) throw new Error('Failed to create folder: ' + JSON.stringify(folderData))
      
      // Make folder public
      await fetch(`https://www.googleapis.com/drive/v3/files/${folderData.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      })

      return new Response(JSON.stringify({ id: folderData.id, link: `https://drive.google.com/drive/folders/${folderData.id}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'upload_file') {
      const { parentFolderId, fileName, mimeType, fileBase64 } = body
      if (!parentFolderId || !fileName || !fileBase64) throw new Error('Missing upload parameters')
      
      const boundary = '-------SchoolOSGalleryUpload314159'
      const delimiter    = `\r\n--${boundary}\r\n`
      const closeDelim   = `\r\n--${boundary}--`

      const metadata = {
        name:    fileName,
        parents: [parentFolderId],
      }

      const multipartBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        fileBase64 +
        closeDelim

      const uploadResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      )

      const uploadData = await uploadResponse.json()
      if (!uploadResponse.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`)

      // Make the individual file public just in case
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      })

      const thumbnailLink = uploadData.thumbnailLink
        ? uploadData.thumbnailLink.replace(/=s\d+$/, '=s800')
        : null

      return new Response(JSON.stringify({
        success:       true,
        id:            uploadData.id,
        name:          uploadData.name,
        thumbnailLink: thumbnailLink,
        webViewLink:   uploadData.webViewLink,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    throw new Error('Unknown action: ' + action)

  } catch (error) {
    console.error("gdrive-upload error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
