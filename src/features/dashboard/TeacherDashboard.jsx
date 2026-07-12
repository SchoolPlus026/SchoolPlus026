import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, ClipboardCheck, Users, Clock, CalendarX, Calendar,
  Bell, CalendarHeart, Image, LineChart, Settings, Lock, BookOpen, MessageSquare, Book, HeartPulse, Search, AlertTriangle, Bus, Trophy, IndianRupee, X
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';
import { usePlan } from '../../hooks/usePlan';
import { usePending } from '../../hooks/usePending';
import { useAllModuleActivities, useMarkModuleViewed } from '../../hooks/useAllModuleActivities';
import PendingBanner from '../../components/PendingBanner';
import ModuleGuard from '../../components/ModuleGuard';
import TeacherDutyBanner from '../attendance/TeacherDutyBanner';
import FeatureGuard from '../../components/FeatureGuard';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { ArrowRight } from 'lucide-react';
import { useTieredCache } from '../../hooks/useTieredCache';
import { sortModules } from '../../utils/dashboardSorter';


// Exact legacy module list for Teacher role:
// My Profile, Mark My Attendance, Class Attendance, Timetable, Off Classes,
// Notices, Leaves, Gallery, Reports, Settings
const MODULES = [
  { name: 'My Profile',         path: '/teacher/profile',          icon: <User size={26} />,          colorHex: '#60a5fa', bgRgb: '96,165,250', moduleId: 'users'   },
  { name: 'My Attendance',      path: '/teacher/my-attendance',    icon: <CalendarHeart size={26} />, colorHex: '#818cf8', bgRgb: '129,140,248', moduleId: 'attendance'  },
  { name: 'Class Attendance',   path: '/teacher/attendance',       icon: <Users size={26} />,         colorHex: '#a78bfa', bgRgb: '167,139,250', moduleId: 'attendance'  },
  { name: 'Fees',               path: '/teacher/fees',             icon: <IndianRupee size={26} />,   colorHex: '#34d399', bgRgb: '52,211,153',  moduleId: 'fees'   },
  { name: 'Manage Students',    path: '/teacher/users',             icon: <Users size={26} />,         colorHex: '#6366f1', bgRgb: '99,102,241', moduleId: 'users'   },
  { name: 'Timetable',          path: '/teacher/timetable',        icon: <Clock size={26} />,         colorHex: '#c084fc', bgRgb: '192,132,252', moduleId: 'timetable'  },
  { name: 'Off Classes',        path: '/teacher/off-classes',      icon: <CalendarX size={26} />,     colorHex: '#fb923c', bgRgb: '251,146,60', moduleId: 'off_classes'   },
  { name: 'Calendar',           path: '/teacher/calendar',         icon: <Calendar size={26} />,      colorHex: '#2dd4bf', bgRgb: '45,212,191',   moduleId: 'calendar'  },
  { name: 'Notices',            path: '/teacher/notices',          icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36', moduleId: 'notices'   },
  { name: 'Leaves',             path: '/teacher/leaves',           icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133', moduleId: 'leaves'  },
  { name: 'Gallery',            path: '/teacher/gallery',          icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182', moduleId: 'gallery'  },
  { name: 'Reports',            path: '/teacher/reports',           icon: <LineChart size={26} />,     colorHex: '#22d3ee', bgRgb: '34,211,238', moduleId: 'reports'   },
  { name: 'Syllabus Tracker',   path: '/teacher/syllabus',          icon: <Book size={26} />,          colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'syllabus'  },
  { name: 'Lost & Found',       path: '/teacher/lost-and-found',    icon: <Search size={26} />,        colorHex: '#10b981', bgRgb: '16,185,129', moduleId: 'lost_found' },

  { name: 'Help',     path: '/teacher/knowledge-base',    icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'knowledge_base'   },
  { name: 'Complaint Box',      path: '/teacher/complaint-box',     icon: <MessageSquare size={26} />, colorHex: '#f43f5e', bgRgb: '244,63,94',   moduleId: 'complaint_box' },
  // Contact module removed — relocated to Settings > Contact Us
  { name: 'Mood Note',          path: '/teacher/mood-note',         icon: <HeartPulse size={26} />,    colorHex: '#ec4899', bgRgb: '236,72,153',  moduleId: 'mood_note' },
  { name: 'Emergency Alerts',   path: '/teacher/emergency',         icon: <AlertTriangle size={26} />, colorHex: '#ef4444', bgRgb: '239,68,68',   moduleId: 'emergency' },
  { name: 'Bus Tracker',        path: '/teacher/bus-alerts',        icon: <Bus size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36',  moduleId: 'bus_alerts' },
  { name: 'Achievers Board',    path: '/teacher/achievers',         icon: <Trophy size={26} />,       colorHex: '#F59E0B', bgRgb: '245,158,11',  moduleId: 'default'},
  { name: 'Settings',           path: '/teacher/settings',          icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184', moduleId: 'default'  },
];

const PREMIUM_MODULES = ['Timetable', 'Gallery'];

function ActivityModuleCard({ mod, isLocked, hasActivity, onClick }) {
  const { mutate: markViewed } = useMarkModuleViewed(mod.moduleId);

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

// Helper to get current date in IST
function getISTNow() {
  const utc = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcMs = utc.getTime() + utc.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + istOffset);
}

// Helper to parse period end time like "09:00 AM - 09:40 AM" into IST Date object
function parsePeriodEndTimeIST(periodLabel, dateStr) {
  if (!periodLabel) return null;
  const parts = periodLabel.split(/-|to/i);
  if (parts.length < 2) return null;
  const endPart = parts[1].trim();
  const match = endPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  let ampm = match[3];
  if (!ampm) {
    const overallAmPmMatch = periodLabel.match(/(AM|PM)/i);
    if (overallAmPmMatch) ampm = overallAmPmMatch[1];
  }
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function TeacherDashboardContent() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { isFree } = usePlan();
  const { isPending } = usePending();
  const { schoolSettings, user } = useAppStore();
  const { data: activities = {} } = useAllModuleActivities();
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Helper to get today's date in IST format
  const getISTTodayStr = () => {
    const istNow = getISTNow();
    const year = istNow.getFullYear();
    const month = String(istNow.getMonth() + 1).padStart(2, '0');
    const day = String(istNow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getISTTodayStr();

  const cacheConfig = useTieredCache({
    freeStaleTime: 10 * 60 * 1000,
    premiumStaleTime: 30 * 1000,
    premiumRefetchInterval: 60000
  });

  // Query for pending substitutions today
  const { data: pendingSubs = [] } = useQuery({
    queryKey: ['teacher-pending-substitutions', user?.id, today],
    queryFn: async () => {
      if (!user?.id || !schoolSettings?.school_id) return [];
      const { data, error } = await supabase
        .from('substitutions')
        .select('*')
        .eq('school_id', schoolSettings.school_id)
        .eq('substitute_teacher_id', user.id)
        .eq('date', today)
        .eq('status', 'pending');
      if (error) throw error;
      
      const istNow = getISTNow();
      return (data || []).filter(sub => {
        const endTime = parsePeriodEndTimeIST(sub.period_label, today);
        if (!endTime) return true;
        return istNow < endTime; // Keep only if current time has not passed period end time
      });
    },
    enabled: !!user?.id && !!schoolSettings?.school_id,
    ...cacheConfig,
  });

  React.useEffect(() => {
    if (showUpgradeModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showUpgradeModal]);

  const handleModuleClick = (e, mod) => {
    if (isFree && PREMIUM_MODULES.includes(mod.name)) {
      e.preventDefault();
      setShowUpgradeModal(true);
    }
  };

  const sortedModules = sortModules(MODULES);
  const filteredModules = sortedModules.filter(mod =>
    mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />
      <PendingBanner />

      <FeatureGuard feature="duty_radar" compact={true}>
        <TeacherDutyBanner />
      </FeatureGuard>

      {pendingSubs.length > 0 && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 mb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 fade-in shadow-lg">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="text-indigo-400" size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest">New Duty Assigned</h3>
              <p className="text-sm text-slate-800 dark:text-slate-300 font-semibold mt-0.5 leading-snug">
                You have {pendingSubs.length} pending off-class substitution{pendingSubs.length > 1 ? 's' : ''} to accept today.
              </p>
            </div>
          </div>
          <Link 
            to="/teacher/off-classes" 
            className="flex-shrink-0 w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Review & Accept <ArrowRight size={14} />
          </Link>
        </div>
      )}

      <div>
        {/* Legacy exact title: "Teacher — Class Tools" */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

          {/* Search Module Widget */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            {showSearch && (
              <input
                type="text"
                placeholder="Search module..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '10px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  width: '150px',
                  transition: 'all 0.3s ease'
                }}
                autoFocus
              />
            )}
            <button
              onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchTerm(''); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '8px'
              }}
              title="Search Modules"
            >
              {showSearch ? <X size={16} /> : <Search size={16} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
          {filteredModules.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: 'var(--text-faint)', fontSize: '13px' }}>
              No modules found.
            </div>
          ) : (
            filteredModules.map((mod) => {
              const isLocked = (isFree && PREMIUM_MODULES.includes(mod.name));
              let hasActivity = activities[mod.moduleId]?.hasActivity || false;
              if (mod.name === 'Off Classes' && pendingSubs.length > 0) {
                hasActivity = true;
              }
              return (
                <ModuleGuard key={mod.name} moduleName={mod.moduleId} inline={true}>
                  <ActivityModuleCard
                     mod={mod}
                     isLocked={isLocked}
                     hasActivity={hasActivity}
                     onClick={(e) => handleModuleClick(e, mod)}
                  />
                </ModuleGuard>
              );
            })
          )}
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
