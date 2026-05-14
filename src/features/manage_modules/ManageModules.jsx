import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { LayoutGrid, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// All possible modules with their display metadata
const ALL_MODULES = [
  // ── Core / Legacy ──────────────────────────────────────────────────────────
  { id: 'attendance',    label: 'Attendance',      emoji: '📋', desc: 'Daily attendance tracking for students and teachers.' },
  { id: 'fees',          label: 'Fees',             emoji: '💰', desc: 'Fee collection, dues tracking, and payment ledger.' },
  { id: 'calendar',      label: 'Calendar',         emoji: '📅', desc: 'School event calendar and important dates.' },
  { id: 'notices',       label: 'Notices',          emoji: '🔔', desc: 'Official school announcements and circulars.' },
  { id: 'gallery',       label: 'Gallery',          emoji: '🖼️', desc: 'Photo gallery and media uploads.' },
  { id: 'timetable',     label: 'Timetable',        emoji: '🕒', desc: 'Class-wise period and subject scheduling.' },
  { id: 'off_classes',   label: 'Off Classes',      emoji: '🚫', desc: 'Track cancelled or substituted classes.' },
  { id: 'leaves',        label: 'Leaves',           emoji: '🌿', desc: 'Leave applications for students and staff.' },
  { id: 'reports',       label: 'Reports',          emoji: '📊', desc: 'Academic and attendance analytics.' },
  { id: 'contact',       label: 'Contact',          emoji: '📞', desc: 'School contact directory.' },
  { id: 'knowledge_base',label: 'Knowledge Base',   emoji: '📚', desc: 'School FAQs and resource library.' },
  // ── Optional / New ─────────────────────────────────────────────────────────
  { id: 'complaint_box', label: 'Complaint Box',    emoji: '📮', desc: 'Private messaging between students, teachers, and admin.' },
  { id: 'lost_found',    label: 'Lost & Found',     emoji: '🔍', desc: 'Report and recover lost items on campus.' },
  { id: 'bus_alerts',    label: 'Bus Tracker',      emoji: '🚌', desc: 'Real-time school transport live tracking.' },
  { id: 'syllabus',      label: 'Syllabus Tracker', emoji: '📖', desc: 'Track curriculum progress by class and subject.' },
  { id: 'mood_note',     label: 'Mood Note',        emoji: '😊', desc: 'Morning health and mood reporting for students.' },
  { id: 'emergency',     label: 'Emergency Alerts', emoji: '🚨', desc: 'Trigger global high-priority screen overrides.' },
  { id: 'duty_radar',    label: 'Staff Pending Duty', emoji: '📡', desc: 'Automated missing attendance tracking.' },
  { id: 'executive_briefing',label: 'Executive Briefing',emoji:'📋',desc: 'Automated daily summaries for Administration.' },
];

// These modules are core infrastructure — cannot be disabled
const PROTECTED_MODULES = ['users', 'settings', 'billing'];

export default function ManageModules() {
  const { schoolSettings, setSchoolSettings } = useAppStore();
  const [saving, setSaving] = useState(null); // moduleId currently being toggled

  const activeModules = schoolSettings?.modules_active || [];

  const isActive = (id) => activeModules.includes(id);

  const handleToggle = async (moduleId) => {
    if (PROTECTED_MODULES.includes(moduleId)) return;
    setSaving(moduleId);
    try {
      const next = isActive(moduleId)
        ? activeModules.filter((m) => m !== moduleId)
        : [...activeModules, moduleId];

      const { error } = await supabase
        .from('school_settings')
        .update({ modules_active: next })
        .eq('school_id', schoolSettings.school_id);

      if (error) throw error;
      setSchoolSettings({ ...schoolSettings, modules_active: next });
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fade-in max-w-3xl mx-auto" style={{ paddingBottom: '48px' }}>

      {/* Header */}
      <div style={{
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        padding: '32px',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: 'rgba(129,140,248,0.2)',
          border: '1px solid rgba(129,140,248,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <LayoutGrid size={28} color="#a5b4fc" />
        </div>
        <div>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0, letterSpacing: '-0.02em' }}>
            Manage Modules
          </h2>
          <p style={{ color: 'rgba(199,210,254,0.7)', fontSize: '13px', margin: '4px 0 0', lineHeight: 1.5 }}>
            Toggle features on or off for your school. Changes take effect instantly for all users in your school only.
          </p>
        </div>
      </div>

      {/* Module Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ALL_MODULES.map((mod) => {
          const active = isActive(mod.id);
          const isSaving = saving === mod.id;

          return (
            <div
              key={mod.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                borderRadius: '16px',
                background: 'var(--card-bg)',
                border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'var(--card-border)'}`,
                transition: 'all 0.2s ease',
                boxShadow: active ? '0 0 0 1px rgba(99,102,241,0.1)' : 'none',
              }}
            >
              {/* Emoji */}
              <span style={{ fontSize: '22px', flexShrink: 0 }}>{mod.emoji}</span>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-main)', marginBottom: '2px' }}>
                  {mod.label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {mod.desc}
                </div>
              </div>

              {/* Status Pill */}
              <div style={{
                fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: active ? '#10b981' : 'var(--text-faint)',
                display: 'flex', alignItems: 'center', gap: '4px',
                flexShrink: 0,
              }}>
                {active
                  ? <><CheckCircle2 size={12} /> On</>
                  : <><XCircle size={12} /> Off</>}
              </div>

              {/* Toggle */}
              <button
                onClick={() => handleToggle(mod.id)}
                disabled={isSaving}
                style={{
                  width: '48px', height: '26px', borderRadius: '999px', flexShrink: 0,
                  background: active ? '#6366f1' : 'var(--input-bg)',
                  border: `2px solid ${active ? '#6366f1' : 'var(--card-border)'}`,
                  position: 'relative', cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  display: 'flex', alignItems: 'center',
                  padding: '0 3px',
                }}
                title={active ? `Disable ${mod.label}` : `Enable ${mod.label}`}
              >
                {isSaving ? (
                  <Loader2 size={14} style={{ color: '#fff', margin: 'auto', animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <span style={{
                    width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    transform: active ? 'translateX(22px)' : 'translateX(0)',
                    transition: 'transform 0.25s ease',
                    display: 'block',
                  }} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-faint)', marginTop: '24px', fontWeight: 600 }}>
        Changes are school-specific and do not affect other schools on the platform.
      </p>
    </div>
  );
}
