import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import UserAvatar from '../../components/UserAvatar';
import {
  Users, Search, UserPlus, Filter, Loader2, Phone, BookOpen,
  CreditCard, X, Save, Calendar, Droplet, MapPin, GraduationCap, BadgeInfo, Lock, Bus, Plus, Trash2
} from 'lucide-react';

const formatClassName = (input) => {
  let str = input.trim().toUpperCase();
  if (!str) return '';

  const getOrdinal = (n) => {
    const num = parseInt(n, 10);
    const j = num % 10, k = num % 100;
    if (j === 1 && k !== 11) return 'ST';
    if (j === 2 && k !== 12) return 'ND';
    if (j === 3 && k !== 13) return 'RD';
    return 'TH';
  };

  if (/^\d+$/.test(str)) {
    return str + getOrdinal(str);
  }
  if (/^\d+[A-Z]$/.test(str)) {
    return str + '-TH';
  }
  if (/^\d+\s+[A-Z]$/.test(str)) {
    return str.replace(/\s+/g, '') + '-TH';
  }
  str = str.replace(/\b(\d+)\b/g, (match) => {
    return match + getOrdinal(match);
  });
  return str;
};

const EField = ({ label, field, type = 'text', options = null, allowCustom = false, editForm, setEditForm }) => (
  <div>
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{label}</label>
    {options && !allowCustom ? (
      <select
        value={editForm[field] || ''}
        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-normal"
      >
        <option value="">{label}...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <>
        <input
          type={type}
          list={options ? field + "-datalist" : undefined}
          value={editForm[field] || ''}
          onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-normal"
        />
        {options && allowCustom && (
          <datalist id={field + "-datalist"}>
            {options.map(o => <option key={o} value={o} />)}
          </datalist>
        )}
      </>
    )}
  </div>
);

// Global UserAvatar component is imported above

export default function UserManagement() {
  const { schoolSettings, setSchoolSettings, user: currentUser, role: currentRole } = useAppStore();
  const { isPending } = usePending();
  const [activeTab, setActiveTab] = useState(currentRole === 'teacher' ? 'student' : 'teacher');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState(currentRole === 'teacher' ? (currentUser?.class || '') : '');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchTerm, selectedClass]);

  /* ── Create Class Modal State ── */
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [newClassInput, setNewClassInput] = useState('');
  const queryClient = useQueryClient();

  /* ── Password Reset State ── */
  const [resettingUser, setResettingUser] = useState(null);
  const [newPass, setNewPass] = useState('');

  /* ── Add User Modal State ── */
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    email: '', username: '', name: '', password: '', contact: '',
    userClass: '', dob: '', bloodGroup: '', address: '',
    designation: '', qualification: '', aadharCard: '',
  });
  // Bus allocation for new driver (only visible when activeTab === 'driver')
  const [busAlloc, setBusAlloc] = useState({ mode: 'existing', existingBusId: '', newBusNumber: '', newRouteName: '' });

  /* ── Edit Profile Panel State ── */
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  const classes = schoolSettings?.classes || [];

  useEffect(() => {
    if (isAddModalOpen || editingUser || isCreateClassModalOpen || resettingUser) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isAddModalOpen, editingUser, isCreateClassModalOpen, resettingUser]);

  /* ── Fetch existing bus assignments for the Bus Allocation dropdown ── */
  const { data: existingBuses = [] } = useQuery({
    queryKey: ['bus-assignments-admin', schoolSettings?.school_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('bus_assignments')
        .select('id, bus_number, route_name, driver_id')
        .eq('school_id', schoolSettings.school_id)
        .eq('is_active', true)
        .order('bus_number', { ascending: true });
      return data || [];
    },
    enabled: !!schoolSettings?.school_id && activeTab === 'driver',
  });

  /* ── Data Fetching ── */
  const { data, isLoading } = useQuery({
    queryKey: ['users-list', activeTab, schoolSettings?.school_id, page, searchTerm, selectedClass],
    queryFn: async () => {
      let q = supabase.from('users').select('*', { count: 'exact' });
      q = q.eq('school_id', schoolSettings.school_id);

      if (activeTab === 'staff') {
        q = q.eq('role', 'staff');
      } else {
        q = q.eq('role', activeTab);
      }

      if (activeTab === 'student' && selectedClass) {
        q = q.eq('class', selectedClass);
      }

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        q = q.or(`name.ilike.${term},username.ilike.${term}`);
      }

      q = q.order('name');

      const from = page * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data: resData, count, error } = await q;
      if (error) throw error;
      return { users: resData || [], totalCount: count || 0 };
    },
    enabled: !!schoolSettings?.school_id,
  });

  const usersList = data?.users || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  /* ── Mutations ── */
  const createUserMutation = useMutation({
    mutationFn: async () => {
      const f = addForm;
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: f.email, p_password: f.password,
        p_role: activeTab === 'staff' ? 'staff' : activeTab,
        p_name: f.name, p_username: f.username,
        p_school_id: schoolSettings.school_id,
        p_class: f.userClass || null, p_contact: f.contact || null,
        p_dob: f.dob || null, p_address: f.address || null,
        p_blood_group: f.bloodGroup || null,
        p_designation: f.designation || null,
        p_qualification: f.qualification || null,
        p_aadhar_card: f.aadharCard || null,
      });
      if (error) throw error;

      // If adding a driver and bus allocation is requested, save to bus_assignments
      if (activeTab === 'driver' && data) {
        const newDriverId = data; // RPC returns the new user's UUID
        const busNumber = busAlloc.mode === 'new'
          ? busAlloc.newBusNumber.trim()
          : existingBuses.find(b => b.id === busAlloc.existingBusId)?.bus_number;

        if (busNumber) {
          if (busAlloc.mode === 'new') {
            // Insert a brand new bus assignment
            await supabase.from('bus_assignments').insert({
              school_id:   schoolSettings.school_id,
              bus_number:  busNumber,
              route_name:  busAlloc.newRouteName.trim() || null,
              driver_id:   newDriverId,
              driver_name: f.name || f.email,
              is_active:   true,
            });
          } else {
            // Update existing bus assignment to point to new driver
            await supabase
              .from('bus_assignments')
              .update({ driver_id: newDriverId, driver_name: f.name || f.email })
              .eq('id', busAlloc.existingBusId);
          }
        }
      }

      return {
        id: data,
        email: f.email,
        username: f.username,
        name: f.name,
        password: f.password,
        role: activeTab === 'staff' ? 'staff' : activeTab
      };
    },
    onSuccess: (createdUser) => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      queryClient.invalidateQueries({ queryKey: ['bus-assignments-admin'] });
      setIsAddModalOpen(false);

      // Trigger welcome email Deno Edge Function if NOT a student
      if (createdUser && createdUser.role !== 'student' && createdUser.email) {
        supabase.functions.invoke('send-welcome-email', {
          body: {
            email: createdUser.email,
            name: createdUser.name,
            username: createdUser.username,
            password: createdUser.password,
            role: createdUser.role,
            schoolName: schoolSettings.name
          }
        }).catch(err => {
          console.error('Failed to trigger welcome email:', err);
        });
      }

      setAddForm({ email: '', username: '', name: '', password: '', contact: '', userClass: '', dob: '', bloodGroup: '', address: '', designation: '', qualification: '', aadharCard: '' });
      setBusAlloc({ mode: 'existing', existingBusId: '', newBusNumber: '', newRouteName: '' });
      alert('User created successfully!');
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_update_user', {
        p_user_id: editingUser.id,
        p_email: editForm.email,
        p_username: editForm.username,
        p_name: editForm.name,
        p_role: editingUser.role,
        p_class: editForm.class || null,
        p_contact: editForm.contact || null,
        p_dob: editForm.dob || null,
        p_address: editForm.address || null,
        p_blood_group: editForm.blood_group || null,
        p_qualification: editForm.qualification || null,
        p_aadhar_card: editForm.aadhar_card || null,
        p_designation: editForm.designation || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setEditingUser(null);
      alert('Profile updated successfully!');
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setEditingUser(null);
      alert('User deleted successfully!');
    },
    onError: (err) => alert('Error: ' + err.message),
  });
  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { targetUserId: resettingUser.id, newPassword: newPass }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setResettingUser(null);
      setNewPass('');
      alert('Password reset successfully!');
    },
    onError: (err) => alert('Error resetting password: ' + err.message),
  });

  const openEditPanel = (user) => {
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    setEditingUser(user);
    setEditForm({ ...user });
  };

  const handleSaveClass = async (e) => {
    e.preventDefault();
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    if (!newClassInput || !newClassInput.trim()) {
      alert('Please enter a class number.');
      return;
    }
    
    const getOrdinal = (n) => {
      const num = parseInt(n, 10);
      if (isNaN(num)) return '';
      const j = num % 10, k = num % 100;
      if (j === 1 && k !== 11) return 'ST';
      if (j === 2 && k !== 12) return 'ND';
      if (j === 3 && k !== 13) return 'RD';
      return 'TH';
    };
    
    const formatted = newClassInput.trim() + getOrdinal(newClassInput.trim());
    
    if (classes.includes(formatted)) {
      alert('Already exists');
      return;
    }
    
    const updatedClasses = [...classes, formatted].sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    
    const { error } = await supabase.from('school_settings').update({ classes: updatedClasses }).eq('school_id', schoolSettings.school_id);
    if (error) return alert('Error creating class: ' + error.message);
    setSchoolSettings({ ...schoolSettings, classes: updatedClasses });
    alert(`Class ${formatted} created successfully!`);
    setIsCreateClassModalOpen(false);
    setNewClassInput('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Tab Switcher */}
      {currentRole === 'admin' && (
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit border border-slate-200 shadow-inner overflow-x-auto">
          {[['teacher', 'Teachers', BookOpen], ['student', 'Students', Users], ['staff', 'Staff', Users], ['driver', 'Drivers', Bus]].map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedClass(''); setEditingUser(null); }}
              className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === tab ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search by name or username..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-11 pr-4 py-3.5 bg-white border border-border rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm leading-normal"
          />
        </div>
        {activeTab === 'student' && (
          <div className="w-64 relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
              <Filter size={18} />
            </div>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="block w-full pl-11 pr-4 py-3.5 bg-white border border-border rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm appearance-none cursor-pointer font-semibold leading-normal"
            >
              <option value="">All Classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {currentRole === 'admin' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                setIsCreateClassModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-500/20 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all whitespace-nowrap active:scale-95"
            >
              <Plus size={20} /> Create Class
            </button>
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                setIsAddModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-primary/20 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all whitespace-nowrap active:scale-95"
            >
              <UserPlus size={20} /> Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </button>
          </div>
        )}
      </div>

      {/* User Table */}
      <div className="bg-white border border-border rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="h-4 w-28 rounded-lg animate-shimmer"></div>
              <div className="h-4 w-36 rounded-lg animate-shimmer"></div>
              <div className="h-4 w-28 rounded-lg animate-shimmer"></div>
              <div className="h-4.5 w-20 rounded-lg animate-shimmer"></div>
            </div>
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full animate-shimmer shrink-0"></div>
                  <div className="space-y-2">
                    <div className="h-3.5 w-32 rounded animate-shimmer"></div>
                    <div className="h-2.5 w-20 rounded animate-shimmer"></div>
                  </div>
                </div>
                <div className="h-3.5 w-28 rounded animate-shimmer hidden md:block"></div>
                <div className="h-3.5 w-24 rounded animate-shimmer hidden md:block"></div>
                <div className="flex gap-2">
                  <div className="h-9 w-20 rounded-xl animate-shimmer"></div>
                  <div className="h-9 w-20 rounded-xl animate-shimmer"></div>
                </div>
              </div>
            ))}
          </div>
        ) : usersList.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-slate-500 font-medium">No {activeTab}s found.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="md:hidden flex items-center justify-end px-4 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black tracking-widest text-primary animate-pulse shadow-inner">
              Swipe left for more actions <span className="ml-2 text-sm">👉</span>
            </div>
            <div className="overflow-x-auto relative shadow-[inset_-12px_0_12px_-12px_rgba(0,0,0,0.1)]">
              <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">User Details</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {activeTab === 'student' ? 'Class' : activeTab === 'teacher' ? 'Qualification' : 'Designation'}
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <UserAvatar user={user} />
                        <div>
                          <div className="font-bold text-slate-800 text-base flex items-center gap-2">
                            {user.name}
                            {activeTab === 'teacher' && user.class && (
                              <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md uppercase tracking-widest">{user.class}</span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md inline-block mt-1">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs font-semibold text-slate-600">
                      {user.contact || <span className="text-slate-300 italic">Not provided</span>}
                    </td>
                    <td className="px-6 py-5">
                      <span className="font-bold text-slate-700 text-sm">
                        {activeTab === 'student' ? user.class : activeTab === 'teacher' ? user.qualification : user.designation}
                        {!user.class && !user.qualification && !user.designation && <span className="text-slate-300 italic text-xs">—</span>}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(currentRole === 'admin' || (currentRole === 'teacher' && activeTab === 'student')) && (
                          <button
                            onClick={() => {
                              if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                              setResettingUser(user);
                            }}
                            className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-black text-amber-600 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-all uppercase tracking-widest shadow-sm flex items-center gap-1.5"
                            title="Manage Password"
                          >
                            <Lock size={12} /> Manage Password
                          </button>
                        )}
                        <button
                          onClick={() => openEditPanel(user)}
                          className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-black text-indigo-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                        >
                          Edit Profile
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-border flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500">
                Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} entries
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </div>
        )}
      </div>

      {/* ── EDIT PROFILE SIDE PANEL ── */}
      {editingUser && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:justify-end bg-black/50 backdrop-blur-sm" onClick={() => setEditingUser(null)}>
          <div
            className="bg-white h-full max-h-[85vh] sm:max-h-screen w-full max-w-md shadow-2xl rounded-t-3xl sm:rounded-none overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-right-8 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-white relative overflow-hidden flex-shrink-0">
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -mt-16 -mr-16" />
              <button onClick={() => setEditingUser(null)} className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X size={18} />
              </button>
              <UserAvatar user={editingUser} size="lg" className="mb-3 border-2 border-white/30 shadow-md" />
              <h2 className="text-lg font-black tracking-tight">{editingUser.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-[10px] font-bold bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">@{editingUser.username}</span>
                <span className="text-[10px] font-bold bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">{editingUser.role}</span>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Edit Profile Information</p>

              <EField label="Full Name" field="name" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Contact Phone" field="contact" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Date of Birth" field="dob" type="date" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Blood Group" field="blood_group" options={['A+','A-','B+','B-','O+','O-','AB+','AB-']} editForm={editForm} setEditForm={setEditForm} />
              <EField label="Address" field="address" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Aadhar Card Number" field="aadhar_card" editForm={editForm} setEditForm={setEditForm} />

              {(activeTab === 'student' || activeTab === 'teacher') && (
                <EField label="Class / Standard" field="class" options={classes} allowCustom={true} editForm={editForm} setEditForm={setEditForm} />
              )}
              {(activeTab === 'teacher' || activeTab === 'staff') && (
                <EField label="Qualification" field="qualification" editForm={editForm} setEditForm={setEditForm} />
              )}
              {activeTab === 'staff' && (
                <EField label="Designation" field="designation" editForm={editForm} setEditForm={setEditForm} />
              )}

              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">System Information</p>
              <EField label="Email Address" field="email" type="email" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Username" field="username" editForm={editForm} setEditForm={setEditForm} />
              
              {/* Read-only info */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mt-4">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">System Role</div>
                <div className="text-sm font-bold text-slate-700 uppercase">{editingUser.role}</div>
              </div>

              {/* Danger Zone */}
              {editingUser.id !== currentUser?.id && (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 mt-6 flex flex-col gap-3">
                  <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Danger Zone</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Are you absolutely sure you want to permanently delete this user (${editingUser.name || editingUser.email})? This will delete their login credentials, attendance history, and all other related records. This action CANNOT be undone.`)) {
                        const confirmInput = window.prompt(`To proceed, please type 'DELETE' below:`);
                        if (confirmInput === 'DELETE') {
                          deleteUserMutation.mutate(editingUser.id);
                        } else {
                          alert('Deletion cancelled: Input did not match.');
                        }
                      }
                    }}
                    disabled={deleteUserMutation.isPending}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {deleteUserMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete User Account
                  </button>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="p-6 border-t border-slate-100 flex-shrink-0 flex gap-3 sticky bottom-0 bg-white z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => updateUserMutation.mutate()}
                disabled={updateUserMutation.isPending}
                className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg"
              >
                {updateUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD USER MODAL ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto py-10 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white border border-border rounded-3xl p-6 w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-4 relative max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                Register New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar pr-1">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[['Full Name *', 'name', 'text', 'Jane Doe'], ['Username *', 'username', 'text', 'janedoe'], ['Email *', 'email', 'email', 'jane@school.com'], ['Password *', 'password', 'password', '••••••••']].map(([label, field, type, ph]) => (
                    <div key={field}>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">{label}</label>
                      <input type={type} value={addForm[field]} onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))} placeholder={ph}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Date of Birth</label>
                    <input type="date" value={addForm.dob} onChange={e => setAddForm(f => ({ ...f, dob: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Blood Group</label>
                    <select value={addForm.bloodGroup} onChange={e => setAddForm(f => ({ ...f, bloodGroup: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Select...</option>
                      {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Address</label>
                  <input type="text" value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="Full residential address"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Contact Phone</label>
                    <input type="text" value={addForm.contact} onChange={e => setAddForm(f => ({ ...f, contact: e.target.value }))} placeholder="+91..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  {(activeTab === 'student' || activeTab === 'teacher') && (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Class / Standard (Enter new or select)</label>
                      <input
                        type="text"
                        list="addClassList"
                        value={addForm.userClass}
                        onChange={e => setAddForm(f => ({ ...f, userClass: e.target.value.toUpperCase() }))}
                        placeholder="e.g. 1ST, 2ND"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <datalist id="addClassList">
                        {classes.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  )}
                </div>

                {(activeTab === 'teacher' || activeTab === 'staff') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Qualification</label>
                      <input type="text" value={addForm.qualification} onChange={e => setAddForm(f => ({ ...f, qualification: e.target.value }))} placeholder="e.g. M.Sc, B.Ed"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Aadhar Card</label>
                      <input type="text" value={addForm.aadharCard} onChange={e => setAddForm(f => ({ ...f, aadharCard: e.target.value }))} placeholder="12-digit number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    {activeTab === 'staff' && (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Designation</label>
                        <input type="text" value={addForm.designation} onChange={e => setAddForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Clerk, Librarian"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── BUS ALLOCATION (driver only) ─────────────────────────────── */}
            {activeTab === 'driver' && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <Bus size={16} className="text-amber-500" />
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bus Allocation (Optional)</p>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-3">
                  {[['existing', '📋 Assign to Existing Bus'], ['new', '➕ Create New Bus']].map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBusAlloc(b => ({ ...b, mode: m }))}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${busAlloc.mode === m ? 'bg-amber-500 border-amber-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-amber-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {busAlloc.mode === 'existing' ? (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Select Bus</label>
                    <select
                      value={busAlloc.existingBusId}
                      onChange={e => setBusAlloc(b => ({ ...b, existingBusId: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <option value="">-- Skip / Assign Later --</option>
                      {existingBuses.map(b => (
                        <option key={b.id} value={b.id}>
                          Bus {b.bus_number}{b.route_name ? ` · ${b.route_name}` : ''}{b.driver_id ? ' (has driver)' : ''}
                        </option>
                      ))}
                    </select>
                    {existingBuses.length === 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">No buses created yet. Switch to "Create New Bus" to add one.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Bus Number *</label>
                      <input
                        type="text"
                        value={busAlloc.newBusNumber}
                        onChange={e => setBusAlloc(b => ({ ...b, newBusNumber: e.target.value }))}
                        placeholder="e.g. 7"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Route Name</label>
                      <input
                        type="text"
                        value={busAlloc.newRouteName}
                        onChange={e => setBusAlloc(b => ({ ...b, newRouteName: e.target.value }))}
                        placeholder="e.g. Morning — Civil Lines"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => { setIsAddModalOpen(false); setBusAlloc({ mode: 'existing', existingBusId: '', newBusNumber: '', newRouteName: '' }); }} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
              <button
                onClick={() => createUserMutation.mutate()}
                disabled={createUserMutation.isPending || !addForm.email || !addForm.password || !addForm.name || !addForm.username}
                className="px-6 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {createUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                Save User
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── RESET PASSWORD MODAL ── */}
      {resettingUser && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                <Lock size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-800 tracking-tight text-base">Manage Password</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Target: {resettingUser.name}</p>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">Set a new password for this user. Minimum 6 characters required.</p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-1">New Password</label>
                <input
                  type="text"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="Enter new password..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300 font-bold"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setResettingUser(null); setNewPass(''); }}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => resetPasswordMutation.mutate()}
                  disabled={resetPasswordMutation.isPending || newPass.length < 6}
                  className="flex-[1.5] py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl disabled:opacity-50 transition-all shadow-md shadow-amber-200 flex items-center justify-center gap-1.5"
                >
                  {resetPasswordMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Lock size={12} /> Manage Password</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE CLASS MODAL ── */}
      {isCreateClassModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <form onSubmit={handleSaveClass} className="bg-white border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                <Plus size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-800 tracking-tight text-base">Create Class</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Manage Academy</p>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">
              Enter the numeric grade or class number (e.g., 1, 2, 10, 11). Only numbers are accepted; the system will append the correct suffix (ST, ND, RD, TH) automatically.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-1">Class Number</label>
                <input
                  type="text"
                  pattern="\d*"
                  inputMode="numeric"
                  value={newClassInput}
                  onChange={e => setNewClassInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 1, 3, 10..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-emerald-300 font-bold"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsCreateClassModalOpen(false); setNewClassInput(''); }}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newClassInput}
                  className="flex-[1.5] py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl disabled:opacity-50 transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5"
                >
                  Create Class
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
