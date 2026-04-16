import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Calendar, ChevronLeft, ChevronRight, Plus, Loader2, CheckCircle } from 'lucide-react';

// Calendar Events — matches renderEventsModule exactly
// Types: activity (teal), exam (purple), holiday (red), event/default (indigo)
const TYPE_COLORS = {
  holiday:  'bg-red-500/20 text-red-300 border-red-500/30',
  exam:     'bg-purple-500/20 text-purple-300 border-purple-500/30',
  activity: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  meeting:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  default:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

function typeBadge(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.default;
}

export default function CalendarEvents() {
  const { role, schoolSettings } = useAppStore();
  const userRole = (role || '').toLowerCase();
  const canEdit = userRole === 'admin' || userRole === 'teacher';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState('');

  // Add event form
  const [eTitle, setETitle] = useState('');
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');
  const [eType, setEType] = useState('activity');
  const [saving, setSaving] = useState(false);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => { fetchEvents(); }, [month, year]);

  async function fetchEvents() {
    setLoading(true);
    const { data } = await supabase.from('calendar_events').select('*').eq('school_id', schoolSettings?.school_id);
    setEvents(data || []);
    setLoading(false);
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const monthDate = new Date(year, month, 1);
  const monthLabel = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDay = monthDate.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function dateStr(day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function dayEvents(day) {
    const ds = dateStr(day);
    return events.filter(e => e.start_date <= ds && (e.end_date || e.start_date) >= ds);
  }

  const saveEvent = async () => {
    if (!eTitle || !eStart) return showToast('Title and Start Date are required');
    setSaving(true);
    const { error } = await supabase.from('calendar_events').insert([{ 
      school_id: schoolSettings.school_id,
      title: eTitle, 
      start_date: eStart, 
      end_date: eEnd || eStart, 
      type: eType 
    }]);
    setSaving(false);
    if (error) return showToast('Error saving event: ' + error.message);
    showToast('Event saved!');
    setShowAddModal(false);
    setETitle(''); setEStart(''); setEEnd(''); setEType('activity');
    fetchEvents();
  };

  return (
    <div className="space-y-4 fade-in pb-10">
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 bg-slate-900 border border-white/10 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="sp-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-indigo-400" />
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Calendar & Events</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"><ChevronLeft size={16} /></button>
            <span className="text-sm font-bold text-slate-200 min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"><ChevronRight size={16} /></button>
            {canEdit && (
              <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2 text-xs ml-2">
                <Plus size={14} /> Add Event
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sp-card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', minWidth: '500px' }}>
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest py-2">{d}</div>
            ))}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const today = new Date().toISOString().split('T')[0];
              const isToday = dateStr(day) === today;
              const evs = dayEvents(day);
              return (
                <div key={day} className={`min-h-[70px] p-1.5 rounded-lg border transition-all ${isToday ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/5 bg-white/2'}`}>
                  <div className={`text-xs font-black mb-1 ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>{day}</div>
                  {evs.map((e, ei) => (
                    <div key={ei} className={`text-[9px] font-bold px-1 py-0.5 rounded border mb-0.5 leading-tight truncate ${typeBadge(e.type)}`}>
                      {e.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="sp-card w-full max-w-md">
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest mb-4">Add Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Title</label>
                <input value={eTitle} onChange={e => setETitle(e.target.value)} placeholder="e.g. Annual Day" className="sp-input w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Start Date</label>
                  <input type="date" value={eStart} onChange={e => setEStart(e.target.value)} className="sp-input w-full" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">End Date</label>
                  <input type="date" value={eEnd} onChange={e => setEEnd(e.target.value)} className="sp-input w-full" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Type</label>
                <select value={eType} onChange={e => setEType(e.target.value)} className="sp-input w-full">
                  <option value="activity">Activity</option>
                  <option value="exam">Exam</option>
                  <option value="holiday">Holiday</option>
                  <option value="meeting">Meeting</option>
                  <option value="event">Event</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={saveEvent} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
