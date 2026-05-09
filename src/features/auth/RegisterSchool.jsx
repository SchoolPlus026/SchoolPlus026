import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { Link } from 'react-router-dom';
import {
  School, User, Mail, Phone, Hash, MapPin, CheckCircle,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, BookOpen,
  Lock, X, Eye, EyeOff
} from 'lucide-react';

const STEPS = ['School Info', 'Admin Account', 'Plan & Terms'];
const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'Other'];
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','J&K','Ladakh','Chandigarh','Other'
];

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle, appearance: 'none' };

// ── Hoisted outside component so identity is stable (fixes keyboard dismiss bug) ──
function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
      {STEPS.map((label, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800,
              background: i < step ? '#4ade80' : i === step ? '#4f46e5' : 'rgba(255,255,255,0.08)',
              color: i <= step ? '#fff' : '#64748b',
              border: i === step ? '2px solid rgba(79,70,229,0.5)' : 'none',
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: i === step ? '#c7d2fe' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < step ? '#4ade80' : 'rgba(255,255,255,0.08)', borderRadius: 1, marginBottom: 22, minWidth: 24 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PolicyModal({ title, content, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '20px 24px', color: '#94a3b8', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {content}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onClose} style={{ width: '100%', background: '#4f46e5', color: '#fff', fontWeight: 700, padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14 }}>
            I Understand — Close
          </button>
        </div>
      </div>
    </div>
  );
}

const TERMS_TEXT = `TERMS & CONDITIONS

1. Eligibility
By registering, you confirm that you are an authorized representative of the institution.

2. Data Accuracy
You agree that all information provided during registration is accurate and up-to-date.

3. Account Responsibility
You are responsible for maintaining the confidentiality of your login credentials.

4. Acceptable Use
The platform may only be used for lawful educational purposes. Misuse will result in account termination.

5. Data Privacy
Student and staff data stored on the platform is owned by your institution. We do not sell or share it with third parties.

6. Service Availability
We strive for 99.9% uptime but do not guarantee uninterrupted access.

7. Termination
We reserve the right to suspend accounts found in violation of these terms.

8. Amendments
These terms may be updated. Continued use of the platform constitutes acceptance.`;

const PRIVACY_TEXT = `PRIVACY POLICY

1. Information We Collect
We collect registration details (school name, admin contact, etc.) and usage data to provide the service.

2. How We Use It
Your data is used solely to operate the platform, provide support, and send service-related communications.

3. Data Storage
All data is stored on secure, encrypted servers. We do not store payment card information.

4. Cookies
We use session cookies for authentication. No tracking cookies are used.

5. Third-Party Services
We use Supabase for database and auth, and Resend for transactional emails. These providers have their own privacy policies.

6. Your Rights
You may request export or deletion of your institution's data at any time by contacting support.

7. Contact
For privacy concerns, email us at the support address shown in the platform settings.`;

export default function RegisterSchool() {
  const [step, setStep]         = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showTerms, setShowTerms]     = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [appName, setAppName]   = useState('SchoolOS+');

  const [platformLegal, setPlatformLegal] = useState({ terms: '', privacy: '' });

  useEffect(() => {
    supabase.from('platform_settings').select('app_name,terms_conditions,privacy_policy').single()
      .then(({ data }) => {
        if (data?.app_name) setAppName(data.app_name);
        if (data) setPlatformLegal({ terms: data.terms_conditions || '', privacy: data.privacy_policy || '' });
      });
  }, []);

  const [form, setForm] = useState({
    school_name: '', school_code: '', city: '', state: '',
    board: '', school_type: 'private', student_strength: '',
    admin_name: '', admin_email: '', admin_phone: '', admin_username: '',
    admin_password: '', admin_confirm_password: '',
    plan_type: 'trial', terms_accepted: false,
  });

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
    setError('');
  };

  const validateStep = () => {
    if (step === 0) {
      if (!form.school_name.trim()) return 'School name is required.';
      if (!form.school_code.trim() || form.school_code.length < 3) return 'School code must be at least 3 characters.';
      if (!/^[A-Za-z0-9]+$/.test(form.school_code)) return 'School code: letters and numbers only.';
      if (!form.state) return 'Please select a state.';
    }
    if (step === 1) {
      if (!form.admin_name.trim()) return 'Admin name is required.';
      if (!form.admin_email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email)) return 'Valid admin email is required.';
      if (!form.admin_username.trim() || form.admin_username.length < 4) return 'Username must be at least 4 characters.';
      if (!/^[a-z0-9_]+$/.test(form.admin_username)) return 'Username: lowercase, numbers, underscores only.';
      if (!form.admin_password || form.admin_password.length < 6) return 'Password must be at least 6 characters.';
      if (form.admin_password !== form.admin_confirm_password) return 'Passwords do not match.';
    }
    if (step === 2) {
      if (!form.terms_accepted) return 'You must accept the Terms & Conditions to proceed.';
    }
    return null;
  };

  // Free navigation — Next never blocks. Validation fires on Submit only.
  const next = () => { setError(''); setStep(s => s + 1); };
  const prev = () => { setStep(s => s - 1); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.admin_password !== form.admin_confirm_password) {
      setError('Passwords do not match!');
      return;
    }
    const err = validateStep();
    if (err) { setError(err); return; }
    setLoading(true); setError('');
    try {
      const { error: insertError } = await supabase.from('school_registrations').insert({
        school_name: form.school_name.trim(),
        school_code: form.school_code.trim().toUpperCase(),
        city: form.city.trim() || null,
        state: form.state || null,
        board: form.board || null,
        school_type: form.school_type,
        student_strength: form.student_strength ? parseInt(form.student_strength, 10) : null,
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim().toLowerCase(),
        admin_phone: form.admin_phone.trim() || null,
        admin_username: form.admin_username.trim().toLowerCase(),
        admin_password: form.admin_password,
        plan_type: form.plan_type,
        terms_accepted: true,
        status: 'pending',
      });
      if (insertError) {
        if (insertError.code === '23505') throw new Error(`School code "${form.school_code.toUpperCase()}" already has a pending registration.`);
        throw new Error(insertError.message);
      }
      setSubmitted(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '2px solid rgba(52,211,153,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <CheckCircle size={36} color="#34d399" />
            </div>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Registration Submitted!</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, margin: '0 auto 24px', maxWidth: 380 }}>
              Your application for <strong style={{ color: '#e2e8f0' }}>{form.school_name}</strong> has been received.
              Our team will review it and send your login credentials to <strong style={{ color: '#e2e8f0' }}>{form.admin_email}</strong> within 24–48 hours.
            </p>
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#4f46e5', color: '#fff', fontWeight: 700, padding: '12px 28px', borderRadius: 12, textDecoration: 'none', fontSize: 14 }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {showTerms && <PolicyModal title="Terms & Conditions" content={platformLegal.terms || TERMS_TEXT} onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PolicyModal title="Privacy Policy" content={platformLegal.privacy || PRIVACY_TEXT} onClose={() => setShowPrivacy(false)} />}

      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <School size={26} color="#fff" />
          </div>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>Register Your School</h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Join <strong style={{ color: '#c7d2fe' }}>{appName}</strong> in minutes</p>
        </div>

        <StepDots step={step} />

        {error && (
          <div style={{ display: 'flex', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
          </div>
        )}

        <form onSubmit={step === STEPS.length - 1 ? handleSubmit : (e) => { e.preventDefault(); next(); }}>

          {/* STEP 0 */}
          {step === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="School Name *">
                  <input style={inputStyle} placeholder="e.g. Delhi Public School" value={form.school_name} onChange={set('school_name')} required />
                </Field>
              </div>
              <Field label="School Code * (unique ID)">
                <input style={{ ...inputStyle, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}
                  placeholder="e.g. DPS14" maxLength={10} value={form.school_code}
                  onChange={(e) => { setForm(f => ({ ...f, school_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })); setError(''); }}
                  required />
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Letters & numbers only. Students use this to log in.</div>
              </Field>
              <Field label="School Type">
                <select style={selectStyle} value={form.school_type} onChange={set('school_type')}>
                  <option value="private">Private</option>
                  <option value="government">Government</option>
                  <option value="aided">Government-Aided</option>
                </select>
              </Field>
              <Field label="Board / Curriculum (optional)">
                <select style={selectStyle} value={form.board} onChange={set('board')}>
                  <option value="">Select Board</option>
                  {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="City (optional)">
                <input style={inputStyle} placeholder="e.g. New Delhi" value={form.city} onChange={set('city')} />
              </Field>
              <Field label="State *">
                <select required style={selectStyle} value={form.state} onChange={set('state')}>
                  <option value="">Select State</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Approx. Student Strength (optional)">
                  <input type="number" min="1" style={inputStyle} placeholder="e.g. 800" value={form.student_strength} onChange={set('student_strength')} />
                </Field>
              </div>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <div style={{ background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#a5b4fc' }}>
                These details become the <strong>Primary Admin</strong> account for your school.
              </div>
              <Field label="Admin Full Name *">
                <input style={inputStyle} placeholder="e.g. Ravi Kumar Sharma" value={form.admin_name} onChange={set('admin_name')} required />
              </Field>
              <Field label="Admin Email * (credentials sent here)">
                <input type="email" style={inputStyle} placeholder="e.g. principal@yourschool.edu" value={form.admin_email} onChange={set('admin_email')} required />
              </Field>
              <Field label="Admin Phone (optional)">
                <input type="tel" style={inputStyle} placeholder="e.g. 9876543210" value={form.admin_phone} onChange={set('admin_phone')} />
              </Field>
              <Field label="Admin Username * (for login)">
                <input style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="e.g. admin_dps14"
                  value={form.admin_username}
                  onChange={(e) => { setForm(f => ({ ...f, admin_username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })); setError(''); }}
                  required />
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Lowercase, numbers, underscores. Min 4 characters.</div>
              </Field>
              <Field label="Create Password *">
                <div style={{ position: 'relative' }}>
                  <input type={showPass ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 42 }}
                    placeholder="Min 8 characters" value={form.admin_password} onChange={set('admin_password')} required />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm Password *">
                <div style={{ position: 'relative' }}>
                  <input type={showConfirm ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 42 }}
                    placeholder="Re-enter password" value={form.admin_confirm_password} onChange={set('admin_confirm_password')} required />
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <Field label="Starting Plan">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
                  {[
                    { value: 'trial', label: '28-Day Free Trial', desc: 'Full access, no card needed', color: '#4ade80' },
                    { value: 'free', label: 'Free Plan', desc: 'Core modules only, always free', color: '#94a3b8' },
                  ].map(plan => (
                    <div key={plan.value} onClick={() => setForm(f => ({ ...f, plan_type: plan.value }))}
                      style={{ border: `2px solid ${form.plan_type === plan.value ? plan.color : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: 14, cursor: 'pointer', background: form.plan_type === plan.value ? `rgba(${plan.value === 'trial' ? '74,222,128' : '148,163,184'},0.08)` : 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: form.plan_type === plan.value ? plan.color : '#e2e8f0', marginBottom: 4 }}>{plan.label}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{plan.desc}</div>
                    </div>
                  ))}
                </div>
              </Field>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Registration Summary</div>
                {[
                  ['School', form.school_name || '—'], ['Code', form.school_code || '—'],
                  ['State', form.state || '—'], ['Admin', form.admin_name || '—'],
                  ['Email', form.admin_email || '—'], ['Username', form.admin_username || '—'],
                  ['Plan', form.plan_type === 'trial' ? '28-Day Free Trial' : 'Free Plan'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* T&C — checkbox and links are SEPARATE elements, not nested in <label> */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${form.terms_accepted ? 'rgba(79,70,229,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                <input
                  type="checkbox" id="terms_cb"
                  checked={form.terms_accepted}
                  onChange={set('terms_accepted')}
                  style={{ width: 18, height: 18, accentColor: '#4f46e5', marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                  <label htmlFor="terms_cb" style={{ cursor: 'pointer' }}>I agree to the </label>
                  <button type="button" onClick={() => setShowTerms(true)}
                    style={{ background: 'none', border: 'none', color: '#a5b4fc', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                    Terms &amp; Conditions
                  </button>
                  <label htmlFor="terms_cb" style={{ cursor: 'pointer' }}> and </label>
                  <button type="button" onClick={() => setShowPrivacy(true)}
                    style={{ background: 'none', border: 'none', color: '#a5b4fc', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                    Privacy Policy
                  </button>
                  <label htmlFor="terms_cb" style={{ cursor: 'pointer' }}> of {appName}. I confirm the information is accurate.</label>
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {step > 0 && (
              <button type="button" onClick={prev} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontWeight: 700, fontSize: 13, padding: 12, borderRadius: 12, cursor: 'pointer' }}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button type="submit" disabled={loading || (step === 2 && !form.terms_accepted)}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontWeight: 800, fontSize: 14, padding: 13, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', opacity: (step === 2 && !form.terms_accepted) ? 0.5 : 1 }}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                : step === STEPS.length - 1 ? <>Submit Application <ChevronRight size={16} /></>
                : <>Next <ChevronRight size={16} /></>}
            </button>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#475569' }}>
          Already registered? <Link to="/login" style={{ color: '#818cf8', fontWeight: 600 }}>Login here</Link>
        </div>
      </div>
    </div>
  );
}

const pageStyle = { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' };
const cardStyle = { background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '36px 32px', width: '100%', maxWidth: 540, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' };
