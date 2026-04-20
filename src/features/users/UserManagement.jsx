import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Users, Search, UserPlus, Filter, Loader2, Mail, Phone, BookOpen, CreditCard } from 'lucide-react';

export default function UserManagement() {
  const { schoolSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState('student'); // 'student', 'teacher', 'staff'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState('');
  const [userClass, setUserClass] = useState('');
  
  // New Fields
  const [dob, setDob] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [address, setAddress] = useState('');
  const [designation, setDesignation] = useState('');
  const [qualification, setQualification] = useState('');
  const [aadharCard, setAadharCard] = useState('');

  const queryClient = useQueryClient();

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data: newId, error } = await supabase.rpc('admin_create_user', {
        p_email: email,
        p_password: password,
        p_role: activeTab === 'staff' ? 'staff' : activeTab,
        p_name: name,
        p_username: username,
        p_school_id: schoolSettings.school_id,
        p_class: activeTab === 'student' ? userClass : (activeTab === 'teacher' ? userClass : null),
        p_contact: contact || null,
        p_dob: dob || null,
        p_address: address || null,
        p_blood_group: bloodGroup || null,
        p_designation: activeTab === 'staff' ? designation : null,
        p_qualification: (activeTab === 'teacher' || activeTab === 'staff') ? qualification : null,
        p_aadhar_card: aadharCard || null
      });
      if (error) throw error;
      return newId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setIsModalOpen(false);
      setEmail(''); setUsername(''); setName(''); setPassword(''); setContact(''); setUserClass('');
      setDob(''); setBloodGroup(''); setAddress(''); setDesignation(''); setQualification(''); setAadharCard('');
      alert('User created successfully!');
    },
    onError: (err) => {
      alert('Error creating user: ' + err.message);
    }
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-list', activeTab, schoolSettings?.school_id],
    queryFn: async () => {
      let query = supabase
        .from('users')
        .select('*')
        .eq('role', activeTab)
        .order('name');
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!schoolSettings?.school_id
  });

  const filteredUsers = users?.filter(u => 
    (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
     u.username.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (selectedClass ? u.class === selectedClass : true)
  );

  const classes = schoolSettings?.classes || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Tab Switcher */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit border border-slate-200 shadow-inner">
        <button
          onClick={() => { setActiveTab('student'); setSelectedClass(''); }}
          className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'student' ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users size={18} /> Students
        </button>
        <button
          onClick={() => { setActiveTab('teacher'); setSelectedClass(''); }}
          className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'teacher' ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BookOpen size={18} /> Teachers
        </button>
        <button
          onClick={() => { setActiveTab('staff'); setSelectedClass(''); }}
          className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'staff' ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users size={18} /> Staff
        </button>
      </div>

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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-11 pr-4 py-3.5 bg-white border border-border rounded-2xl text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
          />
        </div>

        {activeTab === 'student' && (
          <div className="w-64 relative">
             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Filter size={18} />
              </div>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="block w-full pl-11 pr-4 py-3.5 bg-white border border-border rounded-2xl text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm appearance-none cursor-pointer font-semibold"
            >
              <option value="">All Classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-primary/20 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all whitespace-nowrap active:scale-95"
        >
          <UserPlus size={20} /> Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        </button>
      </div>

      {/* User Table/List */}
      <div className="bg-white border border-border rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <span className="font-bold tracking-widest text-slate-400 uppercase text-xs">Accessing Directory...</span>
          </div>
        ) : filteredUsers?.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Search size={40} className="text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">No {activeTab}s found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeTab} Details</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact Info</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeTab === 'student' ? 'Class' : activeTab === 'teacher' ? 'Qualification' : 'Designation'}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-primary flex items-center justify-center font-black text-lg share-shadow shadow-indigo-100 group-hover:scale-110 transition-transform">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-base">{user.name}</div>
                          <div className="text-xs font-bold text-muted uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md inline-block mt-1">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                       <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                             <Phone size={14} className="text-slate-400" /> {user.contact || 'Not Provided'}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                             <CreditCard size={14} className="text-slate-400" /> Aadhar: {user.aadhar_card || 'Missing'}
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-5">
                      {activeTab === 'student' ? (
                        <div className="inline-flex flex-col">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Standard</span>
                           <span className="font-black text-slate-800 tracking-tight text-lg">{user.class || 'Unassigned'}</span>
                        </div>
                      ) : activeTab === 'teacher' ? (
                        <div className="inline-flex flex-col">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Education</span>
                           <span className="font-bold text-slate-800 text-sm leading-tight">{user.qualification || 'N/A'}</span>
                           <span className="text-[9px] font-bold text-primary uppercase mt-1">Class: {user.class || 'Unassigned'}</span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Position</span>
                           <span className="font-bold text-slate-800 text-sm leading-tight">{user.designation || 'Staff'}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all uppercase tracking-widest shadow-sm">
                        Manage {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
           <div className="bg-white border border-border rounded-3xl p-6 w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-4 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
             <h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 flex items-center justify-between">
               Register New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
             </h3>
             
             <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Full Name</label>
                      <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                   </div>
                   <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Username</label>
                      <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="janedoe" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Email</label>
                      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jane@school.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                   </div>
                   <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Password</label>
                      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Date of Birth</label>
                      <input type="date" value={dob} onChange={e=>setDob(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                   </div>
                   <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Blood Group</label>
                      <select value={bloodGroup} onChange={e=>setBloodGroup(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900">
                        <option value="">Select...</option>
                        <option value="A+">A+</option><option value="A-">A-</option>
                        <option value="B+">B+</option><option value="B-">B-</option>
                        <option value="O+">O+</option><option value="O-">O-</option>
                        <option value="AB+">AB+</option><option value="AB-">AB-</option>
                      </select>
                   </div>
                </div>

                <div>
                   <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Address</label>
                   <textarea value={address} onChange={e=>setAddress(e.target.value)} rows="2" placeholder="Full residential address" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 custom-scrollbar"></textarea>
                </div>

                {(activeTab === 'student' || activeTab === 'teacher') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">{activeTab === 'student' ? 'Class / Standard' : 'Allocated Class'}</label>
                        <select value={userClass} onChange={e=>setUserClass(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900">
                           <option value="">Select...</option>
                           {classes.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Contact Phone</label>
                        <input type="text" value={contact} onChange={e=>setContact(e.target.value)} placeholder="+91..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                     </div>
                  </div>
                )}

                {activeTab === 'staff' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Designation</label>
                      <input type="text" value={designation} onChange={e=>setDesignation(e.target.value)} placeholder="e.g. Cleark, Janitor" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Contact Phone</label>
                      <input type="text" value={contact} onChange={e=>setContact(e.target.value)} placeholder="+91..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                    </div>
                  </div>
                )}

                {(activeTab === 'teacher' || activeTab === 'staff') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Qualification</label>
                        <input type="text" value={qualification} onChange={e=>setQualification(e.target.value)} placeholder="e.g. M.Sc, B.Ed" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                     </div>
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Aadhar Card</label>
                        <input type="text" value={aadharCard} onChange={e=>setAadharCard(e.target.value)} placeholder="12-digit number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900" />
                     </div>
                  </div>
                )}
             </div>

             <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                <button 
                  onClick={() => createUserMutation.mutate()} 
                  disabled={createUserMutation.isPending || !email || !password || !name || !username} 
                  className="px-6 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center gap-2"
                >
                   {createUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Save User
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
