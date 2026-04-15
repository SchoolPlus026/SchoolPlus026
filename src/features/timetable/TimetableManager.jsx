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
         throw new Error(`Double Booking Collision Detected! This teacher is already scheduled for Class [${conflicts[0].class}] on ${payload.day} (Period #${payload.period_order}).`);
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
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-slate-800">
           <CalendarDays size={180} className="transform translate-x-8 -translate-y-8" />
        </div>
        
        <h2 className="text-2xl font-bold text-text tracking-tight mb-1 flex items-center gap-2">
           <Clock className="text-primary"/> Timetable Manager
        </h2>
        <p className="text-sm text-muted mb-8 border-b border-border pb-4">Allocate classes to teachers and plan your school's weekly schedule.</p>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
           <div>
              <label className="block text-xs font-bold tracking-widest text-muted mb-2 uppercase">Select Class</label>
              <select required value={targetClass} onChange={e => setTargetClass(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm">
                <option value="">-- Choose a Class --</option>
                {classes?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-xs font-bold tracking-widest text-muted mb-2 uppercase">Day</label>
              <select required value={day} onChange={e => setDay(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm">
                {daysOfWeek.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-xs font-bold tracking-widest text-muted mb-2 uppercase">Teacher</label>
              <select required value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm">
                <option value="">-- Assign Teacher --</option>
                {teachers?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-xs font-bold tracking-widest text-muted mb-2 uppercase">Subject</label>
              <input required type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Science" className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-primary shadow-sm" />
           </div>

           <div className="flex gap-4">
              <div className="w-24">
                <label className="block text-xs font-bold tracking-widest text-muted mb-2 uppercase">Period #</label>
                <input required type="number" min="1" value={periodOrder} onChange={e => setPeriodOrder(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm text-primary focus:outline-none focus:border-primary text-center font-bold shadow-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold tracking-widest text-muted mb-2 uppercase">Timing</label>
                <input required type="text" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="09:00 AM - 09:45 AM" className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-primary shadow-sm" />
              </div>
           </div>
           
           <div className="flex items-end">
              <button disabled={saveMutation.isPending} className="w-full h-[46px] flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50">
                 {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                 {saveMutation.isPending ? 'Saving...' : 'Add Period'}
              </button>
           </div>
        </form>
      </div>

      <div className="pt-2">
         <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-xl font-bold text-text">Class Schedule Viewer</h3>
            <span className="bg-slate-100 border border-border px-3 py-1 rounded text-xs font-semibold text-muted uppercase tracking-wider">{targetClass ? `Viewing: ${targetClass}` : 'Select a class to view'}</span>
         </div>
         <TimetableViewer adminPreviewClass={targetClass} />
      </div>
    </div>
  );
}
