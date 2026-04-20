import React, { useEffect, useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { User, Loader2 } from 'lucide-react';

export default function UserProfile() {
  const { user, role } = useAppStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { setProfile(data); setLoading(false); });
  }, [user]);

  if (loading) return (
    <div className="sp-card flex justify-center py-10">
      <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
    </div>
  );

  if (!profile) return (
    <div className="sp-card text-slate-400 text-sm">Profile not found.</div>
  );

  const r = (role || '').toLowerCase();

  const rows = [
    { label: 'Full Name', value: profile.name || '—' },
    { label: 'Username', value: profile.username || profile.email || '—' },
    { label: 'Role', value: profile.role || r.toUpperCase() || '—' },
  ];

  if (profile.dob) rows.push({ label: 'Date of Birth', value: new Date(profile.dob).toLocaleDateString() });
  if (profile.blood_group) rows.push({ label: 'Blood Group', value: profile.blood_group });
  if (profile.address) rows.push({ label: 'Address', value: profile.address });

  if (r === 'student') {
    rows.push({ label: 'Class', value: profile.class || '—' });
    rows.push({ label: "Contact Number", value: profile.contact || '—' });
    if (profile.aadhar_card) rows.push({ label: "Aadhar Card", value: profile.aadhar_card });
  } else if (r === 'teacher') {
    rows.push({ label: 'Qualification', value: profile.qualification || '—' });
    rows.push({ label: 'Allocated Class', value: profile.class || '—' });
    rows.push({ label: 'Contact Number', value: profile.contact || '—' });
    if (profile.aadhar_card) rows.push({ label: "Aadhar Card", value: profile.aadhar_card });
  } else if (r === 'staff') {
    rows.push({ label: 'Designation', value: profile.designation || '—' });
    rows.push({ label: 'Qualification', value: profile.qualification || '—' });
    rows.push({ label: 'Contact Number', value: profile.contact || '—' });
    if (profile.aadhar_card) rows.push({ label: "Aadhar Card", value: profile.aadhar_card });
  }

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <User size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">My Profile</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">{profile.role || ''}</p>
          </div>
        </div>
      </div>

      <div className="sp-card">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(({ label, value }) => (
              <tr key={label} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4 text-xs font-black text-slate-500 uppercase tracking-widest whitespace-nowrap w-40">{label}</td>
                <td className="py-3 text-slate-200 font-semibold">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
