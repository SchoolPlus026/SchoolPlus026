import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, ClipboardList, DollarSign, Clock, CalendarHeart,
  Image, Bell, Calendar, LineChart, Settings, CalendarX, Phone, Lock, CreditCard, BookOpen
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import PlanStatusBanner from '../../components/PlanStatusBanner';
import PendingBanner from '../../components/PendingBanner';
import { usePlan } from '../../hooks/usePlan';
import { usePending } from '../../hooks/usePending';

const MODULES = [
  { name: 'Users',        path: '/admin/users',        icon: <Users size={26} />,         colorHex: '#60a5fa', bgRgb: '96,165,250'   },
  { name: 'Attendance',   path: '/admin/attendance',   icon: <ClipboardList size={26} />, colorHex: '#818cf8', bgRgb: '129,140,248'  },
  { name: 'Fees',         path: '/admin/fees',         icon: <DollarSign size={26} />,    colorHex: '#34d399', bgRgb: '52,211,153'   },
  { name: 'Calendar',     path: '/admin/calendar',     icon: <Calendar size={26} />,      colorHex: '#2dd4bf', bgRgb: '45,212,191'   },
  { name: 'Notices',      path: '/admin/notices',      icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36'   },
  { name: 'Gallery',      path: '/admin/gallery',      icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182'  },
  { name: 'Timetable',    path: '/admin/timetable',    icon: <Clock size={26} />,         colorHex: '#c084fc', bgRgb: '192,132,252'  },
  { name: 'Off Classes',  path: '/admin/off-classes',  icon: <CalendarX size={26} />,     colorHex: '#fb923c', bgRgb: '251,146,60'   },
  { name: 'Leaves',       path: '/admin/leaves',       icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133'  },
  { name: 'Reports',      path: '/admin/reports',      icon: <LineChart size={26} />,     colorHex: '#22d3ee', bgRgb: '34,211,238'   },
  { name: 'Contact',      path: '/admin/contact',      icon: <Phone size={26} />,         colorHex: '#94a3b8', bgRgb: '148,163,184'  },
  { name: 'Billing',         path: '/admin/billing',         icon: <CreditCard size={26} />,    colorHex: '#a78bfa', bgRgb: '167,139,250'  },
  { name: 'Knowledge Base',  path: '/admin/knowledge-base',  icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248'   },
  { name: 'Settings',        path: '/admin/settings',        icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184'  },
];

// Locked for Free plan — clicking redirects to /admin/billing
const PREMIUM_MODULES = ['Fees', 'Timetable', 'Leaves', 'Reports'];

export default function AdminDashboard() {
  const { isFree } = usePlan();
  const { isPending } = usePending();
  const navigate = useNavigate();

  const handleModuleClick = (e, mod) => {
    if (isPending) {
      e.preventDefault();
      return; // banner already explains why
    }
    if (isFree && PREMIUM_MODULES.includes(mod.name)) {
      e.preventDefault();
      navigate('/admin/billing');
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
      <DashboardHero />
      <PendingBanner />
      <PlanStatusBanner />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ width: '3px', height: '22px', borderRadius: '999px', background: 'linear-gradient(180deg,#4f46e5,#7c3aed)', flexShrink: 0 }} />
          <h3 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Admin — Master Control
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '14px' }}>
          {MODULES.map((mod) => {
            const isLocked = (isFree && PREMIUM_MODULES.includes(mod.name)) || isPending;
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
                <div
                  style={{
                    width: '54px', height: '54px', borderRadius: '16px',
                    background: isLocked ? 'var(--glass)' : `rgba(${mod.bgRgb},0.12)`,
                    border: `1px solid ${isLocked ? 'var(--card-border)' : `rgba(${mod.bgRgb},0.2)`}`,
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
                  fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: isLocked ? 'var(--text-faint)' : 'var(--text-main)',
                  textAlign: 'center', lineHeight: 1.3,
                }}>
                  {mod.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
