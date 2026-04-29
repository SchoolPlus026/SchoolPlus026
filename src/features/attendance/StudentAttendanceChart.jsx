/**
 * StudentAttendanceChart.jsx — Premium animated attendance overview for Student portal
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, CalendarHeart, CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react';

/* ─── useCountUp hook ───────────────────────────────────────────── */
function useCountUp(target, duration = 1400, start = false) {
  const [value, setValue] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    if (!start || target === 0) { setValue(0); return; }
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, start]);

  return value;
}

/* ─── Animated DonutChart ───────────────────────────────────────── */
function DonutChart({ present, absent, leave, total }) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  const SIZE   = 168;
  const STROKE = 22;
  const R      = (SIZE - STROKE) / 2;
  const CIRC   = 2 * Math.PI * R;
  const cx     = SIZE / 2;
  const cy     = SIZE / 2;
  const pct    = (n) => total > 0 ? (n / total) : 0;

  const segments = [
    { value: present, color: '#6366f1', label: 'Present' },
    { value: absent,  color: '#f87171', label: 'Absent'  },
    { value: leave,   color: '#fbbf24', label: 'Leave'   },
  ];

  let offset = 0;
  const built = segments.map(seg => {
    const length = pct(seg.value) * CIRC;
    const dash   = animated ? length : 0;
    const result = { ...seg, dash, gap: CIRC - dash, offset };
    offset += pct(seg.value) * CIRC;
    return result;
  });

  const presentPct = Math.round(pct(present) * 100);
  const countedPct = useCountUp(presentPct, 1200, animated);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
      {/* SVG Donut */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        {/* Glow ring */}
        <div style={{
          position: 'absolute', inset: '-6px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          transition: 'opacity 1s ease',
          opacity: animated ? 1 : 0,
        }} />
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 4px 12px rgba(99,102,241,0.2))' }}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth={STROKE} />
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--card-border)" strokeWidth={STROKE} />
          ) : built.map((seg, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${seg.dash} ${CIRC}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 1.3s cubic-bezier(0.4,0,0.2,1)' }}
            />
          ))}
        </svg>
        {/* Center label */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '30px', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1 }}>
            {countedPct}%
          </span>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>
            Present
          </span>
        </div>
      </div>

      {/* Stat Rows */}
      <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <StatRow icon={<CheckCircle2 size={14} />} color="#6366f1" bg="rgba(99,102,241,0.12)"
          label="Present" value={present} total={total} animated={animated} />
        <StatRow icon={<XCircle size={14} />}     color="#f87171" bg="rgba(248,113,113,0.12)"
          label="Absent"  value={absent}  total={total} animated={animated} />
        <StatRow icon={<Clock size={14} />}        color="#fbbf24" bg="rgba(251,191,36,0.12)"
          label="On Leave" value={leave}  total={total} animated={animated} />
        <div style={{
          marginTop: '4px', paddingTop: '10px',
          borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: '12px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Total Days</span>
          <strong style={{ color: 'var(--text-main)', fontSize: '14px' }}>{total}</strong>
        </div>
      </div>
    </div>
  );
}

/* ─── StatRow ────────────────────────────────────────────────────── */
function StatRow({ icon, color, bg, label, value, total, animated }) {
  const pct      = total > 0 ? Math.round((value / total) * 100) : 0;
  const counted  = useCountUp(value, 1100, animated);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '9px',
          background: bg, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', flex: 1 }}>{label}</span>
        <strong style={{ fontSize: '15px', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{counted}</strong>
        <span style={{ fontSize: '11px', color: 'var(--text-faint)', minWidth: '32px', textAlign: 'right' }}>{pct}%</span>
      </div>
      {/* Animated bar */}
      <div style={{ height: '4px', borderRadius: '999px', background: 'var(--card-border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '999px',
          background: color,
          width: animated ? `${pct}%` : '0%',
          transition: 'width 1.3s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: `0 0 6px ${color}88`,
        }} />
      </div>
    </div>
  );
}

/* ─── Hero Summary Pills ─────────────────────────────────────────── */
function HeroPills({ present, absent, leave, total, animated }) {
  const pills = [
    { label: 'Present', value: present, color: '#6366f1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)', icon: '✅' },
    { label: 'Absent',  value: absent,  color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', icon: '❌' },
    { label: 'On Leave', value: leave,  color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', icon: '🕐' },
  ];
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {pills.map((p) => {
        const counted = useCountUp(p.value, 1000, animated);
        return (
          <div key={p.label} style={{
            flex: '1 1 80px', padding: '12px 14px', borderRadius: '14px',
            background: p.bg, border: `1px solid ${p.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: p.color, fontVariantNumeric: 'tabular-nums' }}>
              {counted}
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {p.icon} {p.label}
            </div>
          </div>
        );
      })}
      <div style={{
        flex: '1 1 80px', padding: '12px 14px', borderRadius: '14px',
        background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
      }}>
        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>{total}</div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>📅 Total</div>
      </div>
    </div>
  );
}

/* ─── Monthly Summary ─────────────────────────────────────────────── */
function MonthlySummary({ attendance }) {
  const grouped = (attendance || []).reduce((acc, a) => {
    const month = new Date(a.date).toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!acc[month]) acc[month] = { Present: 0, Absent: 0, Leave: 0 };
    acc[month][a.status] = (acc[month][a.status] || 0) + 1;
    return acc;
  }, {});

  const months = Object.entries(grouped);
  if (!months.length) return null;

  return (
    <div style={{
      marginTop: '16px', borderRadius: '18px', padding: '20px',
      background: 'var(--glass)', border: '1px solid var(--card-border)',
      animation: 'attendanceSlideUp 0.5s 0.3s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <TrendingUp size={15} color="#818cf8" />
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Monthly Breakdown
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {months.map(([month, counts]) => {
          const total = (counts.Present || 0) + (counts.Absent || 0) + (counts.Leave || 0);
          const pct   = total > 0 ? Math.round((counts.Present / total) * 100) : 0;
          return (
            <div key={month}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>{month}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  ✅ {counts.Present || 0} &nbsp;|&nbsp; ❌ {counts.Absent || 0} &nbsp;|&nbsp; 🕐 {counts.Leave || 0}
                </span>
              </div>
              <div style={{ height: '5px', borderRadius: '999px', background: 'var(--card-border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '999px',
                  background: 'linear-gradient(90deg, #6366f1, #7c3aed)',
                  width: `${pct}%`,
                  transition: 'width 1.1s ease',
                  boxShadow: '0 0 8px rgba(99,102,241,0.4)',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function StudentAttendanceChart() {
  const { user, schoolSettings } = useAppStore();
  const [heroAnimated, setHeroAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  const { data: attendance, isLoading } = useQuery({
    queryKey: ['my-attendance', user?.id, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !!schoolSettings?.school_id
  });

  if (isLoading) {
    return (
      <div style={{
        borderRadius: '20px', padding: '40px 20px',
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '240px',
        animation: 'attendanceSlideUp 0.4s ease both',
      }}>
        <Loader2 size={28} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const total   = attendance?.length || 0;
  const present = attendance?.filter(a => a.status === 'Present').length || 0;
  const absent  = attendance?.filter(a => a.status === 'Absent').length  || 0;
  const leave   = attendance?.filter(a => a.status === 'Leave').length   || 0;

  return (
    <>
      <style>{`
        @keyframes attendanceSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

        {/* ── Main Attendance Card ── */}
        <div style={{
          borderRadius: '20px', padding: '24px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderTop: '3px solid #6366f1',
          boxShadow: '0 8px 32px rgba(99,102,241,0.08)',
          animation: 'attendanceSlideUp 0.45s ease both',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarHeart size={16} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-main)' }}>Attendance Overview</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                {total > 0 ? `${total} days recorded` : 'No records yet'}
              </div>
            </div>
          </div>

          {total === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px',
              color: 'var(--text-muted)', fontSize: '14px',
              borderRadius: '14px', background: 'var(--glass)',
              border: '1px dashed var(--card-border)',
            }}>
              📭 No attendance data recorded yet.
            </div>
          ) : (
            <>
              {/* Hero Pills */}
              <HeroPills present={present} absent={absent} leave={leave} total={total} animated={heroAnimated} />
              {/* Donut Chart */}
              <DonutChart present={present} absent={absent} leave={leave} total={total} />
            </>
          )}
        </div>

        {/* ── Monthly Summary ── */}
        {total > 0 && <MonthlySummary attendance={attendance} />}

        {/* ── History Table ── */}
        {total > 0 && (
          <div style={{
            marginTop: '16px', borderRadius: '18px', overflow: 'hidden',
            border: '1px solid var(--card-border)',
            animation: 'attendanceSlideUp 0.5s 0.5s ease both',
          }}>
            <div style={{
              padding: '14px 20px',
              background: 'var(--glass)', borderBottom: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Attendance History
              </span>
            </div>
            <div className="table-responsive">
              <table className="legacy-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance?.map(a => (
                    <tr key={a.id}>
                      <td style={{ color: 'var(--text-main)', fontWeight: 500 }}>{a.date}</td>
                      <td>
                        <span className={`badge ${
                          a.status === 'Present' ? 'badge-success' :
                          a.status === 'Absent'  ? 'badge-danger'  : 'badge-warn'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
