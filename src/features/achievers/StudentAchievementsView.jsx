import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../config/supabaseClient';
import {
  useStudentAchievements, useLeaderboard, usePinnableBadges, pinBadges, useBadgeCache, useBadgesMaster
} from '../../hooks/useAchievements';
import { LucideBadgeIcon } from '../../components/LucideBadgeIcon';
import { Trophy, Medal, Star, Loader2, Pin, Filter } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';

export default function StudentAchievementsView({ studentId }) {
  const { schoolSettings } = useAppStore();
  const schoolId = schoolSettings?.school_id;
  const qc = useQueryClient();

  // Prompt fix: Tabs explicitly 'class_level' and 'school_level' + 'my_badges' + 'catalog'
  const [tab, setTab] = useState('my_badges'); // 'my_badges' | 'class_level' | 'school_level' | 'catalog'
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'month' | 'year'
  const [filterValue, setFilterValue] = useState(''); // YYYY-MM or YYYY

  const { data: achievements = [], isLoading: loadingAch } = useStudentAchievements(studentId);
  
  // Note: Leaderboard now fetches with the correct filter.
  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useLeaderboard(schoolId, filterMode, filterValue);
  const { data: badgeCache } = useBadgeCache(studentId);
  const { data: allBadges = [] } = useBadgesMaster(schoolId);

  const [showPinModal, setShowPinModal] = useState(false);

  const cardStyle = { borderRadius: '18px', padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', animation: 'abSlideUp 0.45s ease both' };

  // For the active student, split achievements
  const myClassBadges = achievements.filter(a => a.tier === 'class_star');
  const mySchoolBadges = achievements.filter(a => a.tier === 'school_champion');

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          ['my_badges', '🌟 My Achievements'],
          ['class_level', '⭐ Class Level'],
          ['school_level', '🏆 School Level'],
          ['catalog', '🎖️ Info Guide']
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: 'none',
            background: tab === key ? 'linear-gradient(135deg,#F59E0B,#EF4444)' : 'var(--glass)',
            color: tab === key ? '#fff' : 'var(--text-muted)',
            border: tab === key ? 'none' : '1px solid var(--card-border)',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'my_badges' && (
        <div style={cardStyle}>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text-main)' }}>My Achievements</span>
            <button onClick={() => setShowPinModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--glass)', color: 'var(--text-main)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
              <Pin size={13} /> Manage Pinned
            </button>
          </div>

          {/* Pinned Display */}
          {badgeCache?.pinned_badges && badgeCache.pinned_badges.length > 0 && (
             <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', border: '1px dashed rgba(245, 158, 11, 0.3)' }}>
               <div style={{ fontSize: '10px', fontWeight: 800, color: '#F59E0B', marginBottom: '8px', textTransform: 'uppercase' }}>Currently Pinned</div>
               <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {badgeCache.pinned_badges.map(b => (
                     <div key={b.badge_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                        <LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={14} />
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{b.badge_name}</span>
                     </div>
                  ))}
               </div>
             </div>
          )}

          {loadingAch ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-amber-500" /></div> :
           achievements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
               <Star size={40} color="var(--text-faint)" style={{ margin: '0 auto 16px auto' }} />
               <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '16px' }}>No badges yet!</h3>
               <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>Keep up the good work!</p>
            </div>
          ) : (
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {achievements.map(ach => (
                   <div key={ach.achievement_id} style={{
                      padding: '16px', borderRadius: '16px',
                      background: ach.tier === 'school_champion' ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(239, 68, 68, 0.1))' : 'var(--glass)',
                      border: ach.tier === 'school_champion' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--card-border)',
                      textAlign: 'center'
                   }}>
                      <div style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', background: `${ach.icon_color}22`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <LucideBadgeIcon iconKey={ach.icon_key} color={ach.icon_color} size={24} />
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>{ach.badge_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{ach.tier === 'school_champion' ? 'School Level Champion' : 'Class Level Star'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{new Date(ach.awarded_at).toLocaleDateString('en-IN')}</div>
                   </div>
                ))}
             </div>
          )}
        </div>
      )}

      {/* Class Level List (My Class Stars only for now, leaderboard applies to both) */}
      {tab === 'class_level' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Class Level Achievements</span>
          </div>
          {myClassBadges.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>No class level badges yet.</div> :
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
               {myClassBadges.map(ach => (
                  <div key={ach.achievement_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${ach.icon_color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LucideBadgeIcon iconKey={ach.icon_key} color={ach.icon_color} size={16} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                       <div style={{ fontSize: '13px', fontWeight: 800 }}>{ach.badge_name}</div>
                       <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(ach.awarded_at).toLocaleDateString('en-IN')}</div>
                    </div>
                  </div>
               ))}
            </div>
          }
        </div>
      )}

      {/* School Level (Leaderboard + Filters) */}
      {tab === 'school_level' && (
        <div style={cardStyle}>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>School-wide Leaderboard</span>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Filter size={14} color="var(--text-muted)" />
              <select value={filterMode} onChange={e => { setFilterMode(e.target.value); setFilterValue(''); }} className="sp-input" style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}>
                 <option value="all">All Time</option>
                 <option value="year">By Year</option>
                 <option value="month">By Month</option>
              </select>
              {filterMode === 'year' && (
                 <select value={filterValue} onChange={e => setFilterValue(e.target.value)} className="sp-input" style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}>
                    <option value="" disabled>Select Year</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                 </select>
              )}
              {filterMode === 'month' && (
                 <input type="month" value={filterValue} onChange={e => setFilterValue(e.target.value)} className="sp-input" style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }} />
              )}
            </div>
          </div>

          {loadingLeaderboard ? <div style={{ padding: '32px', textAlign: 'center' }}><Loader2 className="animate-spin inline text-indigo-500" /></div> :
           leaderboard.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>No data for this filter.</div> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboard.map((lb, idx) => {
                const rank = idx + 1;
                let bgStyle = 'var(--glass)'; let colorStyle = 'var(--text-main)'; let badgeNode = null;
                if (rank === 1) { bgStyle = 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05))'; colorStyle = '#EAB308'; badgeNode = <Medal size={20} color="#EAB308" />; }
                else if (rank === 2) { bgStyle = 'linear-gradient(135deg, rgba(148, 163, 184, 0.15), rgba(148, 163, 184, 0.05))'; colorStyle = '#94A3B8'; badgeNode = <Medal size={20} color="#94A3B8" />; }
                else if (rank === 3) { bgStyle = 'linear-gradient(135deg, rgba(180, 83, 9, 0.15), rgba(180, 83, 9, 0.05))'; colorStyle = '#B45309'; badgeNode = <Medal size={20} color="#B45309" />; }

                const isMe = lb.student_id === studentId;

                return (
                  <div key={lb.student_id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', background: isMe ? 'rgba(79, 70, 229, 0.1)' : bgStyle, border: isMe ? '1px solid var(--accent)' : `1px solid var(--card-border)` }}>
                    <div style={{ width: '30px', fontWeight: 900, color: colorStyle, fontSize: '14px' }}>#{rank}</div>
                    <div style={{ flex: 1, paddingLeft: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {badgeNode}
                      <div style={{ fontSize: '14px', fontWeight: rank <= 3 ? 800 : 600, color: rank <= 3 ? colorStyle : 'var(--text-main)' }}>
                        {lb.name} {isMe && <span style={{ fontSize: '10px', background: 'var(--accent)', color: 'white', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>YOU</span>}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>({lb.class})</span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, color: 'var(--text-main)' }}>{lb.total} <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>BADGES</span></div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {/* Info Guide / Catalog */}
      {tab === 'catalog' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>Badge Catalog & Info Guide</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>See all available badges and how to earn them.</p>
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

      {showPinModal && <PinBadgesModal studentId={studentId} onClose={() => setShowPinModal(false)} />}
    </div>
  );
}

function PinBadgesModal({ studentId, onClose }) {
  const qc = useQueryClient();
  const { data: pinnable = [], isLoading } = usePinnableBadges(studentId);
  const { data: cacheRow } = useBadgeCache(studentId);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
     if (cacheRow?.pinned_badges) setSelected(cacheRow.pinned_badges.map(b => b.badge_id));
  }, [cacheRow]);

  const toggle = (id) => {
     if (selected.includes(id)) setSelected(s => s.filter(x => x !== id));
     else if (selected.length < 2) setSelected(s => [...s, id]);
  };

  const submit = async () => {
     setSaving(true);
     try {
        await pinBadges(studentId, selected);
        qc.invalidateQueries({ queryKey: ['badge-cache', studentId] });
        qc.invalidateQueries({ queryKey: ['school-badge-cache'] });
        onClose();
     } catch (e) { alert(e.message); setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '400px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Pin Badges</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>Select up to 2 badges to show next to your name everywhere in the app. ({selected.length}/2 selected)</p>

        {isLoading ? <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 className="animate-spin inline" /></div> :
         pinnable.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>You haven't earned any badges yet.</div> :
         (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', maxHeight: '300px', overflowY: 'auto' }}>
              {pinnable.map(b => {
                 const isSel = selected.includes(b.badge_id);
                 return (
                    <div key={b.badge_id} onClick={() => toggle(b.badge_id)} style={{
                       padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                       border: isSel ? `2px solid ${b.icon_color}` : '1px solid var(--card-border)',
                       background: isSel ? `${b.icon_color}18` : 'var(--glass)',
                       display: 'flex', alignItems: 'center', gap: '10px'
                    }}>
                       <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: isSel ? b.icon_color : 'transparent', border: `1px solid ${isSel ? b.icon_color : 'var(--text-muted)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSel && <CheckCircle2 size={12} color="#fff" />}
                       </div>
                       <LucideBadgeIcon iconKey={b.icon_key} color={b.icon_color} size={18} />
                       <div style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{b.badge_name}</div>
                    </div>
                 );
              })}
           </div>
         )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} className="btn outline">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn accent">{saving ? 'Saving...' : 'Save Pins'}</button>
        </div>
      </div>
    </div>
  );
}
