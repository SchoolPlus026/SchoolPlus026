import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Bell, CalendarHeart, Image, Calendar,
  BookOpen, MessageSquare, Settings, AlertTriangle, Search, X
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';
import ModuleGuard from '../../components/ModuleGuard';
import { sortModules } from '../../utils/dashboardSorter';

// Staff members are generic employees (clerks, accountants, etc.)
// They have a restricted view — only the modules the Admin has enabled
// and that are relevant to a non-teaching, non-driving employee.
const MODULES = [
  { name: 'My Profile',    path: '/staff/profile',       icon: <User size={26} />,          colorHex: '#60a5fa', bgRgb: '96,165,250',   moduleId: 'users'         },
  { name: 'Calendar',      path: '/staff/calendar',      icon: <Calendar size={26} />,      colorHex: '#2dd4bf', bgRgb: '45,212,191',   moduleId: 'calendar'      },
  { name: 'Notices',       path: '/staff/notices',       icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36',   moduleId: 'notices'       },
  { name: 'Leaves',        path: '/staff/leaves',        icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133',  moduleId: 'leaves'        },
  { name: 'Gallery',       path: '/staff/gallery',       icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182',  moduleId: 'gallery'       },

  { name: 'Help',path: '/staff/knowledge-base',icon: <BookOpen size={26} />,      colorHex: '#38bdf8', bgRgb: '56,189,248',   moduleId: 'knowledge_base'},
  { name: 'Complaint Box', path: '/staff/complaint-box', icon: <MessageSquare size={26} />, colorHex: '#f43f5e', bgRgb: '244,63,94',    moduleId: 'complaint_box' },
  // Contact module removed — relocated to Settings > Contact Us
  { name: 'Emergency Alerts',path: '/staff/emergency',   icon: <AlertTriangle size={26} />, colorHex: '#ef4444', bgRgb: '239,68,68',    moduleId: 'emergency'     },
  { name: 'Settings',      path: '/staff/settings',      icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184',  moduleId: 'default'      },
];

export default function StaffDashboard() {
  const { user, schoolSettings } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

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

  const sortedModules = sortModules(MODULES);
  const filteredModules = sortedModules.filter(mod =>
    mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />

      <div>
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
              Staff Portal
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

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '14px',
        }}>
          {filteredModules.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: 'var(--text-faint)', fontSize: '13px' }}>
              No modules found.
            </div>
          ) : (
            filteredModules.map((mod) => (
              <ModuleGuard key={mod.name} moduleName={mod.moduleId} inline={true}>
                <motion.div
                  whileHover={{ scale: 1.04, boxShadow: `0 10px 30px -6px rgba(${mod.bgRgb},0.3)` }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                >
                  <Link
                    to={mod.path}
                    className="module-card"
                    style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px', display: 'block' }}
                  >
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
                      color: 'var(--text-main)', textAlign: 'center', lineHeight: 1.3,
                      display: 'block', marginTop: '12px',
                    }}>
                      {mod.name}
                    </span>
                  </Link>
                </motion.div>
              </ModuleGuard>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
