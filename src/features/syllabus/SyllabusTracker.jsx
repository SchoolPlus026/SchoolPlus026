import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { BookOpen, CheckCircle2, Circle, Loader2, Save, ChevronDown, ChevronUp, Edit2, PlayCircle, Settings, ShieldCheck, Lock, Layers, Plus } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

/* ── Progress Circle Component ── */
const ProgressCircle = ({ percentage, size = 60, strokeWidth = 6, color = '#38bdf8' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--card-border)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.25, fontWeight: 800 }}>
        {Math.round(percentage)}%
      </div>
    </div>
  );
};

/* ── Teacher View ────────────────────────────────────────────────────────── */
function TeacherSyllabus({ schoolId, user }) {
  const { schoolSettings } = useAppStore();
  const isGroupingEnabled = schoolSettings?.gdrive_config?.syllabus_grouping_enabled === true || schoolSettings?.school_override_active?.syllabus_grouping_enabled === true || schoolSettings?.syllabus_grouping_enabled === true;
  const groupLabel = schoolSettings?.gdrive_config?.syllabus_group_label || schoolSettings?.school_override_active?.syllabus_group_label || schoolSettings?.syllabus_group_label || 'Unit';

  const [selectedSubject, setSelectedSubject] = useState(null); // { class, subject }
  const [totalChaptersInput, setTotalChaptersInput] = useState('');
  
  // Dynamic per-unit chapter configuration
  const [unitListState, setUnitListState] = useState([
    { name: `${groupLabel} 1`, count: '4' },
    { name: `${groupLabel} 2`, count: '3' }
  ]);

  const queryClient = useQueryClient();

  const { data: allocations = [], isLoading: loadingTimetable } = useQuery({
    queryKey: ['teacher-allocations', schoolId, user.id],
    queryFn: async () => {
      const { data } = await supabase.from('timetable').select('subject, class').eq('school_id', schoolId).eq('teacher', user.id);
      const unique = [];
      (data || []).forEach(d => {
        if (!unique.find(u => u.subject === d.subject && u.class === d.class) && d.subject && d.class) unique.push(d);
      });
      return unique;
    }
  });

  const { data: syllabus, isLoading: loadingSyllabus } = useQuery({
    queryKey: ['syllabus', schoolId, selectedSubject?.class, selectedSubject?.subject],
    queryFn: async () => {
      if (!selectedSubject) return null;
      const { data } = await supabase.from('syllabus_tracker').select('*')
        .eq('school_id', schoolId).eq('class', selectedSubject.class).eq('subject', selectedSubject.subject).single();
      return data || { chapters: [], total_chapters: 0 };
    },
    enabled: !!selectedSubject,
  });

  const setupMutation = useMutation({
    mutationFn: async ({ unitsList, total }) => {
      let chapters = [];
      if (isGroupingEnabled && Array.isArray(unitsList) && unitsList.length > 0) {
        let chId = 1;
        unitsList.forEach((uItem, uIdx) => {
          const uName = uItem.name.trim() || `${groupLabel} ${uIdx + 1}`;
          const count = parseInt(uItem.count, 10) || 1;
          for (let c = 1; c <= count; c++) {
            chapters.push({ id: chId, unit_name: uName, title: '', is_completed: false });
            chId++;
          }
        });
      } else {
        chapters = Array.from({ length: total }).map((_, i) => ({ id: i + 1, unit_name: `${groupLabel} 1`, title: '', is_completed: false }));
      }

      const calcTotal = chapters.length;

      if (syllabus?.id) {
        await supabase.from('syllabus_tracker').update({ total_chapters: calcTotal, chapters }).eq('id', syllabus.id);
      } else {
        await supabase.from('syllabus_tracker').insert({ school_id: schoolId, class: selectedSubject.class, subject: selectedSubject.subject, total_chapters: calcTotal, chapters, updated_by: user.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syllabus'] });
      queryClient.invalidateQueries({ queryKey: ['syllabus-student'] });
      queryClient.invalidateQueries({ queryKey: ['syllabus-admin'] });
    }
  });

  const updateChapterMutation = useMutation({
    mutationFn: async ({ chapters }) => {
      await supabase.from('syllabus_tracker').update({ chapters, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', syllabus.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syllabus'] });
      queryClient.invalidateQueries({ queryKey: ['syllabus-student'] });
      queryClient.invalidateQueries({ queryKey: ['syllabus-admin'] });
    }
  });

  const handleSetup = () => {
    if (isGroupingEnabled) {
      if (!unitListState || unitListState.length === 0) {
        return alert(`Please add at least one ${groupLabel}.`);
      }
      setupMutation.mutate({ unitsList: unitListState });
    } else {
      const total = parseInt(totalChaptersInput, 10);
      if (!total || total <= 0) return alert("Please enter a valid number of chapters.");
      setupMutation.mutate({ total });
    }
  };

  const handleAddUnitRow = () => {
    setUnitListState(prev => [...prev, { name: `${groupLabel} ${prev.length + 1}`, count: '3' }]);
  };

  const handleRemoveUnitRow = (index) => {
    if (unitListState.length <= 1) return alert(`You must have at least one ${groupLabel}.`);
    setUnitListState(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateUnitRow = (index, field, value) => {
    setUnitListState(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const toggleChapter = (chapterId) => {
    const newChapters = syllabus.chapters.map(c => c.id === chapterId ? { ...c, is_completed: !c.is_completed } : c);
    queryClient.setQueryData(['syllabus', schoolId, selectedSubject?.class, selectedSubject?.subject], { ...syllabus, chapters: newChapters });
    updateChapterMutation.mutate({ chapters: newChapters });
  };

  const updateTitle = (chapterId, title) => {
    const newChapters = syllabus.chapters.map(c => c.id === chapterId ? { ...c, title } : c);
    queryClient.setQueryData(['syllabus', schoolId, selectedSubject?.class, selectedSubject?.subject], { ...syllabus, chapters: newChapters });
    updateChapterMutation.mutate({ chapters: newChapters });
  };

  // Group chapters by unit_name if grouping enabled
  const groupedChapters = useMemo(() => {
    const chapters = syllabus?.chapters || [];
    if (!isGroupingEnabled) {
      return [{ groupName: null, items: chapters }];
    }
    const map = {};
    chapters.forEach(ch => {
      const gName = ch.unit_name || `${groupLabel} 1`;
      if (!map[gName]) map[gName] = [];
      map[gName].push(ch);
    });
    return Object.keys(map).map(gName => ({ groupName: gName, items: map[gName] }));
  }, [syllabus, isGroupingEnabled, groupLabel]);

  if (loadingTimetable) return <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>;

  return (
    <div className="card" style={{ borderTop: '4px solid #38bdf8' }}>
      <h3 style={{ margin: '0 0 16px', fontWeight: 800 }}>Manage Syllabus Tracker</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
        Select an assigned subject to update progression. {isGroupingEnabled && <span className="text-indigo-400 font-semibold">({groupLabel} Grouping Active)</span>}
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {allocations.map((alloc, idx) => {
          const isSelected = selectedSubject?.subject === alloc.subject && selectedSubject?.class === alloc.class;
          return (
            <div 
              key={idx} 
              className="card" 
              style={{ 
                padding: '16px', 
                background: 'var(--bg-main)', 
                border: `1px solid ${isSelected ? '#38bdf8' : 'var(--card-border)'}`,
                borderRadius: '16px',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (isSelected) {
                  setSelectedSubject(null);
                } else {
                  setSelectedSubject(alloc);
                  setTotalChaptersInput('');
                }
              }}
            >
              {/* Accordion Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 800, fontSize: '16px', color: 'var(--text-main)' }}>{alloc.subject}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Class {alloc.class}</span>
                </div>
                {isSelected ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </div>

              {/* Accordion Expanded Content */}
              {isSelected && (
                <div 
                  className="fade-in mt-4 pt-4 border-t border-[var(--card-border)]" 
                  onClick={(e) => e.stopPropagation()}
                >
                  {loadingSyllabus ? (
                    <div className="text-center py-4"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>
                  ) : (!syllabus?.total_chapters || syllabus.total_chapters === 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '420px' }}>
                      {isGroupingEnabled ? (
                        <>
                          <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers size={15} /> Setup {groupLabel} Structure (Custom Chapters per {groupLabel})
                          </div>

                          <div className="space-y-2">
                            {unitListState.map((uItem, uIdx) => (
                              <div key={uIdx} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-700/50 bg-slate-800/30">
                                <input
                                  type="text"
                                  value={uItem.name}
                                  onChange={e => handleUpdateUnitRow(uIdx, 'name', e.target.value)}
                                  placeholder={`${groupLabel} ${uIdx + 1} Name`}
                                  className="sp-input text-xs font-bold"
                                  style={{ flex: 2 }}
                                />
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[11px] text-slate-400 font-medium">Chapters:</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={uItem.count}
                                    onChange={e => handleUpdateUnitRow(uIdx, 'count', e.target.value)}
                                    className="sp-input text-xs font-bold text-center"
                                    style={{ width: '60px' }}
                                  />
                                </div>
                                {unitListState.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveUnitRow(uIdx)}
                                    className="text-rose-400 hover:text-rose-300 text-xs font-bold px-1.5 py-1"
                                    title="Remove"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={handleAddUnitRow}
                            className="px-3 py-1.5 rounded-lg border border-dashed border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 text-xs font-extrabold flex items-center gap-1 w-fit transition-all cursor-pointer"
                          >
                            <Plus size={14} /> Add another {groupLabel}
                          </button>
                        </>
                      ) : (
                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Chapters/Topics</label>
                          <input type="number" min="1" value={totalChaptersInput} onChange={e => setTotalChaptersInput(e.target.value)} placeholder="e.g. 12" className="sp-input block w-full mt-1" />
                        </div>
                      )}

                      <button onClick={handleSetup} disabled={setupMutation.isPending} className="btn accent" style={{ background: '#38bdf8', marginTop: '4px' }}>
                        {setupMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />} Generate Checklist
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Checklist ({syllabus.chapters.filter(c => c.is_completed).length} / {syllabus.total_chapters} Completed)</span>
                      </div>

                      {groupedChapters.map((group, gIdx) => (
                        <div key={gIdx} className="space-y-2">
                          {group.groupName && (
                            <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-400 uppercase tracking-widest px-2 py-1 bg-indigo-500/10 rounded-lg w-fit border border-indigo-500/20">
                              <Layers size={14} />
                              {group.groupName} ({group.items.filter(c => c.is_completed).length}/{group.items.length})
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {group.items.map((ch) => (
                              <div 
                                key={ch.id} 
                                onClick={() => toggleChapter(ch.id)}
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '16px', 
                                  padding: '14px 20px', 
                                  background: ch.is_completed ? 'rgba(16, 185, 129, 0.06)' : 'var(--card, #ffffff)', 
                                  borderRadius: '16px', 
                                  border: '1px solid var(--card-border, rgba(255, 255, 255, 0.08))',
                                  borderLeft: ch.is_completed ? '4px solid #10b981' : '4px solid var(--text-faint, #94a3b8)',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 4px 12px -2px rgba(0,0,0,0.03)',
                                  cursor: 'pointer'
                                }}
                                className="hover:translate-x-1 hover:shadow-md transition-all"
                              >
                                <div style={{ flexShrink: 0 }}>
                                  {ch.is_completed ? <CheckCircle2 size={22} className="text-emerald-500" style={{ fill: 'rgba(16, 185, 129, 0.1)' }} /> : <Circle size={22} color="var(--text-faint)" />}
                                </div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)', minWidth: '90px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Chapter {ch.id}</span>
                                  <input 
                                    type="text" defaultValue={ch.title || ''} 
                                    onBlur={(e) => updateTitle(ch.id, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="Add chapter name..."
                                    style={{ 
                                      flex: 1, 
                                      background: 'transparent', 
                                      border: 'none', 
                                      outline: 'none', 
                                      fontSize: '14px', 
                                      fontWeight: 600, 
                                      color: 'var(--text-main)', 
                                      textDecoration: ch.is_completed ? 'line-through' : 'none',
                                      opacity: ch.is_completed ? 0.65 : 1,
                                      cursor: 'text'
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Student View ────────────────────────────────────────────────────────── */
function StudentSyllabus({ schoolId, userClass }) {
  const { schoolSettings } = useAppStore();
  const isGroupingEnabled = schoolSettings?.gdrive_config?.syllabus_grouping_enabled === true || schoolSettings?.school_override_active?.syllabus_grouping_enabled === true || schoolSettings?.syllabus_grouping_enabled === true;
  const groupLabel = schoolSettings?.gdrive_config?.syllabus_group_label || schoolSettings?.school_override_active?.syllabus_group_label || schoolSettings?.syllabus_group_label || 'Unit';

  const [expandedId, setExpandedId] = useState(null);

  const { data: allSyllabus, isLoading } = useQuery({
    queryKey: ['syllabus-student', schoolId, userClass],
    queryFn: async () => {
      const { data } = await supabase.from('syllabus_tracker').select('*').eq('school_id', schoolId).eq('class', userClass);
      return data || [];
    },
    enabled: !!userClass,
  });

  if (isLoading) return <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>;
  if (!allSyllabus?.length) return <div className="card text-center text-slate-500 py-12">No syllabus available for your class yet.</div>;

  let totalChapters = 0;
  let totalCompleted = 0;
  allSyllabus.forEach(s => {
    totalChapters += (s.total_chapters || 0);
    totalCompleted += (s.chapters || []).filter(c => c.is_completed).length;
  });
  const overallProgress = totalChapters > 0 ? (totalCompleted / totalChapters) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Overview Charts */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: '24px', padding: '32px' }}>
        <div style={{ textAlign: 'center' }}>
          <ProgressCircle percentage={overallProgress} size={100} strokeWidth={8} color="#10b981" />
          <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Completed</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <ProgressCircle percentage={100 - overallProgress} size={100} strokeWidth={8} color="#f43f5e" />
          <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Remaining</div>
        </div>
      </div>

      {/* Subject List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {allSyllabus.map(s => {
          const chapters = s.chapters || [];
          const completedCount = chapters.filter(c => c.is_completed).length;
          const prog = s.total_chapters > 0 ? (completedCount / s.total_chapters) * 100 : 0;
          const isExpanded = expandedId === s.id;

          // Grouping logic for Student
          const groupedMap = {};
          if (isGroupingEnabled) {
            chapters.forEach(ch => {
              const gName = ch.unit_name || `${groupLabel} 1`;
              if (!groupedMap[gName]) groupedMap[gName] = [];
              groupedMap[gName].push(ch);
            });
          }

          return (
            <div key={s.id} className="card" style={{ padding: '16px', paddingBottom: isExpanded ? '16px' : '16px', cursor: 'pointer', transition: 'all 0.3s ease' }} onClick={() => setExpandedId(isExpanded ? null : s.id)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <ProgressCircle percentage={prog} size={48} strokeWidth={5} />
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>{s.subject}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{completedCount} of {s.total_chapters} Chapters</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
              </div>

              {isExpanded && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {isGroupingEnabled ? (
                    Object.keys(groupedMap).map((gName, gIdx) => (
                      <div key={gIdx} className="space-y-2">
                        <div className="text-xs font-extrabold text-indigo-400 uppercase tracking-widest px-2.5 py-1 bg-indigo-500/10 rounded-lg w-fit border border-indigo-500/20">
                          {gName}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {groupedMap[gName].map(ch => (
                            <div key={ch.id} style={{ 
                              display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px', 
                              background: ch.is_completed ? 'rgba(16, 185, 129, 0.04)' : 'var(--card, #ffffff)', 
                              borderRadius: '14px', border: '1px solid var(--card-border, rgba(255, 255, 255, 0.08))',
                              borderLeft: ch.is_completed ? '4px solid #10b981' : '4px solid var(--text-faint, #94a3b8)',
                            }}>
                              {ch.is_completed ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} color="var(--text-faint)" />}
                              <span style={{ 
                                fontSize: '14px', fontWeight: 700, 
                                color: ch.is_completed ? 'var(--text-muted)' : 'var(--text-main)',
                                textDecoration: ch.is_completed ? 'line-through' : 'none', flex: 1
                              }}>
                                Chapter {ch.id}{ch.title ? `: ${ch.title}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    chapters.map(ch => (
                      <div key={ch.id} style={{ 
                        display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px', 
                        background: ch.is_completed ? 'rgba(16, 185, 129, 0.04)' : 'var(--card, #ffffff)', 
                        borderRadius: '14px', border: '1px solid var(--card-border, rgba(255, 255, 255, 0.08))',
                        borderLeft: ch.is_completed ? '4px solid #10b981' : '4px solid var(--text-faint, #94a3b8)',
                      }}>
                        {ch.is_completed ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} color="var(--text-faint)" />}
                        <span style={{ 
                          fontSize: '14px', fontWeight: 700, 
                          color: ch.is_completed ? 'var(--text-muted)' : 'var(--text-main)',
                          textDecoration: ch.is_completed ? 'line-through' : 'none', flex: 1
                        }}>
                          Chapter {ch.id}{ch.title ? `: ${ch.title}` : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Admin View ──────────────────────────────────────────────────────────── */
function AdminSyllabus({ schoolId }) {
  const { user, schoolSettings } = useAppStore();
  const isGroupingEnabled = schoolSettings?.gdrive_config?.syllabus_grouping_enabled === true || schoolSettings?.school_override_active?.syllabus_grouping_enabled === true || schoolSettings?.syllabus_grouping_enabled === true;
  const currentGroupLabel = schoolSettings?.gdrive_config?.syllabus_group_label || schoolSettings?.school_override_active?.syllabus_group_label || schoolSettings?.syllabus_group_label || 'Unit';

  const [filterType, setFilterType] = useState('class'); // 'class' or 'teacher'
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Structure Configuration Modal States
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState(isGroupingEnabled);
  const [pendingPreset, setPendingPreset] = useState(['Units', 'Semester', 'Term', 'Quarter'].includes(currentGroupLabel) ? currentGroupLabel : 'Custom');
  const [pendingCustomLabel, setPendingCustomLabel] = useState(['Units', 'Semester', 'Term', 'Quarter'].includes(currentGroupLabel) ? '' : currentGroupLabel);
  const [adminPassword, setAdminPassword] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Fetch unique classes and teachers from timetable to populate dropdowns
  const { data: filtersData } = useQuery({
    queryKey: ['syllabus-admin-filters', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('timetable').select('class, teacher').eq('school_id', schoolId);
      const classes = [...new Set((data || []).map(d => d.class).filter(Boolean))].sort();
      const teacherUUIDs = [...new Set((data || []).map(d => d.teacher).filter(Boolean))];
      
      let teacherMap = {};
      if (teacherUUIDs.length > 0) {
        const { data: usersData } = await supabase.from('users').select('id, name').in('id', teacherUUIDs);
        usersData?.forEach(u => { teacherMap[u.id] = u.name; });
      }
      
      const teachers = [...new Set(teacherUUIDs.map(id => teacherMap[id] || id))].sort();
      return { classes, teachers, teacherMap };
    }
  });

  const { data: syllabusList = [], isLoading } = useQuery({
    queryKey: ['syllabus-admin', schoolId, filterType, selectedClass, selectedTeacher],
    queryFn: async () => {
      let q = supabase.from('syllabus_tracker').select('*, users!updated_by(name)').eq('school_id', schoolId);
      if (filterType === 'class' && selectedClass) q = q.eq('class', selectedClass);
      const { data } = await q;
      if (filterType === 'teacher' && selectedTeacher) {
        return (data || []).filter(s => s.users?.name === selectedTeacher);
      }
      return data || [];
    },
    enabled: (filterType === 'class' && !!selectedClass) || (filterType === 'teacher' && !!selectedTeacher)
  });

  // Password verification & Save Settings
  const handleSaveStructureSettings = async (e) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      return alert('Please enter your admin password to confirm structure changes.');
    }

    setVerifying(true);
    try {
      // 1. Password Verification via Supabase Auth
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: adminPassword
      });

      if (authErr) {
        throw new Error('Invalid admin password! Action unauthorized.');
      }

      const finalLabel = pendingPreset === 'Custom' ? (pendingCustomLabel.trim() || 'Unit') : pendingPreset;

      const currentGDrive = typeof schoolSettings?.gdrive_config === 'object' ? (schoolSettings.gdrive_config || {}) : {};
      const updatedGDrive = {
        ...currentGDrive,
        syllabus_grouping_enabled: pendingEnabled,
        syllabus_group_label: finalLabel
      };

      // 2. Persist to school_settings DB via jsonb gdrive_config (Guaranteed column in school_settings)
      const { error: updateErr } = await supabase.from('school_settings')
        .update({
          gdrive_config: updatedGDrive
        })
        .eq('school_id', schoolId);

      if (updateErr) throw updateErr;

      // 3. Update local Zustand Store
      useAppStore.getState().setSchoolSettings({
        ...schoolSettings,
        gdrive_config: updatedGDrive,
        syllabus_grouping_enabled: pendingEnabled,
        syllabus_group_label: finalLabel
      });

      alert('Syllabus grouping configuration updated successfully!');
      setShowConfigModal(false);
      setAdminPassword('');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="card" style={{ borderTop: '4px solid #8b5cf6' }}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 border-b border-slate-700/40 pb-4">
        <div>
          <h3 style={{ margin: 0, fontWeight: 900, fontSize: '18px' }}>School-Wide Syllabus Overview</h3>
          <p className="text-xs text-slate-400 mt-0.5">Monitor progression and configure curriculum structure.</p>
        </div>

        {/* Grouping Configuration Button */}
        <button
          onClick={() => {
            setPendingEnabled(isGroupingEnabled);
            setPendingPreset(['Units', 'Semester', 'Term', 'Quarter'].includes(currentGroupLabel) ? currentGroupLabel : 'Custom');
            setPendingCustomLabel(['Units', 'Semester', 'Term', 'Quarter'].includes(currentGroupLabel) ? '' : currentGroupLabel);
            setAdminPassword('');
            setShowConfigModal(true);
          }}
          className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
        >
          <Settings size={15} />
          <span>Curriculum Structure: <strong>{isGroupingEnabled ? `${currentGroupLabel} Grouping` : 'Standard (OFF)'}</strong></span>
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--bg-main)', borderRadius: '12px', padding: '4px', border: '1px solid var(--card-border)' }}>
          <button onClick={() => { setFilterType('class'); setSelectedTeacher(''); }} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'class' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>By Class</button>
          <button onClick={() => { setFilterType('teacher'); setSelectedClass(''); }} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'teacher' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>By Teacher</button>
        </div>

        {filterType === 'class' ? (
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="sp-input" style={{ width: '200px' }}>
            <option value="">-- Select Class --</option>
            {filtersData?.classes?.map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
        ) : (
          <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} className="sp-input" style={{ width: '200px' }}>
            <option value="">-- Select Teacher --</option>
            {filtersData?.teachers?.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {isLoading ? <Loader2 className="animate-spin mx-auto text-slate-400 my-8" /> : 
       (!selectedClass && !selectedTeacher) ? <p className="text-center text-slate-400 py-12">Please select a filter above to view progress.</p> :
       syllabusList.length === 0 ? <p className="text-center text-slate-400 py-12">No syllabus tracked for this selection yet.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Average Stats Header */}
          <div style={{ padding: '16px', background: 'rgba(139,92,246,0.05)', borderRadius: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px dashed rgba(139,92,246,0.3)' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#8b5cf6', letterSpacing: '0.05em' }}>Overall Completion</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-main)' }}>
                {(() => {
                  let tc = 0, cc = 0;
                  syllabusList.forEach(s => { tc += (s.total_chapters || 0); cc += (s.chapters || []).filter(c => c.is_completed).length; });
                  return tc > 0 ? Math.round((cc / tc) * 100) : 0;
                })()}%
              </div>
            </div>
          </div>

          {syllabusList.map(s => {
            const chapters = s.chapters || [];
            const completedCount = chapters.filter(c => c.is_completed).length;
            const prog = s.total_chapters > 0 ? (completedCount / s.total_chapters) * 100 : 0;
            const isExpanded = expandedId === s.id;

            return (
              <div key={s.id} style={{ background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
                <div style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <ProgressCircle percentage={prog} size={42} strokeWidth={4} color="#8b5cf6" />
                    <div>
                      <h4 style={{ margin: 0, fontWeight: 800, fontSize: '15px' }}>{s.subject} {filterType === 'teacher' && <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}> (Class {s.class})</span>}</h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Teacher: {s.users?.name || 'Unknown'} • {completedCount}/{s.total_chapters}</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>

                {isExpanded && (
                  <div style={{ padding: '16px', paddingTop: 0, borderTop: '1px solid var(--card-border)', background: 'var(--card, #ffffff)' }}>
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {chapters.map(ch => (
                        <div key={ch.id} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px', 
                          padding: '12px 18px', 
                          background: ch.is_completed ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-faint, var(--bg-main, #f8fafc))', 
                          borderRadius: '14px',
                          border: '1px solid var(--card-border, rgba(255, 255, 255, 0.08))',
                          borderLeft: ch.is_completed ? '4px solid #10b981' : '4px solid var(--text-faint, #94a3b8)',
                          boxShadow: '0 4px 12px -2px rgba(0,0,0,0.02)'
                        }}>
                          {ch.is_completed ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} color="var(--text-faint)" />}
                          <span style={{ 
                            fontSize: '13px', 
                            fontWeight: 700, 
                            color: ch.is_completed ? 'var(--text-muted)' : 'var(--text-main)', 
                            textDecoration: ch.is_completed ? 'line-through' : 'none',
                            flex: 1
                          }}>
                            {ch.unit_name ? `[${ch.unit_name}] ` : ''}Chapter {ch.id}{ch.title ? `: ${ch.title}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADMIN STRUCTURE CONFIGURATION MODAL (Protected by Password) ── */}
      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', padding: '24px' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Curriculum Structure Settings</h3>
                <p className="text-xs text-slate-400 margin-0">Configure Units/Semesters grouping for teachers.</p>
              </div>
            </div>

            <form onSubmit={handleSaveStructureSettings} className="space-y-4 mt-5">
              {/* Grouping Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-700/60 bg-slate-800/40">
                <div>
                  <div className="text-xs font-extrabold text-slate-200">Enable Grouping Structure</div>
                  <div className="text-[11px] text-slate-400">Default is OFF (Standard Chapters)</div>
                </div>
                <input
                  type="checkbox"
                  checked={pendingEnabled}
                  onChange={e => setPendingEnabled(e.target.checked)}
                  style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                />
              </div>

              {/* Terminology Selector */}
              {pendingEnabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1.5">Grouping Preset Terminology</label>
                    <select
                      value={pendingPreset}
                      onChange={e => setPendingPreset(e.target.value)}
                      className="sp-input block w-full"
                    >
                      <option value="Units">Units (Default)</option>
                      <option value="Semester">Semester</option>
                      <option value="Term">Term</option>
                      <option value="Quarter">Quarter</option>
                      <option value="Custom">Custom (Specify Name)</option>
                    </select>
                  </div>

                  {pendingPreset === 'Custom' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1.5">Custom Structure Name</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Module, Part, Section..."
                        value={pendingCustomLabel}
                        onChange={e => setPendingCustomLabel(e.target.value)}
                        className="sp-input block w-full"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Admin Password Verification Input */}
              <div className="pt-2 border-t border-slate-700/50">
                <label className="text-xs font-extrabold text-amber-400 block mb-1.5 flex items-center gap-1.5">
                  <Lock size={14} /> Password Verification Required
                </label>
                <input
                  required
                  type="password"
                  placeholder="Enter your Admin Password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  className="sp-input block w-full"
                  style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => setShowConfigModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={verifying} className="btn accent" style={{ flex: 2, background: '#6366f1' }}>
                  {verifying ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function SyllabusTracker() {
  const { user, role, schoolSettings } = useAppStore();
  const isAdmin = role === 'admin' || role === 'platform_admin';
  const isTeacher = role === 'teacher';
  
  return (
    <ModuleGuard moduleName="syllabus">
      <div className="fade-in max-w-4xl mx-auto pb-12">
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #0f172a, #0369a1)',
          padding: '28px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '18px',
        }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '15px', background: 'rgba(56,189,248,0.2)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={26} color="#7dd3fc" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Syllabus Tracker</h2>
            <p style={{ color: 'rgba(224,242,254,0.65)', fontSize: '13px', margin: '4px 0 0' }}>
              {isAdmin ? 'Monitor curriculum progress across the school.' :
               isTeacher ? 'Track curriculum progress for your assigned classes.' : 'Check your class syllabus progress.'}
            </p>
          </div>
        </div>

        {isAdmin ? <AdminSyllabus schoolId={schoolSettings.school_id} /> :
         isTeacher ? <TeacherSyllabus schoolId={schoolSettings.school_id} user={user} /> :
         <StudentSyllabus schoolId={schoolSettings.school_id} userClass={user?.class} />}
      </div>
    </ModuleGuard>
  );
}
