import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Helper: refresh Google OAuth token ──────────────────────────────────────
async function getAccessToken(refreshToken: string): Promise<string> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const tokenData = await tokenResponse.json()
  if (!tokenData.access_token) throw new Error('Failed to refresh Google token: ' + JSON.stringify(tokenData))
  return tokenData.access_token
}

// ── Helper: make a Drive file/folder publicly readable ───────────────────────
async function makePublic(fileId: string, accessToken: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 0. Parse body FIRST — must happen before any await to avoid stream closure ──
    const body = await req.json()
    const action = body.action
    const driveIndex = body.driveIndex ?? 0  // nullish coalescing: 0 is valid, only fall back on null/undefined

    if (!action) throw new Error('Missing action in request body')

    // ── 1. Auth: verify the calling user ────────────────────────────────────
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // ── 2. Fetch school's gdrive_config ─────────────────────────────────────
    const { data: profile } = await supabaseClient
      .from('users').select('school_id').eq('id', user.id).single()
    if (!profile?.school_id) throw new Error('No school linked to this user')

    const { data: settings } = await supabaseClient
      .from('school_settings')
      .select('gdrive_config')
      .eq('school_id', profile.school_id)
      .single()

    if (!settings?.gdrive_config) {
      throw new Error('Google Drive not connected for this school')
    }

    let configArray = Array.isArray(settings.gdrive_config) ? settings.gdrive_config : [settings.gdrive_config]
    configArray = configArray.filter(Boolean)

    if (configArray.length === 0 || driveIndex >= configArray.length) {
       throw new Error(`Invalid Google Drive connection index ${driveIndex} (${configArray.length} drive(s) connected)`)
    }

    const { refresh_token, folder_id } = configArray[driveIndex]

    // ── 3. Get a fresh access token ──────────────────────────────────────────
    const accessToken = await getAccessToken(refresh_token)

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: create_folder
    // Creates a named subfolder inside the school's root GDrive folder.
    // Returns: { success, id, link }
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'create_folder') {
      const folderName = body.folderName
      if (!folderName) throw new Error('Missing folderName')

      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name:     folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents:  [folder_id],
        }),
      })

      const createData = await createResponse.json()
      if (!createResponse.ok) throw new Error(`Drive folder creation failed: ${JSON.stringify(createData)}`)

      // Make folder publicly accessible
      await makePublic(createData.id, accessToken)

      // Fetch the shareable webViewLink
      const fileResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${createData.id}?fields=webViewLink`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      const fileData = await fileResponse.json()

      return new Response(JSON.stringify({
        success: true,
        id:      createData.id,
        link:    fileData.webViewLink,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: upload_file
    // Uploads a single file (sent as base64) directly into a specific GDrive
    // folder (parentFolderId). Used for multi-photo gallery uploads.
    // Returns: { success, id, thumbnailLink, webViewLink }
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'upload_file') {
      const { fileName, mimeType, fileBase64, parentFolderId } = body

      if (!fileName)        throw new Error('Missing fileName')
      if (!fileBase64)      throw new Error('Missing fileBase64')
      if (!parentFolderId)  throw new Error('Missing parentFolderId — files must go into a specific event folder')

      const boundary = '-------SchoolOSGalleryUpload314159'
      const delimiter    = `\r\n--${boundary}\r\n`
      const closeDelim   = `\r\n--${boundary}--`

      const metadata = {
        name:    fileName,
        parents: [parentFolderId],  // ← uploads into the specific event subfolder
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

      // Make the file publicly viewable
      await makePublic(uploadData.id, accessToken)

      // thumbnailLink is available for images; videos may only have webViewLink
      // Strip the size suffix from thumbnailLink (e.g. =s220) to get a larger preview
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

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: get_quota
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'get_quota') {
       const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
         headers: { 'Authorization': `Bearer ${accessToken}` }
       });
       const aboutData = await aboutResponse.json();
       if (!aboutResponse.ok) throw new Error(`Quota fetch failed: ${JSON.stringify(aboutData)}`);
       return new Response(JSON.stringify({ success: true, quota: aboutData.storageQuota }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: delete_file
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'delete_file') {
       const fileId = body.fileId;
       if (!fileId) throw new Error('Missing fileId');
       const delResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
         method: 'DELETE',
         headers: { 'Authorization': `Bearer ${accessToken}` }
       });
       if (!delResponse.ok) {
          const err = await delResponse.json();
          throw new Error('Failed to delete file: ' + JSON.stringify(err));
       }
       return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    throw new Error(`Unknown action: "${action}". Valid actions: create_folder, upload_file, get_quota, delete_file`)

  } catch (error) {
    console.error('gdrive-upload Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
