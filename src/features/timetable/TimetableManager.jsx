import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, PlusCircle, Clock, CalendarDays } from 'lucide-react';
import TimetableViewer from './TimetableViewer';

export default function TimetableManager() {
  const { schoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  const [day, setDay] = useState('Monday');
  const [periodOrder, setPeriodOrder] = useState(1);
  const [periodLabel, setPeriodLabel] = useState('');
  const [subject, setSubject] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  // Fetch unique classes organically from user assignment matrix
  const { data: classes } = useQuery({
    queryKey: ['classes-timetable', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('class').eq('role', 'student').not('class', 'is', null);
      if (error) throw error;
      return [...new Set(data.map(d => d.class))].sort();
    },
    enabled: !!schoolSettings?.school_id
  });

  // Fetch verified targeted Teachers list
  const { data: teachers } = useQuery({
    queryKey: ['teachers-list', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, name').eq('role', 'teacher').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!schoolSettings?.school_id
  });

  // Mutation and Double Booking Collision Check Logic
  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      // 1. Validation Logic: Search for specific teacher collisions first
      const { data: conflicts, error: conflictErr } = await supabase
        .from('timetable')
        .select('*')
        .eq('school_id', schoolSettings.school_id)
        .eq('day', payload.day)
        .eq('period_order', payload.period_order)
        .eq('teacher', payload.teacher);

      if (conflictErr) throw conflictErr;
      
      // Intercept and forcibly abort if teacher overlaps
      if (conflicts && conflicts.length > 0) {
         throw new Error(`Double Booking Collision Detected! This teacher is already explicitly scheduled for Class [${conflicts[0].class}] on ${payload.day} (Sequence #${payload.period_order}).`);
      }

      // 2. Insert validated constraint block
      const { error } = await supabase.from('timetable').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
      // Clear modular inputs but preserve batch inputs smartly
      setPeriodLabel('');
      setSubject('');
      setSelectedTeacher('');
      setPeriodOrder(prev => Number(prev) + 1);
    },
    onError: (err) => {
      alert(err.message);
    }
  });

  const handleSave = (e) => {
    e.preventDefault();
    if (!targetClass || !selectedTeacher || !subject || !periodLabel) return;
    
    saveMutation.mutate({
      school_id: schoolSettings.school_id,
      day,
      period_order: Number(periodOrder),
      period_label: periodLabel,
      subject,
      class: targetClass,
      teacher: selectedTeacher
    });
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-8">
      {/* Dynamic Creation Engine Interface */}
      <div className="bg-surface border border-glass rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
           <CalendarDays size={180} className="transform translate-x-8 -translate-y-8" />
        </div>
        
        <h2 className="text-2xl font-bold text-white tracking-tight mb-1 flex items-center gap-2"><Clock className="text-primary"/> Modular Timetable Engine</h2>
        <p className="text-sm text-slate-400 mb-8 border-b border-glass pb-4">Allocate slots, detect collisions automatically, and build the global schedule matrix.</p>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
           <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Target Assignment Class</label>
              <select required value={targetClass} onChange={e => setTargetClass(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-inner">
                <option value="">-- Deploy to Class --</option>
                {classes?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Day Vector</label>
              <select required value={day} onChange={e => setDay(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-inner">
                {daysOfWeek.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Staff Allocation</label>
              <select required value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-inner">
                <option value="">-- Select Assignee --</option>
                {teachers?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Subject Core</label>
              <input required type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Advanced Physics" className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary placeholder-slate-600 shadow-inner" />
           </div>

           <div className="flex gap-4">
              <div className="w-24">
                <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Sequence #</label>
                <input required type="number" min="1" value={periodOrder} onChange={e => setPeriodOrder(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-primary focus:outline-none focus:border-primary text-center font-bold shadow-inner" />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Physical Bounds</label>
                <input required type="text" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="09:00 AM - 09:45 AM" className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-primary placeholder-slate-600 font-mono shadow-inner" />
              </div>
           </div>
           
           <div className="flex items-end">
              <button disabled={saveMutation.isPending} className="w-full h-[46px] flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold text-[11px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
                 {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                 {saveMutation.isPending ? 'Verifying Topology...' : 'Inject Schedule Slice'}
              </button>
           </div>
        </form>
      </div>

      <div className="pt-2">
         <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-xl font-bold text-white">Live Operations Matrix Preview</h3>
            <span className="bg-glass px-3 py-1 rounded text-xs font-semibold text-slate-400 uppercase tracking-wider">{targetClass ? `Viewing: ${targetClass}` : 'Global View'}</span>
         </div>
         <TimetableViewer adminPreviewClass={targetClass} />
      </div>
    </div>
  );
}
