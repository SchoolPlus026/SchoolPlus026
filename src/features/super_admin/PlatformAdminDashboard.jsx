import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Building, Settings as SettingsIcon, Megaphone, Users, Save, Send, Image as ImageIcon } from 'lucide-react';

export default function PlatformAdminDashboard() {
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState('schools');
  
  // Schools State
  const [schools, setSchools] = useState([]);
  const [loadingSchools, setLoadingSchools] = useState(true);

  // Platform Settings State
  const [platformName, setPlatformName] = useState('');
  const [platformLogo, setPlatformLogo] = useState('');
  const [termsConditions, setTermsConditions] = useState('');
  const [aboutApp, setAboutApp] = useState('');
  const [savingPlatform, setSavingPlatform] = useState(false);

  // Broadcast State
  const [bMessage, setBMessage] = useState('');
  const [bTargetRole, setBTargetRole] = useState('all');
  const [bStyle, setBStyle] = useState('info');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);

  useEffect(() => {
    fetchSchools();
    fetchPlatformSettings();
    fetchAnnouncements();
  }, []);

  const fetchSchools = async () => {
    setLoadingSchools(true);
    // Fetch schools and their admins
    const { data: schoolData, error } = await supabase.from('school_settings').select('*').order('created_at', { ascending: false });
    
    if (!error && schoolData) {
      // In a real app we'd join users where role='admin' to get the email, but for now we'll just mock the email or show N/A
      setSchools(schoolData);
    }
    setLoadingSchools(false);
  };

  const fetchPlatformSettings = async () => {
    const { data } = await supabase.from('platform_settings').select('*').single();
    if (data) {
      setPlatformName(data.app_name || '');
      setPlatformLogo(data.logo_url || '');
      setTermsConditions(data.terms_conditions || '');
      setAboutApp(data.about_app || '');
    }
  };

  const fetchAnnouncements = async () => {
    setLoadingBroadcasts(true);
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (!error && data) setBroadcasts(data);
    setLoadingBroadcasts(false);
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    else fetchAnnouncements();
  };

  const handleSavePlatform = async () => {
    setSavingPlatform(true);
    const { error } = await supabase.from('platform_settings').update({ 
      app_name: platformName,
      logo_url: platformLogo,
      terms_conditions: termsConditions,
      about_app: aboutApp
    }).neq('id', '00000000-0000-0000-0000-000000000000'); // Update all (there's only 1 row)
    
    setSavingPlatform(false);
    if (error) alert('Error saving: ' + error.message);
    else alert('Platform settings saved successfully. Refresh to see changes on login screen.');
  };

  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    if (!bMessage.trim()) return alert('Message cannot be empty');
    setSendingBroadcast(true);
    
    const { error } = await supabase.from('announcements').insert([{
      message: bMessage.trim(),
      target_role: bTargetRole,
      target_schools: 'all',
      type_style: bStyle
    }]);

    if (error) {
      alert('Error: ' + error.message);
    } else {
      alert('Broadcast sent successfully!');
      setBMessage('');
      fetchAnnouncements();
    }
    setSendingBroadcast(false);
  };

  return (
    <div className="space-y-6 fade-in pb-12">
      <div className="section-title mb-6 flex justify-between items-center">
        <h3 className="text-xl">Platform Dashboard</h3>
        <div className="badge badge-success px-3 py-1">v2.0 Active</div>
      </div>
      
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="icon-box"><Building size={20} /></div>
          <div>
            <div className="text-2xl font-bold">{schools.length}</div>
            <div className="text-xs text-muted uppercase tracking-wider">Active Schools</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="icon-box"><Users size={20} /></div>
          <div>
            <div className="text-2xl font-bold">Live</div>
            <div className="text-xs text-muted uppercase tracking-wider">Platform Status</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="icon-box"><Megaphone size={20} /></div>
          <div>
            <div className="text-2xl font-bold">Active</div>
            <div className="text-xs text-muted uppercase tracking-wider">Broadcast System</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab ${activeTab === 'schools' ? 'active' : ''}`} onClick={() => setActiveTab('schools')}>Tenant Schools</div>
        <div className={`tab ${activeTab === 'broadcast' ? 'active' : ''}`} onClick={() => setActiveTab('broadcast')}>Broadcast Center</div>
        <div className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Platform Settings</div>
      </div>

      {/* ── SECTION 1: TENANT SCHOOLS ── */}
      {activeTab === 'schools' && (
        <div className="card fade-in">
          <div className="settings-header">
            <div className="icon-box"><Building size={20} /></div>
            <div className="text-content">
              <h4>Registered Schools</h4>
              <p>Manage all tenants on the platform</p>
            </div>
          </div>
          
          <div className="table-responsive mt-4 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="legacy-table">
              <thead>
                <tr className="bg-slate-800/50">
                  <th>School Code</th>
                  <th>Name</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingSchools ? (
                  <tr><td colSpan="5" className="text-center py-6 text-muted">Loading schools...</td></tr>
                ) : schools.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-6 text-muted">No schools registered yet.</td></tr>
                ) : (
                  schools.map(s => (
                    <tr key={s.school_id}>
                      <td className="font-mono text-xs">{s.school_code}</td>
                      <td className="font-semibold">{s.name}</td>
                      <td>
                        <span className={`badge ${s.subscription_status === 'Premium' ? 'badge-success' : 'badge-warn'}`}>
                          {s.subscription_status || 'Trial'}
                        </span>
                      </td>
                      <td>
                        <span className="text-success text-xs font-bold uppercase">Active</span>
                      </td>
                      <td>
                        <button className="btn outline" style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }} onClick={() => alert('Impersonation logic will be wired here!')}>
                          Impersonate
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 2: BROADCAST CENTER ── */}
      {activeTab === 'broadcast' && (
        <div className="card fade-in">
          <div className="settings-header">
            <div className="icon-box"><Megaphone size={20} /></div>
            <div className="text-content">
              <h4>Global Broadcast</h4>
              <p>Send an announcement banner to all users across the platform.</p>
            </div>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4 mt-6">
            <div>
              <label className="muted small block mb-2 font-semibold">Message</label>
              <textarea 
                required
                rows={3}
                className="sp-input"
                placeholder="e.g. Scheduled maintenance this Sunday at 2 AM UTC."
                value={bMessage}
                onChange={e => setBMessage(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="muted small block mb-2 font-semibold">Target Role</label>
                <select className="sp-input" value={bTargetRole} onChange={e => setBTargetRole(e.target.value)}>
                  <option value="all">All Users (Admin, Teacher, Student)</option>
                  <option value="admin">Admins Only</option>
                  <option value="teacher">Teachers Only</option>
                  <option value="student">Students Only</option>
                </select>
              </div>
              <div>
                <label className="muted small block mb-2 font-semibold">Notification Style</label>
                <select className="sp-input" value={bStyle} onChange={e => setBStyle(e.target.value)}>
                  <option value="info">Info (Blue)</option>
                  <option value="success">Success (Green)</option>
                  <option value="warning">Critical / Alert (Red)</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={sendingBroadcast} className="btn accent w-full mt-4">
              <Send size={16} /> {sendingBroadcast ? 'Sending...' : 'Send Broadcast'}
            </button>
          </form>

          {/* Broadcast History */}
          <div className="mt-10 pt-8 border-t border-slate-700/50">
            <h5 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Broadcast History</h5>
            <div className="table-responsive border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="legacy-table">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th>Date</th>
                    <th>Message</th>
                    <th>Role</th>
                    <th>Style</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBroadcasts ? (
                    <tr><td colSpan="5" className="text-center py-4 text-muted">Loading history...</td></tr>
                  ) : broadcasts.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-4 text-muted">No past broadcasts.</td></tr>
                  ) : (
                    broadcasts.map(b => (
                      <tr key={b.id}>
                        <td className="text-[10px] text-slate-500">{new Date(b.created_at).toLocaleDateString()}</td>
                        <td className="text-xs max-w-xs truncate">{b.message}</td>
                        <td><span className="badge">{b.target_role}</span></td>
                        <td>
                          <span className={`badge ${b.type_style === 'warning' ? 'badge-danger' : b.type_style === 'success' ? 'badge-success' : 'badge-info'}`}>
                            {b.type_style}
                          </span>
                        </td>
                        <td>
                          <button className="text-red-400 hover:text-red-300 transition-colors" onClick={() => deleteAnnouncement(b.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 3: PLATFORM SETTINGS ── */}
      {activeTab === 'settings' && (
        <div className="card fade-in">
          <div className="settings-header">
            <div className="icon-box"><SettingsIcon size={20} /></div>
            <div className="text-content">
              <h4>Platform Branding</h4>
              <p>Update the global app name and logo shown on the login screen.</p>
            </div>
          </div>

          <div className="space-y-4 mt-6">
            <div>
              <label className="muted small block mb-2 font-semibold">Platform Name</label>
              <input 
                type="text" 
                className="sp-input" 
                value={platformName} 
                onChange={e => setPlatformName(e.target.value)} 
                placeholder="e.g. SchoolOS+"
              />
            </div>

            <div>
              <label className="muted small block mb-2 font-semibold">Terms & Conditions</label>
              <textarea 
                rows={4}
                className="sp-input"
                placeholder="Platform usage terms..."
                value={termsConditions}
                onChange={e => setTermsConditions(e.target.value)}
              />
            </div>

            <div>
              <label className="muted small block mb-2 font-semibold">About This App</label>
              <textarea 
                rows={4}
                className="sp-input"
                placeholder="Description shown on login/about page..."
                value={aboutApp}
                onChange={e => setAboutApp(e.target.value)}
              />
            </div>

            <button onClick={handleSavePlatform} disabled={savingPlatform} className="btn accent w-full mt-4">
              <Save size={16} /> {savingPlatform ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
