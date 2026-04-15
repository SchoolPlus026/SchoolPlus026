import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Save, Calendar as CalendarIcon, Users } from 'lucide-react';

export default function MarkAttendance() {
  const { user, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  
  const [attendanceEdits, setAttendanceEdits] = useState({});

  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ['classes', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('class')
        .eq('role', 'student')
        .not('class', 'is', null);
      
      if (error) throw error;
      const uniqueClasses = [...new Set(data.map(d => d.class))].sort();
      return uniqueClasses;
    },
    enabled: !!schoolSettings?.school_id
  });

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-class', selectedClass, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, username')
        .eq('role', 'student')
        .eq('class', selectedClass)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClass && !!schoolSettings?.school_id
  });

  const { data: existingAttendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', selectedClass, selectedDate, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', selectedDate)
        .in('user_id', students?.map(s => s.id) || []);
      if (error) throw error;
      return data || [];
    },
    enabled: !!students && students.length > 0
  });

  const saveMutation = useMutation({
    mutationFn: async (updates) => {
      const userIds = updates.map(u => u.user_id);
      
      // Delete existing records to act as an upsert constraint substitute
      await supabase.from('attendance')
        .delete()
        .eq('date', selectedDate)
        .in('user_id', userIds);
        
      const updatesWithMarkedBy = updates.map(u => ({ ...u, marked_by: user.id }));

      const { error: insertErr } = await supabase.from('attendance').insert(updatesWithMarkedBy);
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', selectedClass, selectedDate] });
      setAttendanceEdits({});
      alert('Attendance saved successfully!');
    }
  });

  const statuses = ['Present', 'Absent', 'Late', 'Half_day'];

  const handleStatusChange = (studentId, status) => {
    setAttendanceEdits(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const currentStatusFor = (studentId) => {
    if (attendanceEdits[studentId]) return attendanceEdits[studentId];
    const record = existingAttendance?.find(a => a.user_id === studentId);
    return record?.status || 'Present';
  };

  const handleSave = () => {
    if (!students || students.length === 0) return;
    const payload = students.map(s => ({
      school_id: schoolSettings.school_id,
      user_id: s.id,
      date: selectedDate,
      role: 'student',
      status: currentStatusFor(s.id),
    }));
    saveMutation.mutate(payload);
  };

  return (
    <div className="bg-surface border border-glass rounded-2xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Mark Attendance</h2>
          <p className="text-sm text-slate-400 mt-1">Select a class and date to record daily presence.</p>
        </div>
        <div className="flex bg-primary/10 text-primary px-4 py-2 rounded-lg items-center gap-2 font-medium border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            Live Mode
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-[#0a1128] p-4 rounded-xl border border-glass">
        <div className="flex-1">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <CalendarIcon size={16} /> Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-surface border border-glass rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex-1">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Users size={16} /> Class / Section
          </label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full bg-surface border border-glass rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
          >
            <option value="">-- Select Class --</option>
            {classes?.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {studentsLoading || attendanceLoading || classesLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !selectedClass ? (
        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-glass rounded-xl hidden sm:block">
           Please select a class to load the student roster.
        </div>
      ) : students?.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-glass rounded-xl">
           No students found in this class.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-glass">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-[#0a1128] border-b border-glass text-sm font-semibold text-slate-400">
                  <th className="p-4 w-1/3">Student</th>
                  <th className="p-4 text-center">Status Selection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass text-sm">
                {students.map(student => {
                  const status = currentStatusFor(student.id);
                  return (
                    <tr key={student.id} className="hover:bg-glass/50 transition-colors group">
                      <td className="p-4">
                        <div className="font-semibold text-white group-hover:text-primary transition-colors">{student.name}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">{student.username}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap justify-center gap-2">
                          {statuses.map(st => {
                            const isSelected = status === st;
                            let colors = '';
                            if (st === 'Present') colors = isSelected ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'hover:bg-emerald-500/10 text-slate-400';
                            if (st === 'Absent') colors = isSelected ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'hover:bg-red-500/10 text-slate-400';
                            if (st === 'Late') colors = isSelected ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'hover:bg-amber-500/10 text-slate-400';
                            if (st === 'Half_day') colors = isSelected ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'hover:bg-blue-500/10 text-slate-400';

                            return (
                              <button
                                key={st}
                                onClick={() => handleStatusChange(student.id, st)}
                                className={`px-3 py-1.5 rounded-md border border-glass text-xs font-medium transition-all ${colors}`}
                              >
                                {st.replace('_', ' ')}
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
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
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
