import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bus, Search, AlertTriangle, Calendar, Image, HelpCircle } from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';

const MODULES = [
  { name: 'Route Control',   path: '/driver/bus-alerts',     icon: <Bus size={26} />,            colorHex: '#fbbf24', bgRgb: '251,191,36' },
  { name: 'Lost & Found',    path: '/driver/lost-and-found', icon: <Search size={26} />,         colorHex: '#10b981', bgRgb: '16,185,129' },
  { name: 'Emergency Alerts',path: '/driver/emergency',      icon: <AlertTriangle size={26} />,  colorHex: '#ef4444', bgRgb: '239,68,68'  },
  { name: 'Leaves',          path: '/driver/leaves',         icon: <Calendar size={26} />,       colorHex: '#8b5cf6', bgRgb: '139,92,246' },
  { name: 'Gallery',         path: '/driver/gallery',        icon: <Image size={26} />,          colorHex: '#f43f5e', bgRgb: '244,63,94' },
  { name: 'Help',            path: '/driver/knowledge-base', icon: <HelpCircle size={26} />,     colorHex: '#3b82f6', bgRgb: '59,130,246' }
];

export default function DriverDashboard() {
  return (
    <div className="fade-in p-4 sm:p-6" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{
            width: '3px', height: '22px', borderRadius: '999px',
            background: 'linear-gradient(180deg, #4f46e5, #7c3aed)', flexShrink: 0,
          }} />
          <h3 style={{
            margin: 0, fontSize: '11px', fontWeight: 800,
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Driver Modules
          </h3>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '14px',
        }}>
          {MODULES.map((mod) => (
            <motion.div
              key={mod.name}
              whileHover={{ scale: 1.04, boxShadow: `0 10px 30px -6px rgba(${mod.bgRgb},0.3)` }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 20 }}
            >
              <Link
                to={mod.path}
                className="module-card"
                style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', borderRadius: '24px' }}
              >
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  background: `rgba(${mod.bgRgb}, 0.12)`,
                  border: `1px solid rgba(${mod.bgRgb}, 0.2)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: mod.colorHex,
                }}
                >
                  {mod.icon}
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--text-main)', textAlign: 'center', lineHeight: 1.3,
                }}>
                  {mod.name}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
