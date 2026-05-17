import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../config/supabaseClient';
import {
  useSchoolChampions, useBadgesMaster, useLeaderboard,
  awardBadge, revokeBadge, seedDefaultBadges, rolloverYearEnd, useClassAchievements
} from '../../hooks/useAchievements';
import { LucideBadgeIcon } from '../../components/LucideBadgeIcon';
import {
  Trophy, Plus, Trash2, Loader2, Sparkles, Medal, Award, Edit3, BookOpen
} from 'lucide-react';

export default function AdminAchieversPanel() {
  const { user, schoolSettings } = useAppStore();
  const schoolId = schoolSettings?.school_id;
  const qc = useQueryClient();

  const [tab, setTab] = useState('champions'); // 'champions' | 'class_level' | 'catalog' | 'leaderboard'
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [showCreateBadgeModal, setShowCreateBadgeModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);

  const [selectedClass, setSelectedClass] = useState('');

  const { data: champions = [], isLoading: loadingChampions } = useSchoolChampions(schoolId);
  const { data: badges = [], isLoading: loadingBadges } = useBadgesMaster(schoolId);
  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useLeaderboard(schoolId, 'all', null);
  
  // For viewing Class Level as Admin
  const { data: classAchievements = [], isLoading: loadingClassAch } = useClassAchievements(schoolId, selectedClass);

  const [classes, setClasses] = React.useState([]);
  React.useEffect(() => {
    if (!schoolId) return;
    supabase.from('users').select('class').eq('school_id', schoolId).eq('role', 'student').neq('class', null)
      .then(({ data }) => {
        const uniqueClasses = [...new Set((data || []).map(d => d.class))].filter(Boolean).sort();
        setClasses(uniqueClasses);
        if (uniqueClasses.length > 0 && !selectedClass) setSelectedClass(uniqueClasses[0]);
      });
  }, [schoolId]);

  const handleRevoke = async (achievementId, studentId) => {
    if (!window.confirm('Revoke this badge? The record is soft-deleted.')) return;
    await revokeBadge(achievementId, studentId);
    qc.invalidateQueries({ queryKey: ['school-champions', schoolId] });
    qc.invalidateQueries({ queryKey: ['class-achievements', schoolId, selectedClass] });
    qc.invalidateQueries({ queryKey: ['badge-cache', studentId] });
    qc.invalidateQueries({ queryKey: ['leaderboard', schoolId] });
  };

  const handleDeleteBadge = async (badgeId) => {
     if (!window.confirm('Delete this badge from the catalog?')) return;
     await supabase.from('badges_master').update({ is_active: false }).eq('id', badgeId);
     qc.invalidateQueries({ queryKey: ['badges-master', schoolId] });
  };

  const handleSeedBadges = async () => {
    setSeeding(true);
    await seedDefaultBadges(schoolId, user?.id);
    setSeeding(false); setSeedDone(true);
    qc.invalidateQueries({ queryKey: ['badges-master', schoolId] });
  };

  const handleRollover = async () => {
    const currentYear = new Date().getFullYear().toString();
    if (!window.confirm(`Are you sure you want to run the year-end rollover for ${currentYear}? This converts class stars into Mega Stars.`)) return;
    setRollingOver(true);
    try {
      const count = await rolloverYearEnd(schoolId, currentYear);
      alert(`Rollover complete. Awarded ${count} Mega Stars.`);
      qc.invalidateQueries();
    } catch (e) { alert(e.message); } 
    finally { setRollingOver(false); }
  };

  const cardStyle = {
    borderRadius: '18px', padding: '20px',
    background: 'var(--card-bg)', border: '1px solid var(--card-border)',
    animation: 'abSlideUp 0.45s ease both',
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <style>{`@keyframes abSlideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }`}</style>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          ['champions','🏆 School Level Champions'],
          ['class_level','⭐ Class Level Stars'],
          ['catalog','🎖️ Badge Catalog'],
          ['leaderboard','🏅 Leaderboard']
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', borderRadius: '10px', fontWeight: 700,
            fontSize: '12px', cursor: 'pointer', border: 'none',
            background: tab === key ? 'linear-gradient(135deg,#F59E0B,#EF4444)' : 'var(--glass)',
            color: tab === key ? '#fff' : 'var(--text-muted)',
            border: tab === key ? 'none' : '1px solid var(--card-border)',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Champions Tab ── */}
      {tab === 'champions' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
              School Level Champions ({champions.length})
            </span>
            <button onClick={() => setShowAwardModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
              color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer',
            }}>
              <Plus size={13} /> Give Badges
            </button>
          </div>

          {loadingChampions ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-amber-500" /></div> :
           champions.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>🏆 No school level champions yet.</div> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {champions.map(ch => (
                <div key={ch.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', borderRadius: '14px',
                  background: 'var(--glass)', border: '1px solid var(--card-border)',
                }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, background: `${ch.badges_master?.icon_color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LucideBadgeIcon iconKey={ch.badges_master?.icon_key} color={ch.badges_master?.icon_color} size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>{ch.users?.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{ch.badges_master?.name} · {ch.users?.class}</div>
                  </div>
                  <button onClick={() => handleRevoke(ch.id, ch.student_id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><Trash2 size={12} color="#EF4444" /></button>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {/* ── Class Level Tab ── */}
      {tab === 'class_level' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Class Level Badges</span>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="sp-input" style={{ width: '200px' }}>
               <option value="" disabled>Select Class...</option>
               {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loadingClassAch ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-emerald-500" /></div> :
           classAchievements.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>⭐ No stars awarded in this class.</div> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {classAchievements.map(ach => (
                <div key={ach.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', borderRadius: '14px',
                  background: 'var(--glass)', border: '1px solid var(--card-border)',
                }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, background: `${ach.badges_master?.icon_color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LucideBadgeIcon iconKey={ach.badges_master?.icon_key} color={ach.badges_master?.icon_color} size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>{ach.users?.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{ach.badges_master?.name}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{new Date(ach.awarded_at).toLocaleDateString('en-IN')}</div>
                  <button onClick={() => handleRevoke(ach.id, ach.student_id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><Trash2 size={12} color="#EF4444" /></button>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {/* ── Badge Catalog Tab ── */}
      {tab === 'catalog' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Badge Catalog ({badges.length})</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => setShowCreateBadgeModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--glass)', color: 'var(--text-main)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
                <Plus size={13} /> Create Badge
              </button>
              <button onClick={handleRollover} disabled={rollingOver} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#3B82F6,#2563EB)', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
                {rollingOver ? <Loader2 size={13} className="animate-spin" /> : <Award size={13} />} Run Year-End Rollover
              </button>
              {badges.length === 0 && (
                <button onClick={handleSeedBadges} disabled={seeding || seedDone} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', background: seedDone ? '#10B981' : 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
                  {seeding ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {seedDone ? 'Seeded!' : 'Seed Default Badges'}
                </button>
              )}
            </div>
          </div>

          {['school_champion','class_star'].map(tier => {
            const tierBadges = badges.filter(b => b.tier === tier);
            return (
              <div key={tier} style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--card-border)' }}>
                  {tier === 'class_star' ? '⭐ Class Level Stars' : '🏆 School Level Champions'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                  {tierBadges.map(b => (
                    <div key={b.id} style={{ padding: '12px', borderRadius: '14px', background: `${b.icon_color}0D`, border: `1px solid ${b.icon_color}33`, position: 'relative' }}>
                      <button onClick={() => handleDeleteBadge(b.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}><Trash2 size={12} color="var(--text-main)" /></button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={16} />
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{b.name}</span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{b.description}</div>
                      {b.award_type === 'automated' && <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 700, color: '#10B981', background: '#10B98118', borderRadius: '6px', padding: '2px 6px', display: 'inline-block' }}>AUTO</div>}
                      {b.custom_scope_class && <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 700, color: '#6366F1', background: '#6366F118', borderRadius: '6px', padding: '2px 6px', display: 'inline-block', marginLeft: '4px' }}>CLASS: {b.custom_scope_class}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Leaderboard Tab ── */}
      {tab === 'leaderboard' && (
        <div style={cardStyle}>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>School-wide Leaderboard</span>
          </div>
          {loadingLeaderboard ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-indigo-500" /></div> :
           leaderboard.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>No badges awarded yet.</div> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboard.map((lb, idx) => {
                const rank = idx + 1;
                let bgStyle = 'var(--glass)'; let borderStyle = '1px solid var(--card-border)'; let colorStyle = 'var(--text-main)'; let badgeNode = null;
                if (rank === 1) { bgStyle = 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05))'; borderStyle = '1px solid rgba(234, 179, 8, 0.5)'; colorStyle = '#EAB308'; badgeNode = <Medal size={20} color="#EAB308" />; }
                else if (rank === 2) { bgStyle = 'linear-gradient(135deg, rgba(148, 163, 184, 0.15), rgba(148, 163, 184, 0.05))'; borderStyle = '1px solid rgba(148, 163, 184, 0.5)'; colorStyle = '#94A3B8'; badgeNode = <Medal size={20} color="#94A3B8" />; }
                else if (rank === 3) { bgStyle = 'linear-gradient(135deg, rgba(180, 83, 9, 0.15), rgba(180, 83, 9, 0.05))'; borderStyle = '1px solid rgba(180, 83, 9, 0.5)'; colorStyle = '#B45309'; badgeNode = <Medal size={20} color="#B45309" />; }
                
                return (
                  <div key={lb.student_id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', background: bgStyle, border: borderStyle }}>
                    <div style={{ width: '30px', fontWeight: 900, color: colorStyle, fontSize: '14px' }}>#{rank}</div>
                    <div style={{ flex: 1, minWidth: 0, paddingLeft: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {badgeNode}
                      <div style={{ fontSize: '14px', fontWeight: rank <= 3 ? 800 : 600, color: rank <= 3 ? colorStyle : 'var(--text-main)' }}>
                        {lb.name} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '4px' }}>({lb.class})</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>{lb.total}</div>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {showAwardModal && <AwardChampionModal badges={badges} classes={classes} schoolId={schoolId} awardedBy={user?.id} onClose={() => setShowAwardModal(false)} onSuccess={() => { setShowAwardModal(false); qc.invalidateQueries({ queryKey: ['school-champions', schoolId] }); qc.invalidateQueries({ queryKey: ['leaderboard', schoolId] }); }} />}
      {showCreateBadgeModal && <CreateBadgeModal schoolId={schoolId} adminId={user?.id} onClose={() => setShowCreateBadgeModal(false)} onSuccess={() => { setShowCreateBadgeModal(false); qc.invalidateQueries({ queryKey: ['badges-master', schoolId] }); }} />}
    </div>
  );
}

function AwardChampionModal({ badges, classes, schoolId, awardedBy, onClose, onSuccess }) {
  const [selClass, setSelClass] = useState('');
  const [students, setStudents] = useState([]);
  const [selStd, setSelStd] = useState(null);
  const [selBdg, setSelBdg] = useState(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
     if (!selClass) return;
     supabase.from('users').select('id, name').eq('school_id', schoolId).eq('class', selClass).order('name')
       .then(({data}) => setStudents(data || []));
  }, [selClass, schoolId]);

  const submit = async () => {
    if (!selStd || !selBdg) return;
    setLoading(true);
    try {
      await awardBadge({ schoolId, studentId: selStd.id, badgeId: selBdg.id, awardedBy, note });
      onSuccess();
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '440px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Award School Level Champion</h3>
        
        <label className="text-xs font-bold text-slate-500 mb-1 block">1. Select Class</label>
        <select value={selClass} onChange={e => { setSelClass(e.target.value); setSelStd(null); }} className="sp-input" style={{ marginBottom: '12px' }}>
           <option value="" disabled>Choose Class...</option>
           {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="text-xs font-bold text-slate-500 mb-1 block">2. Select Student</label>
        <select value={selStd?.id || ''} onChange={e => setSelStd(students.find(s=>String(s.id) === String(e.target.value)))} className="sp-input" style={{ marginBottom: '16px' }} disabled={!selClass}>
           <option value="" disabled>Choose Student...</option>
           {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label className="text-xs font-bold text-slate-500 mb-1 block">3. Select Badge</label>
        {badges.filter(b => b.tier === 'school_champion').length === 0 ? (
          <div style={{ padding: '12px', background: 'var(--glass)', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            No School Champion badges available. Create one first!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            {badges.filter(b => b.tier === 'school_champion').map(b => (
              <div key={b.id} onClick={() => setSelBdg(b)} style={{ padding: '10px', borderRadius: '8px', border: `2px solid ${selBdg?.id === b.id ? b.icon_color : 'var(--card-border)'}`, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: selBdg?.id === b.id ? `${b.icon_color}11` : 'var(--glass)' }}>
                <LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={16} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{b.name}</span>
              </div>
            ))}
          </div>
        )}
        
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note..." className="sp-input" rows={2} style={{ marginBottom: '16px', resize: 'none' }} />
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} className="btn outline">Cancel</button>
          <button onClick={submit} disabled={loading || !selStd || !selBdg} className="btn accent">{loading ? '...' : 'Award Badge'}</button>
        </div>
      </div>
    </div>
  );
}

function CreateBadgeModal({ schoolId, adminId, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tier, setTier] = useState('class_star');
  const [color, setColor] = useState('#F59E0B');
  const [icon, setIcon] = useState('star');
  const [loading, setLoading] = useState(false);

  const icons = ['star','smile','thumbs-up','zap','heart','sparkles','book-open','hand-heart','trophy','medal','crown','award','flask-conical','music','graduation-cap','shield'];
  const colors = ['#F59E0B','#EF4444','#3B82F6','#10B981','#8B5CF6','#EC4899','#14B8A6','#64748B'];

  const submit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      await supabase.from('badges_master').insert({
        school_id: schoolId, name, description: desc, icon_key: icon, icon_color: color, tier, award_type: 'manual', created_by: adminId
      });
      onSuccess();
    } catch(e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '440px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Create Global Badge</h3>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
           <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="radio" checked={tier==='class_star'} onChange={()=>setTier('class_star')} /> Class Level Star
           </label>
           <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="radio" checked={tier==='school_champion'} onChange={()=>setTier('school_champion')} /> School Level Champion
           </label>
        </div>

        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Badge Name" className="sp-input" style={{ marginBottom: '12px' }} />
        <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Criteria (How to earn this)" className="sp-input" style={{ marginBottom: '12px' }} />
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>ICON</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {icons.map(i => <div key={i} onClick={() => setIcon(i)} style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer', background: icon === i ? 'var(--accent-light)' : 'var(--glass)', border: icon === i ? '1px solid var(--accent)' : '1px solid var(--card-border)' }}><LucideBadgeIcon iconKey={i} color="var(--text-main)" size={16} /></div>)}
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>COLOR</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {colors.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', background: c, border: color === c ? '2px solid white' : '2px solid transparent', boxShadow: color === c ? `0 0 0 2px ${c}` : 'none' }} />)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} className="btn outline">Cancel</button>
          <button onClick={submit} disabled={!name || loading} className="btn accent">{loading ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
