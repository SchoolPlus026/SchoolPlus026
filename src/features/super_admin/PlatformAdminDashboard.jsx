import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Building, Settings as SettingsIcon, Megaphone, Users, Save, Send, Image as ImageIcon, HelpCircle, Activity, Shield, CreditCard, CheckCircle, X, ExternalLink, Crown, Plus, AlertTriangle, Trash2, HardDrive, Loader2 } from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import PlatformKnowledgeBaseManager from '../knowledge-base/PlatformKnowledgeBaseManager';
import RegistrationsInbox from './RegistrationsInbox';

export default function PlatformAdminDashboard() {
  const { user, setImpersonation } = useAppStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('schools');

  // Schools State
  const [schools, setSchools] = useState([]);
  const [loadingSchools, setLoadingSchools] = useState(true);

  // Add School State
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newSchoolTier, setNewSchoolTier] = useState('Free');
  const [newPlanType, setNewPlanType] = useState('free');
  const [newBillingCycle, setNewBillingCycle] = useState('monthly');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [addingSchool, setAddingSchool] = useState(false);
  const [addSchoolError, setAddSchoolError] = useState('');

  // Edit School State
  const [editingSchool, setEditingSchool] = useState(null); // school object
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editPlanType, setEditPlanType] = useState('free');
  const [editBillingCycle, setEditBillingCycle] = useState('monthly');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete School State
  const [deletingSchool, setDeletingSchool] = useState(null); // school object
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Platform Settings State
  const [platformName, setPlatformName] = useState('');
  const [platformLogo, setPlatformLogo] = useState('');
  const [termsConditions, setTermsConditions] = useState('');
  const [aboutApp, setAboutApp] = useState('');
  const [refundPolicy, setRefundPolicy] = useState('');
  const [privacyPolicy, setPrivacyPolicy] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [paGdriveConfig, setPaGdriveConfig] = useState([]);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

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

  // Broadcast scheduling & edit state
  const [bStartDate, setBStartDate] = useState('');
  const [bExpiryDate, setBExpiryDate] = useState('');
  const [editingBroadcast, setEditingBroadcast] = useState(null);
  const [editBMessage, setEditBMessage] = useState('');
  const [editBExpiryDate, setEditBExpiryDate] = useState('');

  // Ticket inline reply state
  const [replyingTo, setReplyingTo] = useState(null); // ticket id
  const [replyText, setReplyText] = useState('');

  // Plans State
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanAmount, setNewPlanAmount] = useState('');
  const [newPlanValidity, setNewPlanValidity] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanAmount, setEditPlanAmount] = useState('');
  const [editPlanValidity, setEditPlanValidity] = useState('');
  const [editPlanActive, setEditPlanActive] = useState(true);

  // Transactions State
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Registrations State — pending count for badge
  const [pendingRegCount, setPendingRegCount] = useState(0);

  useEffect(() => {
    fetchSchools();
    fetchPlatformSettings();
    fetchAnnouncements();
    fetchTickets();
    fetchAnalytics();
    fetchAuditLogs();
    fetchPlans();
    fetchAllTransactions();
    fetchPendingRegCount();
  }, []);

  const fetchPendingRegCount = async () => {
    const { count } = await supabase
      .from('school_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (count !== null) setPendingRegCount(count);
  };

  const fetchPlans = async () => {
    setLoadingPlans(true);
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('amount_paise', { ascending: true });
    if (!error && data) setPlans(data);
    setLoadingPlans(false);
  };

  const fetchAllTransactions = async () => {
    setLoadingTx(true);
    const { data, error } = await supabase
      .from('subscription_transactions')
      .select('*, subscription_plans(name)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Error fetching transactions:", error);
    }
    if (!error && data) {
      setTransactions(data);
      const revenue = data.filter(t => t.status === 'SUCCESSFUL').reduce((sum, t) => sum + t.amount_paise, 0);
      setTotalRevenue(revenue);
    }
    setLoadingTx(false);
  };

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

  const handleUpdateBroadcast = async (e) => {
    e.preventDefault();
    if (!editingBroadcast) return;
    const { error } = await supabase
      .from('announcements')
      .update({
        message: editBMessage.trim(),
        expiry_date: editBExpiryDate ? new Date(editBExpiryDate).toISOString() : null,
      })
      .eq('id', editingBroadcast.id);
    if (error) { alert('Error updating broadcast: ' + error.message); return; }
    setEditingBroadcast(null);
    fetchAnnouncements();
  };

  const handleResolveTicket = async (ticketId) => {
    if (!replyText.trim()) { alert('Please enter a reply message.'); return; }
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: 'Resolved', response: replyText.trim(), manager_reply: replyText.trim(), updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    if (error) { alert('Error: ' + error.message); return; }
    setReplyingTo(null);
    setReplyText('');
    fetchTickets();
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

  const handleAddSchool = async (e) => {
    e.preventDefault();
    if (!newSchoolName.trim() || !newSchoolCode.trim()) return;
    if (!newAdminEmail.trim() || !newAdminPassword || !newAdminUsername.trim()) return;
    setAddingSchool(true);
    setAddSchoolError('');

    try {
      const { data, error } = await supabase.functions.invoke('platform-create-school', {
        body: {
          school_name: newSchoolName.trim(),
          school_code: newSchoolCode.trim().toUpperCase(),
          subscription_tier: newSchoolTier,
          plan_type: newPlanType,
          billing_cycle: (newPlanType === 'premium') ? newBillingCycle : null,
          admin_name: newAdminName.trim(),
          admin_username: newAdminUsername.trim(),
          admin_email: newAdminEmail.trim(),
          admin_password: newAdminPassword,
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      alert(`âœ… ${data.message}`);
      setShowAddSchool(false);
      setNewSchoolName(''); setNewSchoolCode(''); setNewSchoolTier('Free');
      setNewPlanType('free'); setNewBillingCycle('monthly');
      setNewAdminName(''); setNewAdminUsername(''); setNewAdminEmail(''); setNewAdminPassword('');
      setAddSchoolError('');
      fetchSchools();
    } catch (err) {
      setAddSchoolError(err.message);
    } finally {
      setAddingSchool(false);
    }
  };

  const handleEditSchool = async (e) => {
    e.preventDefault();
    if (!editingSchool) return;
    setSavingEdit(true);
    try {
      const now = new Date();
      const updateData = {
        name: editName.trim(),
        school_code: editCode.trim().toUpperCase(),
        plan_type: editPlanType,
        billing_cycle: editPlanType === 'premium' ? editBillingCycle : null,
        subscription_tier: editPlanType === 'premium' ? 'Premium' : editPlanType === 'trial' ? 'Trial' : 'Free',
      };
      if (editPlanType === 'trial') {
        updateData.trial_start_date = now.toISOString();
      } else if (editPlanType === 'premium') {
        const days = editBillingCycle === 'yearly' ? 365 : 28;
        updateData.subscription_end_date = new Date(now.getTime() + days * 86400000).toISOString();
        updateData.trial_start_date = null;
      } else {
        updateData.trial_start_date = null;
        updateData.subscription_end_date = null;
      }
      const { error } = await supabase.from('school_settings').update(updateData).eq('school_id', editingSchool.school_id);
      if (error) throw new Error(error.message);
      setEditingSchool(null);
      fetchSchools();
    } catch (err) {
      alert('Error saving: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSchool = async (e) => {
    e.preventDefault();
    if (!deletingSchool || !deletePassword.trim()) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const { data, error } = await supabase.functions.invoke('platform-delete-school', {
        body: { school_id: deletingSchool.school_id, platform_admin_password: deletePassword },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      alert(`âœ… ${data.message}`);
      setDeletingSchool(null);
      setDeletePassword('');
      fetchSchools();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAddPlan = async (e) => {
    e.preventDefault();
    if (!newPlanName || !newPlanAmount || !newPlanValidity) return;
    setSavingPlan(true);
    try {
      const { error } = await supabase.from('subscription_plans').insert({
        name: newPlanName.trim(),
        amount_paise: Math.round(parseFloat(newPlanAmount) * 100),
        validity_days: parseInt(newPlanValidity, 10),
        is_active: true
      });
      if (error) throw error;
      setShowAddPlan(false);
      setNewPlanName('');
      setNewPlanAmount('');
      setNewPlanValidity('');
      fetchPlans();
    } catch (err) {
      alert('Error adding plan: ' + err.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleEditPlan = async (e) => {
    e.preventDefault();
    if (!editingPlan) return;
    setSavingPlan(true);
    try {
      const { error } = await supabase.from('subscription_plans').update({
        name: editPlanName.trim(),
        amount_paise: Math.round(parseFloat(editPlanAmount) * 100),
        validity_days: parseInt(editPlanValidity, 10),
        is_active: editPlanActive
      }).eq('id', editingPlan.id);
      if (error) throw error;
      setEditingPlan(null);
      fetchPlans();
    } catch (err) {
      alert('Error updating plan: ' + err.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const fetchPlatformSettings = async () => {
    const { data } = await supabase.from('platform_settings').select('*').single();
    if (data) {
      setPlatformName(data.app_name || '');
      setPlatformLogo(data.logo_url || '');
      setTermsConditions(data.terms_conditions || '');
      setAboutApp(data.about_app || '');
      setRefundPolicy(data.refund_policy || '');
      setPrivacyPolicy(data.privacy_policy || '');
      setSupportEmail(data.support_email || 'schoolpro026@gmail.com');
      const gd = Array.isArray(data.pa_gdrive_config) ? data.pa_gdrive_config : (data.pa_gdrive_config ? [data.pa_gdrive_config] : []);
      setPaGdriveConfig(gd);
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
      about_app: aboutApp,
      refund_policy: refundPolicy,
      privacy_policy: privacyPolicy,
      support_email: supportEmail
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
      type_style: bStyle,
      start_date: bStartDate ? new Date(bStartDate).toISOString() : new Date().toISOString(),
      expiry_date: bExpiryDate ? new Date(bExpiryDate).toISOString() : null,
    }]);

    if (error) {
      alert('Error: ' + error.message);
    } else {
      setBMessage('');
      setBStartDate('');
      setBExpiryDate('');
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
      <div className="tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        <div className={`tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</div>
        <div className={`tab ${activeTab === 'schools' ? 'active' : ''}`} onClick={() => setActiveTab('schools')}>Tenant Schools</div>
        <div className={`tab ${activeTab === 'plans' ? 'active' : ''}`} onClick={() => setActiveTab('plans')}>Subscription Plans</div>
        <div className={`tab ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>Transactions</div>
        <div className={`tab ${activeTab === 'broadcast' ? 'active' : ''}`} onClick={() => setActiveTab('broadcast')}>Broadcast Center</div>
        <div className={`tab ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveTab('tickets')}>Support Tickets</div>
        <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit Logs</div>
        <div className={`tab ${activeTab === 'registrations' ? 'active' : ''}`} onClick={() => { setActiveTab('registrations'); fetchPendingRegCount(); }} style={{ position: 'relative' }}>
          Registrations
          {pendingRegCount > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{pendingRegCount}</span>
          )}
        </div>
        <div className={`tab ${activeTab === 'kb' ? 'active' : ''}`} onClick={() => setActiveTab('kb')}>Knowledge Base</div>
        <div className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Platform Settings</div>
      </div>

      {/* ---- SECTION 0: ANALYTICS ---- */}
      {activeTab === 'analytics' && (
        <div className="card fade-in">
          <div className="settings-header">
            <div className="icon-box"><Activity size={20} /></div>
            <div className="text-content">
              <h4>Platform Analytics</h4>
              <p>Real-time overview of your SaaS growth</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center justify-center text-center hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-shadow">
              <div className="text-3xl font-black text-amber-400 mb-1">₹{(totalRevenue / 100).toFixed(0)}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Total Revenue</div>
            </div>
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

      {/* ── SECTION: SUBSCRIPTION PLANS ── */}
      {activeTab === 'plans' && (
        <div className="card fade-in">
          <div className="settings-header flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="icon-box"><CreditCard size={20} /></div>
              <div className="text-content">
                <h4>Subscription Plans</h4>
                <p>Manage dynamic SaaS pricing plans</p>
              </div>
            </div>
            <button className="btn accent" onClick={() => setShowAddPlan(true)}>
              <Plus size={16} /> Add Plan
            </button>
          </div>

          <div className="table-responsive overflow-x-auto mt-4 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="legacy-table">
              <thead>
                <tr className="bg-slate-800/50">
                  <th>Plan Name</th>
                  <th>Amount</th>
                  <th>Validity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingPlans ? (
                  <tr><td colSpan="5" className="text-center py-6 text-muted">Loading plans...</td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-6 text-muted">No subscription plans found.</td></tr>
                ) : (
                  plans.map(plan => (
                    <tr key={plan.id}>
                      <td className="font-semibold text-white">{plan.name}</td>
                      <td>₹{(plan.amount_paise / 100).toFixed(2)}</td>
                      <td>{plan.validity_days} Days</td>
                      <td>
                        <span className={`badge ${plan.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className="btn outline sm" onClick={() => {
                          setEditingPlan(plan);
                          setEditPlanName(plan.name);
                          setEditPlanAmount((plan.amount_paise / 100).toString());
                          setEditPlanValidity(plan.validity_days.toString());
                          setEditPlanActive(plan.is_active);
                        }}>
                          Edit
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

      {/* ── SECTION: TRANSACTIONS ── */}
      {activeTab === 'transactions' && (
        <div className="card fade-in">
          <div className="settings-header flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="icon-box"><CreditCard size={20} /></div>
              <div className="text-content">
                <h4>Global Transactions</h4>
                <p>Track all payments across tenant schools.</p>
              </div>
            </div>
          </div>
          <div className="table-responsive overflow-x-auto mt-6 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="legacy-table">
              <thead>
                <tr className="bg-slate-800/50">
                  <th>Date</th>
                  <th>School</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Order ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingTx ? (
                  <tr><td colSpan="6" className="text-center py-6 text-muted">Loading transactions...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-6 text-muted">No transactions found.</td></tr>
                ) : (
                  transactions.map(tx => (
                    <tr key={tx.id}>
                      <td className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleString()}</td>
                      <td className="font-semibold text-white">
                        {schools.find(s => s.school_id === tx.school_id)?.name || tx.school_id}
                      </td>
                      <td className="text-xs text-slate-300">{tx.subscription_plans?.name || 'Unknown'}</td>
                      <td>₹{(tx.amount_paise / 100).toFixed(2)}</td>
                      <td className="text-xs font-mono text-slate-500">{tx.razorpay_order_id}</td>
                      <td>
                        <span className={`badge ${tx.status === 'SUCCESSFUL' ? 'badge-success' : tx.status === 'FAILED' ? 'badge-danger' : 'badge-warn'}`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 1: TENANT SCHOOLS ── */}
      {activeTab === 'schools' && (
        <div className="card fade-in">
          <div className="settings-header flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="icon-box"><Building size={20} /></div>
              <div className="text-content">
                <h4>Registered Schools</h4>
                <p>Manage all tenants on the platform</p>
              </div>
            </div>
            <button className="btn accent" onClick={() => setShowAddSchool(true)}>
              <Plus size={16} /> Add School
            </button>
          </div>

          <div className="table-responsive overflow-x-auto mt-4 border border-slate-700/50 rounded-xl overflow-hidden">
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
                        <span className={`badge ${s.plan_type === 'premium' ? 'badge-success' : s.plan_type === 'trial' ? 'badge-warn' : ''}`}>
                          {s.plan_type === 'premium' ? 'Premium' : s.plan_type === 'trial' ? 'Trial' : 'Free'}
                          {s.billing_cycle ? ` (${s.billing_cycle})` : ''}
                        </span>
                      </td>
                      <td>
                        <span className="text-success text-xs font-bold uppercase">Active</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="btn outline"
                            style={{ padding: '4px 10px', fontSize: '11px', width: 'auto' }}
                            onClick={() => {
                              setEditingSchool(s);
                              setEditName(s.name);
                              setEditCode(s.school_code);
                              setEditPlanType(s.plan_type || 'free');
                              setEditBillingCycle(s.billing_cycle || 'monthly');
                            }}
                          >Edit</button>
                          <button
                            className="btn outline"
                            style={{ padding: '4px 10px', fontSize: '11px', width: 'auto' }}
                            onClick={() => {
                              setImpersonation(s);
                              navigate('/admin/dashboard');
                            }}
                          >Impersonate</button>
                          <button
                            className="btn outline"
                            style={{ padding: '4px 10px', fontSize: '11px', width: 'auto', color: '#f87171', borderColor: '#f87171' }}
                            onClick={() => { setDeletingSchool(s); setDeletePassword(''); setDeleteError(''); }}
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- SECTION 2: BROADCAST CENTER ---- */}
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
                <label className="muted small block mb-2 font-semibold">Style</label>
                <select className="sp-input" value={bStyle} onChange={e => setBStyle(e.target.value)}>
                  <option value="info">Info (Blue)</option>
                  <option value="success">Success (Green)</option>
                  <option value="warning">Critical / Alert (Red)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="muted small block mb-2 font-semibold">Start Date <span style={{color:'var(--text-faint)'}}>(optional, default: now)</span></label>
                <input type="datetime-local" className="sp-input" value={bStartDate} onChange={e => setBStartDate(e.target.value)} />
              </div>
              <div>
                <label className="muted small block mb-2 font-semibold">Expiry Date <span style={{color:'var(--text-faint)'}}>(optional, leave blank = permanent)</span></label>
                <input type="datetime-local" className="sp-input" value={bExpiryDate} onChange={e => setBExpiryDate(e.target.value)} />
              </div>
            </div>

            <button type="submit" disabled={sendingBroadcast} className="btn accent w-full mt-2">
              <Send size={16} /> {sendingBroadcast ? 'Sending...' : 'Send Broadcast'}
            </button>
          </form>

          {/* Broadcast History */}
          <div className="mt-10 pt-8 border-t border-slate-700/50">
            <h5 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Broadcast History</h5>
            <div className="table-responsive overflow-x-auto border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="legacy-table">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th>Date</th>
                    <th>Message</th>
                    <th>Role</th>
                    <th>Style</th>
                    <th>Expiry</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBroadcasts ? (
                    <tr><td colSpan="7" className="text-center py-4 text-muted">Loading history...</td></tr>
                  ) : broadcasts.length === 0 ? (
                    <tr><td colSpan="7" className="text-center py-4 text-muted">No past broadcasts.</td></tr>
                  ) : (
                    broadcasts.map(b => {
                      const isExpired = b.expiry_date && new Date(b.expiry_date) < new Date();
                      return (
                        <tr key={b.id} style={{ opacity: isExpired ? 0.55 : 1 }}>
                          <td className="text-[10px] text-slate-500">{new Date(b.created_at).toLocaleDateString()}</td>
                          <td className="text-xs max-w-xs truncate">{b.message}</td>
                          <td><span className="badge">{b.target_role}</span></td>
                          <td>
                            <span className={`badge ${b.type_style === 'warning' ? 'badge-danger' : b.type_style === 'success' ? 'badge-success' : 'badge-info'}`}>
                              {b.type_style}
                            </span>
                          </td>
                          <td className="text-[10px] text-slate-500">
                            {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : <span className="text-emerald-500 font-bold">Permanent</span>}
                          </td>
                          <td>
                            <span className={`badge ${isExpired ? 'badge-danger' : 'badge-success'}`}>
                              {isExpired ? 'Expired' : 'Active'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <button
                                className="text-indigo-400 hover:text-indigo-300 transition-colors text-xs font-semibold"
                                onClick={() => { setEditingBroadcast(b); setEditBMessage(b.message); setEditBExpiryDate(b.expiry_date ? new Date(b.expiry_date).toISOString().slice(0,16) : ''); }}
                              >Edit</button>
                              <button className="text-red-400 hover:text-red-300 transition-colors text-xs font-semibold" onClick={() => deleteAnnouncement(b.id)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---- SECTION 3: SUPPORT TICKETS ---- */}
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
                      {replyingTo === t.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="sp-input"
                            rows={3}
                            placeholder="Type your resolution message..."
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="btn outline" style={{ flex: 1, padding: '6px 12px', fontSize: '12px', width: 'auto' }} onClick={() => { setReplyingTo(null); setReplyText(''); }}>Cancel</button>
                            <button type="button" className="btn accent" style={{ flex: 2, padding: '6px 12px', fontSize: '12px', width: 'auto' }} onClick={() => handleResolveTicket(t.id)}>
                              <CheckCircle size={14} /> Mark as Resolved
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn accent" style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}
                          onClick={() => { setReplyingTo(t.id); setReplyText(''); }}
                        >
                          Reply &amp; Resolve
                        </button>
                      )}
                    </div>
                  )}
                  {(t.response || t.manager_reply) && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <h6 className="text-xs font-bold text-slate-400 mb-1">Your Response:</h6>
                      <div className="text-sm text-green-400 whitespace-pre-wrap">{t.response || t.manager_reply}</div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---- SECTION 4: AUDIT LOGS ---- */}
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

          <div className="table-responsive overflow-x-auto mt-6 border border-slate-700/50 rounded-xl overflow-hidden">
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

      {/* ── SECTION: REGISTRATIONS ── */}
      {activeTab === 'registrations' && <RegistrationsInbox />}

      {/* ── SECTION: KNOWLEDGE BASE ── */}
      {activeTab === 'kb' && <PlatformKnowledgeBaseManager />}

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

            <div>
              <label className="muted small block mb-2 font-semibold">Refund Policy</label>
              <textarea
                rows={4}
                className="sp-input"
                placeholder="Platform refund policy..."
                value={refundPolicy}
                onChange={e => setRefundPolicy(e.target.value)}
              />
            </div>

            <div>
              <label className="muted small block mb-2 font-semibold">Privacy Policy</label>
              <textarea
                rows={4}
                className="sp-input"
                placeholder="Platform privacy policy..."
                value={privacyPolicy}
                onChange={e => setPrivacyPolicy(e.target.value)}
              />
            </div>

            <div>
              <label className="muted small block mb-2 font-semibold">Support Email</label>
              <input
                type="email"
                className="sp-input"
                placeholder="e.g. support@schoolos.com"
                value={supportEmail}
                onChange={e => setSupportEmail(e.target.value)}
              />
            </div>

            <button onClick={handleSavePlatform} disabled={savingPlatform} className="btn accent w-full mt-4">
              <Save size={16} /> {savingPlatform ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* ---- PLATFORM GDRIVE ---- */}
          <div className="mt-6" style={{ borderTop: '1px solid var(--card-border)', paddingTop: 24 }}>
            <div className="settings-header">
              <div className="icon-box"><HardDrive size={20} /></div>
              <div className="text-content">
                <h4>Platform Google Drive</h4>
                <p>Connect P.A. Google Drive for Knowledge Base video uploads.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {paGdriveConfig.map((drive, idx) => (
                <div key={drive.id || idx} className="p-4 border border-green-500/30 bg-green-500/10 rounded-xl flex items-center gap-3">
                  <div className="flex-1 text-sm">
                    <div className="font-bold text-green-400">✓ Drive Connected</div>
                    <div className="text-slate-400 text-xs mt-0.5">{drive.email || `Folder: ${drive.folder_id}`}</div>
                  </div>
                  <button className="btn outline" style={{ padding: '6px 12px', fontSize: 12 }}
                    disabled={disconnectingDrive}
                    onClick={async () => {
                      if (!window.confirm('Disconnect this Drive?')) return;
                      setDisconnectingDrive(true);
                      const updated = [...paGdriveConfig];
                      updated.splice(idx, 1);
                      await supabase.from('platform_settings').update({ pa_gdrive_config: updated }).eq('id', 1);
                      setPaGdriveConfig(updated);
                      setDisconnectingDrive(false);
                    }}>
                    {disconnectingDrive ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              ))}
              <button
                className="btn accent w-full"
                disabled={connectingDrive}
                onClick={async () => {
                  setConnectingDrive(true);
                  const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gdrive-auth`;
                  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                  const state = JSON.stringify({ school_id: 'platform_admin', drive_index: paGdriveConfig.length });
                  const scope = 'https://www.googleapis.com/auth/drive.file';
                  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
                  window.open(authUrl, '_blank');
                  setConnectingDrive(false);
                }}>
                {connectingDrive ? <><Loader2 size={16} className="animate-spin" /> Connecting...</> : <><Plus size={16} /> {paGdriveConfig.length > 0 ? 'Add Another Drive' : 'Connect Platform Google Drive'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* —— ADD SCHOOL MODAL —— */}
      {showAddSchool && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', padding: '16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', margin: 'auto' }}>
            <h3 style={{ marginBottom: '4px' }}>Add New School</h3>
            <p className="muted small" style={{ marginBottom: '20px' }}>Creates the school workspace AND the first admin user in one secure operation.</p>

            {addSchoolError && (
              <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', marginBottom: '16px', color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} /> {addSchoolError}
              </div>
            )}

            <form onSubmit={handleAddSchool}>
              <p className="muted small" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', marginTop: '4px' }}>School Details</p>

              <label className="muted small block" style={{ marginBottom: '6px' }}>School Name</label>
              <input type="text" required value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)} placeholder="e.g. Lincoln High School" className="sp-input block w-full mb-4" />

              <label className="muted small block" style={{ marginBottom: '6px' }}>School Code <span style={{ color: 'var(--text-faint)' }}>(unique login identifier)</span></label>
              <input type="text" required value={newSchoolCode} onChange={e => setNewSchoolCode(e.target.value.toUpperCase())} placeholder="e.g. LNC01" className="sp-input block w-full mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }} />

              <label className="muted small block" style={{ marginBottom: '6px' }}>Plan</label>
              <select value={newPlanType} onChange={e => {
                const v = e.target.value;
                setNewPlanType(v);
                setNewSchoolTier(v === 'premium' ? 'Premium' : v === 'trial' ? 'Trial' : 'Free');
              }} className="sp-input block w-full mb-2">
                <option value="free">Free</option>
                <option value="trial">28-Day Free Trial</option>
                <option value="premium">Premium</option>
              </select>
              {newPlanType === 'premium' && (
                <>
                  <label className="muted small block" style={{ marginBottom: '6px', marginTop: '6px' }}>Billing Cycle</label>
                  <select value={newBillingCycle} onChange={e => setNewBillingCycle(e.target.value)} className="sp-input block w-full mb-4">
                    <option value="monthly">Monthly (28 days)</option>
                    <option value="yearly">Yearly (365 days)</option>
                  </select>
                </>
              )}

              <div style={{ height: '1px', background: 'var(--card-border)', margin: '4px 0 16px' }} />

              <p className="muted small" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>First Admin Account</p>

              <label className="muted small block" style={{ marginBottom: '6px' }}>Admin Full Name</label>
              <input type="text" required value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="e.g. Ravi Sharma" className="sp-input block w-full mb-4" />

              <label className="muted small block" style={{ marginBottom: '6px' }}>Admin Username <span style={{ color: 'var(--text-faint)' }}>(used at login)</span></label>
              <input type="text" required value={newAdminUsername} onChange={e => setNewAdminUsername(e.target.value)} placeholder="e.g. admin_lnc" className="sp-input block w-full mb-4" />

              <label className="muted small block" style={{ marginBottom: '6px' }}>Admin Email</label>
              <input type="email" required value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="e.g. admin@lincolnhigh.edu" className="sp-input block w-full mb-4" />

              <label className="muted small block" style={{ marginBottom: '6px' }}>Admin Password <span style={{ color: 'var(--text-faint)' }}>(min 6 chars)</span></label>
              <input type="password" required minLength={6} value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="••••••••" className="sp-input block w-full mb-6" />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => { setShowAddSchool(false); setAddSchoolError(''); }}>Cancel</button>
                <button type="submit" disabled={addingSchool} className="btn accent" style={{ flex: 2 }}>
                  {addingSchool ? 'Creating School...' : 'Create School & Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* —— EDIT SCHOOL MODAL —— */}
      {editingSchool && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', padding: '16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px', margin: 'auto' }}>
            <h3 style={{ marginBottom: '4px' }}>Edit School</h3>
            <p className="muted small" style={{ marginBottom: '20px' }}>Update school details and plan assignment.</p>
            <form onSubmit={handleEditSchool} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>School Name</label>
                <input required className="sp-input block w-full" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>School Code</label>
                <input required className="sp-input block w-full" value={editCode} onChange={e => setEditCode(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }} />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Plan</label>
                <select className="sp-input block w-full" value={editPlanType} onChange={e => setEditPlanType(e.target.value)}>
                  <option value="free">Free</option>
                  <option value="trial">28-Day Free Trial (starts now)</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              {editPlanType === 'premium' && (
                <div>
                  <label className="muted small block" style={{ marginBottom: '6px' }}>Billing Cycle</label>
                  <select className="sp-input block w-full" value={editBillingCycle} onChange={e => setEditBillingCycle(e.target.value)}>
                    <option value="monthly">Monthly (28 days from now)</option>
                    <option value="yearly">Yearly (365 days from now)</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => setEditingSchool(null)}>Cancel</button>
                <button type="submit" disabled={savingEdit} className="btn accent" style={{ flex: 2 }}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* —— DELETE SCHOOL MODAL —— */}
      {deletingSchool && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px', borderLeft: '4px solid #ef4444' }}>
            <h3 style={{ marginBottom: '4px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={20} /> Delete School</h3>
            <p className="muted small" style={{ marginBottom: '16px', fontSize: '13px', lineHeight: 1.6 }}>
              You are about to <strong style={{ color: '#f87171' }}>permanently delete</strong> <strong>{deletingSchool.name}</strong> and ALL its data — users, attendance, fees, gallery, notices, timetable, and leaves. <strong>This cannot be undone.</strong>
            </p>
            {deleteError && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', marginBottom: '14px', color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} /> {deleteError}
              </div>
            )}
            <form onSubmit={handleDeleteSchool} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px', color: '#f87171', fontWeight: 700 }}>
                  Enter your Platform Admin password to confirm:
                </label>
                <input
                  required
                  type="password"
                  className="sp-input block w-full"
                  placeholder="Your password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  style={{ borderColor: 'rgba(239,68,68,0.4)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => { setDeletingSchool(null); setDeleteError(''); }}>Cancel</button>
                <button type="submit" disabled={deleteLoading || !deletePassword.trim()} className="btn outline" style={{ flex: 2, color: '#f87171', borderColor: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {deleteLoading ? 'Deleting...' : <><Trash2 size={16} /> Delete Permanently</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── ADD PLAN MODAL ── */}
      {showAddPlan && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px' }}>
            <h3 style={{ marginBottom: '4px' }}>Add Subscription Plan</h3>
            <p className="muted small" style={{ marginBottom: '20px' }}>Create a new pricing tier for schools.</p>
            <form onSubmit={handleAddPlan} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Plan Name</label>
                <input required type="text" className="sp-input block w-full" placeholder="e.g. Pro Annual" value={newPlanName} onChange={e => setNewPlanName(e.target.value)} />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Amount (₹)</label>
                <input required type="number" min="1" step="0.01" className="sp-input block w-full" placeholder="e.g. 999.00" value={newPlanAmount} onChange={e => setNewPlanAmount(e.target.value)} />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Validity (Days)</label>
                <input required type="number" min="1" className="sp-input block w-full" placeholder="e.g. 365" value={newPlanValidity} onChange={e => setNewPlanValidity(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => setShowAddPlan(false)}>Cancel</button>
                <button type="submit" disabled={savingPlan} className="btn accent" style={{ flex: 2 }}>
                  {savingPlan ? 'Saving...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT PLAN MODAL ── */}
      {editingPlan && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px' }}>
            <h3 style={{ marginBottom: '4px' }}>Edit Plan</h3>
            <p className="muted small" style={{ marginBottom: '20px' }}>Update plan details or disable it.</p>
            <form onSubmit={handleEditPlan} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Plan Name</label>
                <input required type="text" className="sp-input block w-full" value={editPlanName} onChange={e => setEditPlanName(e.target.value)} />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Amount (₹)</label>
                <input required type="number" min="1" step="0.01" className="sp-input block w-full" value={editPlanAmount} onChange={e => setEditPlanAmount(e.target.value)} />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px' }}>Validity (Days)</label>
                <input required type="number" min="1" className="sp-input block w-full" value={editPlanValidity} onChange={e => setEditPlanValidity(e.target.value)} />
              </div>
              <div className="flex items-center gap-3 mt-2 mb-2 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <input
                  type="checkbox"
                  id="editPlanActive"
                  checked={editPlanActive}
                  onChange={e => setEditPlanActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                />
                <label htmlFor="editPlanActive" className="text-sm font-semibold cursor-pointer">
                  Plan is Active (Visible to schools)
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => setEditingPlan(null)}>Cancel</button>
                <button type="submit" disabled={savingPlan} className="btn accent" style={{ flex: 2 }}>
                  {savingPlan ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* —— EDIT BROADCAST MODAL —— */}
      {editingBroadcast && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px' }}>
            <h3 style={{ marginBottom: '4px' }}>Edit Broadcast</h3>
            <p className="muted small" style={{ marginBottom: '20px' }}>Update the message or change the expiry window.</p>
            <form onSubmit={handleUpdateBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px', fontWeight: 700 }}>Message</label>
                <textarea
                  required rows={4} className="sp-input block w-full"
                  value={editBMessage}
                  onChange={e => setEditBMessage(e.target.value)}
                />
              </div>
              <div>
                <label className="muted small block" style={{ marginBottom: '6px', fontWeight: 700 }}>
                  Expiry Date <span style={{ color: 'var(--text-faint)' }}>(clear to make permanent)</span>
                </label>
                <input
                  type="datetime-local" className="sp-input block w-full"
                  value={editBExpiryDate}
                  onChange={e => setEditBExpiryDate(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => setEditingBroadcast(null)}>Cancel</button>
                <button type="submit" className="btn accent" style={{ flex: 2 }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
