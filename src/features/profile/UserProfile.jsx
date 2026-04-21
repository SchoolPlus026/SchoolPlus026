import React, { useEffect, useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { User, Loader2, Mail, Phone, MapPin, Briefcase, Calendar, Info, GraduationCap, FileText, Users, BookOpen, Award, Star } from 'lucide-react';

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
    <div className="card text-center py-10 muted">
      <Loader2 className="animate-spin mx-auto mb-2" size={24} />
      Loading profile...
    </div>
  );

  if (!profile) return (
    <div className="card muted text-sm text-center">Profile details not found.</div>
  );

  const r = (role || '').toLowerCase();
  
  // Dynamic Initial
  const initial = profile.name ? profile.name.charAt(0).toUpperCase() : (profile.username ? profile.username.charAt(0).toUpperCase() : 'U');

  return (
    <div className="space-y-6 fade-in pb-10 max-w-4xl mx-auto">
      
      {/* Banner & Avatar (Digital ID Card Header) */}
      <div className="relative overflow-hidden rounded-2xl shadow-xl border border-border bg-[var(--card)]">
        {/* Banner Background */}
        <div className="h-32 md:h-40 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 opacity-90 relative">
          <div className="absolute inset-0 bg-black/20" />
          {/* Subtle pattern / texture could go here */}
        </div>
        
        {/* Profile Info Overlay */}
        <div className="px-6 pb-6 relative">
           {/* Avatar */}
           <div className="absolute -top-16 md:-top-20 bg-slate-900 border-[6px] border-slate-900 shadow-2xl rounded-full w-32 h-32 md:w-40 md:h-40 flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-500/20" />
              <span className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 z-10">{initial}</span>
           </div>
           
           <div className="mt-20 md:mt-24 flex items-start justify-between flex-wrap gap-4">
              <div>
                 <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-1">{profile.name || 'Unknown User'}</h2>
                 <div className="flex items-center gap-3">
                    <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)'}}>{profile.role || r.toUpperCase()}</span>
                    <span className="muted small font-medium">@{profile.username || profile.email}</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
         {/* Personal Info Card */}
         <div className="card p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
               <Info size={18} className="text-accent" />
               <h3 className="m-0 text-sm font-black uppercase tracking-widest text-[var(--muted)]">Personal Information</h3>
            </div>
            <div className="space-y-4 flex-1">
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><User size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Full Name</div><div className="font-semibold text-[15px] text-white">{profile.name || '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Calendar size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Date of Birth</div><div className="font-semibold text-[15px] text-white">{profile.dob ? new Date(profile.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Info size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Blood Group</div><div className="font-semibold text-[15px] text-white space-x-1">{profile.blood_group ? <span className="text-red-400 font-black">{profile.blood_group}</span> : '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><FileText size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Aadhar Card</div><div className="font-semibold text-[15px] text-white tracking-widest font-mono text-sm">{profile.aadhar_card || '—'}</div></div>
               </div>
            </div>
         </div>

         <div className="flex flex-col gap-6">
            {/* Contact Info Card */}
            <div className="card p-6">
               <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
                  <Briefcase size={18} className="text-emerald-400" />
                  <h3 className="m-0 text-sm font-black uppercase tracking-widest text-[var(--muted)]">Contact & Address</h3>
               </div>
               <div className="space-y-4">
                  <div className="flex items-start gap-3">
                     <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Phone size={16} className="text-emerald-400/70" /></div>
                     <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Contact Number</div><div className="font-semibold text-[15px] text-white">{profile.contact || '—'}</div></div>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><MapPin size={16} className="text-emerald-400/70" /></div>
                     <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Residential Address</div><div className="font-semibold text-[15px] text-white leading-relaxed">{profile.address || '—'}</div></div>
                  </div>
               </div>
            </div>

            {/* Academic/Role Details Card */}
            <div className="card p-6 flex-1">
               <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
                  <GraduationCap size={18} className="text-amber-400" />
                  <h3 className="m-0 text-sm font-black uppercase tracking-widest text-[var(--muted)]">Academic / Role Duties</h3>
               </div>
               
               <div className="space-y-4">
                  {r === 'student' && (
                     <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Users size={16} className="text-amber-400/70" /></div>
                        <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Enrolled Class</div><div className="font-semibold text-xl text-white">{profile.class || 'Unassigned'}</div></div>
                     </div>
                  )}

                  {r === 'teacher' && (
                     <>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><BookOpen size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Allocated Class</div><div className="font-semibold text-lg text-white">Class {profile.class || 'Unassigned'}</div></div>
                        </div>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Award size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Qualification</div><div className="font-semibold text-[15px] text-white">{profile.qualification || '—'}</div></div>
                        </div>
                     </>
                  )}

                  {r === 'staff' && (
                     <>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Star size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Designation</div><div className="font-semibold text-lg text-white">{profile.designation || 'Staff Member'}</div></div>
                        </div>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Award size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Qualification</div><div className="font-semibold text-[15px] text-white">{profile.qualification || '—'}</div></div>
                        </div>
                     </>
                  )}
                  
                  {r === 'admin' && (
                     <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-amber-200 text-sm mt-2">
                        <Info size={20} className="text-amber-400 shrink-0" />
                        <div>As an Administrator, you have full access to management modules, settings, and school database controls.</div>
                     </div>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
