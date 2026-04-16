import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Save, Calendar as CalendarIcon, Users, UserCheck, CheckCircle2, XCircle, AlertCircle, Filter } from 'lucide-react';

export default function MarkAttendance() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [targetRole, setTargetRole] = useState('student'); // 'student' or 'teacher'
  const [viewMode, setViewMode] = useState('roster'); // 'roster' or 'self'
  
  const [attendanceEdits, setAttendanceEdits] = useState({});

  // 1. Fetch Teacher's Assigned Class if applicable
  useEffect(() => {
    async function fetchTeacherClass() {
      if (role === 'teacher') {
        const { data } = await supabase.from('users').select('class').eq('id', user.id).single();
        if (data?.class) {
          setSelectedClass(data.class);
        }
        // Teachers default to self-attendance view first? 
        // Actually PDF shows they are separate modules usually, but we'll put them in one component with tabs.
        setViewMode('self');
      }
    }
    fetchTeacherClass();
  }, [role, user.id]);

  const classes = schoolSettings?.classes || [];

  // 2. Fetch Targets (Students in class OR Self)
  const { data: targets, isLoading: targetsLoading } = useQuery({
    queryKey: ['attendance-targets', targetRole, selectedClass, viewMode, user.id, schoolSettings?.school_id],
    queryFn: async () => {
      if (viewMode === 'self') {
        return [{ id: user.id, name: 'My Self', username: 'self' }];
      }

      let query = supabase
        .from('users')
        .select('id, name, username')
        .eq('role', targetRole)
        .order('name');
        
      if (targetRole === 'student' && selectedClass) {
        query = query.eq('class', selectedClass);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!schoolSettings?.school_id && (viewMode === 'self' || targetRole === 'teacher' || !!selectedClass)
  });

  // 3. Fetch Existing Attendance
  const { data: existingAttendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', targetRole, selectedClass, viewMode, selectedDate, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', selectedDate)
        .in('user_id', targets?.map(s => s.id) || []);
      if (error) throw error;
      return data || [];
    },
    enabled: !!targets && targets.length > 0
  });

  const saveMutation = useMutation({
    mutationFn: async (updates) => {
      const userIds = updates.map(u => u.user_id);
      
      await supabase.from('attendance')
        .delete()
        .eq('date', selectedDate)
        .in('user_id', userIds);
        
      const updatesWithMarkedBy = updates.map(u => ({ ...u, marked_by: user.id }));

      const { error: insertErr } = await supabase.from('attendance').insert(updatesWithMarkedBy);
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setAttendanceEdits({});
      alert('Attendance recorded successfully!');
    }
  });

  const handleStatusChange = (targetId, status) => {
    setAttendanceEdits(prev => ({
      ...prev,
      [targetId]: status
    }));
  };

  const currentStatusFor = (targetId) => {
    if (attendanceEdits[targetId]) return attendanceEdits[targetId];
    const record = existingAttendance?.find(a => a.user_id === targetId);
    return record?.status || 'Present';
  };

  const handleSave = () => {
    if (!targets || targets.length === 0) return;
    const payload = targets.map(s => ({
      school_id: schoolSettings.school_id,
      user_id: s.id,
      date: selectedDate,
      role: viewMode === 'self' ? role : targetRole,
      status: currentStatusFor(s.id),
    }));
    saveMutation.mutate(payload);
  };

  const statuses = ['Present', 'Absent', 'Late', 'Half_day'];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Role specific header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Attendance Protocol</h2>
           <p className="text-slate-500 font-medium italic">Standard Operating Procedure: Daily Registry</p>
        </div>
        
        {role === 'teacher' && (
          <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => { setViewMode('self'); setTargetRole('teacher'); }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'self' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              My Attendance
            </button>
            <button 
              onClick={() => { setViewMode('roster'); setTargetRole('student'); }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'roster' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Class Roster
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters Column */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-border rounded-3xl p-6 shadow-xl shadow-slate-100/50 space-y-4">
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Registry Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
              />
            </div>

            {role === 'admin' && (
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Target Group</label>
                <select
                  value={targetRole}
                  onChange={(e) => {
                    setTargetRole(e.target.value);
                    setSelectedClass('');
                  }}
                  className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner appearance-none cursor-pointer"
                >
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                </select>
              </div>
            )}

            {(targetRole === 'student' || (role === 'teacher' && viewMode === 'roster')) && (
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Selection Area</label>
                {role === 'admin' ? (
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner appearance-none cursor-pointer"
                  >
                    <option value="">-- Choose Class --</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <div className="w-full bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-sm font-black text-primary flex items-center gap-2 shadow-sm">
                    <Users size={16} /> {selectedClass || 'No Class Assigned'}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !targets || targets.length === 0}
            className="w-full flex items-center justify-center gap-2 py-4 bg-primary hover:bg-primary-dark text-white rounded-3xl font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/30 disabled:opacity-50 active:scale-[0.98]"
          >
            {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={18} />}
            Commit to Archive
          </button>
        </div>

        {/* List Column */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-border rounded-[2.5rem] shadow-xl shadow-slate-100/50 overflow-hidden min-h-[400px]">
             {targetsLoading || attendanceLoading ? (
               <div className="flex flex-col items-center justify-center h-full py-32 gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <span className="font-bold text-xs text-slate-400 uppercase tracking-widest">Hydrating Registry...</span>
               </div>
             ) : (targetRole === 'student' && !selectedClass) ? (
               <div className="flex flex-col items-center justify-center h-full py-32 text-center px-8">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                    <Filter size={24} className="text-slate-300" />
                  </div>
                  <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest">Locked Module</h3>
                  <p className="text-slate-400 text-sm mt-1 italic">Please select a class deployment to view the roster.</p>
               </div>
             ) : targets?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-32">
                   <AlertCircle size={40} className="text-slate-200 mb-2" />
                   <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No data objects found</p>
                </div>
             ) : (
                <div className="divide-y divide-slate-100">
                  {targets.map(target => {
                    const status = currentStatusFor(target.id);
                    return (
                      <div key={target.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center font-black text-slate-700 shadow-sm">
                             {target.name.charAt(0)}
                           </div>
                           <div>
                              <div className="font-black text-slate-800 uppercase tracking-tight leading-none mb-1">{target.name}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {target.username}</div>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                           {statuses.map(st => {
                             const isSelected = status === st;
                             let colors = 'bg-white border-slate-200 text-slate-500';
                             if (st === 'Present') colors = isSelected ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-200 scale-105' : 'hover:border-emerald-200 hover:text-emerald-600';
                             if (st === 'Absent') colors = isSelected ? 'bg-red-500 border-red-600 text-white shadow-lg shadow-red-200 scale-105' : 'hover:border-red-200 hover:text-red-600';
                             if (st === 'Late') colors = isSelected ? 'bg-amber-500 border-amber-600 text-white shadow-lg shadow-amber-200 scale-105' : 'hover:border-amber-200 hover:text-amber-600';
                             if (st === 'Half_day') colors = isSelected ? 'bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105' : 'hover:border-indigo-200 hover:text-indigo-600';

                             const label = st === 'Half_day' ? 'Half' : st;

                             return (
                               <button 
                                key={st}
                                onClick={() => handleStatusChange(target.id, st)}
                                className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${colors}`}
                               >
                                 {label}
                               </button>
                             );
                           })}
                        </div>
                      </div>
                    );
                  })}
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
