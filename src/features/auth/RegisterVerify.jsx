import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { 
  School, CheckCircle, AlertTriangle, Camera, Image, Send, 
  Lock, ArrowRight, Loader2, RefreshCw, Check, Info 
} from 'lucide-react';

export default function RegisterVerify() {
  const [searchParams] = useSearchParams();
  const regId = searchParams.get('id');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registration, setRegistration] = useState(null);
  
  // Auth state
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    school_name: '',
    school_code: '',
    board: '',
    school_type: '',
    student_strength: '',
    admin_name: '',
    admin_email: '',
    admin_phone: '',
    admin_username: '',
  });
  
  const [message, setMessage] = useState('');
  const [selfieFile, setSelfieFile] = useState(null);
  const [eventFile, setEventFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState('');
  const [eventPreview, setEventPreview] = useState('');
  
  // Submission progress
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (regId) {
      loadRegistration();
    } else {
      setError('Invalid URL: Missing registration token.');
      setLoading(false);
    }
  }, [regId]);

  const loadRegistration = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('school_registrations')
        .select('*')
        .eq('id', regId)
        .single();

      if (fetchErr || !data) {
        throw new Error('Registration record not found. Please check your link.');
      }

      if (data.status !== 'verification_requested') {
        throw new Error(`This registration is currently ${data.status} and does not require verification.`);
      }

      setRegistration(data);
      setFormData({
        school_name: data.school_name || '',
        school_code: data.school_code || '',
        board: data.board || '',
        school_type: data.school_type || '',
        student_strength: data.student_strength || '',
        admin_name: data.admin_name || '',
        admin_email: data.admin_email || '',
        admin_phone: data.admin_phone || '',
        admin_username: data.admin_username || '',
      });
      setAuthEmail(data.admin_email || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (signInErr) throw new Error(signInErr.message);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result.toString().split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSelfieChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelfieFile(file);
      setSelfiePreview(URL.createObjectURL(file));
    }
  };

  const handleEventChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEventFile(file);
      setEventPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!session) {
      setAuthError('Session expired. Please unlock the page again.');
      return;
    }

    setSubmitting(true);
    setProgressText('Preparing updates...');

    try {
      const config = registration.verification_config || {};
      const requestedPhotos = config.photos || [];
      
      // Validate photos if requested
      if (requestedPhotos.includes('selfie') && !selfieFile && !registration.verification_photos?.some(p => p.name.includes('selfie'))) {
        throw new Error('Please capture your admin selfie photo.');
      }
      if (requestedPhotos.includes('event') && !eventFile && !registration.verification_photos?.some(p => p.name.includes('event'))) {
        throw new Error('Please upload the event / campus premises photo.');
      }

      const headers = { Authorization: `Bearer ${session.access_token}` };
      let folderId = registration.verification_folder_url ? 
        registration.verification_folder_url.split('id=').pop() : null;
      
      const folderName = `School Verification - ${formData.school_name}`;
      
      // 1. Establish Google Drive folder if not present
      if (requestedPhotos.length > 0 && !folderId) {
        setProgressText('Establishing Google Drive verification folder...');
        const createRes = await supabase.functions.invoke('gdrive-upload', {
          body: { action: 'create_folder', folderName, uploadToPlatformAdminDrive: true },
          headers
        });
        if (createRes.error) throw new Error(`Google Drive folder creation failed: ${createRes.error.message}`);
        folderId = createRes.data?.id;
      }

      const newUploadedPhotos = [...(registration.verification_photos || [])];

      // 2. Upload Selfie if provided
      if (selfieFile) {
        setProgressText('Uploading administrator selfie...');
        const base64 = await fileToBase64(selfieFile);
        const res = await supabase.functions.invoke('gdrive-upload', {
          body: {
            action: 'upload_file',
            parentFolderId: folderId,
            fileName: `selfie_${Date.now()}_${selfieFile.name}`,
            mimeType: selfieFile.type,
            fileBase64: base64,
            uploadToPlatformAdminDrive: true
          },
          headers
        });
        if (res.error) throw new Error(`Selfie upload failed: ${res.error.message}`);
        if (res.data?.success) {
          newUploadedPhotos.push({
            name: 'selfie_' + selfieFile.name,
            url: res.data.webViewLink,
            webViewLink: res.data.webViewLink,
            thumbnailLink: res.data.thumbnailLink
          });
        }
      }

      // 3. Upload Event Photo if provided
      if (eventFile) {
        setProgressText('Uploading premise event photo...');
        const base64 = await fileToBase64(eventFile);
        const res = await supabase.functions.invoke('gdrive-upload', {
          body: {
            action: 'upload_file',
            parentFolderId: folderId,
            fileName: `event_${Date.now()}_${eventFile.name}`,
            mimeType: eventFile.type,
            fileBase64: base64,
            uploadToPlatformAdminDrive: true
          },
          headers
        });
        if (res.error) throw new Error(`Event photo upload failed: ${res.error.message}`);
        if (res.data?.success) {
          newUploadedPhotos.push({
            name: 'event_' + eventFile.name,
            url: res.data.webViewLink,
            webViewLink: res.data.webViewLink,
            thumbnailLink: res.data.thumbnailLink
          });
        }
      }

      // 4. Update school registration details
      setProgressText('Submitting corrected registration details...');
      
      const configFields = config.fields || [];
      const updatedFields = {};
      
      // Only update fields that were requested for edits
      configFields.forEach(f => {
        if (formData[f] !== undefined) {
          updatedFields[f] = f === 'student_strength' ? parseInt(formData[f], 10) || 0 : formData[f];
        }
      });

      const { error: updateErr } = await supabase
        .from('school_registrations')
        .update({
          ...updatedFields,
          verification_photos: newUploadedPhotos,
          verification_folder_url: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
          verification_message: message,
          status: 'pending' // Send back to pending state for review
        })
        .eq('id', regId);

      if (updateErr) throw new Error(`Database submission failed: ${updateErr.message}`);

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-amber-500" />
          <span className="text-sm font-semibold text-slate-400">Loading resubmission portal...</span>
        </div>
      </div>
    );
  }

  if (error && !registration) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-500/20">
            <AlertTriangle size={28} />
          </div>
          <h2 className="text-xl font-black text-slate-200 mb-2 tracking-tight">Access Restricted</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">{error}</p>
          <button onClick={() => navigate('/login')} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-all">
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // 🔒 Login lock screen if not authenticated
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-amber-500/5 -mt-8 -mr-8 blur-2xl" />
          
          <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center mb-6 border border-amber-500/20">
            <Lock size={22} />
          </div>
          
          <h2 className="text-xl font-black text-slate-200 mb-2 tracking-tight">Verification Portal Locked</h2>
          <p className="text-slate-400 text-xs leading-relaxed mb-6">
            For security, please enter the administrative credentials sent in your verification request email to unlock this resubmission page.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500 block mb-1.5">Admin Email</label>
              <input 
                type="email" 
                required 
                value={authEmail} 
                onChange={e => setAuthEmail(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="school@admin.com"
              />
            </div>
            
            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500 block mb-1.5">Password</label>
              <input 
                type="password" 
                required 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <div className="text-red-400 text-xs font-semibold bg-red-950/20 border border-red-500/15 p-3 rounded-lg flex gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={authLoading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 size={16} className="animate-spin" /> : <><ArrowRight size={16} /> Unlock Portal</>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 🎉 Success Screen
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-500/20">
            <CheckCircle size={28} />
          </div>
          <h2 className="text-xl font-black text-slate-200 mb-2 tracking-tight">Response Submitted</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Your verification response, edited fields, and photos have been submitted back to the Platform Administrator. We will notify you via email as soon as your registration is reviewed.
          </p>
          <button onClick={() => navigate('/login')} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all">
            Proceed to Login Portal
          </button>
        </div>
      </div>
    );
  }

  const config = registration.verification_config || {};
  const allowedFields = config.fields || [];
  const allowedPhotos = config.photos || [];

  return (
    <div className="h-screen w-screen overflow-y-auto bg-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative">
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-amber-500/5 -mt-10 -mr-10 blur-2xl pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-6 mb-6">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center border border-amber-500/20">
            <School size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-200 tracking-tight">{registration.school_name}</h1>
            <p className="text-xs text-slate-400">Secure Verification & Correction Portal</p>
          </div>
        </div>

        {/* Admin Instructions */}
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 mb-6 flex gap-4">
          <Info size={24} className="text-amber-500 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-amber-400 mb-1">Instructions from Platform Admin:</h4>
            <p className="text-slate-300 text-xs leading-relaxed">{registration.rejection_reason}</p>
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-xs font-semibold bg-red-950/20 border border-red-500/15 p-4 rounded-xl mb-6 flex gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Editable Registration Fields */}
          <div>
            <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Check size={14} className="text-amber-500" /> Correct Registration Info
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['School Name', 'school_name', 'text'],
                ['School Code', 'school_code', 'text'],
                ['Education Board', 'board', 'text'],
                ['School Type', 'school_type', 'text'],
                ['Student Strength', 'student_strength', 'number'],
                ['Admin Full Name', 'admin_name', 'text'],
                ['Admin Email Address', 'admin_email', 'email'],
                ['Admin Contact Phone', 'admin_phone', 'tel'],
                ['Admin Username', 'admin_username', 'text'],
              ].map(([label, field, type]) => {
                const isEditable = allowedFields.includes(field);
                return (
                  <div key={field}>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">
                      {label} {!isEditable && <span className="text-[8px] text-slate-600 font-semibold">(READ-ONLY)</span>}
                    </label>
                    <input 
                      type={type}
                      disabled={!isEditable}
                      value={formData[field]}
                      onChange={e => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                      className={`w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all ${
                        isEditable ? 
                        'bg-slate-950 border border-slate-800 text-white focus:ring-2 focus:ring-amber-500/50' : 
                        'bg-slate-900/40 border border-slate-800/30 text-slate-500 cursor-not-allowed font-medium'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Verification Photo Upload Section */}
          {allowedPhotos.length > 0 && (
            <div className="border-t border-slate-800 pt-6">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Camera size={14} className="text-amber-500" /> Upload Verification Photos
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* 1. School Admin Selfie (Camera capture only) */}
                {allowedPhotos.includes('selfie') && (
                  <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-3">
                      <Camera size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">Admin Live Selfie</span>
                    <span className="text-[10px] text-slate-500 mt-1 max-w-[220px]">Device camera capture only. Access to webcam/camera will be requested.</span>
                    <span className="text-[9px] text-amber-400/80 mt-1.5 max-w-[220px] font-medium leading-relaxed">Purpose: Verification of the identity of the administrator submitting the request.</span>
                    
                    <label className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase rounded-lg cursor-pointer transition-colors">
                      Take Photo
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="user"
                        onChange={handleSelfieChange}
                        className="hidden"
                      />
                    </label>

                    {selfiePreview && (
                      <div className="mt-4 w-24 h-24 rounded-lg overflow-hidden border border-slate-700 relative">
                        <img src={selfiePreview} alt="Selfie preview" className="w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5">
                          <Check size={10} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Event Photo (Gallery upload allowed) */}
                {allowedPhotos.includes('event') && (
                  <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-3">
                      <Image size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">Event / Premise Photo</span>
                    <span className="text-[10px] text-slate-500 mt-1 max-w-[220px]">Photo showing school event or building. Gallery selection is allowed.</span>
                    <span className="text-[9px] text-indigo-400/80 mt-1.5 max-w-[220px] font-medium leading-relaxed">Purpose: Verification of the physical legitimacy and branding/premises of the school.</span>
                    
                    <label className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase rounded-lg cursor-pointer transition-colors">
                      Select Photo
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleEventChange}
                        className="hidden"
                      />
                    </label>

                    {eventPreview && (
                      <div className="mt-4 w-24 h-24 rounded-lg overflow-hidden border border-slate-700 relative">
                        <img src={eventPreview} alt="Event preview" className="w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5">
                          <Check size={10} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reply Message Box */}
          <div className="border-t border-slate-800 pt-6">
            <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-2">Message to Platform Admin (Optional)</label>
            <textarea 
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y"
              placeholder="Provide context, comments, or explanations for your resubmitted items..."
            />
          </div>

          {/* Submit Actions */}
          <div className="border-t border-slate-800 pt-6 flex flex-col gap-3">
            {submitting && (
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-slate-300">{progressText}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              {submitting ? 'Submitting Verification...' : <><Send size={15} /> Submit & Resubmit for Review</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
