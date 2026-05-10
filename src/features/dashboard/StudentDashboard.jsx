import React from 'react';
import { Link } from 'react-router-dom';
import {
  User, ClipboardList, DollarSign, Clock,
  Bell, CalendarHeart, Image, Phone, Settings, BookOpen
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';

import ModuleGuard from '../../components/ModuleGuard';

// Exact legacy module list for Student role:
// My Profile, Attendance, Fees, Timetable, Notices, Leaves, Gallery, Contact, Settings
const MODULES = [
  { name: 'My Profile',  path: '/student/profile',    icon: <User size={26} />,          colorHex: '#60a5fa', bgRgb: '96,165,250', moduleId: 'users'   },
  { name: 'Attendance',  path: '/student/attendance', icon: <ClipboardList size={26} />, colorHex: '#818cf8', bgRgb: '129,140,248', moduleId: 'attendance'  },
  { name: 'Fees',        path: '/student/fees',       icon: <DollarSign size={26} />,    colorHex: '#34d399', bgRgb: '52,211,153', moduleId: 'fees'   },
  { name: 'Timetable',   path: '/student/timetable',  icon: <Clock size={26} />,         colorHex: '#c084fc', bgRgb: '192,132,252', moduleId: 'timetable'  },
  { name: 'Notices',     path: '/student/notices',    icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36', moduleId: 'notices'   },
  { name: 'Leaves',      path: '/student/leaves',     icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133', moduleId: 'leaves'  },
  { name: 'Gallery',        path: '/student/gallery',         icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182', moduleId: 'gallery'  },
  { name: 'Contact',        path: '/student/contact',         icon: <Phone size={26} />,         colorHex: '#2dd4bf', bgRgb: '45,212,191', moduleId: 'contact'   },
  { name: 'Knowledge Base', path: '/student/knowledge-base',  icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'knowledge_base'   },
  { name: "Principal's Desk",path: '/student/principals-desk', icon: <Phone size={26} />,         colorHex: '#f43f5e', bgRgb: '244,63,94', moduleId: 'principals_desk' },
  { name: 'Settings',       path: '/student/settings',        icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184', moduleId: 'settings'  },
];

function StudentDashboardContent() {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />

      <div>
        {/* Legacy exact title: "Student Panel" */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{
            width: '3px', height: '22px', borderRadius: '999px',
            background: 'linear-gradient(180deg, #4f46e5, #7c3aed)',
            flexShrink: 0,
          }} />
          <h3 style={{
            margin: 0, fontSize: '11px', fontWeight: 800,
            color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Student Panel
          </h3>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '14px',
        }}>
          {MODULES.map((mod) => (
            <ModuleGuard key={mod.name} moduleName={mod.moduleId || 'default'} inline={!!mod.moduleId}>
              <Link
                to={mod.path}
                className="module-card"
                style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px' }}
              >
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  background: `rgba(${mod.bgRgb}, 0.12)`,
                  border: `1px solid rgba(${mod.bgRgb}, 0.2)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: mod.colorHex,
                  transition: 'transform 0.25s ease',
                }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {mod.icon}
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--text-main)', textAlign: 'center',
                  lineHeight: 1.3,
                }}>
                  {mod.name}
                </span>
              </Link>
            </ModuleGuard>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
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
          <p style={{
            fontSize: '10px', color: 'var(--text-faint)',
            fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em',
          }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }
  return <StudentDashboardContent />;
}
