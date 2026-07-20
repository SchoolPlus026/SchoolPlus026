import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import { Loader2, PlusCircle, Clock, CalendarDays, Upload, Download, FileSpreadsheet, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import TimetableViewer from './TimetableViewer';

export default function TimetableManager() {
  const { schoolSettings } = useAppStore();
  const { isPending } = usePending();
  const queryClient = useQueryClient();

  const [day, setDay] = useState('Monday');
  const [periodOrder, setPeriodOrder] = useState(1);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subject, setSubject] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  // Bulk Upload State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bulkSummary, setBulkSummary] = useState(null);

  // Classes now come from schoolSettings
  const classes = schoolSettings?.classes || [];

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
      setStartTime('');
      setEndTime('');
      setSubject('');
      setSelectedTeacher('');
      setPeriodOrder(prev => Number(prev) + 1);
    },
    onError: (err) => {
      alert(err.message);
    }
  });

  const handleSave = async (e) => {
    e.preventDefault();
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    if (!targetClass || !selectedTeacher || !subject || !startTime || !endTime) return;
    
    // Formatting time (e.g. 09:00 -> 09:00 AM)
    const formatTime = (time24) => {
       const [h, m] = time24.split(':');
       let hours = parseInt(h, 10);
       const ampm = hours >= 12 ? 'PM' : 'AM';
       hours = hours % 12 || 12;
       return `${hours.toString().padStart(2, '0')}:${m} ${ampm}`;
    };
    const formattedLabel = `${formatTime(startTime)} - ${formatTime(endTime)}`;

    const applyPayload = async (d) => {
      await saveMutation.mutateAsync({
        school_id: schoolSettings.school_id,
        day: d,
        period_order: Number(periodOrder),
        period_label: formattedLabel,
        subject,
        class: targetClass,
        teacher: selectedTeacher
      });
    };

    try {
      if (day === 'All Days') {
        const standardDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (let d of standardDays) {
          await applyPayload(d);
        }
      } else {
        await applyPayload(day);
      }
    } catch (err) {
       // Single errors will be handled gracefully by the mutation's onError alert
    }
  };

  const handleDownloadTimetableTemplate = () => {
    const templateData = [
      {
        "Day": "Monday",
        "Period Number": 1,
        "Start Time": "08:00 AM",
        "End Time": "08:45 AM",
        "Class": "1ST - A",
        "Subject": "English",
        "Teacher": "Amit Kumar"
      },
      {
        "Day": "Monday",
        "Period Number": 2,
        "Start Time": "08:45 AM",
        "End Time": "09:30 AM",
        "Class": "1ST - A",
        "Subject": "Mathematics",
        "Teacher": "Shubham Hajare"
      },
      {
        "Day": "Monday",
        "Period Number": 3,
        "Start Time": "09:30 AM",
        "End Time": "10:15 AM",
        "Class": "1ST - A",
        "Subject": "EVS",
        "Teacher": "Amit Kumar"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Timetable Template");
    XLSX.writeFile(workbook, "school_timetable_template.xlsx");
  };

  const handleProcessBulkTimetable = async () => {
    if (!bulkFile) {
      alert("Please select an Excel or CSV file first.");
      return;
    }
    setIsProcessing(true);
    setBulkSummary(null);

    try {
      const arrayBuffer = await bulkFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows || rows.length === 0) {
        throw new Error("Uploaded file contains no data rows.");
      }

      // Fetch existing timetable slots for double-booking collision check
      const { data: existingSlots, error: fetchErr } = await supabase
        .from('timetable')
        .select('day, period_order, teacher, class')
        .eq('school_id', schoolSettings.school_id);
      if (fetchErr) throw fetchErr;

      let insertedCount = 0;
      let skippedCount = 0;
      const errors = [];
      const validPayloads = [];
      const insertedDetails = [];

      // Create teacher lookup map (by name and username lowercase)
      const teacherMap = {};
      teachers?.forEach(t => {
        if (t.name) teacherMap[t.name.trim().toLowerCase()] = t.id;
        if (t.username) teacherMap[t.username.trim().toLowerCase()] = t.id;
      });

      const getVal = (r, keys) => {
        for (let k of keys) {
          for (let rk in r) {
            if (rk.trim().toLowerCase() === k.toLowerCase()) {
              return String(r[rk]).trim();
            }
          }
        }
        return "";
      };

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const rDay = getVal(row, ["Day", "Day Name", "DayOfWeek"]);
        const rPeriod = parseInt(getVal(row, ["Period Number", "Period", "PeriodNo", "Period Number #", "Period_Number"]), 10);
        const rStart = getVal(row, ["Start Time", "Start", "StartTime", "Start_Time"]);
        const rEnd = getVal(row, ["End Time", "End", "EndTime", "End_Time"]);
        const rClass = getVal(row, ["Class", "Class Name", "Grade", "Standard", "UserClass"]);
        const rSubject = getVal(row, ["Subject", "Subject Name"]);
        const rTeacherStr = getVal(row, ["Teacher", "Teacher Name", "Staff", "Teacher Username"]);

        if (!rDay || isNaN(rPeriod) || !rClass || !rSubject || !rTeacherStr) {
          skippedCount++;
          errors.push(`Row ${idx + 2}: Missing required fields (Day, Period, Class, Subject, or Teacher).`);
          continue;
        }

        // Resolve teacher UUID or keep name string
        const teacherId = teacherMap[rTeacherStr.toLowerCase()] || rTeacherStr;

        // Collision check against existing DB slots (only if not overwriting)
        const hasDbConflict = !overwriteClassSchedule && (existingSlots || []).some(s => 
          s.day.toLowerCase() === rDay.toLowerCase() &&
          s.period_order === rPeriod &&
          s.teacher === teacherId
        );

        // Collision check against newly payload batch
        const hasBatchConflict = validPayloads.some(p =>
          p.day.toLowerCase() === rDay.toLowerCase() &&
          p.period_order === rPeriod &&
          p.teacher === teacherId
        );

        if (hasDbConflict || hasBatchConflict) {
          skippedCount++;
          errors.push(`Row ${idx + 2}: Double Booking Collision! Teacher "${rTeacherStr}" is already assigned at Period #${rPeriod} on ${rDay}.`);
          continue;
        }

        const timeLabel = (rStart && rEnd) ? `${rStart} - ${rEnd}` : `Period ${rPeriod}`;

        validPayloads.push({
          school_id: schoolSettings.school_id,
          day: rDay,
          period_order: rPeriod,
          period_label: timeLabel,
          subject: rSubject,
          class: rClass,
          teacher: teacherId
        });

        insertedDetails.push(`${rClass} | ${rDay} Period ${rPeriod}: ${rSubject} (${rTeacherStr})`);
      }

      if (validPayloads.length > 0) {
        if (overwriteClassSchedule) {
          const targetClasses = Array.from(new Set(validPayloads.map(p => p.class)));
          if (targetClasses.length > 0) {
            await supabase.from('timetable').delete().eq('school_id', schoolSettings.school_id).in('class', targetClasses);
          }
        }

        const { error: insertErr } = await supabase.from('timetable').insert(validPayloads);
        if (insertErr) throw insertErr;
        insertedCount = validPayloads.length;
        queryClient.invalidateQueries({ queryKey: ['timetable'] });
      }

      setBulkSummary({ insertedCount, skippedCount, errors, insertedDetails });
    } catch (err) {
      alert("Bulk upload failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };


  const daysOfWeek = ['All Days', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-8">
      {/* Dynamic Creation Engine Interface */}
      <div className="bg-white dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-slate-800">
           <CalendarDays size={180} className="transform translate-x-8 -translate-y-8" />
        </div>
        
        <h2 className="text-2xl font-bold text-slate-805 dark:text-slate-100 tracking-tight mb-1 flex items-center gap-2">
           <Clock className="text-primary"/> Timetable Manager
        </h2>
        <p className="text-sm text-slate-505 dark:text-slate-400 mb-8 border-b border-border pb-4">Allocate classes to teachers and plan your school's weekly schedule.</p>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
           <div>
              <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">Select Class</label>
              <select required value={targetClass} onChange={e => setTargetClass(e.target.value)} className="sp-input appearance-none cursor-pointer">
                <option value="">-- Choose a Class --</option>
                {classes?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">Day</label>
              <select required value={day} onChange={e => setDay(e.target.value)} className="sp-input appearance-none cursor-pointer">
                {daysOfWeek.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">Teacher</label>
              <select required value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} className="sp-input appearance-none cursor-pointer">
                <option value="">-- Assign Teacher --</option>
                {teachers?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
           </div>
           
           <div>
              <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">Subject</label>
              <input required type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Science" className="sp-input" />
           </div>

           <div className="flex gap-4">
              <div className="w-24">
                <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">Period #</label>
                <input required type="number" min="1" value={periodOrder} onChange={e => setPeriodOrder(e.target.value)} className="sp-input text-center font-bold" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                   <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">Start Time</label>
                   <input required type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="sp-input" style={{ colorScheme: 'dark light' }} />
                </div>
                <div>
                   <label className="block text-xs font-bold tracking-widest text-slate-505 dark:text-slate-400 mb-2 uppercase">End Time</label>
                   <input required type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="sp-input" style={{ colorScheme: 'dark light' }} />
                </div>
              </div>
           </div>
           
           <div className="flex items-end">
              <div className="w-full flex gap-2">
                <button disabled={saveMutation.isPending} type="submit" className="flex-1 h-[46px] flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer border-0">
                   {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                   {saveMutation.isPending ? 'Saving...' : 'Add Period'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(true)}
                  className="h-[46px] px-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 cursor-pointer border-0 whitespace-nowrap"
                >
                  <Upload size={18} /> Bulk Add Timetable
                </button>
              </div>
           </div>
        </form>
      </div>

      <div className="pt-2">
         <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-xl font-bold text-slate-805 dark:text-slate-100">Class Schedule Viewer</h3>
            <span className="bg-slate-100 border border-border px-3 py-1 rounded text-xs font-semibold text-slate-505 dark:text-slate-400 uppercase tracking-wider">{targetClass ? `Viewing: ${targetClass}` : 'Select a class to view'}</span>
         </div>
         <TimetableViewer adminPreviewClass={targetClass} />
      </div>

      {/* ── BULK UPLOAD TIMETABLE MODAL ── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white border border-border rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 tracking-tight text-base">Bulk Upload Timetable</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Import schedule via Excel or CSV</p>
                </div>
              </div>
              <button onClick={() => { setIsBulkModalOpen(false); setBulkFile(null); setBulkSummary(null); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>

            <div className="space-y-4">
              {/* Template Download Option */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Download Sample Template</h4>
                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Pre-formatted columns (Day, Period, Start, End, Class, Subject, Teacher)</p>
                </div>
                <button
                  onClick={handleDownloadTimetableTemplate}
                  className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
                >
                  <Download size={14} /> Template
                </button>
              </div>

              {/* Upload Input */}
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-2xl bg-white hover:bg-slate-50 transition-all text-center relative">
                <Upload size={28} className="text-slate-400 mx-auto mb-2" />
                <span className="text-xs font-bold text-slate-700 block">{bulkFile ? bulkFile.name : "Click or drag Excel/CSV file to upload"}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Supports .xlsx, .xls, .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={e => setBulkFile(e.target.files[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              {/* Overwrite Option */}
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer p-1">
                <input
                  type="checkbox"
                  checked={overwriteClassSchedule}
                  onChange={e => setOverwriteClassSchedule(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Overwrite/Replace existing timetable for uploaded classes</span>
              </label>

              {/* Process Button */}
              <button
                onClick={handleProcessBulkTimetable}
                disabled={!bulkFile || isProcessing}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border-0"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {isProcessing ? "Processing & Validating..." : "Import Timetable Slots"}
              </button>

              {/* Summary Results Overview */}
              {bulkSummary && (
                <div className="space-y-3">
                  {bulkSummary.insertedCount > 0 ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <span>Successfully imported {bulkSummary.insertedCount} timetable period(s)!</span>
                      </div>
                      <div className="max-h-28 overflow-y-auto bg-white/70 p-2.5 rounded-xl border border-emerald-200/60 text-[10px] font-medium text-slate-700 space-y-1">
                        {bulkSummary.insertedDetails?.map((det, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>{det}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span>No periods imported. All rows collided with existing slots or contained invalid data.</span>
                    </div>
                  )}

                  {bulkSummary.skippedCount > 0 && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-1 text-rose-800 text-[11px] font-bold">
                      <div className="flex items-center gap-1.5 text-rose-700">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>Skipped {bulkSummary.skippedCount} conflicting / invalid row(s):</span>
                      </div>
                      <div className="max-h-24 overflow-y-auto pl-4 space-y-0.5 font-normal text-[10px] text-rose-900">
                        {bulkSummary.errors.map((err, i) => <div key={i}>• {err}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
