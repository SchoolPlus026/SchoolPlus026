import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User, ClipboardCheck, Users, Clock, CalendarX,
  Bell, CalendarHeart, Image, LineChart, Settings, Phone, Lock, BookOpen
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';

// Exact legacy module list for Teacher role:
// My Profile, Mark My Attendance, Class Attendance, Timetable, Off Classes,
// Notices, Leaves, Gallery, Reports, Settings
const MODULES = [
  { name: 'My Profile',         path: '/teacher/profile',          icon: <User size={26} />,          colorHex: '#60a5fa', bgRgb: '96,165,250'   },
  { name: 'Mark My Attendance', path: '/teacher/self-attendance',  icon: <ClipboardCheck size={26} />,colorHex: '#818cf8', bgRgb: '129,140,248'  },
  { name: 'Class Attendance',   path: '/teacher/attendance',       icon: <Users size={26} />,         colorHex: '#a78bfa', bgRgb: '167,139,250'  },
  { name: 'Timetable',          path: '/teacher/timetable',        icon: <Clock size={26} />,         colorHex: '#c084fc', bgRgb: '192,132,252'  },
  { name: 'Off Classes',        path: '/teacher/off-classes',      icon: <CalendarX size={26} />,     colorHex: '#fb923c', bgRgb: '251,146,60'   },
  { name: 'Notices',            path: '/teacher/notices',          icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36'   },
  { name: 'Leaves',             path: '/teacher/leaves',           icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133'  },
  { name: 'Gallery',            path: '/teacher/gallery',          icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182'  },
  { name: 'Reports',            path: '/teacher/reports',           icon: <LineChart size={26} />,     colorHex: '#22d3ee', bgRgb: '34,211,238'   },
  { name: 'Student Directory',   path: '/teacher/users',             icon: <Users size={26} />,         colorHex: '#6366f1', bgRgb: '99,102,241'   },
  { name: 'Contact',            path: '/teacher/contact',           icon: <Phone size={26} />,         colorHex: '#94a3b8', bgRgb: '148,163,184'  },
  { name: 'Knowledge Base',     path: '/teacher/knowledge-base',    icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248'   },
  { name: 'Settings',           path: '/teacher/settings',          icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184'  },
];

const PREMIUM_MODULES = ['Timetable', 'Gallery'];

function TeacherDashboardContent() {
  const { schoolSettings } = useAppStore();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const isPremium = schoolSettings?.subscription_tier === 'Premium';

  const handleModuleClick = (e, mod) => {
    if (!isPremium && PREMIUM_MODULES.includes(mod.name)) {
      e.preventDefault();
      setShowUpgradeModal(true);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />

      <div>
        {/* Legacy exact title: "Teacher — Class Tools" */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{
            width: '3px', height: '22px', borderRadius: '999px',
            background: 'linear-gradient(180deg, #4f46e5, #7c3aed)', flexShrink: 0,
          }} />
          <h3 style={{
            margin: 0, fontSize: '11px', fontWeight: 800,
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Teacher — Class Tools
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
          {MODULES.map((mod) => {
            const isLocked = !isPremium && PREMIUM_MODULES.includes(mod.name);
            return (
              <Link
                key={mod.name}
                to={isLocked ? '#' : mod.path}
                onClick={(e) => handleModuleClick(e, mod)}
                className="module-card"
                style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px', position: 'relative', opacity: isLocked ? 0.6 : 1 }}
              >
                {isLocked && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--text-faint)' }}>
                    <Lock size={14} />
                  </div>
                )}
                <div style={{
                  width: '54px', height: '54px', borderRadius: '16px',
                  background: isLocked ? 'var(--glass)' : `rgba(${mod.bgRgb}, 0.12)`,
                  border: `1px solid ${isLocked ? 'var(--card-border)' : `rgba(${mod.bgRgb}, 0.2)`}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isLocked ? 'var(--text-faint)' : mod.colorHex,
                  transition: 'transform 0.25s ease',
                }}
                  onMouseEnter={e => !isLocked && (e.currentTarget.style.transform = 'scale(1.12)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {mod.icon}
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: isLocked ? 'var(--text-faint)' : 'var(--text-main)',
                  textAlign: 'center', lineHeight: 1.3,
                }}>
                  {mod.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', borderLeft: '4px solid #4f46e5' }}>
            <h3 style={{ marginBottom: '8px' }} className="flex items-center gap-2"><Lock size={20} className="text-indigo-400" /> Premium Feature</h3>
            <p className="muted small" style={{ marginBottom: '24px', fontSize: '14px' }}>
              Unlock this feature with a Premium Subscription. Contact Platform Admin to upgrade your account and access Timetable and infinite Gallery storage.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn outline w-full" onClick={() => setShowUpgradeModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherDashboard() {
  const { user, schoolSettings } = useAppStore();
  if (!user || !schoolSettings) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '256px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '10px',
            border: '2px solid rgba(79,70,229,0.3)', borderTopColor: '#4f46e5',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Loading...</p>
        </div>
      </div>
    );
  }
  return <TeacherDashboardContent />;
}
