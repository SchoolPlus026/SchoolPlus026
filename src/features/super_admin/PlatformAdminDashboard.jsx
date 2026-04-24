import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Building, Settings as SettingsIcon, Megaphone, Users, Save, Send, Image as ImageIcon, HelpCircle, Activity, Shield } from 'lucide-react';

import { useNavigate } from 'react-router-dom';

export default function PlatformAdminDashboard() {
  const { user, setImpersonation } = useAppStore();
  const navigate = useNavigate();
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

  // Support Tickets State
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Analytics State
  const [analytics, setAnalytics] = useState(null);
  
  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    fetchSchools();
    fetchPlatformSettings();
    fetchAnnouncements();
    fetchTickets();
    fetchAnalytics();
    fetchAuditLogs();
  }, []);

  const fetchAnalytics = async () => {
    const { data, error } = await supabase.rpc('get_platform_analytics');
    if (!error && data) setAnalytics(data);
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`*, users(email), school_settings(name)`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setAuditLogs(data);
    setLoadingAudit(false);
  };

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

  const fetchTickets = async () => {
    setLoadingTickets(true);
    const { data, error } = await supabase.from('support_tickets').select(`*, school_settings(name)`).order('created_at', { ascending: false });
    if (!error && data) setTickets(data);
    setLoadingTickets(false);
  };

  const handleUpdateTier = async (schoolId, newTier) => {
    const { error } = await supabase.from('school_settings').update({ subscription_tier: newTier }).eq('school_id', schoolId);
    if (error) {
      alert('Error updating tier: ' + error.message);
    } else {
      fetchSchools();
    }
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
        <div className={`tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</div>
        <div className={`tab ${activeTab === 'schools' ? 'active' : ''}`} onClick={() => setActiveTab('schools')}>Tenant Schools</div>
        <div className={`tab ${activeTab === 'broadcast' ? 'active' : ''}`} onClick={() => setActiveTab('broadcast')}>Broadcast Center</div>
        <div className={`tab ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveTab('tickets')}>Support Tickets</div>
        <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit Logs</div>
        <div className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Platform Settings</div>
      </div>

      {/* ── SECTION 0: ANALYTICS ── */}
      {activeTab === 'analytics' && (
        <div className="card fade-in">
          <div className="settings-header">
            <div className="icon-box"><Activity size={20} /></div>
            <div className="text-content">
              <h4>Platform Analytics</h4>
              <p>Real-time overview of your SaaS growth</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="p-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex flex-col items-center justify-center text-center hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-shadow">
              <div className="text-3xl font-black text-indigo-400 mb-1">{analytics?.total_schools || 0}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-indigo-300">Total Schools</div>
            </div>
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center justify-center text-center hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-shadow">
              <div className="text-3xl font-black text-emerald-400 mb-1">{analytics?.premium_schools || 0}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Premium Schools</div>
            </div>
            <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex flex-col items-center justify-center text-center hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-shadow">
              <div className="text-3xl font-black text-blue-400 mb-1">{analytics?.total_students || 0}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-blue-300">Total Students</div>
            </div>
            <div className="p-6 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex flex-col items-center justify-center text-center hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-shadow">
              <div className="text-3xl font-black text-purple-400 mb-1">{analytics?.total_teachers || 0}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-300">Total Teachers</div>
            </div>
          </div>
        </div>
      )}

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
                        <select 
                          value={s.subscription_tier || 'Free'} 
                          onChange={(e) => handleUpdateTier(s.school_id, e.target.value)}
                          className={`sp-input text-xs py-1 px-2 h-auto ${s.subscription_tier === 'Premium' ? 'text-green-400 border-green-500/30' : 'text-slate-400 border-slate-500/30'}`}
                          style={{ width: '100px' }}
                        >
                          <option value="Free">Free</option>
                          <option value="Premium">Premium</option>
                        </select>
                      </td>
                      <td>
                        <span className="text-success text-xs font-bold uppercase">Active</span>
                      </td>
                      <td>
                        <button 
                          className="btn outline" 
                          style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }} 
                          onClick={() => {
                            setImpersonation(s);
                            navigate('/admin/dashboard');
                          }}
                        >
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

      {/* ── SECTION 3: SUPPORT TICKETS ── */}
      {activeTab === 'tickets' && (
        <div className="card fade-in">
          <div className="settings-header">
            <div className="icon-box"><HelpCircle size={20} /></div>
            <div className="text-content">
              <h4>Support Tickets</h4>
              <p>Manage support requests from school admins.</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {loadingTickets ? (
              <div className="text-center py-6 text-muted">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-6 text-muted">No support tickets found.</div>
            ) : (
              tickets.map(t => (
                <div key={t.id} className="border border-slate-700/50 rounded-xl p-4 bg-slate-800/30">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-bold">{t.subject}</h5>
                      <div className="text-xs text-slate-400 mt-1">{t.school_settings?.name || 'Unknown School'} • {new Date(t.created_at).toLocaleDateString()}</div>
                    </div>
                    <span className={`badge ${t.status === 'Resolved' ? 'badge-success' : 'badge-warn'}`}>{t.status}</span>
                  </div>
                  <div className="text-sm text-slate-300 mt-3 whitespace-pre-wrap">{t.message}</div>
                  
                  {t.status !== 'Resolved' && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <button 
                        className="btn accent" style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}
                        onClick={async () => {
                          const response = window.prompt('Enter your response to resolve this ticket:');
                          if (response) {
                            const { error } = await supabase.from('support_tickets').update({ status: 'Resolved', response }).eq('id', t.id);
                            if (error) alert(error.message);
                            else fetchTickets();
                          }
                        }}
                      >
                        Mark as Resolved
                      </button>
                    </div>
                  )}
                  {t.response && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <h6 className="text-xs font-bold text-slate-400 mb-1">Your Response:</h6>
                      <div className="text-sm text-green-400 whitespace-pre-wrap">{t.response}</div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── SECTION 4: AUDIT LOGS ── */}
      {activeTab === 'audit' && (
        <div className="card fade-in">
          <div className="settings-header flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="icon-box"><Shield size={20} /></div>
              <div className="text-content">
                <h4>Global Audit Ledger</h4>
                <p>Track critical security events across all tenants.</p>
              </div>
            </div>
            <button className="btn outline" onClick={fetchAuditLogs}>Refresh</button>
          </div>

          <div className="table-responsive mt-6 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="legacy-table">
              <thead>
                <tr className="bg-slate-800/50">
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Performed By</th>
                  <th>Tenant School</th>
                </tr>
              </thead>
              <tbody>
                {loadingAudit ? (
                  <tr><td colSpan="4" className="text-center py-6 text-muted">Loading ledger...</td></tr>
                ) : auditLogs.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-6 text-muted">No security events recorded.</td></tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id}>
                      <td className="text-xs font-mono text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                      <td>
                        <span className="badge badge-warn font-mono text-[10px]">{log.action_type}</span>
                      </td>
                      <td className="text-xs">{log.users?.email || 'Unknown User'}</td>
                      <td className="text-xs font-semibold">{log.school_settings?.name || 'Platform'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 5: PLATFORM SETTINGS ── */}
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
