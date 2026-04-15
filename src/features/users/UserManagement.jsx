import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Users, Search, UserPlus, Filter, Loader2, Mail, Phone, BookOpen, CreditCard } from 'lucide-react';

export default function UserManagement() {
  const { schoolSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState('student'); // 'student' or 'teacher'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

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

        <button className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-primary/20 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all whitespace-nowrap active:scale-95">
          <UserPlus size={20} /> Add {activeTab === 'student' ? 'Student' : 'Teacher'}
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
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Roster Information</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact / Identity</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeTab === 'student' ? 'Deployment' : 'Allocated Role'}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Registry Actions</th>
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
                      ) : (
                        <div className="inline-flex flex-col">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Education</span>
                           <span className="font-bold text-slate-800 text-sm leading-tight">{user.qualification || 'Master Grade'}</span>
                           <span className="text-[9px] font-bold text-primary uppercase mt-1">Class: {user.class || 'Gen 1'}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all uppercase tracking-widest shadow-sm">
                        Manage Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
