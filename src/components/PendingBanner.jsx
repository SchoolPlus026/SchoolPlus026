import React, { useState, useRef } from 'react';
import { Clock, XCircle, Upload, Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { usePending } from '../hooks/usePending';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';

const compressImage = (file, maxW = 1200, maxH = 1200, quality = 0.75) => {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxW) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          }
        } else {
          if (height > maxH) {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            return resolve(file);
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, 'image/jpeg', quality);
      };
    };
  });
};

export default function PendingBanner() {
  const { isPending, isRejected, isVerificationRequested } = usePending();
  const schoolSettings = useAppStore((s) => s.schoolSettings);
  const setSchoolSettings = useAppStore((s) => s.setSchoolSettings);
  const [regId, setRegId] = useState(null);

  React.useEffect(() => {
    if (isVerificationRequested && schoolSettings?.school_id) {
      supabase
        .from('school_registrations')
        .select('id')
        .eq('school_id', schoolSettings.school_id)
        .single()
        .then(({ data }) => {
          if (data) setRegId(data.id);
        });
    }
  }, [isVerificationRequested, schoolSettings?.school_id]);

  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  if (!isPending && !isRejected && !isVerificationRequested) return null;

  if (isRejected) {
    return (
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: 'var(--danger-bg)',
        border: '1px solid var(--danger-border)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 20,
      }}>
        <XCircle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: 'var(--danger)' }}>
            Application Rejected
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Your school registration was declined by the Platform Admin. Please contact support for more information.
          </p>
        </div>
      </div>
    );
  }

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setErrorText('');
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setErrorText('Please select at least one verification photo.');
      return;
    }

    setUploading(true);
    setErrorText('');
    setProgressText('Preparing updates...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Get the registration row ID first
      const { data: reg, error: regFetchErr } = await supabase
        .from('school_registrations')
        .select('id, verification_photos')
        .eq('school_id', schoolSettings.school_id)
        .single();

      if (regFetchErr || !reg) throw new Error('Associated school registration record not found.');

      setProgressText('Compressing and uploading verification photos in parallel...');
      
      const uploadPromises = files.map(async (file, idx) => {
        // Compress image to high quality (2000x2000, 0.85)
        const compressedFile = await compressImage(file, 2000, 2000, 0.85);
        const filePath = `verification/${reg.id}/doc_${Date.now()}_${idx}_${file.name}`;

        const { error: uploadErr } = await supabase.storage
          .from('school_assets')
          .upload(filePath, compressedFile, { cacheControl: '3600', upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: publicUrlData } = supabase.storage
          .from('school_assets')
          .getPublicUrl(filePath);

        return {
          name: file.name,
          url: publicUrlData.publicUrl,
          webViewLink: publicUrlData.publicUrl,
          thumbnailLink: publicUrlData.publicUrl
        };
      });

      const uploadedPhotos = await Promise.all(uploadPromises);
      const combinedPhotos = [...(reg.verification_photos || []), ...uploadedPhotos];

      setProgressText('Submitting verification to Platform Admin...');
      
      const storageFolderUrl = supabase.storage
        .from('school_assets')
        .getPublicUrl(`verification/${reg.id}`).data.publicUrl;

      // Update school_registrations
      const { error: regUpdateErr } = await supabase
        .from('school_registrations')
        .update({
          status: 'pending',
          verification_folder_url: storageFolderUrl,
          verification_photos: combinedPhotos
        })
        .eq('id', reg.id);

      if (regUpdateErr) throw new Error('Failed to update registration record: ' + regUpdateErr.message);

      // Update school_settings to set status back to Pending
      const { error: schoolUpdateErr } = await supabase
        .from('school_settings')
        .update({
          subscription_status: 'Pending'
        })
        .eq('school_id', schoolSettings.school_id);

      if (schoolUpdateErr) throw new Error('Failed to update school settings status: ' + schoolUpdateErr.message);

      setSuccess(true);
      setFiles([]);
      
      // Update global app state so the banner instantly updates to "Account Under Review"
      setTimeout(() => {
        setSchoolSettings({
          ...schoolSettings,
          subscription_status: 'Pending'
        });
      }, 1500);

    } catch (err) {
      console.error('Verification upload error:', err);
      setErrorText(err.message || 'An unexpected error occurred during upload. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (isVerificationRequested) {
    return (
      <div style={{
        background: 'var(--warn-bg)',
        border: '1px solid var(--warn-border)',
        borderRadius: 14, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Clock size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: 'var(--warn)' }}>
              Verification Action Required
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              The Platform Administrator has requested verification details/photos for your school.
            </p>
            {schoolSettings?.verification_reason && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-main)', borderLeft: '3px solid var(--warn)' }}>
                <strong>Details requested:</strong> {schoolSettings.verification_reason}
              </div>
            )}
            
            {regId ? (
              <div style={{ marginTop: 14 }}>
                <a 
                  href={`/register-verify?id=${regId}`}
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    padding: '8px 16px', 
                    background: 'var(--warn)', 
                    color: '#000', 
                    fontWeight: 800, 
                    fontSize: 12, 
                    borderRadius: 10, 
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(251,191,36,0.2)'
                  }}
                >
                  Open Resubmission Portal <ArrowRight size={14} />
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                <Loader2 size={14} className="animate-spin" color="var(--warn)" /> Resolving verification token...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'var(--warn-bg)',
      border: '1px solid var(--warn-border)',
      borderRadius: 14, padding: '14px 18px', marginBottom: 20,
    }}>
      <Clock size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: 'var(--warn)' }}>
          Account Under Review
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Your application is currently being reviewed by the Platform Admin. You can explore the interface, but
          <strong style={{ color: 'var(--text-main)' }}> data entry and core features are disabled</strong> until your account is approved.
        </p>
      </div>
    </div>
  );
}
