import { supabase } from '../config/supabaseClient';

/**
 * Uploads a file directly to Google Drive using a transient access token fetched from Supabase.
 * Bypasses Edge Function proxies, saving Supabase network bandwidth and invocations.
 *
 * @param {File|Blob} file The raw file/blob to upload.
 * @param {string} parentFolderId The Google Drive folder ID to upload to.
 * @param {Object} options Options like driveIndex, school_id, and filename override.
 * @returns {Promise<Object>} The uploaded file metadata (id, name, webViewLink, thumbnailLink).
 */
export async function uploadFileToGDriveDirect(file, parentFolderId, { driveIndex = 0, school_id = null, fileName = null } = {}) {
  // 1. Get current session token
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { Authorization: `Bearer ${session?.access_token}` };

  // 2. Fetch short-lived OAuth access token from Supabase Edge Function
  const { data: tokenData, error: tokenErr } = await supabase.functions.invoke('gdrive-upload', {
    body: { action: 'get_upload_token', driveIndex, school_id },
    headers
  });

  if (tokenErr || !tokenData?.access_token) {
    throw new Error(tokenData?.error || tokenErr?.message || "Failed to retrieve Google access token");
  }

  const accessToken = tokenData.access_token;
  const targetFileName = fileName || file.name || `file_${Date.now()}`;

  // 3. Perform Google Drive Multipart Upload directly from browser
  const boundary = '-------MultipartBoundary' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata = {
    name: targetFileName,
    parents: [parentFolderId]
  };

  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const multipartBlob = new Blob([
    delimiter,
    'Content-Type: application/json\r\n\r\n',
    metadataBlob,
    delimiter,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    closeDelim
  ]);

  console.log(`[GDrive] Performing direct client upload for file: ${targetFileName}`);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBlob
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive API error (HTTP ${res.status})`);
  }

  const data = await res.json();

  // 4. Set individual file permissions to public reader so anyone in the app can view it
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
  } catch (err) {
    console.warn('[GDrive] Failed to set public permissions:', err.message);
  }

  const thumbnailLink = data.thumbnailLink
    ? data.thumbnailLink.replace(/=s\d+$/, '=s800')
    : null;

  return {
    success: true,
    id: data.id,
    name: data.name,
    thumbnailLink,
    webViewLink: data.webViewLink
  };
}
