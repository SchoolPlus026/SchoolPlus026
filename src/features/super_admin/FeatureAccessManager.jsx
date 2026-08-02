import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { Lock, Unlock, Save, RefreshCw, Search, AlertTriangle, CheckCircle, ShieldAlert, Layers, Shield } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const ALL_MODULES = [
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
  { id: 'knowledge_base',label: 'Help',             emoji: '📚', desc: 'School FAQs and resource library.' },
  { id: 'complaint_box', label: 'Complaint Box',    emoji: '📮', desc: 'Private messaging between students, teachers, and admin.' },
  { id: 'lost_found',    label: 'Lost & Found',     emoji: '🔍', desc: 'Report and recover lost items on campus.' },
  { id: 'bus_alerts',    label: 'Bus Tracker',      emoji: '🚌', desc: 'Real-time school transport live tracking.' },
  { id: 'syllabus',      label: 'Syllabus Tracker', emoji: '📖', desc: 'Track curriculum progress by class and subject.' },
  { id: 'mood_note',     label: 'Mood Note',        emoji: '😊', desc: 'Morning health and mood reporting for students.' },
  { id: 'emergency',     label: 'Emergency Alerts', emoji: '🚨', desc: 'Trigger global high-priority screen overrides.' },
  { id: 'duty_radar',    label: 'Staff Pending Duty', emoji: '📡', desc: 'Automated missing attendance tracking.' },
  { id: 'executive_briefing',label: 'Executive Briefing',emoji:'📋',desc: 'Automated daily summaries for Administration.' },
  { id: 'billing',       label: 'Billing & Subscriptions', emoji: '💳', desc: 'School subscription billing and payment management.' },
];

export default function FeatureAccessManager() {
  const [subTab, setSubTab] = useState('global'); // 'global' | 'school'
  
  // Global tier states
  const [globalLockedList, setGlobalLockedList] = useState([]);
  const [globallyDisabledList, setGloballyDisabledList] = useState([]);
  const [savingKillSwitch, setSavingKillSwitch] = useState(false);
  const [allowDemoEdit, setAllowDemoEdit] = useState(false);
  const [demoLoginEnabled, setDemoLoginEnabled] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);

  // School override states
  const [schools, setSchools] = useState([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [schoolLockedList, setSchoolLockedList] = useState([]);
  const [savingSchoolOverride, setSavingSchoolOverride] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentEmailsEnabled, setStudentEmailsEnabled] = useState(false);
  
  // Migration missing error warning
  const [migrationWarning, setMigrationWarning] = useState(false);

  useEffect(() => {
    fetchGlobalSettings();
    fetchSchools();
  }, []);

  const fetchGlobalSettings = async () => {
    setLoadingGlobal(true);
    try {
      const { data, error } = await supabase.from('platform_settings').select('*').single();
      if (error) throw error;
      if (data) {
        // Suppress migration warnings if column is fetched (even if null/empty array)
        const locked = Array.isArray(data.free_tier_locked_modules) ? data.free_tier_locked_modules : [];
        const globallyDisabled = Array.isArray(data.globally_disabled_modules) ? data.globally_disabled_modules : [];
        setGlobalLockedList(locked);
        setGloballyDisabledList(globallyDisabled);
        setAllowDemoEdit(!!data.allow_demo_edit);
        setDemoLoginEnabled(data.demo_login_enabled !== false);
      }
    } catch (err) {
      console.warn('Failed to fetch platform global locks:', err.message);
      if (err.message.includes('column') && err.message.includes('does not exist')) {
        setMigrationWarning(true);
      }
    } finally {
      setLoadingGlobal(false);
    }
  };

  const fetchSchools = async () => {
    setLoadingSchools(true);
    try {
      const { data, error } = await supabase.from('school_settings').select('*').order('name');
      if (error) throw error;
      if (data) setSchools(data);
    } catch (err) {
      console.warn('Failed to fetch schools:', err.message);
      if (err.message.includes('column') && err.message.includes('does not exist')) {
        setMigrationWarning(true);
      }
    } finally {
      setLoadingSchools(false);
    }
  };

  // Set the selected school override details when school changes
  useEffect(() => {
    if (!selectedSchoolId) {
      setSelectedSchool(null);
      setSchoolLockedList([]);
      setStudentEmailsEnabled(false);
      return;
    }
    const school = schools.find(s => s.school_id === selectedSchoolId);
    if (school) {
      setSelectedSchool(school);
      setSchoolLockedList(Array.isArray(school.locked_modules) ? school.locked_modules : []);
      setStudentEmailsEnabled(!!school.student_emails_enabled);
    }
  }, [selectedSchoolId, schools]);

  const handleGlobalToggle = (moduleId) => {
    setGlobalLockedList(prev => 
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    );
  };

  const handleSchoolToggle = (moduleId) => {
    setSchoolLockedList(prev => 
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    );
  };

  const handleSaveGlobalDefaults = async () => {
    setSavingGlobal(true);
    try {
      // Find row in platform_settings
      const { data: rows, error: selectErr } = await supabase.from('platform_settings').select('id');
      if (selectErr) throw selectErr;
      if (rows && rows.length > 0) {
        const { error } = await supabase.from('platform_settings')
          .update({ 
            free_tier_locked_modules: globalLockedList,
            allow_demo_edit: allowDemoEdit,
            demo_login_enabled: demoLoginEnabled
          })
          .eq('id', rows[0].id);
        if (error) throw error;

        // Sync to Zustand store
        const currentPlat = useAppStore.getState().platformSettings || {};
        useAppStore.getState().setPlatformSettings({ ...currentPlat, allow_demo_edit: allowDemoEdit, demo_login_enabled: demoLoginEnabled });

        alert('Global Free Tier default locks and settings saved successfully!');
      } else {
        // Fallback if table has no rows
        const { error } = await supabase.from('platform_settings')
          .insert({ 
            free_tier_locked_modules: globalLockedList,
            allow_demo_edit: allowDemoEdit,
            demo_login_enabled: demoLoginEnabled
          });
        if (error) throw error;

        // Sync to Zustand store
        const currentPlat = useAppStore.getState().platformSettings || {};
        useAppStore.getState().setPlatformSettings({ ...currentPlat, allow_demo_edit: allowDemoEdit, demo_login_enabled: demoLoginEnabled });

        alert('Global Free Tier default locks and settings saved successfully!');
      }
    } catch (err) {
      console.error('Error saving global defaults:', err);
      if (err.message.includes('column') && err.message.includes('does not exist')) {
        alert('Database schema mismatch! Please ensure you have run the database/v73_saas_monetization_controls.sql script in your Supabase SQL editor.');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleBulkApply = async () => {
    if (!window.confirm(`Are you sure you want to bulk-apply these locks/unlocks to ALL current schools on the Free plan? This will overwrite their specific configurations with the global defaults.`)) {
      return;
    }
    setBulkApplying(true);
    try {
      const freeSchools = schools.filter(s => s.plan_type === 'free' || s.subscription_tier === 'Free');
      if (freeSchools.length === 0) {
        alert('No schools currently on the Free plan.');
        setBulkApplying(false);
        return;
      }

      // Update all Free schools in a loop
      let successCount = 0;
      for (const school of freeSchools) {
        const { error } = await supabase.from('school_settings')
          .update({ locked_modules: globalLockedList })
          .eq('school_id', school.school_id);
        if (!error) successCount++;
      }

      alert(`Successfully bulk-applied defaults to ${successCount} Free-tier schools!`);
      // Refetch schools to update overrides panel
      await fetchSchools();
    } catch (err) {
      console.error('Error in bulk apply:', err);
      alert('Bulk apply failed: ' + err.message);
    } finally {
      setBulkApplying(false);
    }
  };

  const handleKillSwitchToggle = (moduleId) => {
    setGloballyDisabledList(prev =>
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    );
  };

  const handleSaveKillSwitch = async () => {
    setSavingKillSwitch(true);
    try {
      const { data: rows, error: selectErr } = await supabase.from('platform_settings').select('id');
      if (selectErr) throw selectErr;
      if (rows && rows.length > 0) {
        const { error } = await supabase.from('platform_settings')
          .update({ globally_disabled_modules: globallyDisabledList })
          .eq('id', rows[0].id);
        if (error) throw error;
      }
      
      const currentPlat = useAppStore.getState().platformSettings || {};
      useAppStore.getState().setPlatformSettings({ ...currentPlat, globally_disabled_modules: globallyDisabledList });

      alert('Global Module Kill-Switch settings saved successfully across ALL schools!');
    } catch (err) {
      alert('Failed to save globally disabled modules: ' + err.message);
    } finally {
      setSavingKillSwitch(false);
    }
  };

  const handleSaveSchoolOverride = async () => {
    if (!selectedSchool) return;
    setSavingSchoolOverride(true);
    try {
      const { error } = await supabase.from('school_settings')
        .update({ 
          locked_modules: schoolLockedList,
          student_emails_enabled: studentEmailsEnabled
        })
        .eq('school_id', selectedSchool.school_id);
      
      if (error) throw error;
      
      alert(`Successfully updated overrides for "${selectedSchool.name}"!`);
      
      // Update local schools array so selection state is updated
      setSchools(prev => prev.map(s => 
        s.school_id === selectedSchool.school_id 
          ? { ...s, locked_modules: schoolLockedList, student_emails_enabled: studentEmailsEnabled } 
          : s
      ));
    } catch (err) {
      console.error('Error saving override:', err);
      if (err.message.includes('column') && err.message.includes('does not exist')) {
        alert('Database schema mismatch! Please ensure you have run the database/v73_saas_monetization_controls.sql script in your Supabase SQL editor.');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      setSavingSchoolOverride(false);
    }
  };

  const handleResetToDefaults = () => {
    if (!window.confirm('Reset this school\'s locked features to match the global defaults? You will still need to click "Save Override" to persist changes.')) {
      return;
    }
    setSchoolLockedList(globalLockedList);
  };

  // Filter schools based on query
  const filteredSchools = schools.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.school_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto" style={{ paddingBottom: '60px' }}>
      
      {/* Header card */}
      <div style={{
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        padding: '32px',
        border: '1px solid rgba(129,140,248,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '18px',
          background: 'rgba(167,139,250,0.15)',
          border: '1px solid rgba(167,139,250,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Lock size={30} color="#c084fc" />
        </div>
        <div>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '22px', margin: 0, letterSpacing: '-0.02em' }}>
            Feature Access Manager
          </h2>
          <p style={{ color: 'rgba(199,210,254,0.7)', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
            Manage feature locks for Free plan schools. Configure global tier defaults and bulk-apply them, or define school-specific custom overrides.
          </p>
        </div>
      </div>

      {/* Migration Warning banner */}
      {migrationWarning && (
        <div style={{
          display: 'flex',
          gap: '16px',
          padding: '16px 20px',
          borderRadius: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          alignItems: 'center',
        }}>
          <AlertTriangle size={24} color="#f87171" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: '#fca5a5', lineHeight: 1.5 }}>
            <strong style={{ color: '#ef4444' }}>Database Columns Missing:</strong> You need to apply the database migrations. Please run the SQL queries in <a href="file:///c:/Users/Icon/Downloads/new%20school%20app/database/v73_saas_monetization_controls.sql" style={{ color: '#6366f1', textDecoration: 'underline', fontWeight: 700 }}>v73_saas_monetization_controls.sql</a> inside your Supabase SQL editor to create the necessary columns.
          </div>
        </div>
      )}

      {/* Nav Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', paddingBottom: '1px', gap: '8px' }}>
        <button
          onClick={() => setSubTab('global')}
          style={{
            padding: '12px 24px',
            fontSize: '13px',
            fontWeight: 800,
            color: subTab === 'global' ? 'var(--text-main)' : 'var(--text-muted)',
            background: subTab === 'global' ? 'var(--card-bg)' : 'transparent',
            border: subTab === 'global' ? '1px solid var(--card-border)' : 'none',
            borderBottom: subTab === 'global' ? '1px solid var(--card-bg)' : 'none',
            borderRadius: '12px 12px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Layers size={14} /> Global Free Tier Defaults
        </button>
        <button
          onClick={() => setSubTab('school')}
          style={{
            padding: '12px 24px',
            fontSize: '13px',
            fontWeight: 800,
            color: subTab === 'school' ? 'var(--text-main)' : 'var(--text-muted)',
            background: subTab === 'school' ? 'var(--card-bg)' : 'transparent',
            border: subTab === 'school' ? '1px solid var(--card-border)' : 'none',
            borderBottom: subTab === 'school' ? '1px solid var(--card-bg)' : 'none',
            borderRadius: '12px 12px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Search size={14} /> School-Specific Override
        </button>
        <button
          onClick={() => setSubTab('killswitch')}
          style={{
            padding: '12px 24px',
            fontSize: '13px',
            fontWeight: 800,
            color: subTab === 'killswitch' ? '#ef4444' : 'var(--text-muted)',
            background: subTab === 'killswitch' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
            border: subTab === 'killswitch' ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
            borderBottom: subTab === 'killswitch' ? '1px solid var(--card-bg)' : 'none',
            borderRadius: '12px 12px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <ShieldAlert size={14} /> Global Module Kill-Switch
        </button>
      </div>

      {/* GLOBAL TAB CONTENT */}
      {subTab === 'global' && (
        <div className="space-y-6">
          {/* Standalone Demo School Protection Toggle Card */}
          <div className="card p-5 rounded-3xl relative overflow-hidden" style={{ borderLeft: '4px solid #f59e0b', background: 'rgba(245, 158, 11, 0.05)', padding: '20px', borderRadius: '24px', position: 'relative' }}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="flex items-center justify-between gap-4 flex-wrap relative z-10" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div className="flex items-start gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="p-2 bg-amber-500/20 text-amber-500 rounded-xl" style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider" style={{ fontSize: '13px', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Demo School Data Protection</h4>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5" style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Control editing permissions for School Code 100 (demo testing school).</p>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                <span className="text-xs font-black text-amber-200 uppercase tracking-wider" style={{ fontSize: '12px', fontWeight: 800, color: '#f59e0b' }}>{allowDemoEdit ? "Editing Enabled" : "Read-Only (Locked)"}</span>
                <input
                  type="checkbox"
                  checked={allowDemoEdit}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setAllowDemoEdit(checked);
                    try {
                      const { error } = await supabase
                        .from('platform_settings')
                        .update({ allow_demo_edit: checked })
                        .neq('id', '00000000-0000-0000-0000-000000000000');
                      if (error) throw error;
                      
                      const currentPlat = useAppStore.getState().platformSettings || {};
                      useAppStore.getState().setPlatformSettings({ ...currentPlat, allow_demo_edit: checked });
                      alert(`Demo school editing permissions set to: ${checked ? 'ENABLED' : 'DISABLED (Read-Only)'}`);
                    } catch (err) {
                      alert('Failed to save demo protection setting: ' + err.message);
                      setAllowDemoEdit(!checked);
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </label>
            </div>
          </div>

          {/* Standalone Demo Login Toggle Card */}
          <div className="card p-5 rounded-3xl relative overflow-hidden" style={{ borderLeft: '4px solid #6366f1', background: 'rgba(99, 102, 241, 0.05)', padding: '20px', borderRadius: '24px', position: 'relative' }}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="flex items-center justify-between gap-4 flex-wrap relative z-10" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div className="flex items-start gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl" style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Unlock size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider" style={{ fontSize: '13px', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Main Login Screen Demo Access Switch</h4>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5" style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Toggle whether the one-click 'Demo Login' button is visible to everyone on the initial login screen.</p>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                <span className="text-xs font-black text-indigo-300 uppercase tracking-wider" style={{ fontSize: '12px', fontWeight: 800, color: '#818cf8' }}>{demoLoginEnabled ? "ON (Visible on Login)" : "OFF (Hidden)"}</span>
                <input
                  type="checkbox"
                  checked={demoLoginEnabled}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setDemoLoginEnabled(checked);
                    try {
                      const { error } = await supabase
                        .from('platform_settings')
                        .update({ demo_login_enabled: checked })
                        .neq('id', '00000000-0000-0000-0000-000000000000');
                      if (error) throw error;
                      
                      const currentPlat = useAppStore.getState().platformSettings || {};
                      useAppStore.getState().setPlatformSettings({ ...currentPlat, demo_login_enabled: checked });
                      alert(`Demo login feature on login screen set to: ${checked ? 'ENABLED (Visible)' : 'DISABLED (Hidden)'}`);
                    } catch (err) {
                      alert('Failed to save demo login setting: ' + err.message);
                      setDemoLoginEnabled(!checked);
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </label>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Global Default Locks</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Enable modules (on) to make them available to Free tier schools, or disable them (off) to lock them under Premium.
                </p>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                <button
                  onClick={fetchGlobalSettings}
                  disabled={loadingGlobal}
                  className="btn btn-secondary inline-flex items-center gap-1.5"
                  style={{ padding: '8px 14px', fontSize: '12px', height: '36px' }}
                >
                  <RefreshCw size={14} className={loadingGlobal ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleSaveGlobalDefaults}
                  disabled={savingGlobal}
                  className="btn btn-primary inline-flex items-center gap-2"
                  style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', fontSize: '12px', height: '36px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  <Save size={14} /> {savingGlobal ? 'Saving...' : 'Save Defaults'}
                </button>
              </div>
            </div>

            {loadingGlobal ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <RefreshCw size={24} className="animate-spin" color="var(--text-muted)" />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                {ALL_MODULES.map(mod => {
                  const isLocked = globalLockedList.includes(mod.id);
                  return (
                    <div
                      key={mod.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '14px 20px',
                        borderRadius: '14px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--card-border)',
                        transition: 'border 0.2s',
                      }}
                    >
                      <span style={{ fontSize: '20px', flexShrink: 0 }}>{mod.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>{mod.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>{mod.desc}</div>
                      </div>
                      
                      {/* Status indicator */}
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: isLocked ? '#ef4444' : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginRight: '12px',
                      }}>
                        {isLocked ? <><Lock size={11} /> Locked</> : <><Unlock size={11} /> Unlocked</>}
                      </div>

                      {/* Toggle button (ON = unlocked (not in globalLockedList), OFF = locked (in globalLockedList)) */}
                      <button
                        onClick={() => handleGlobalToggle(mod.id)}
                        style={{
                          width: '46px', height: '24px', borderRadius: '999px', flexShrink: 0,
                          background: !isLocked ? '#10b981' : '#334155',
                          border: 'none',
                          position: 'relative', cursor: 'pointer',
                          transition: 'all 0.25s ease',
                          display: 'flex', alignItems: 'center',
                          padding: '0 3px',
                        }}
                      >
                        <span style={{
                          width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          transform: !isLocked ? 'translateX(22px)' : 'translateX(0)',
                          transition: 'transform 0.25s ease',
                          display: 'block',
                        }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bulk Action panel */}
          <div className="card" style={{ padding: '24px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'between' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={16} color="#818cf8" /> Bulk Apply defaults to Free Schools
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                  Overwrite all current Free-tier schools' module configurations with the default list above in one click. (Overrides will be wiped out for matching free schools).
                </p>
              </div>
              <button
                onClick={handleBulkApply}
                disabled={bulkApplying || loadingSchools}
                style={{
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(99,102,241,0.2)',
                  transition: 'all 0.2s',
                }}
              >
                {bulkApplying ? (
                  <><RefreshCw size={14} className="animate-spin" /> Applying...</>
                ) : (
                  <>Apply Defaults to All Free Schools ({schools.filter(s => s.plan_type === 'free' || s.subscription_tier === 'Free').length})</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL MODULE KILL-SWITCH TAB CONTENT */}
      {subTab === 'killswitch' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl border border-rose-500/30 bg-rose-500/5 relative overflow-hidden">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-base font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert size={18} /> Master System Kill-Switch
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  Globally disable any module (including Billing & Subscriptions) across ALL schools (Free, Premium, Trial, and newly created schools).
                </p>
              </div>
              <button
                onClick={handleSaveKillSwitch}
                disabled={savingKillSwitch}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer border-0 disabled:opacity-50"
              >
                {savingKillSwitch ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {savingKillSwitch ? 'Saving Changes...' : 'Save Global Kill-Switch'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_MODULES.map(m => {
              const isKilled = globallyDisabledList.includes(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => handleKillSwitchToggle(m.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                    isKilled
                      ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-900/20'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{m.emoji}</span>
                      <h4 className={`text-sm font-bold ${isKilled ? 'text-rose-300' : 'text-slate-200'}`}>{m.label}</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed">{m.desc}</p>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                    isKilled ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {isKilled ? <Lock size={12} /> : <Unlock size={12} />}
                    {isKilled ? 'Globally Off' : 'Active'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SCHOOL OVERRIDE TAB CONTENT */}
      {subTab === 'school' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Sidebar: School Selector */}
          <div className="card space-y-4" style={{ padding: '20px', height: 'fit-content' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>Select School</h4>
            
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--text-faint)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Search name or code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '8px',
                  padding: '8px 12px 8px 30px',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            {/* School List */}
            {loadingSchools ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <RefreshCw size={18} className="animate-spin" color="var(--text-muted)" />
              </div>
            ) : (
              <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                {filteredSchools.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No schools found.</div>
                ) : (
                  filteredSchools.map(s => {
                    const isFree = s.plan_type === 'free' || s.subscription_tier === 'Free';
                    const hasOverrides = Array.isArray(s.locked_modules) && s.locked_modules.length > 0;
                    
                    return (
                      <button
                        key={s.school_id}
                        onClick={() => setSelectedSchoolId(s.school_id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: selectedSchoolId === s.school_id ? 'rgba(99,102,241,0.12)' : 'transparent',
                          borderLeft: selectedSchoolId === s.school_id ? '3px solid #6366f1' : '3px solid transparent',
                          color: selectedSchoolId === s.school_id ? 'var(--accent)' : 'var(--text-main)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {s.name}
                          </span>
                          <span style={{
                            fontSize: '8px',
                            fontWeight: 900,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: isFree ? 'rgba(148,163,184,0.15)' : 'rgba(16,185,129,0.15)',
                            color: isFree ? 'var(--text-muted)' : '#34d399',
                            textTransform: 'uppercase',
                          }}>
                            {s.plan_type || 'Free'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)' }}>
                          <span>Code: {s.school_code}</span>
                          {hasOverrides && <span style={{ color: '#c084fc', fontWeight: 600 }}>Active Locks</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Main Area: School Customizer */}
          <div className="card md:col-span-2" style={{ padding: '24px', minHeight: '300px' }}>
            {!selectedSchool ? (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', textAlign: 'center'
              }}>
                <Search size={36} color="var(--text-faint)" style={{ marginBottom: '12px' }} />
                <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '14px', fontWeight: 800 }}>No School Selected</h4>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '11px', maxWidth: '240px', lineHeight: 1.4 }}>
                  Select a school from the left panel to configure its specific overrides.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Selected school header */}
                <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>
                      {selectedSchool.name}
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span>Code: <strong>{selectedSchool.school_code}</strong></span>
                      <span>•</span>
                      <span>Tier: <strong style={{ textTransform: 'capitalize' }}>{selectedSchool.plan_type || 'free'}</strong></span>
                    </div>
                  </div>
                  
                  {/* Action override buttons */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleResetToDefaults}
                      className="btn btn-secondary inline-flex items-center gap-1.5"
                      style={{ padding: '6px 12px', fontSize: '11px', height: '32px' }}
                      title="Reset toggles to match global defaults"
                    >
                      Reset Defaults
                    </button>
                    <button
                      onClick={handleSaveSchoolOverride}
                      disabled={savingSchoolOverride}
                      style={{
                        background: '#6366f1',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        height: '32px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Save size={12} /> {savingSchoolOverride ? 'Saving...' : 'Save Override'}
                    </button>
                  </div>
                </div>

                {/* Tier warning if not free */}
                {selectedSchool.plan_type !== 'free' && selectedSchool.subscription_tier !== 'Free' && (
                  <div style={{
                    display: 'flex', gap: '8px', padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
                    fontSize: '11px', color: '#b45309', alignItems: 'center'
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    This school is on the <strong>{selectedSchool.plan_type || selectedSchool.subscription_tier}</strong> plan. Locks only enforce behavior for schools on the <strong>Free</strong> plan.
                  </div>
                )}

                {/* Student Email Services Activation Toggle */}
                <div style={{
                  padding: '16px 20px',
                  borderRadius: '14px',
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  marginBottom: '16px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 850, fontSize: '13px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📨 Student Recovery Emails
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                      Allow students of this school to request password recovery links via email (Normally blocked to save Brevo SMTP quota).
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStudentEmailsEnabled(prev => !prev)}
                    style={{
                      width: '46px', height: '24px', borderRadius: '999px', flexShrink: 0,
                      background: studentEmailsEnabled ? '#10b981' : '#334155',
                      border: 'none',
                      position: 'relative', cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      display: 'flex', alignItems: 'center',
                      padding: '0 3px',
                    }}
                  >
                    <span style={{
                      width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      transform: studentEmailsEnabled ? 'translateX(22px)' : 'translateX(0)',
                      transition: 'transform 0.25s ease',
                      display: 'block',
                    }} />
                  </button>
                </div>

                {/* Overrides checklist */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  {ALL_MODULES.map(mod => {
                    const isLocked = schoolLockedList.includes(mod.id);
                    return (
                      <div
                        key={mod.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 16px',
                          borderRadius: '10px',
                          background: 'var(--card-bg)',
                          border: '1px solid var(--card-border)',
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>{mod.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--text-main)' }}>{mod.label}</span>
                          <p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.desc}</p>
                        </div>
                        
                        {/* Status */}
                        <div style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: isLocked ? '#ef4444' : '#10b981',
                          marginRight: '8px',
                        }}>
                          {isLocked ? 'Locked' : 'Unlocked'}
                        </div>

                        {/* Toggle button */}
                        <button
                          onClick={() => handleSchoolToggle(mod.id)}
                          style={{
                            width: '40px', height: '22px', borderRadius: '999px', flexShrink: 0,
                            background: !isLocked ? '#10b981' : '#334155',
                            border: 'none',
                            position: 'relative', cursor: 'pointer',
                            transition: 'all 0.25s ease',
                            display: 'flex', alignItems: 'center',
                            padding: '0 2px',
                          }}
                        >
                          <span style={{
                            width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            transform: !isLocked ? 'translateX(20px)' : 'translateX(0)',
                            transition: 'transform 0.25s ease',
                            display: 'block',
                          }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
