import React, { useState, useEffect } from 'react';
import { Lock, User, Loader2, AlertCircle, SchoolIcon, ArrowRight, ArrowLeft, Eye, EyeOff,
  Fingerprint, Key, ChevronRight, QrCode, Smartphone, Shield, CheckCircle2, X, Mail } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Browser } from '@capacitor/browser';
import { CapacitorPasskey } from '@capgo/capacitor-passkey';
import { authenticateWebAuthnWeb } from '../../utils/webauthnWeb';
import { supabase, safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { getSavedAccounts } from '../../utils/multiAccount';

const isMobileOrPWA = () => {
  if (Capacitor.isNativePlatform()) return true;
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileOS = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const hasTouch = navigator.maxTouchPoints > 0;
  return isMobileOS || hasTouch;
};

export default function Login() {
  /**
   * STEPS:
   *  1  → School Code entry
   *  2  → Username + Password login
   *  3  → Account Help & Recovery menu
   *  4  → Forgot School Code form
   *  42 → School Code challenge screen
   *  5  → Forgot Username (method picker + form)
   *  52 → Username Q&A wizard
   *  53 → Username PIN recovery
   *  6  → Forgot Password (method picker + form)
   *  62 → Password Q&A wizard
   *  63 → Password PIN recovery form
   *  7  → PC QR/code entry (Mobile→PC Flow B) OR anonymous QR screen
   *  8  → Mobile "Scan QR / Enter Code" screen (native only, Flow A)
   *  9  → Forced password change after QR login
   */
  const [step, setStep] = useState(1);
  const [schoolCode, setSchoolCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [savedAccounts, setSavedAccounts] = useState([]);
  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
  }, []);

  const handleSwitchAccount = async (account) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { error } = await supabase.auth.setSession({
        access_token: account.session.access_token,
        refresh_token: account.session.refresh_token
      });
      if (error) throw error;
      
      // Navigate based on role
      navigate(account.role === 'platform_admin' ? '/platform-admin' : `/${account.role}`, { replace: true });
      window.location.reload(); // Force full reload to rebuild state cleanly
    } catch (err) {
      setError('Saved session has expired. Please log in again using school code.');
      // Remove expired account from saved list
      const filtered = savedAccounts.filter(a => a.user_id !== account.user_id);
      localStorage.setItem('sp_accounts', JSON.stringify(filtered));
      setSavedAccounts(filtered);
    } finally {
      setLoading(false);
    }
  };

  // Recovery UI state variables
  const [recoveryRole, setRecoveryRole] = useState('student');
  const [recoveryName, setRecoveryName] = useState('');
  const [recoveryContact, setRecoveryContact] = useState('');
  const [recoveryDob, setRecoveryDob] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');

  // Q&A Wizard states
  const [qaSessionId, setQaSessionId] = useState('');
  const [qaQuestions, setQaQuestions] = useState([]);
  const [currentQaIndex, setCurrentQaIndex] = useState(0);
  const [qaAnswers, setQaAnswers] = useState({});
  const [qaIncorrectList, setQaIncorrectList] = useState([]);
  const [qaAttempts, setQaAttempts] = useState(0);
  const [newRecoveryPassword, setNewRecoveryPassword] = useState('');
  const [confirmRecoveryPassword, setConfirmRecoveryPassword] = useState('');

  // PIN Recovery states
  const [recoveryPin, setRecoveryPin] = useState('');
  const [pinNewPassword, setPinNewPassword] = useState('');
  const [pinConfirmPassword, setPinConfirmPassword] = useState('');
  const [pinVerified, setPinVerified] = useState(false); // 2-step flow: verify first, then show password fields

  // QR Sync State (PC login screen — Flow B: enter 6-digit code from Mobile)
  const [qrToken, setQrToken] = useState('');
  const [qrPollInterval, setQrPollInterval] = useState(null);
  const [qrSyncCode, setQrSyncCode] = useState(''); // 6-digit code entered on PC
  const [mobileQrCode, setMobileQrCode] = useState(''); // 6-digit code entered on Mobile (Flow A)
  const [scannerActive, setScannerActive] = useState(false); // Live camera QR scanner state
  const [scannerPermError, setScannerPermError] = useState(false); // Camera permission denied

  // Forced password change after QR login
  const [qrForceNewPassword, setQrForceNewPassword] = useState('');
  const [qrForceConfirmPassword, setQrForceConfirmPassword] = useState('');
  const [pendingMagicLink, setPendingMagicLink] = useState('');

  // Colleague Token (Step 10)
  const [colleagueToken, setColleagueToken] = useState('');
  const [colleagueNewPassword, setColleagueNewPassword] = useState('');
  const [colleagueConfirmPassword, setColleagueConfirmPassword] = useState('');

  const [globalApp, setGlobalApp] = useState({ name: 'SchoolOS+', logo: null });
  const { setUserAndRole, setSchoolSettings, schoolSettings } = useAppStore();
  const navigate = useNavigate();

  // On mount: reset session
  useEffect(() => {
    setSchoolSettings(null);
    supabase.from('platform_settings').select('app_name, logo_url').single()
      .then(({ data }) => {
        if (data) setGlobalApp({ name: data.app_name || 'SchoolOS+', logo: data.logo_url });
      }).catch(console.error);
  }, [setSchoolSettings]);

  useEffect(() => {
    return () => {
      if (qrPollInterval) {
        clearTimeout(qrPollInterval);
        clearInterval(qrPollInterval);
      }
    };
  }, [qrPollInterval]);

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE QR SCANNER — WhatsApp-style real-time scanning
  // Strategy: On native, first request permission via Capacitor Camera plugin,
  // then use getUserMedia for live video in WebView (works after permission granted).
  // ─────────────────────────────────────────────────────────────────────────

  // Called when user taps the scanner button
  const handleStartLiveScan = async () => {
    setError('');
    setScannerPermError(false);

    if (Capacitor.isNativePlatform()) {
      try {
        // 1. Check current native permission status
        const checkStatus = await Camera.checkPermissions();
        
        // 2. If already granted, directly activate scanner
        if (checkStatus.camera === 'granted') {
          setScannerActive(true);
          return;
        }

        // 3. If permanently denied (returns 'denied' directly on check), don't prompt but show Settings message
        if (checkStatus.camera === 'denied') {
          setScannerPermError(true);
          setError('Camera permission denied. Please allow camera access in your phone Settings → Apps → SchoolOS+.');
          return;
        }

        // 4. Otherwise ('prompt' or 'prompt-with-rationale'), request native permission explicitly
        const permStatus = await Camera.requestPermissions({ permissions: ['camera'] });
        if (permStatus.camera === 'granted') {
          setScannerActive(true);
        } else {
          setScannerPermError(true);
          setError('Camera permission denied. Please allow camera access in your phone Settings → Apps → SchoolOS+.');
        }
      } catch (permErr) {
        console.warn('Native permission check/request failed, attempting fallback:', permErr);
        // Fail-open: proceed to activate scanner and let browser getUserMedia handle it
        setScannerActive(true);
      }
    } else {
      // Non-native platform (Web): proceed directly to active state
      setScannerActive(true);
    }
  };

  // Universal live QR scanner — works on both web and native (after permission granted)
  useEffect(() => {
    let stream = null;
    let animationFrameId = null;
    let detected = false; // guard: prevent firing handleMobileScannedCode multiple times

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera not supported on this device.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        });

        const video = document.getElementById('qr-scanner-video');
        if (!video) return;

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        // Explicitly call play() — required on some Android WebViews
        await video.play().catch(() => {});

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const scanFrame = () => {
          if (detected) return;

          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code?.data) {
              detected = true; // stop further detections
              let token = code.data;
              if (token.includes('?token=')) {
                try { token = new URL(token).searchParams.get('token') || token; } catch (_) {}
              }
              setScannerActive(false); // stops camera
              handleMobileScannedCode(token); // fires login
              return;
            }
          }

          // Continue scanning — no error on unrecognized frames
          animationFrameId = requestAnimationFrame(scanFrame);
        };

        animationFrameId = requestAnimationFrame(scanFrame);
      } catch (err) {
        console.error('Live QR scanner error:', err);
        const isDenied = err?.name === 'NotAllowedError' || err?.message?.includes('denied') || err?.message?.includes('permission');
        if (isDenied) {
          setScannerPermError(true);
          setError('Camera access denied. Please allow camera in your device Settings.');
        } else {
          setError('Could not open camera. Please enter the 6-digit code manually below.');
        }
        setScannerActive(false);
      }
    };

    const stopCamera = () => {
      if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      const video = document.getElementById('qr-scanner-video');
      if (video) { video.srcObject = null; }
    };

    if (scannerActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [scannerActive]);

  const invokeEdgeFn = async (action, body) => {
    if (action === 'webauthn-start' || action === 'webauthn-verify') {
      return safeInvokeEdgeFn(action, body);
    }
    return safeInvokeEdgeFn('hybrid-recovery-handler', { action, ...body });
  };

  // ─────────────────────────────────────────────────────────────────────────
  const handleIdentifySchool = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (schoolCode.toUpperCase() === 'PLATFORM') {
         setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
         setStep(2);
         return;
      }
      const { data, error: fetchError } = await supabase
        .from('school_settings').select('*').eq('school_code', schoolCode.toUpperCase()).maybeSingle();
      if (fetchError) throw new Error(fetchError.message);
      if (!data) throw new Error('Invalid School Code. Please check and try again.');
      setSchoolSettings(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SUBMIT
  // ─────────────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const rawInput = username.trim();
      try {
        const { data: bfCheck, error: rpcErr } = await supabase.rpc('check_and_log_login_attempt', {
          p_username: rawInput,
          p_action: 'check'
        });
        if (rpcErr) throw rpcErr;
        if (bfCheck?.locked) {
          const unlockTime = new Date(bfCheck.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          throw new Error(`🔒 Account Temporarily Locked: Too many incorrect login attempts. For security, this username is locked for 2 hours. Please try again after ${unlockTime}.`);
        }
      } catch (bfErr) {
        if (bfErr.message?.includes('Account Temporarily Locked')) throw bfErr;
        console.warn('Brute-force check failed to execute. Failing open:', bfErr);
      }

      let loginEmail = '';
      if (rawInput.includes('@')) {
        loginEmail = rawInput;
      } else {
        const { data: lookupData, error: lookupError } = await supabase
          .rpc('get_email_by_username', { p_username: rawInput });
        if (lookupError || !lookupData) {
          throw new Error(`No account found for username "${rawInput}". Please check your username.`);
        }
        loginEmail = lookupData;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail, password
      });

      if (authError) {
        try {
          await supabase.rpc('check_and_log_login_attempt', {
            p_username: rawInput,
            p_action: 'fail'
          });
        } catch (_) {}
        throw new Error('Incorrect password or account not found.');
      }

      try {
        await supabase.rpc('check_and_log_login_attempt', {
          p_username: rawInput,
          p_action: 'success'
        });
      } catch (_) {}

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id, name, class, avatar_url, avatar_file_id, hide_avatar_from_class')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        throw new Error('Could not load your profile. Please contact your administrator.');
      }

      if (profile.role !== 'platform_admin') {
        if (profile.school_id !== schoolSettings?.school_id) {
          await supabase.auth.signOut();
          throw new Error('This account does not belong to the selected school workspace.');
        }
      }

      if (profile.role === 'platform_admin' && !schoolSettings) {
        setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
      }

      const enrichedUser = { 
        ...authData.user, 
        class: profile.class || null,
        avatar_url: profile.avatar_url || null,
        avatar_file_id: profile.avatar_file_id || null,
        hide_avatar_from_class: !!profile.hide_avatar_from_class
      };
      setUserAndRole(enrichedUser, profile.role);
      navigate(profile.role === 'platform_admin' ? '/platform-admin' : `/${profile.role}`, { replace: true });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SCHOOL CODE RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecoverSchoolCode = async (e) => {
    e.preventDefault();
    if (!recoveryContact.trim() && !recoveryDob) {
      setError('Please provide either your Registered Contact Number or Date of Birth.');
      return;
    }
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('recover-school-code', {
        name: recoveryName, role: recoveryRole,
        contact: recoveryContact.trim() || null, dob: recoveryDob || null
      });
      setQaQuestions([{ id: 1, question: data.challengeQuestion, options: data.options }]);
      setQaSessionId(data.sessionId);
      setCurrentQaIndex(0);
      setStep(42);
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmitSchoolCodeChallenge = async (answer) => {
    setLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('verify-school-code', { sessionId: qaSessionId, answer });
      setSuccess(`Your School Code is: ${data.schoolCode}`);
      setSchoolCode(data.schoolCode);
      setStep(1);
      setTimeout(() => setSuccess(''), 10000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // USERNAME RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecoverUsername = async (e) => {
    e.preventDefault();
    if (!recoveryContact.trim() && !recoveryDob) {
      setError('Please provide either your Registered Contact Number or Date of Birth.');
      return;
    }
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('initiate-recovery', {
        credential_type: 'username', school_code: schoolCode,
        password: recoveryPassword, name: recoveryName,
        dob: recoveryDob || null, contact: recoveryContact.trim() || null
      });
      setQaQuestions(data.questions);
      setQaSessionId(data.sessionId);
      setCurrentQaIndex(0);
      setQaAnswers({});
      setStep(52);
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleRecoverUsernameByEmail = async (e) => {
    e.preventDefault();
    if (!recoveryEmail.trim() || !recoveryContact.trim()) {
      setError('Please provide both your recovery email and contact number.');
      return;
    }
    setForgotLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data, error: rpcError } = await supabase
        .rpc('retrieve_username_by_email', { 
          p_email: recoveryEmail.trim(), 
          p_contact: recoveryContact.trim() 
        });

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) {
        throw new Error('No account matches the provided email and contact number.');
      }

      const match = data[0];

      if (match.role === 'student' && !match.student_emails_enabled) {
        throw new Error('Username recovery via email is disabled for students at your school. Please ask your class teacher for assistance.');
      }

      const { error: edgeError } = await supabase.functions.invoke('send-username-email', {
        body: {
          email: recoveryEmail.trim(),
          name: match.name,
          username: match.username,
          schoolName: match.school_name
        }
      });

      if (edgeError) throw edgeError;

      setSuccess(`Your username has been sent to your verified recovery email: ${maskEmail(recoveryEmail)}`);
      setTimeout(() => {
        setSuccess('');
        setStep(3);
      }, 5000);
    } catch (err) {
      setError(err.message || 'Failed to recover username.');
    } finally {
      setForgotLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PASSWORD RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecoverPassword = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('initiate-recovery', {
        credential_type: 'password', username: username, school_code: schoolCode
      });
      setQaQuestions(data.questions);
      setQaSessionId(data.sessionId);
      setCurrentQaIndex(0);
      setQaAnswers({});
      setStep(62);
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const maskEmail = (email) => {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (local.length <= 2) {
      return `${local[0]}*@${domain}`;
    }
    return `${local.substring(0, 2)}${'*'.repeat(5)}${local.slice(-1)}@${domain}`;
  };

  const getPasswordResetQuota = () => {
    const requestsStr = localStorage.getItem('password_reset_requests') || '[]';
    let requests = [];
    try {
      requests = JSON.parse(requestsStr);
    } catch (e) {
      requests = [];
    }

    const now = Date.now();
    // Clean up expired entries (older than 7 days) to prevent storage leak
    requests = requests.filter(t => now - t < 7 * 24 * 60 * 60 * 1000);

    const dailyLimit = 2;
    const weeklyLimit = 5;

    const dailyCount = requests.filter(t => now - t < 24 * 60 * 60 * 1000).length;
    const weeklyCount = requests.filter(t => now - t < 7 * 24 * 60 * 60 * 1000).length;

    const dailyRemaining = Math.max(0, dailyLimit - dailyCount);
    const weeklyRemaining = Math.max(0, weeklyLimit - weeklyCount);

    return {
      dailyRemaining,
      weeklyRemaining,
      requests
    };
  };

  const handleEmailPasswordReset = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username or email address.');
      return;
    }

    // Double check quota limit on submission
    const { dailyRemaining, weeklyRemaining, requests } = getPasswordResetQuota();
    if (dailyRemaining <= 0 || weeklyRemaining <= 0) {
      setError('You have exceeded your password reset request limit for today/this week.');
      return;
    }

    setForgotLoading(true);
    setError('');
    setSuccess('');
    try {
      // 1. Call secure RPC to verify plan status, user role, and retrieve verified email
      const { data: verifiedEmail, error: rpcError } = await supabase
        .rpc('request_password_reset_email', { p_identifier: username.trim() });

      if (rpcError) throw rpcError;

      // 2. Trigger Supabase GoTrue reset link
      const redirectUrl = Capacitor.isNativePlatform()
        ? 'schoolosplus://dashboard'
        : `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(verifiedEmail, {
        redirectTo: redirectUrl,
      });

      if (resetError) throw resetError;

      // Update rate limit quotas in localStorage
      const updatedRequests = [...requests, Date.now()];
      localStorage.setItem('password_reset_requests', JSON.stringify(updatedRequests));

      setSuccess(`A password reset link has been sent to your verified recovery email: ${maskEmail(verifiedEmail)}`);
      setTimeout(() => {
        setSuccess('');
        setStep(2); // Redirect back to login credentials page
      }, 5000);
    } catch (err) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      if (schoolCode) {
        localStorage.setItem('oauth_school_code', schoolCode);
      }

      const redirectUrl = Capacitor.isNativePlatform() 
        ? `schoolosplus://dashboard?school=${schoolCode}` 
        : `${window.location.origin}/?school=${schoolCode}`;

      if (Capacitor.isNativePlatform()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (data?.url) {
          await Browser.open({ url: data.url });
        } else {
          throw new Error('Google Sign-In URL not found.');
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl
          }
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || 'Failed to initialize Google Login.');
      setLoading(false);
    }
  };

  // Final evaluation for recovery Q&A
  const handleEvaluateQARecovery = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (qaQuestions.length === 5 && Object.keys(qaAnswers).length < 5) {
        throw new Error('Please answer all 5 questions first.');
      }
      const isPasswordRec = step === 62;
      if (isPasswordRec) {
        if (newRecoveryPassword !== confirmRecoveryPassword) throw new Error('Passwords do not match');
        if (newRecoveryPassword.length < 6) throw new Error('Password must be at least 6 characters');
      }
      const data = await invokeEdgeFn('submit-recovery-answers', {
        sessionId: qaSessionId, answers: qaAnswers,
        newPassword: isPasswordRec ? newRecoveryPassword : null
      });
      if (isPasswordRec) {
        setSuccess('Password updated successfully! Redirecting you to login...');
        setTimeout(() => { setSuccess(''); setStep(2); }, 3000);
      } else {
        setSuccess(`Your Username is: ${data.username}`);
        setUsername(data.username);
        setStep(2);
        setTimeout(() => setSuccess(''), 10000);
      }
    } catch (err) {
      if (err.message.includes('aborted') || err.message.includes('Class Teacher')) {
        setError('Verification Failed. Please contact your Class Teacher to reset your password.');
        setQaQuestions([]);
        return;
      }
      setError(err.message);
      if (err.incorrectQuestions) setQaIncorrectList(err.incorrectQuestions);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PIN RECOVERY — Password
  // ─────────────────────────────────────────────────────────────────────────
  const handlePinRecoverPassword = async (e) => {
    e.preventDefault();
    if (pinNewPassword !== pinConfirmPassword) { setError('Passwords do not match.'); return; }
    if (pinNewPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await invokeEdgeFn('pin-recovery-verify', {
        credential_type: 'password',
        username: username,
        school_code: schoolCode,
        pin: recoveryPin,
        dob: recoveryDob || null,
        contact: recoveryContact.trim() || null,
        newPassword: pinNewPassword
      });
      setSuccess('✅ Password updated successfully! Please login with your new password.');
      setPinNewPassword(''); setPinConfirmPassword(''); setRecoveryPin(''); setPinVerified(false);
      setTimeout(() => { setSuccess(''); setStep(2); }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 1 of 2-step flow: Verify identity details first (dry-run)
  const handleVerifyPinDetails = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Call with dryRun: true — backend verifies PIN but does NOT reset password
      await invokeEdgeFn('pin-recovery-verify', {
        credential_type: 'password',
        username: username,
        school_code: schoolCode,
        pin: recoveryPin,
        dob: recoveryDob || null,
        contact: recoveryContact.trim() || null,
        dryRun: true
      });
      setPinVerified(true);
      setSuccess('✅ Identity verified! Now set your new password below.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // PIN RECOVERY — Username
  const handlePinRecoverUsername = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('pin-recovery-verify', {
        credential_type: 'username',
        name: recoveryName,
        role: recoveryRole,
        school_code: schoolCode,
        pin: recoveryPin,
        dob: recoveryDob || null,
        contact: recoveryContact.trim() || null
      });
      setSuccess(`✅ Your Username is: ${data.username}`);
      setUsername(data.username);
      setTimeout(() => { setSuccess(''); setStep(2); }, 8000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // COLLEAGUE TOKEN LOGIN (Step 10)
  const handleColleagueTokenLogin = async (e) => {
    e.preventDefault();
    if (colleagueNewPassword !== colleagueConfirmPassword) { setError('Passwords do not match.'); return; }
    if (colleagueNewPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await invokeEdgeFn('colleague-token-login', {
        token: colleagueToken.trim(),
        newPassword: colleagueNewPassword
      });
      setSuccess('✅ Password reset successfully! Please login with your new password.');
      setColleagueToken(''); setColleagueNewPassword(''); setColleagueConfirmPassword('');
      setTimeout(() => { setSuccess(''); setStep(2); }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // QR SYNC — PC side (no user logged in, anonymous QR for old Flow / or enter 6-digit from mobile)
  // ─────────────────────────────────────────────────────────────────────────
  const handleInitiateQrSync = async () => {
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('qr-generate', {});
      setQrToken(data.qrToken);
      setStep(7);

      let delay = 5000; // start at 5 seconds
      const maxTime = 90000; // 90 seconds timeout
      let elapsed = 0;
      let timerId = null;

      const poll = async () => {
        try {
          const status = await invokeEdgeFn('qr-poll', { qrToken: data.qrToken });
          if (status.expired) {
            setError('QR session expired. Please refresh.');
            return;
          } else if (status.verified) {
            if (status.requiresPasswordChange) {
              setPendingMagicLink(status.loginUrl);
              setStep(9);
            } else {
              setSuccess('Device verified! Logging you in...');
              window.location.href = status.loginUrl;
            }
            return;
          }
        } catch (e) {
          console.error(e);
        }

        // Increment elapsed time and check if timeout reached
        elapsed += delay;
        if (elapsed >= maxTime) {
          setError('QR session timed out. Please try again.');
          return;
        }

        // Apply backoff: increase delay by 1.5x, up to a maximum of 15 seconds
        delay = Math.min(delay * 1.5, 15000);

        // Schedule next poll
        timerId = setTimeout(poll, delay);
        setQrPollInterval(timerId);
      };

      // Start the first poll after 5 seconds
      timerId = setTimeout(poll, delay);
      setQrPollInterval(timerId);
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const performSyncLogin = async (data) => {
    let tokenHash = data.tokenHash;
    if (!tokenHash && data.loginUrl) {
      try {
        const parsedUrl = new URL(data.loginUrl);
        tokenHash = parsedUrl.searchParams.get('token') || '';
      } catch (e) {
        console.error('Failed to parse token from loginUrl:', e);
      }
    }

    if (!tokenHash) {
      throw new Error('Failed to retrieve authentication token.');
    }

    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink'
    });

    if (authError) throw authError;
    if (!authData?.user) {
      throw new Error('Verification failed: No user session returned.');
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, school_id, name, class, avatar_url, avatar_file_id, hide_avatar_from_class')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      throw new Error('Could not load your profile. Please contact your administrator.');
    }

    // Load school settings
    if (profile.role !== 'platform_admin') {
      const { data: settings, error: settingsError } = await supabase
        .from('school_settings')
        .select('*')
        .eq('school_id', profile.school_id)
        .single();
      if (settingsError || !settings) {
        await supabase.auth.signOut();
        throw new Error('Could not load school settings for your account.');
      }
      setSchoolSettings(settings);
    } else {
      setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
    }

    // Set show sync password reset key in local storage & dispatch event
    localStorage.setItem('show_sync_password_reset', 'true');
    window.dispatchEvent(new Event('sync_login_success'));

    // Set user and role, and navigate to dashboard
    const enrichedUser = { 
      ...authData.user, 
      class: profile.class || null,
      avatar_url: profile.avatar_url || null,
      avatar_file_id: profile.avatar_file_id || null,
      hide_avatar_from_class: !!profile.hide_avatar_from_class
    };
    setUserAndRole(enrichedUser, profile.role);
    navigate(profile.role === 'platform_admin' ? '/platform-admin' : `/${profile.role}`, { replace: true });
  };

  // PC enters 6-digit code from Mobile (Flow B)
  const handlePcCodeLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('qr-pc-login', { displayCode: qrSyncCode.trim() });
      setSuccess('Logging you in...');
      await performSyncLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Mobile user: enter 6-digit code from PC (Flow A) — shows on mobile login screen
  const handleMobileCodeLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('qr-mobile-login', {
        displayCode: mobileQrCode.trim()
      });
      setSuccess('Logging you in...');
      await performSyncLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Mobile user: successfully scanned QR code (Flow A)
  const handleMobileScannedCode = async (token) => {
    setLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('qr-mobile-login', {
        qrToken: token
      });
      setSuccess('Logging you in...');
      await performSyncLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 9: Forced password change after QR login
  const handleQrForcePasswordChange = async (e) => {
    e.preventDefault();
    if (qrForceNewPassword !== qrForceConfirmPassword) { setError('Passwords do not match.'); return; }
    if (qrForceNewPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      // First complete the magic link login
      if (pendingMagicLink) {
        const url = new URL(pendingMagicLink);
        const tokenHash = url.searchParams.get('token') || url.hash.replace('#', '').split('&')
          .find(p => p.startsWith('access_token='))?.replace('access_token=', '');
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: url.searchParams.get('token') || '',
          type: 'magiclink'
        });
        if (verifyErr) {
          // Try direct redirect approach — navigate to magic link then update password
          window.location.href = pendingMagicLink;
          return;
        }
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: qrForceNewPassword });
      if (updateErr) throw updateErr;
      setSuccess('Password updated! Taking you to your dashboard...');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('users').select('role, school_id, class, avatar_url, avatar_file_id, hide_avatar_from_class').eq('id', user.id).single();
        if (profile) {
          const enrichedUser = { 
            ...user, 
            class: profile.class || null,
            avatar_url: profile.avatar_url || null,
            avatar_file_id: profile.avatar_file_id || null,
            hide_avatar_from_class: !!profile.hide_avatar_from_class
          };
          setUserAndRole(enrichedUser, profile.role);
          navigate(`/${profile.role}`, { replace: true });
        }
      }
    } catch (err) {
      // If magic link approach fails, send them to the link directly
      if (pendingMagicLink) {
        setSuccess('Redirecting you to complete login...');
        setTimeout(() => { window.location.href = pendingMagicLink; }, 1500);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!isMobileOrPWA()) return;
    setLoading(true);
    setError('');
    try {
      const startData = await invokeEdgeFn('webauthn-start', { action: 'authenticate', username });
      const { options, sessionKey } = startData;
      
      let passkeyResponse;
      if (Capacitor.isNativePlatform()) {
        passkeyResponse = await CapacitorPasskey.getCredential({ publicKey: options, mediation: 'optional' });
      } else {
        passkeyResponse = await authenticateWebAuthnWeb(options);
      }

      const verifyData = await invokeEdgeFn('webauthn-verify', {
        action: 'authentication', sessionKey, response: passkeyResponse
      });
      const { data: authData, error: authError } = await supabase.auth.verifyOtp({
        token_hash: verifyData.token_hash, type: 'magiclink'
      });
      if (authError) throw authError;
      const { data: profile } = await supabase.from('users').select('role, school_id, class, avatar_url, avatar_file_id, hide_avatar_from_class').eq('id', authData.user.id).single();
      const enrichedUser = { 
        ...authData.user, 
        class: profile?.class || null,
        avatar_url: profile?.avatar_url || null,
        avatar_file_id: profile?.avatar_file_id || null,
        hide_avatar_from_class: !!profile?.hide_avatar_from_class
      };
      setUserAndRole(enrichedUser, profile.role);
      navigate(`/${profile.role}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Biometric verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED UI HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  const MethodPicker = ({ onQuestions, onPin, onEmail, showEmail, questionLabel, pinLabel, emailLabel }) => (
    <div className="space-y-3 mb-4">
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Choose Recovery Method:</p>
      {showEmail && (
        <button
          type="button"
          onClick={onEmail}
          className="w-full py-3 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-indigo-300 transition-all"
        >
          <span>✉️ {emailLabel || 'Get Password Reset Email'}</span>
          <ChevronRight size={15} />
        </button>
      )}
      <button
        type="button"
        onClick={onQuestions}
        className="w-full py-3 px-4 bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/30 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200 transition-all"
      >
        <span>📋 {questionLabel}</span>
        <ChevronRight size={15} />
      </button>
      <button
        type="button"
        onClick={onPin}
        className="w-full py-3 px-4 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-emerald-300 transition-all"
      >
        <span>🔢 {pinLabel}</span>
        <ChevronRight size={15} />
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(800px 400px at 30% 20%, rgba(124, 58, 237, 0.15), transparent), linear-gradient(180deg, #0b1020 0%, #061233 100%)' }}
    >
      <div className="mb-8 text-center relative z-10">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl border border-white/10 overflow-hidden"
          style={{ background: globalApp.logo ? 'transparent' : 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          {globalApp.logo ? (
             <img src={globalApp.logo} alt="Global Logo" className="w-full h-full object-contain" />
          ) : (
             <SchoolIcon size={32} className="text-white" />
          )}
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          {step === 2 && schoolSettings?.name ? schoolSettings.name : globalApp.name}
        </h1>
        <p className="text-slate-400 text-sm mt-1 font-medium">Digital School Workspace</p>
      </div>

      <div className="w-full max-w-md relative z-10 sp-card shadow-2xl">
        {error && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 font-semibold">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-300 font-semibold">{success}</p>
          </div>
        )}

        {/* ── 1. School Code ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="fade-in">
            <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight mb-5">Enter School Code</h2>
            
            {/* Quick account switch list */}
            {savedAccounts.length > 0 && (
              <div className="mb-6 border-b border-slate-800/80 pb-6">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Continue with Saved Account</div>
                <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                  {savedAccounts.map(acc => (
                    <button
                      key={acc.user_id}
                      type="button"
                      onClick={() => handleSwitchAccount(acc)}
                      disabled={loading}
                      className="w-full p-3 bg-slate-950/60 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 rounded-xl transition-all flex items-center justify-between text-left group disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-200 text-xs truncate">{acc.name}</div>
                        <div className="text-[9px] text-slate-500 font-semibold truncate uppercase mt-0.5">
                          {acc.role} • {acc.school_name}
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-slate-500 group-hover:text-white transition-colors" />
                    </button>
                  ))}
                </div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center mt-5">Or enter details below</div>
              </div>
            )}
            <form onSubmit={handleIdentifySchool} className="space-y-5">
              <input type="text" required value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                className="sp-input text-center text-2xl font-black tracking-[0.3em]"
                placeholder="DEMO01" autoFocus />
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
              </button>
            </form>
            <div className="flex flex-col gap-2.5 mt-5">
              <button onClick={() => setStep(4)} className="text-xs font-bold text-slate-400 hover:text-indigo-400 uppercase tracking-widest transition-colors block text-center w-full">
                Forgot School Code?
              </button>
              <button onClick={() => navigate('/register')} className="text-xs font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors block text-center w-full">
                Register Your School
              </button>
            </div>
          </div>
        )}

        {/* ── 2. Login ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="fade-in">
            <button onClick={() => { setStep(1); setSchoolSettings(null); }} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors mb-7 uppercase tracking-widest">
              <ArrowLeft size={12} /> Change School
            </button>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Username</label>
                <input id="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="sp-input pl-4" placeholder="e.g. admin or teacher" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="sp-input pl-4 pr-11" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <button type="button" onClick={() => setStep(3)} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">
                  Login Help / Forgot Account
                </button>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
              </button>
            </form>

            <div className="relative flex py-3 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Or</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              disabled={loading} 
              className="w-full py-3.5 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm font-black text-slate-800 dark:text-white transition-all shadow-md active:scale-[0.98]"
            >
              <svg className="w-5 h-5 mr-1" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.59 5.59 0 0 1-2.42 3.7v3.08h3.92c2.28-2.1 3.55-5.19 3.55-8.63z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.92-3.08c-1.08.73-2.48 1.17-4.04 1.17-3.11 0-5.74-2.11-6.68-4.96H1.21v3.18C3.18 21.88 7.31 24 12 24z" />
                <path fill="#FBBC05" d="M5.32 14.22A7.16 7.16 0 0 1 4.9 12c0-.79.13-1.57.41-2.22V6.6H1.21A11.94 11.94 0 0 0 0 12c0 2.22.6 4.3 1.66 6.1l3.66-2.88z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.18 2.12 1.21 6.6l4.11 3.18c.94-2.85 3.57-4.96 6.68-4.96z" />
              </svg>
              Login with Google
            </button>
            {isMobileOrPWA() && (
              <button onClick={handleBiometricLogin} className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold rounded-xl border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 transition-colors mt-4">
                <Fingerprint size={18} /> Biometric Login
              </button>
            )}
          </div>
        )}

        {/* ── 3. Account Help & Recovery Menu ───────────────────── */}
        {step === 3 && (
          <div className="fade-in space-y-4">
            <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back to Login
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-2">Login Help</h3>
            
            {/* Top level Reset Password via Email */}
            <button onClick={() => { setError(''); setStep(64); }} className="w-full py-3.5 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-indigo-300">
              <span>✉️ Reset Password via Email</span>
              <ChevronRight size={16} />
            </button>

            {/* Top level Reset Password via PIN */}
            <button onClick={() => { setError(''); setStep(63); }} className="w-full py-3.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-emerald-300">
              <span>🔢 Reset Password via Recovery PIN</span>
              <ChevronRight size={16} />
            </button>

            {/* Top level Reset Password via Security Questions */}
            <button onClick={() => { setError(''); setStep(6); }} className="w-full py-3.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200">
              <span>📋 Reset Password via Security Questions</span>
              <ChevronRight size={16} />
            </button>

            <button onClick={() => { setError(''); setStep(5); }} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200">
              <span>👤 Forgot Username?</span>
              <ChevronRight size={16} />
            </button>

            <button onClick={() => { setError(''); setStep(4); }} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200">
              <span>🏫 Forgot School Code?</span>
              <ChevronRight size={16} />
            </button>

            {/* Flow B: PC enters 6-digit code generated on Mobile */}
            {!Capacitor.isNativePlatform() && (
              <button onClick={() => { setError(''); setQrSyncCode(''); setStep(7); }} className="w-full py-3 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-indigo-300">
                <span>📷 Scan QR / Enter Code to Login (Only for Admin)</span>
                <ChevronRight size={16} />
              </button>
            )}

            {/* Flow A: Mobile scans QR or enters code from PC */}
            {Capacitor.isNativePlatform() && (
              <button onClick={() => { setError(''); setMobileQrCode(''); setStep(8); }} className="w-full py-3 px-4 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-violet-300">
                <span>📷 Scan QR / Enter Code to Login (Only for Admin)</span>
                <ChevronRight size={16} />
              </button>
            )}

            {/* Colleague token option */}
            <button onClick={() => { setError(''); setColleagueToken(''); setColleagueNewPassword(''); setColleagueConfirmPassword(''); setStep(10); }} className="w-full py-3 px-4 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-teal-300">
              <span>🤝 Use Colleague Reset Token</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── 4. Recover School Code ────────────────────────────── */}
        {step === 4 && (
          <form onSubmit={handleRecoverSchoolCode} className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Find School Code</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Your Role</label>
              <select value={recoveryRole} onChange={e => setRecoveryRole(e.target.value)} className="sp-input text-sm">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff Member</option>
                <option value="driver">Bus Driver</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</label>
              <input type="text" required value={recoveryName} onChange={e => setRecoveryName(e.target.value)} className="sp-input" placeholder="As registered in school records" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Contact Number</label>
                <input type="tel" value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Mobile Number" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date of Birth</label>
                <input type="date" value={recoveryDob} onChange={e => setRecoveryDob(e.target.value)} className="sp-input text-sm" />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 ml-1">Provide at least one: Registered Contact Number or Date of Birth.</p>
            <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
              {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
            </button>
          </form>
        )}

        {/* ── 42. School Code Challenge ─────────────────────────── */}
        {step === 42 && (
          <div className="fade-in space-y-4">
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-2">School Verification</h3>
            <p className="text-xs text-slate-300 font-semibold mb-4">{qaQuestions[0]?.question}</p>
            <div className="space-y-3">
              {qaQuestions[0]?.options.map((opt, i) => (
                <button key={i} onClick={() => handleSubmitSchoolCodeChallenge(opt)} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold text-slate-200">
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Forgot Username — method picker ─────────── */}
        {step === 5 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Recover Username</h3>
            <MethodPicker
              onQuestions={() => setStep(51)}
              onPin={() => setStep(53)}
              onEmail={() => setStep(54)}
              showEmail={true}
              questionLabel="Answer 5 Identity Questions"
              pinLabel="Use My 6-Digit Recovery PIN (Quick)"
              emailLabel="Send Username to Email"
            />
          </div>
        )}

        {/* ── 51. Forgot Username — Q&A form ─────────── */}
        {step === 51 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Recover Username (Questions)</h3>
            <form onSubmit={handleRecoverUsername} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">School Code</label>
                <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} className="sp-input text-center text-lg font-black tracking-widest" placeholder="DEMO01" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Password</label>
                <input type="password" required value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} className="sp-input" placeholder="Enter password to cross-verify" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</label>
                <input type="text" required value={recoveryName} onChange={e => setRecoveryName(e.target.value)} className="sp-input" placeholder="Registered full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date of Birth</label>
                  <input type="date" value={recoveryDob} onChange={e => setRecoveryDob(e.target.value)} className="sp-input text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mobile Number</label>
                  <input type="tel" value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Registered number" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500">Provide at least one: Date of Birth or Contact Number.</p>
              <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Identity'}
              </button>
            </form>
          </div>
        )}

        {/* ── 53. Username PIN Recovery ─────────────────────────── */}
        {step === 53 && (
          <form onSubmit={handlePinRecoverUsername} className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Quick Username Recovery</h3>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 font-semibold">
              🔢 Enter your 6-digit Recovery PIN to instantly find your username.
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">School Code</label>
              <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} className="sp-input text-center font-black tracking-widest" placeholder="DEMO01" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Your Role</label>
              <select value={recoveryRole} onChange={e => setRecoveryRole(e.target.value)} className="sp-input text-sm">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff Member</option>
                <option value="driver">Bus Driver</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</label>
              <input type="text" required value={recoveryName} onChange={e => setRecoveryName(e.target.value)} className="sp-input" placeholder="Registered full name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date of Birth</label>
                <input type="date" value={recoveryDob} onChange={e => setRecoveryDob(e.target.value)} className="sp-input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mobile Number</label>
                <input type="tel" value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Registered number" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">6-Digit Recovery PIN</label>
              <input type="password" inputMode="numeric" maxLength={6} required value={recoveryPin}
                onChange={e => setRecoveryPin(e.target.value.replace(/\D/g, ''))}
                className="sp-input text-center text-xl tracking-[0.3em] font-black" placeholder="••••••" />
            </div>
            <p className="text-[10px] text-slate-500">Provide at least one: Date of Birth or Contact Number.</p>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Find My Username'}
            </button>
          </form>
        )}

        {/* ── 54. Forgot Username — Email form ─────────── */}
        {step === 54 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Recover Username (Email)</h3>
            <form onSubmit={handleRecoverUsernameByEmail} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Registered Email</label>
                <input type="email" required value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} className="sp-input" placeholder="Enter registered email" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Contact Number</label>
                <input type="tel" required value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Registered contact number" />
              </div>
              <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Username'}
              </button>
            </form>
          </div>
        )}

        {/* ── 6. Forgot Password — method picker ─────────── */}
        {step === 6 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Reset Password</h3>
            <MethodPicker
              onQuestions={() => setStep(61)}
              onPin={() => setStep(63)}
              onEmail={() => setStep(64)}
              showEmail={true}
              questionLabel="Answer 5 Identity Questions"
              pinLabel="Use My 6-Digit Recovery PIN (Quick)"
              emailLabel="Send Reset Link to Email (GoTrue)"
            />
          </div>
        )}

        {/* ── 61. Forgot Password — Q&A form ─────────── */}
        {step === 61 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(6)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Reset Password (Questions)</h3>
            <form onSubmit={handleRecoverPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Username</label>
                <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="sp-input" placeholder="Enter username" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">School Code</label>
                <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} className="sp-input text-center text-lg font-black tracking-widest" placeholder="DEMO01" />
              </div>
              <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Get Recovery Questions'}
              </button>
            </form>
          </div>
        )}

        {/* ── 64. Password Reset Link (Email) ─────────────────────── */}
        {step === 64 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(6)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Reset Password via Email</h3>
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 font-semibold leading-relaxed">
              ✉️ Enter your registered username or email address, and we will send a password reset link to your verified recovery email.
            </div>

            {(() => {
              const { dailyRemaining, weeklyRemaining } = getPasswordResetQuota();
              const isBlocked = dailyRemaining <= 0 || weeklyRemaining <= 0;
              return (
                <div className="space-y-4">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-[11px] font-semibold text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Remaining resets today:</span>
                      <span className={dailyRemaining === 0 ? "text-red-400 font-bold" : "text-indigo-400 font-bold"}>
                        {dailyRemaining} / 2
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Remaining resets this week:</span>
                      <span className={weeklyRemaining === 0 ? "text-red-400 font-bold" : "text-indigo-400 font-bold"}>
                        {weeklyRemaining} / 5
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-amber-500 font-semibold leading-relaxed">
                    ⚠️ Warning: Repeatedly requesting reset links will lead to your email address being temporarily blocked by the SMTP server.
                  </p>

                  <form onSubmit={handleEmailPasswordReset} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Username or Email</label>
                      <input 
                        type="text" 
                        required 
                        disabled={isBlocked}
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        className="sp-input" 
                        placeholder={isBlocked ? "Quota exceeded" : "Enter your username or email"} 
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={forgotLoading || isBlocked} 
                      className="btn-primary w-full py-3.5 flex items-center justify-center font-bold"
                    >
                      {isBlocked ? 'Resets Limit Exceeded' : (forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link')}
                    </button>
                  </form>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── 63. Password PIN Recovery (2-Step Flow) ─────────────── */}
        {step === 63 && (
          <div className="fade-in space-y-4">
            <button type="button" onClick={() => { setStep(6); setPinVerified(false); }} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Quick Password Reset</h3>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 font-semibold">
              🔢 Use your Recovery PIN to instantly reset your password — no questions needed!
            </div>

            {/* STEP 1: Verify identity details */}
            {!pinVerified ? (
              <form onSubmit={handleVerifyPinDetails} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Username</label>
                  <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="sp-input" placeholder="Your username" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">School Code</label>
                  <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} className="sp-input text-center font-black tracking-widest" placeholder="DEMO01" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date of Birth</label>
                    <input type="date" value={recoveryDob} onChange={e => setRecoveryDob(e.target.value)} className="sp-input text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mobile Number</label>
                    <input type="tel" value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Registered number" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">6-Digit Recovery PIN</label>
                  <input type="password" inputMode="numeric" maxLength={6} required value={recoveryPin}
                    onChange={e => setRecoveryPin(e.target.value.replace(/\D/g, ''))}
                    className="sp-input text-center text-xl tracking-[0.3em] font-black" placeholder="••••••" />
                </div>
                <p className="text-[10px] text-slate-500">Provide at least one: Date of Birth or Contact Number.</p>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Shield size={16} /> Verify My Details</>}
                </button>
              </form>
            ) : (
              /* STEP 2: Set new password (only visible after verification) */
              <form onSubmit={handlePinRecoverPassword} className="space-y-4 fade-in">
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-bold text-center">
                  ✅ Identity Verified — now set your new password
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Password</label>
                  <input type="password" required value={pinNewPassword} onChange={e => setPinNewPassword(e.target.value)} className="sp-input mb-3" placeholder="New Password (min 6 chars)" />
                  <input type="password" required value={pinConfirmPassword} onChange={e => setPinConfirmPassword(e.target.value)} className="sp-input" placeholder="Confirm New Password" />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Key size={16} /> Reset My Password</>}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── 52 & 62. Sequential 5-Question Recovery Wizard ──────── */}
        {(step === 52 || step === 62) && qaQuestions.length > 0 && (
          <div className="fade-in space-y-4">
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-2">Identity Verification</h3>
            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Question {currentQaIndex + 1} of 5</div>
            <p className="text-xs font-semibold text-slate-200 mt-2 mb-4">{qaQuestions[currentQaIndex]?.question}</p>

            {qaQuestions[currentQaIndex]?.options && qaQuestions[currentQaIndex]?.options.length > 0 ? (
              <div className="space-y-3">
                {qaQuestions[currentQaIndex].options.map((opt, i) => (
                  <button key={i}
                    onClick={() => {
                      setQaAnswers({ ...qaAnswers, [qaQuestions[currentQaIndex].id]: opt });
                      if (currentQaIndex < 4) setCurrentQaIndex(currentQaIndex + 1);
                    }}
                    className={`w-full py-3 px-4 border rounded-xl text-left text-sm font-semibold transition-all ${
                      qaAnswers[qaQuestions[currentQaIndex].id] === opt
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                        : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                    }`}
                  >{opt}</button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <input type="text"
                  value={qaAnswers[qaQuestions[currentQaIndex].id] || ''}
                  onChange={e => setQaAnswers({ ...qaAnswers, [qaQuestions[currentQaIndex].id]: e.target.value })}
                  className="sp-input" placeholder="Type your answer here..." />
                <button onClick={() => { if (currentQaIndex < 4) setCurrentQaIndex(currentQaIndex + 1); }}
                  className="btn-primary w-full py-2.5 text-xs font-bold">Save &amp; Next</button>
              </div>
            )}

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
              <button disabled={currentQaIndex === 0} onClick={() => setCurrentQaIndex(currentQaIndex - 1)}
                className="text-xs text-slate-500 hover:text-slate-300 font-semibold disabled:opacity-30">Previous</button>
              <button disabled={currentQaIndex === 4} onClick={() => setCurrentQaIndex(currentQaIndex + 1)}
                className="text-xs text-slate-500 hover:text-slate-300 font-semibold disabled:opacity-30">Next</button>
            </div>

            {Object.keys(qaAnswers).length === 5 && (
              <form onSubmit={handleEvaluateQARecovery} className="space-y-4 pt-4 border-t border-white/10">
                {step === 62 && (
                  <>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Create New Password</h4>
                    <input type="password" required value={newRecoveryPassword} onChange={e => setNewRecoveryPassword(e.target.value)} className="sp-input text-sm" placeholder="New Password (min 6 chars)" />
                    <input type="password" required value={confirmRecoveryPassword} onChange={e => setConfirmRecoveryPassword(e.target.value)} className="sp-input text-sm" placeholder="Confirm New Password" />
                  </>
                )}
                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Answers'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── 7. PC QR/Code Screen (Flow B: enter 6-digit from Mobile) ── */}
        {step === 7 && (
          <div className="fade-in space-y-4">
            <button onClick={() => { setStep(3); setQrSyncCode(''); }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Cancel
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Sync Login with Mobile</h3>

            {/* Flow B: Enter 6-digit code generated on mobile */}
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-3">
              <p className="text-xs font-bold text-indigo-300">📱 Have your Mobile App open? Enter the 6-digit code shown there:</p>
              <form onSubmit={handlePcCodeLogin} className="flex gap-2 items-center">
                <input type="text" inputMode="numeric" maxLength={6} value={qrSyncCode}
                  onChange={e => setQrSyncCode(e.target.value.replace(/\D/g, ''))}
                  className="sp-input text-center text-xl font-black tracking-[0.3em] flex-1 min-w-0" placeholder="000000" />
                <button type="submit" disabled={loading || qrSyncCode.length < 6} className="btn-primary px-4 py-2 font-bold w-auto shrink-0" style={{ width: 'auto' }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── 8. Mobile Login: Live QR Scanner (Flow A) ── */}
        {step === 8 && Capacitor.isNativePlatform() && (
          <div className="fade-in space-y-4">
            <button type="button"
              onClick={() => { setStep(3); setMobileQrCode(''); setScannerActive(false); setScannerPermError(false); }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Scan QR Code from PC</h3>

            {/* ── Live QR Scanner ── */}
            {!scannerActive ? (
              <div className="space-y-3">
                {/* Start Scanner Button */}
                <button
                  type="button"
                  onClick={handleStartLiveScan}
                  className="w-full py-8 bg-violet-500/10 hover:bg-violet-500/20 active:bg-violet-500/25 border-2 border-dashed border-violet-500/40 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all"
                >
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                      <QrCode size={40} className="text-violet-400" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    </div>
                  </div>
                  <span className="text-base font-bold text-violet-300">📷 Tap to Start Scanner</span>
                  <span className="text-[11px] text-slate-400 text-center px-6">Live camera — point at QR on PC screen. Auto-detects instantly.</span>
                </button>

                {/* Permission error helper */}
                {scannerPermError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 font-semibold">
                    ⚠️ Camera permission denied. Go to <strong>Settings → Apps → SchoolOS+ → Permissions → Camera → Allow</strong>.
                  </div>
                )}

                {/* Hint */}
                <div className="p-3 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                  <p className="text-[10px] text-violet-300/70 font-semibold text-center">
                    💡 On PC: Open SchoolOS+ → Settings → Sync Login to see the QR code
                  </p>
                </div>
              </div>
            ) : (
              /* ── LIVE VIDEO SCANNER VIEW ── */
              <div>
                <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '1/1' }}>
                  {/* Live camera feed */}
                  <video
                    id="qr-scanner-video"
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />

                  {/* Dark overlay with transparent scanning window */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'linear-gradient(rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.5) 100%)'
                  }} />
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.5) 100%)'
                  }} />

                  {/* Scanning frame with corner brackets */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative w-56 h-56">
                      {/* Corner: top-left */}
                      <div className="absolute top-0 left-0 w-9 h-9 border-t-4 border-l-4 border-violet-400 rounded-tl-xl" />
                      {/* Corner: top-right */}
                      <div className="absolute top-0 right-0 w-9 h-9 border-t-4 border-r-4 border-violet-400 rounded-tr-xl" />
                      {/* Corner: bottom-left */}
                      <div className="absolute bottom-0 left-0 w-9 h-9 border-b-4 border-l-4 border-violet-400 rounded-bl-xl" />
                      {/* Corner: bottom-right */}
                      <div className="absolute bottom-0 right-0 w-9 h-9 border-b-4 border-r-4 border-violet-400 rounded-br-xl" />
                      {/* Animated scanning line */}
                      <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-violet-400 to-transparent rounded-full qr-scan-line" />
                    </div>
                  </div>

                  {/* Top label */}
                  <div className="absolute top-3 left-0 right-0 flex justify-center">
                    <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5 flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-[11px] text-white/90 font-bold tracking-wide">Scanning...</span>
                    </div>
                  </div>

                  {/* Bottom hint */}
                  <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/70 font-semibold">
                    Point camera at the QR code on your PC screen
                  </p>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => { setScannerActive(false); setError(''); }}
                    className="absolute top-3 right-3 w-8 h-8 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white z-10"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Loading indicator while setting up stream */}
                <p className="text-center text-[10px] text-slate-500 font-semibold mt-2">
                  Hold phone steady — auto-detects when QR is in frame
                </p>
              </div>
            )}

            {/* ── Divider ── */}
            {!scannerActive && (
              <>
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Or enter code manually</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Manual 6-digit code entry */}
                <form onSubmit={handleMobileCodeLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">6-Digit Code from PC Screen</label>
                    <input type="text" inputMode="numeric" maxLength={6} value={mobileQrCode}
                      onChange={e => setMobileQrCode(e.target.value.replace(/\D/g, ''))}
                      className="sp-input text-center text-2xl font-black tracking-[0.4em]" placeholder="000000" />
                    <p className="text-[10px] text-slate-500 mt-2">Open SchoolOS+ on PC → Account Help → Sync Login → enter the 6-digit code shown.</p>
                  </div>
                  <button type="submit" disabled={loading || mobileQrCode.length < 6} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold gap-2">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Smartphone size={16} /> Login with Code</>}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* ── 9. Forced Password Change after QR Login ─────────── */}
        {step === 9 && (
          <form onSubmit={handleQrForcePasswordChange} className="fade-in space-y-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-amber-500/20 border border-amber-500/30">
                <Shield size={24} className="text-amber-400" />
              </div>
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Update Your Password</h3>
              <p className="text-xs text-slate-400 mt-1">For your security, please set a new password before continuing.</p>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 font-semibold">
              🔐 You logged in using a QR/Sync code. This is a one-time login — please create a proper password now.
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Password</label>
              <input type="password" required value={qrForceNewPassword} onChange={e => setQrForceNewPassword(e.target.value)}
                className="sp-input" placeholder="Create a strong password" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Confirm Password</label>
              <input type="password" required value={qrForceConfirmPassword} onChange={e => setQrForceConfirmPassword(e.target.value)}
                className="sp-input" placeholder="Confirm new password" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 size={16} /> Save &amp; Continue</>}
            </button>
          </form>
        )}

        {/* ── 10. Colleague Token Login ─────────────────────── */}
        {step === 10 && (
          <form onSubmit={handleColleagueTokenLogin} className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <div className="text-center mb-2">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-teal-500/20 border border-teal-500/30">
                <span className="text-2xl">🤝</span>
              </div>
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Colleague Reset Token</h3>
              <p className="text-xs text-slate-400 mt-1">A colleague generated a one-time 6-digit code for you.</p>
            </div>
            <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-300 font-semibold">
              🤝 Ask your teacher/staff colleague to go to <em>Settings → Assist a Colleague</em> and generate a token for your username.
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">6-Digit Token from Colleague</label>
              <input type="text" inputMode="numeric" maxLength={6} required value={colleagueToken}
                onChange={e => setColleagueToken(e.target.value.replace(/\D/g, ''))}
                className="sp-input text-center text-2xl font-black tracking-[0.4em]" placeholder="000000" />
            </div>
            <div className="border-t border-white/5 pt-4 space-y-3">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Set New Password</label>
              <input type="password" required value={colleagueNewPassword} onChange={e => setColleagueNewPassword(e.target.value)}
                className="sp-input" placeholder="New Password (min 6 chars)" />
              <input type="password" required value={colleagueConfirmPassword} onChange={e => setColleagueConfirmPassword(e.target.value)}
                className="sp-input" placeholder="Confirm New Password" />
            </div>
            <button type="submit" disabled={loading || colleagueToken.length < 6} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Key size={16} /> Reset My Password</>}
            </button>
          </form>
        )}
      </div>

      <div className="relative z-10 text-center mt-8 space-y-3">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">SchoolOS+ Multi-Tenant Platform</p>
      </div>
    </div>
  );
}
