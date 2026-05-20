import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, ClipboardList, DollarSign, Clock,
  Bell, CalendarHeart, Image, Phone, Settings, BookOpen, MessageSquare, Book, HeartPulse, Search, Bus, Trophy
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import ModuleGuard from '../../components/ModuleGuard';
import { X } from 'lucide-react';
import { useUniversalModuleActivity } from '../../hooks/useUniversalModuleActivity';

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
  { name: 'Syllabus Tracker',path: '/student/syllabus',       icon: <Book size={26} />,          colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'syllabus'  },
  { name: 'Lost & Found',    path: '/student/lost-and-found', icon: <Search size={26} />,        colorHex: '#10b981', bgRgb: '16,185,129', moduleId: 'lost_found' },
  { name: 'Contact',        path: '/student/contact',         icon: <Phone size={26} />,         colorHex: '#2dd4bf', bgRgb: '45,212,191', moduleId: 'contact'   },
  { name: 'Help', path: '/student/knowledge-base',  icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248', moduleId: 'knowledge_base'   },
  { name: 'Complaint Box',  path: '/student/complaint-box',   icon: <MessageSquare size={26} />, colorHex: '#f43f5e', bgRgb: '244,63,94',   moduleId: 'complaint_box' },
  { name: 'Mood Note',      path: '/student/mood-note',       icon: <HeartPulse size={26} />,    colorHex: '#ec4899', bgRgb: '236,72,153', moduleId: 'mood_note' },
  { name: 'Bus Tracker',   path: '/student/bus-alerts',      icon: <Bus size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36', moduleId: 'bus_alerts' },
  { name: 'Achievers Board', path: '/student/achievers',     icon: <Trophy size={26} />,       colorHex: '#F59E0B', bgRgb: '245,158,11', moduleId: 'default'},
  { name: 'Settings',       path: '/student/settings',        icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184', moduleId: 'settings'  },
];

function MorningCheckInBanner({ user, schoolId }) {
  const navigate = React.useRouter ? React.useRouter().push : null; // we will use Link instead
  const today = new Date().toISOString().split('T')[0];
  const monthYear = today.substring(0, 7);
  const dismissKey = `mood_dismissed_${user.id}_${today}`;
  const [dismissed, setDismissed] = React.useState(localStorage.getItem(dismissKey) === 'true');

  const { data: record } = useQuery({
    queryKey: ['mood-note', schoolId, user.id, monthYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('health_mood_notes')
        .select('notes')
        .eq('school_id', schoolId)
        .eq('student_id', user.id)
        .eq('month_year', monthYear)
        .single();
      return data || { notes: {} };
    },
    enabled: !dismissed,
  });

  if (dismissed || record?.notes?.[today]) return null;

  return (
    <ModuleGuard moduleName="mood_note" inline={true}>
      <div style={{
        background: 'linear-gradient(135deg, #fce7f3, #fbcfe8)',
        borderRadius: '16px', padding: '16px 20px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: '1px solid #f9a8d4', boxShadow: '0 4px 12px rgba(236,72,153,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          <div style={{ fontSize: '32px' }}>🌞</div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 900, color: '#831843', fontSize: '16px' }}>Good Morning!</h3>
            <p style={{ margin: '2px 0 0', color: '#9d174d', fontSize: '13px', fontWeight: 600 }}>
              How are you feeling today?
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/student/mood-note" style={{ textDecoration: 'none' }}>
            <button className="btn accent" style={{ background: '#ec4899', color: '#fff', padding: '8px 16px', borderRadius: '12px', fontSize: '13px', border: 'none' }}>
              Check-in
            </button>
          </Link>
          <button 
            onClick={() => {
              localStorage.setItem(dismissKey, 'true');
              setDismissed(true);
            }}
            style={{ background: 'transparent', border: 'none', color: '#be185d', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </ModuleGuard>
  );
}

function ActivityModuleCard({ mod }) {
  const { hasActivity, markViewed } = useUniversalModuleActivity(mod.moduleId);

  return (
    <motion.div
      whileHover={{ scale: 1.04, boxShadow: `0 10px 30px -6px rgba(${mod.bgRgb},0.3)` }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 20 }}
    >
      <Link
        to={mod.path}
        onClick={() => markViewed()}
        className="module-card"
        style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px', position: 'relative', display: 'block' }}
      >
        {hasActivity && (
           <div style={{ position: 'absolute', top: '12px', right: '12px', background: '#ef4444', border: '2px solid var(--card-bg)', borderRadius: '50%', width: '12px', height: '12px', zIndex: 10, boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
        )}
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: `rgba(${mod.bgRgb}, 0.12)`,
          border: `1px solid rgba(${mod.bgRgb}, 0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: mod.colorHex, margin: '0 auto',
        }}
        >
          {mod.icon}
        </div>
        <span style={{
          fontSize: '11px', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--text-main)', textAlign: 'center',
          lineHeight: 1.3, display: 'block', marginTop: '12px',
        }}>
          {mod.name}
        </span>
      </Link>
    </motion.div>
  );
}

function StudentDashboardContent({ user, schoolSettings }) {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />
      <MorningCheckInBanner user={user} schoolId={schoolSettings.school_id} />
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
            <ModuleGuard key={mod.name} moduleName={mod.moduleId} inline={true}>
              <ActivityModuleCard mod={mod} />
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
  return <StudentDashboardContent user={user} schoolSettings={schoolSettings} />;
}
