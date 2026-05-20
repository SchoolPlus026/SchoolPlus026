import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, ClipboardCheck, Users, Clock, CalendarX,
  Bell, CalendarHeart, Image, LineChart, Settings, Phone, Lock, BookOpen, MessageSquare, Book, HeartPulse, Search, AlertTriangle, Bus, Trophy
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';
import { usePlan } from '../../hooks/usePlan';
import { usePending } from '../../hooks/usePending';
import { useUniversalModuleActivity } from '../../hooks/useUniversalModuleActivity';
import PendingBanner from '../../components/PendingBanner';
import ModuleGuard from '../../components/ModuleGuard';
import TeacherDutyBanner from '../attendance/TeacherDutyBanner';
import FeatureGuard from '../../components/FeatureGuard';

// Exact legacy module list for Teacher role:
// My Profile, Mark My Attendance, Class Attendance, Timetable, Off Classes,
// Notices, Leaves, Gallery, Reports, Settings
const MODULES = [
  { name: 'My Profile',         path: '/teacher/profile',          icon: <User size={26} />,          colorHex: '#60a5fa', bgRgb: '96,165,250', moduleId: 'users'   },
  { name: 'My Attendance',      path: '/teacher/my-attendance',    icon: <CalendarHeart size={26} />, colorHex: '#818cf8', bgRgb: '129,140,248', moduleId: 'attendance'  },
  { name: 'Class Attendance',   path: '/teacher/attendance',       icon: <Users size={26} />,         colorHex: '#a78bfa', bgRgb: '167,139,250', moduleId: 'attendance'  },
  { name: 'Manage Students',    path: '/teacher/users',             icon: <Users size={26} />,         colorHex: '#6366f1', bgRgb: '99,102,241', moduleId: 'users'   },
  { name: 'Timetable',          path: '/teacher/timetable',        icon: <Clock size={26} />,         colorHex: '#c084fc', bgRgb: '192,132,252', moduleId: 'timetable'  },
  { name: 'Off Classes',        path: '/teacher/off-classes',      icon: <CalendarX size={26} />,     colorHex: '#fb923c', bgRgb: '251,146,60', moduleId: 'off_classes'   },
  { name: 'Notices',            path: '/teacher/notices',          icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36', moduleId: 'notices'   },
  { name: 'Leaves',             path: '/teacher/leaves',           icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133', moduleId: 'leaves'  },
  { name: 'Gallery',            path: '/teacher/gallery',          icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182', moduleId: 'gallery'  },
  { name: 'Reports',            path: '/teacher/reports',           icon: <LineChart size={26} />,     colorHex: '#22d3ee', bgRgb: '34,211,238', moduleId: 'reports'   },
  { name: 'Syllabus Tracker',   path: '/teacher/syllabus',          icon: <Book size={26} />,          colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'syllabus'  },
  { name: 'Lost & Found',       path: '/teacher/lost-and-found',    icon: <Search size={26} />,        colorHex: '#10b981', bgRgb: '16,185,129', moduleId: 'lost_found' },
  { name: 'Contact',            path: '/teacher/contact',           icon: <Phone size={26} />,         colorHex: '#94a3b8', bgRgb: '148,163,184', moduleId: 'contact'  },
  { name: 'Help',     path: '/teacher/knowledge-base',    icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'knowledge_base'   },
  { name: 'Complaint Box',      path: '/teacher/complaint-box',     icon: <MessageSquare size={26} />, colorHex: '#f43f5e', bgRgb: '244,63,94',   moduleId: 'complaint_box' },
  { name: 'Mood Note',          path: '/teacher/mood-note',         icon: <HeartPulse size={26} />,    colorHex: '#ec4899', bgRgb: '236,72,153',  moduleId: 'mood_note' },
  { name: 'Emergency Alerts',   path: '/teacher/emergency',         icon: <AlertTriangle size={26} />, colorHex: '#ef4444', bgRgb: '239,68,68',   moduleId: 'emergency' },
  { name: 'Bus Tracker',        path: '/teacher/bus-alerts',        icon: <Bus size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36',  moduleId: 'bus_alerts' },
  { name: 'Achievers Board',    path: '/teacher/achievers',         icon: <Trophy size={26} />,       colorHex: '#F59E0B', bgRgb: '245,158,11',  moduleId: 'default'},
  { name: 'Settings',           path: '/teacher/settings',          icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184', moduleId: 'default'  },
];

const PREMIUM_MODULES = ['Timetable', 'Gallery'];

function ActivityModuleCard({ mod, isLocked, onClick }) {
  const { hasActivity, markViewed } = useUniversalModuleActivity(mod.moduleId);

  const handleClick = (e) => {
    markViewed();
    if (onClick) onClick(e);
  };

  return (
    <motion.div
      whileHover={{ scale: isLocked ? 1 : 1.04, boxShadow: isLocked ? undefined : `0 10px 30px -6px rgba(${mod.bgRgb},0.3)` }}
      whileTap={{ scale: isLocked ? 1 : 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 20 }}
    >
      <Link
        to={isLocked ? '#' : mod.path}
        onClick={handleClick}
        className="module-card"
        style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px', position: 'relative', opacity: isLocked ? 0.6 : 1, display: 'block' }}
      >
        {hasActivity && (
           <div style={{ position: 'absolute', top: '12px', right: '12px', background: '#ef4444', border: '2px solid var(--card-bg)', borderRadius: '50%', width: '12px', height: '12px', zIndex: 10, boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
        )}
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
          margin: '0 auto',
        }}
        >
          {mod.icon}
        </div>
        <span style={{
          fontSize: '11px', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: isLocked ? 'var(--text-faint)' : 'var(--text-main)',
          textAlign: 'center', lineHeight: 1.3, display: 'block', marginTop: '12px',
        }}>
          {mod.name}
        </span>
      </Link>
    </motion.div>
  );
}

function TeacherDashboardContent() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { isFree } = usePlan();
  const { isPending } = usePending();

  const handleModuleClick = (e, mod) => {
    if (isFree && PREMIUM_MODULES.includes(mod.name)) {
      e.preventDefault();
      setShowUpgradeModal(true);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />
      <PendingBanner />

      <FeatureGuard feature="duty_radar" compact={true}>
        <TeacherDutyBanner />
      </FeatureGuard>

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
            const isLocked = (isFree && PREMIUM_MODULES.includes(mod.name));
            return (
              <ModuleGuard key={mod.name} moduleName={mod.moduleId} inline={true}>
                <ActivityModuleCard
                  mod={mod}
                  isLocked={isLocked}
                  onClick={(e) => handleModuleClick(e, mod)}
                />
              </ModuleGuard>
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
