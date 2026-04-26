import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, CalendarHeart, CheckCircle2, XCircle, Clock } from 'lucide-react';

/* ─── Animated SVG Donut Chart ─────────────────────────────────── */
function DonutChart({ present, absent, leave, total }) {
  const [animated, setAnimated] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const SIZE   = 160;
  const STROKE = 20;
  const R      = (SIZE - STROKE) / 2;
  const CIRC   = 2 * Math.PI * R;
  const cx     = SIZE / 2;
  const cy     = SIZE / 2;

  const pct = (n) => total > 0 ? (n / total) : 0;

  // Segments: present (indigo), absent (red), leave (amber)
  const segments = [
    { value: present, color: '#4f46e5', label: 'Present' },
    { value: absent,  color: '#f87171', label: 'Absent'  },
    { value: leave,   color: '#fbbf24', label: 'Leave'   },
  ];

  // Build stroke-dasharray offsets
  let offset = 0;
  const built = segments.map(seg => {
    const length = pct(seg.value) * CIRC;
    const gap    = CIRC - length;
    const dash   = animated ? length : 0;
    const result = { ...seg, dash, gap: CIRC - dash, offset };
    offset += length;
    return result;
  });

  const presentPct = Math.round(pct(present) * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>

      {/* SVG Donut */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track ring */}
          <circle
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke="var(--card-border)"
            strokeWidth={STROKE}
          />
          {/* Data segments */}
          {total === 0 ? (
            <circle
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke="var(--card-border)"
              strokeWidth={STROKE}
            />
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
              style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
            />
          ))}
        </svg>

        {/* Center label */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: '28px', fontWeight: 900,
            color: 'var(--text-main)', lineHeight: 1,
          }}>
            {presentPct}%
          </span>
          <span style={{
            fontSize: '11px', fontWeight: 700,
            color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginTop: '3px',
          }}>
            Present
          </span>
        </div>
      </div>

      {/* Stats list */}
      <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <StatRow icon={<CheckCircle2 size={15} />} color="#4f46e5" bg="rgba(79,70,229,0.12)"
          label="Present" value={present} total={total} />
        <StatRow icon={<XCircle size={15} />}     color="#f87171" bg="rgba(248,113,113,0.12)"
          label="Absent"  value={absent}  total={total} />
        <StatRow icon={<Clock size={15} />}        color="#fbbf24" bg="rgba(251,191,36,0.12)"
          label="Leave"   value={leave}   total={total} />

        <div style={{
          marginTop: '4px', paddingTop: '12px',
          borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: '13px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Total Days</span>
          <strong style={{ color: 'var(--text-main)' }}>{total}</strong>
        </div>
      </div>
    </div>
  );
}

function StatRow({ icon, color, bg, label, value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '8px',
          background: bg, color, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', flex: 1 }}>
          {label}
        </span>
        <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{value}</strong>
        <span style={{ fontSize: '11px', color: 'var(--text-faint)', minWidth: '34px', textAlign: 'right' }}>
          {pct}%
        </span>
      </div>
      {/* Progress bar */}
      <div style={{
        height: '4px', borderRadius: '999px',
        background: 'var(--card-border)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: '999px',
          background: color, width: `${pct}%`,
          transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

/* ─── Monthly Summary ───────────────────────────────────────────── */
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
    <div className="card fade-in" style={{ marginTop: '16px' }}>
      <div className="section-title">
        <h3>Monthly Summary</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {months.map(([month, counts]) => {
          const total = (counts.Present || 0) + (counts.Absent || 0) + (counts.Leave || 0);
          const pct   = total > 0 ? Math.round((counts.Present / total) * 100) : 0;
          return (
            <div key={month}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{month}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  ✅ {counts.Present || 0} &nbsp;|&nbsp; ❌ {counts.Absent || 0} &nbsp;|&nbsp; 🕐 {counts.Leave || 0}
                </span>
              </div>
              <div style={{ height: '5px', borderRadius: '999px', background: 'var(--card-border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '999px',
                  background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                  width: `${pct}%`,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────── */
export default function StudentAttendanceChart() {
  const { user, schoolSettings } = useAppStore();

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
      <div className="card fade-in" style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  const total   = attendance?.length || 0;
  const present = attendance?.filter(a => a.status === 'Present').length || 0;
  const absent  = attendance?.filter(a => a.status === 'Absent').length  || 0;
  const leave   = attendance?.filter(a => a.status === 'Leave').length   || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

      {/* Attendance Overview Card */}
      <div className="card fade-in">
        <div className="section-title">
          <CalendarHeart size={16} style={{ color: 'var(--accent)' }} />
          <h3>Attendance Overview</h3>
        </div>

        {total === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px',
            color: 'var(--text-muted)', fontSize: '14px',
          }}>
            No attendance data recorded yet.
          </div>
        ) : (
          <DonutChart present={present} absent={absent} leave={leave} total={total} />
        )}
      </div>

      {/* Monthly Summary */}
      {total > 0 && <MonthlySummary attendance={attendance} />}

      {/* Attendance History Table */}
      {total > 0 && (
        <div className="card fade-in" style={{ marginTop: '16px' }}>
          <div className="section-title">
            <h3>Attendance History</h3>
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
  );
}
