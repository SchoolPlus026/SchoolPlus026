import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../config/supabaseClient';
import {
  useClassAchievements, useBadgesMaster, useLeaderboard,
  awardBadge, createCustomBadge, deleteCustomBadge
} from '../../hooks/useAchievements';
import { LucideBadgeIcon } from '../../components/LucideBadgeIcon';
import { Star, Plus, Trash2, Loader2, BookOpen, Medal } from 'lucide-react';

export default function TeacherAchieversPanel() {
  const { user, schoolSettings } = useAppStore();
  const schoolId = schoolSettings?.school_id;
  const [teacherClass, setTeacherClass] = useState(user?.class || '');
  const qc = useQueryClient();

  React.useEffect(() => {
    async function fetchClass() {
      if (!user?.class && user?.id) {
        const { data } = await supabase.from('users').select('class').eq('id', user.id).single();
        if (data?.class) setTeacherClass(data.class);
      }
    }
    fetchClass();
  }, [user]);

  const className = teacherClass;

  const [tab, setTab] = useState('class'); // 'class' | 'custom' | 'catalog' | 'school'
  const [showAwardModal, setShowAwardModal] = useState(false);

  const { data: classBadges = [], isLoading: loadingBadges } = useBadgesMaster(schoolId, 'class_star', className);
  const { data: allBadges = [] } = useBadgesMaster(schoolId, null, className); // For catalog
  const { data: achievements = [], isLoading: loadingAch } = useClassAchievements(schoolId, className);
  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useLeaderboard(schoolId, 'all', null);

  const [students, setStudents] = React.useState([]);
  React.useEffect(() => {
    if (!schoolId || !className) return;
    supabase.from('users').select('id, name').eq('school_id', schoolId).eq('class', className).eq('role', 'student').order('name')
      .then(({ data }) => setStudents(data || []));
  }, [schoolId, className]);

  const handleDeleteCustom = async (id) => {
    if (!window.confirm('Delete this custom badge? It will not affect past awards, but cannot be awarded again.')) return;
    await deleteCustomBadge(id);
    qc.invalidateQueries({ queryKey: ['badges-master', schoolId] });
  };

  const cardStyle = { borderRadius: '18px', padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', animation: 'abSlideUp 0.45s ease both' };

  if (!className) return <div className="p-4 text-amber-500 font-bold bg-amber-500/10 rounded-lg">You are not assigned to a class.</div>;

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          ['class', `⭐ My Class (${className})`],
          ['custom', '✏️ Custom Badges'],
          ['catalog', '🎖️ Info Guide'],
          ['school', '🌍 School Leaderboard']
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
            background: tab === key ? 'linear-gradient(135deg,#10B981,#059669)' : 'var(--glass)',
            color: tab === key ? '#fff' : 'var(--text-muted)',
            border: tab === key ? 'none' : '1px solid var(--card-border)',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'class' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Recent Class Level Stars</span>
            <button onClick={() => setShowAwardModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
              <Plus size={13} /> Give Badges
            </button>
          </div>
          {loadingAch ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-emerald-500" /></div> :
           achievements.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>⭐ No stars awarded in your class yet.</div> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {achievements.map(ach => (
                <div key={ach.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, background: `${ach.badges_master?.icon_color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LucideBadgeIcon iconKey={ach.badges_master?.icon_key} color={ach.badges_master?.icon_color} size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>{ach.users?.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{ach.badges_master?.name}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{new Date(ach.awarded_at).toLocaleDateString('en-IN')}</div>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {tab === 'custom' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Your Custom Badges</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Create custom badges specifically for your class.</p>
          <CreateCustomBadgeForm schoolId={schoolId} teacherId={user?.id} className={className} onSuccess={() => qc.invalidateQueries({ queryKey: ['badges-master', schoolId] })} />
          <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
            {classBadges.filter(b => b.custom_scope_class === className).map(b => (
              <div key={b.id} style={{ padding: '12px', borderRadius: '14px', background: `${b.icon_color}0D`, border: `1px solid ${b.icon_color}33`, position: 'relative' }}>
                <button onClick={() => handleDeleteCustom(b.id)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}><Trash2 size={12} /></button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}><LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={16} /><span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{b.name}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Guide / Catalog */}
      {tab === 'catalog' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Badge Catalog & Info Guide</span>
          </div>
          {['school_champion','class_star'].map(tier => {
            const tierBadges = allBadges.filter(b => b.tier === tier);
            return (
              <div key={tier} style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--card-border)' }}>
                  {tier === 'class_star' ? '⭐ Class Level Stars' : '🏆 School Level Champions'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                  {tierBadges.map(b => (
                    <div key={b.id} style={{ padding: '12px', borderRadius: '14px', background: `${b.icon_color}0D`, border: `1px solid ${b.icon_color}33` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}><LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={16} /><span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{b.name}</span></div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{b.description}</div>
                      {b.award_type === 'automated' && <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 700, color: '#10B981', background: '#10B98118', borderRadius: '6px', padding: '2px 6px', display: 'inline-block' }}>AUTO</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'school' && (
        <div style={cardStyle}>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>School-wide Leaderboard</span>
          </div>
          {loadingLeaderboard ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-indigo-500" /></div> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboard.map((lb, idx) => {
                const rank = idx + 1;
                let bgStyle = 'var(--glass)'; let colorStyle = 'var(--text-main)'; let badgeNode = null;
                if (rank === 1) { bgStyle = 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05))'; colorStyle = '#EAB308'; badgeNode = <Medal size={20} color="#EAB308" />; }
                else if (rank === 2) { bgStyle = 'linear-gradient(135deg, rgba(148, 163, 184, 0.15), rgba(148, 163, 184, 0.05))'; colorStyle = '#94A3B8'; badgeNode = <Medal size={20} color="#94A3B8" />; }
                else if (rank === 3) { bgStyle = 'linear-gradient(135deg, rgba(180, 83, 9, 0.15), rgba(180, 83, 9, 0.05))'; colorStyle = '#B45309'; badgeNode = <Medal size={20} color="#B45309" />; }

                return (
                  <div key={lb.student_id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', background: bgStyle, border: `1px solid var(--card-border)` }}>
                    <div style={{ width: '30px', fontWeight: 900, color: colorStyle, fontSize: '14px' }}>#{rank}</div>
                    <div style={{ flex: 1, paddingLeft: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {badgeNode}
                      <div style={{ fontSize: '14px', fontWeight: rank <= 3 ? 800 : 600, color: rank <= 3 ? colorStyle : 'var(--text-main)' }}>{lb.name} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>({lb.class})</span></div>
                    </div>
                    <div style={{ fontWeight: 900, color: 'var(--text-main)' }}>{lb.total} <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>BADGES</span></div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {showAwardModal && <AwardStarModal badges={classBadges} students={students} schoolId={schoolId} awardedBy={user?.id} className={className} onClose={() => setShowAwardModal(false)} onSuccess={() => { setShowAwardModal(false); qc.invalidateQueries({ queryKey: ['class-achievements', schoolId, className] }); }} />}
    </div>
  );
}

function CreateCustomBadgeForm({ schoolId, teacherId, className, onSuccess }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [color, setColor] = useState('#10B981'); const [icon, setIcon] = useState('star'); const [loading, setLoading] = useState(false);
  const icons = ['star','smile','thumbs-up','zap','heart','sparkles','book-open','hand-heart'];
  const colors = ['#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

  const submit = async () => {
    if (!name) return; setLoading(true);
    try { await createCustomBadge({ schoolId, teacherId, className, name, description: desc, iconKey: icon, iconColor: color }); setName(''); setDesc(''); onSuccess(); } catch(e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ padding: '16px', background: 'var(--glass)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Badge Name (e.g. Best Silencer)" className="sp-input" style={{ marginBottom: '12px' }} />
      <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Criteria (How to earn this)" className="sp-input" style={{ marginBottom: '12px' }} />
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div><label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>ICON</label><div style={{ display: 'flex', gap: '4px' }}>{icons.map(i => <div key={i} onClick={() => setIcon(i)} style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer', background: icon === i ? 'var(--accent-light)' : 'transparent', border: icon === i ? '1px solid var(--accent)' : '1px solid var(--card-border)' }}><LucideBadgeIcon iconKey={i} color="var(--text-main)" size={16} /></div>)}</div></div>
        <div><label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>COLOR</label><div style={{ display: 'flex', gap: '4px' }}>{colors.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', background: c, border: color === c ? '2px solid white' : '2px solid transparent', boxShadow: color === c ? `0 0 0 1px ${c}` : 'none' }} />)}</div></div>
      </div>
      <button onClick={submit} disabled={!name || loading} className="btn accent">{loading ? 'Saving...' : 'Create Badge'}</button>
    </div>
  );
}

function AwardStarModal({ badges, students, schoolId, awardedBy, className, onClose, onSuccess }) {
  const [selStd, setSelStd] = useState(null); const [selBdg, setSelBdg] = useState(null); const [note, setNote] = useState(''); const [loading, setLoading] = useState(false);
  const manualBadges = badges.filter(b => b.award_type === 'manual');

  const submit = async () => {
    if (!selStd || !selBdg) return; setLoading(true);
    try { await awardBadge({ schoolId, studentId: selStd.id, badgeId: selBdg.id, className, awardedBy, note }); onSuccess(); } catch (e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '400px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Award Class Star</h3>
        <select onChange={e => setSelStd(students.find(s => String(s.id) === String(e.target.value)))} className="sp-input" style={{ marginBottom: '8px' }} defaultValue=""><option value="" disabled>Select Student...</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto' }}>
          {manualBadges.map(b => <div key={b.id} onClick={() => setSelBdg(b)} style={{ padding: '8px', borderRadius: '8px', border: `2px solid ${selBdg?.id === b.id ? b.icon_color : 'var(--card-border)'}`, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}><LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={14} /><span style={{ fontSize: '12px', fontWeight: 600 }}>{b.name}</span></div>)}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note..." className="sp-input" rows={2} style={{ marginBottom: '16px', resize: 'none' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} className="btn outline">Cancel</button>
          <button onClick={submit} disabled={loading || !selStd || !selBdg} className="btn accent" style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>{loading ? '...' : 'Award'}</button>
        </div>
      </div>
    </div>
  );
}
