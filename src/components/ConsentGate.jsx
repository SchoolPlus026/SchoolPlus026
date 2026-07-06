import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { ShieldCheck, ShieldAlert, LogOut, Loader2, Check, X, FileText } from 'lucide-react';

export default function ConsentGate({ onAccept }) {
  const { user, role, schoolSettings, platformSettings, clearSession } = useAppStore();
  const [agreePolicies, setAgreePolicies] = useState(false);
  const [agreeRoster, setAgreeRoster] = useState(false);
  const [agreeGps, setAgreeGps] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // State to manage policy viewing modal
  const [activePolicyDoc, setActivePolicyDoc] = useState(null); // 'terms' | 'privacy' | 'refund' | null

  const isDriver = role === 'driver';
  const isAdmin = role === 'admin';
  const schoolName = schoolSettings?.name || 'my School Administrator';
  const suffix = (role || '').toLowerCase();
  
  const getRolePolicyText = (type) => {
    if (!platformSettings) return '';
    const resolvedSuffix = suffix === 'teacher' ? 'teacher' : 
                           suffix === 'student' ? 'student' : 
                           suffix === 'driver' ? 'driver' : 
                           suffix === 'staff' ? 'staff' : 'admin';
                           
    if (type === 'terms') {
      return platformSettings[`terms_${resolvedSuffix}`] || platformSettings?.terms_conditions || 'Terms and Conditions placeholder text...';
    }
    if (type === 'privacy') {
      return platformSettings[`privacy_${resolvedSuffix}`] || platformSettings?.privacy_policy || 'Privacy Policy placeholder text...';
    }
    if (type === 'disclaimer') {
      return platformSettings[`disclaimer_${resolvedSuffix}`] || '';
    }
    if (type === 'gps') {
      return platformSettings?.disclaimer_driver_gps || 'I consent to the recording and real-time broadcasting of my GPS coordinates while active on designated school routes.';
    }
    return '';
  };

  const termsText = getRolePolicyText('terms');
  const refundText = platformSettings?.refund_policy || 'Refund Policy placeholder text...';
  
  const defaultDisclaimer = isAdmin
    ? 'I acknowledge that as the School Administrator (Data Controller), I am responsible for onboarding users and managing the school records under this tenant. SchoolOS+ holds zero liability for school-entered data.'
    : `I acknowledge my profile was created by ${schoolName} (Data Controller). To delete my data, I must contact my School Admin directly.`;
  const disclaimerText = getRolePolicyText('disclaimer') || defaultDisclaimer;
  
  const privacyText = getRolePolicyText('privacy') + (disclaimerText ? '\n\n' + disclaimerText : '');
  
  const gpsDisclaimerText = getRolePolicyText('gps');
  const policyVersion = platformSettings?.updated_at || '1.0.0';

  const allChecked = agreePolicies && (!isDriver || agreeGps);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      clearSession();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleAgree = async () => {
    if (!allChecked || !user?.id) return;
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // Upsert the user consent row
      const { error } = await supabase
        .from('user_consents')
        .upsert({
          user_id: user.id,
          status: 'agreed',
          accepted_version: policyVersion,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      // Trigger callback to re-evaluate gate in App.jsx
      if (onAccept) {
        onAccept();
      }
    } catch (err) {
      console.error('Failed to save consent:', err);
      setErrorMsg('Failed to save agreement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-white my-8 flex flex-col items-center">
        
        {/* Header/Greeting */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <div className="inline-flex p-3.5 bg-indigo-500/10 rounded-full text-indigo-400 border border-indigo-500/20 shadow-inner">
            <ShieldCheck size={28} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl font-black tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
              Welcome to SchoolOS+
            </h2>
            <p className="text-xs md:text-sm font-semibold text-indigo-400/90">
              Just a quick check before we start.
            </p>
          </div>
        </div>

        {/* Checkboxes Form */}
        <div className="w-full space-y-4 pt-2">
          {/* Checkbox 1: Legal Policies Acceptance */}
          <div className="flex items-start gap-3 group">
            <label className="relative mt-0.5 flex items-center justify-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={agreePolicies}
                onChange={(e) => setAgreePolicies(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                agreePolicies 
                  ? 'bg-indigo-500 border-indigo-500 text-white' 
                  : 'border-slate-700 bg-slate-950 text-transparent group-hover:border-slate-600'
              }`}>
                <Check size={14} strokeWidth={3} />
              </div>
            </label>
            <span className="text-xs text-slate-400 font-medium select-none leading-relaxed">
              {isAdmin ? (
                <>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setActivePolicyDoc('terms'); }}
                    className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-2 font-semibold hover:decoration-indigo-300 inline"
                  >
                    Terms & Conditions
                  </button>
                  ,{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setActivePolicyDoc('privacy'); }}
                    className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-2 font-semibold hover:decoration-indigo-300 inline"
                  >
                    Privacy Policy
                  </button>
                  , and{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setActivePolicyDoc('refund'); }}
                    className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-2 font-semibold hover:decoration-indigo-300 inline"
                  >
                    Refund Policy
                  </button>
                  .
                </>
              ) : (
                <>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setActivePolicyDoc('terms'); }}
                    className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-2 font-semibold hover:decoration-indigo-300 inline"
                  >
                    Terms & Conditions
                  </button>
                  {' '}and{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setActivePolicyDoc('privacy'); }}
                    className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-2 font-semibold hover:decoration-indigo-300 inline"
                  >
                    Privacy Policy
                  </button>
                  .
                </>
              )}
            </span>
          </div>



          {/* Checkbox 3: GPS Telemetry (Drivers Only) */}
          {isDriver && (
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreeGps}
                onChange={(e) => setAgreeGps(e.target.checked)}
                className="sr-only"
              />
              <div className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all flex-shrink-0 ${
                agreeGps 
                  ? 'bg-indigo-500 border-indigo-500 text-white' 
                  : 'border-slate-700 bg-slate-950 text-transparent group-hover:border-slate-600'
            }`}>
                <Check size={14} strokeWidth={3} />
              </div>
              <span className="text-[11px] text-slate-400/90 select-none leading-relaxed">
                {gpsDisclaimerText}
              </span>
            </label>
          )}
        </div>

        {errorMsg && (
          <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-center gap-2 text-xs">
            <ShieldAlert size={16} className="flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Actions buttons */}
        <div className="w-full flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleAgree}
            disabled={!allChecked || isSubmitting}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              allChecked && !isSubmitting
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 active:scale-[0.98]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving...
              </>
            ) : (
              'Accept & Continue'
            )}
          </button>
          <button
            onClick={handleLogout}
            disabled={isSubmitting}
            className="py-3 px-4 rounded-xl text-sm font-bold bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Log Out
          </button>
        </div>

      </div>

      {/* ── Policy Viewing Small Modal Overlay ── */}
      {activePolicyDoc && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col max-h-[80vh] text-white">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="m-0 text-base md:text-lg font-black tracking-tight flex items-center gap-2 text-indigo-400">
                <FileText size={20} />
                {activePolicyDoc === 'terms' ? 'Terms & Conditions' : 
                 activePolicyDoc === 'privacy' ? 'Privacy Policy' : 
                 'Refund Policy'}
              </h3>
              <button 
                onClick={() => setActivePolicyDoc(null)} 
                className="p-1.5 bg-slate-850 rounded-full hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4 bg-slate-950/60 border border-slate-850 rounded-2xl text-xs text-slate-400 leading-relaxed font-mono whitespace-pre-wrap pr-2 mb-4 scrollbar-thin">
              {activePolicyDoc === 'terms' && termsText}
              {activePolicyDoc === 'privacy' && privacyText}
              {activePolicyDoc === 'refund' && refundText}
            </div>
            
            <button 
              onClick={() => setActivePolicyDoc(null)} 
              className="py-2.5 px-4 rounded-xl text-sm font-bold bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-800 transition-all"
            >
              Close Document
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
