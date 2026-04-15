import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Save, Calendar as CalendarIcon, Users, UserCheck } from 'lucide-react';

export default function MarkAttendance() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [targetRole, setTargetRole] = useState('student'); // 'student' or 'teacher'
  
  const [attendanceEdits, setAttendanceEdits] = useState({});

  // If teacher, fetch their assigned class once
  useEffect(() => {
    async function fetchTeacherClass() {
      if (role === 'teacher') {
        const { data } = await supabase.from('users').select('class').eq('id', user.id).single();
        if (data?.class) {
          setSelectedClass(data.class);
        }
      }
    }
    fetchTeacherClass();
  }, [role, user.id]);

  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ['classes', schoolSettings?.school_id, targetRole],
    queryFn: async () => {
      // Teachers don't have classes per se for their own attendance, so if targetRole is teacher, we omit class filtering
      if (targetRole === 'teacher') return [];

      const { data, error } = await supabase
        .from('users')
        .select('class')
        .eq('role', 'student')
        .not('class', 'is', null);
      
      if (error) throw error;
      const uniqueClasses = [...new Set(data.map(d => d.class))].sort();
      return uniqueClasses;
    },
    enabled: !!schoolSettings?.school_id && role === 'admin'
  });

  const { data: targets, isLoading: targetsLoading } = useQuery({
    queryKey: ['attendance-targets', targetRole, selectedClass, schoolSettings?.school_id],
    queryFn: async () => {
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
    enabled: !!schoolSettings?.school_id && (targetRole === 'teacher' || !!selectedClass)
  });

  const { data: existingAttendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', targetRole, selectedClass, selectedDate, schoolSettings?.school_id],
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
      alert('Attendance saved successfully!');
    }
  });

  const statuses = ['Present', 'Absent', 'Late', 'Half_day'];

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
      role: targetRole,
      status: currentStatusFor(s.id),
    }));
    saveMutation.mutate(payload);
  };

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Mark Attendance</h2>
          <p className="text-sm text-muted mt-1">Record daily presence for your school.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-border">
        {role === 'admin' && (
          <div className="flex-1">
            <label className="flex items-center gap-2 text-sm font-medium text-text mb-2">
              <UserCheck size={16} /> Target Group
            </label>
            <select
              value={targetRole}
              onChange={(e) => {
                setTargetRole(e.target.value);
                setSelectedClass('');
              }}
              className="w-full bg-white border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors appearance-none shadow-sm"
            >
              <option value="student">Student Attendance</option>
              <option value="teacher">Teacher Attendance</option>
            </select>
          </div>
        )}

        <div className="flex-1">
          <label className="flex items-center gap-2 text-sm font-medium text-text mb-2">
            <CalendarIcon size={16} /> Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-white border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors shadow-sm"
          />
        </div>
        
        {targetRole === 'student' && (
          <div className="flex-1">
            <label className="flex items-center gap-2 text-sm font-medium text-text mb-2">
              <Users size={16} /> Select Class
            </label>
            {role === 'admin' ? (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full bg-white border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors appearance-none shadow-sm"
              >
                <option value="">-- Select Class --</option>
                {classes?.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <div className="w-full bg-slate-100 border border-border rounded-lg px-4 py-2.5 text-text font-semibold shadow-sm">
                {selectedClass || 'Loading assigned class...'}
              </div>
            )}
          </div>
        )}
      </div>

      {targetsLoading || attendanceLoading || classesLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (targetRole === 'student' && !selectedClass) ? (
        <div className="text-center py-12 text-muted border-2 border-dashed border-border rounded-xl hidden sm:block">
           Please select a class to load the roster.
        </div>
      ) : targets?.length === 0 ? (
        <div className="text-center py-12 text-muted border-2 border-dashed border-border rounded-xl">
           No records found for this selection.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
            <table className="w-full text-left border-collapse min-w-[600px] bg-white">
              <thead>
                <tr className="bg-slate-50 border-b border-border text-sm font-semibold text-text">
                  <th className="p-4 w-1/3">Name</th>
                  <th className="p-4 text-center">Status Selection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {targets.map(target => {
                  const status = currentStatusFor(target.id);
                  return (
                    <tr key={target.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        <div className="font-semibold text-text group-hover:text-primary transition-colors">{target.name}</div>
                        <div className="text-xs text-muted uppercase tracking-widest mt-0.5">{target.username}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap justify-center gap-2">
                          {statuses.map(st => {
                            const isSelected = status === st;
                            let colors = '';
                            if (st === 'Present') colors = isSelected ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'hover:bg-slate-100 text-slate-500 bg-white';
                            if (st === 'Absent') colors = isSelected ? 'bg-red-100 text-red-700 border-red-300' : 'hover:bg-slate-100 text-slate-500 bg-white';
                            if (st === 'Late') colors = isSelected ? 'bg-amber-100 text-amber-700 border-amber-300' : 'hover:bg-slate-100 text-slate-500 bg-white';
                            if (st === 'Half_day') colors = isSelected ? 'bg-blue-100 text-blue-700 border-blue-300' : 'hover:bg-slate-100 text-slate-500 bg-white';

                            const displayLabel = st === 'Half_day' ? 'Half Day' : st;

                            return (
                              <button
                                key={st}
                                onClick={() => handleStatusChange(target.id, st)}
                                className={`px-4 py-1.5 rounded-lg border border-border text-xs font-semibold transition-all ${colors} shadow-sm`}
                              >
                                {displayLabel}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end pb-2">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || Object.keys(attendanceEdits).length === 0}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 shadow-md"
            >
              {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Register'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
