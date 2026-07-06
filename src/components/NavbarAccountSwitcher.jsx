import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Users, UserPlus, LogOut, ChevronDown, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSavedAccounts, clearActiveSessionLocally, logoutAndRemoveAccount } from '../utils/multiAccount';

export default function NavbarAccountSwitcher() {
  const { user, role, schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [switchingId, setSwitchingId] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setAccounts(getSavedAccounts());
  }, [user, isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddAccount = async () => {
    // Save current active account session tokens
    const { data: { session } } = await supabase.auth.getSession();
    if (session && user) {
      const list = getSavedAccounts();
      const index = list.findIndex(a => a.user_id === user.id);
      if (index > -1) {
        list[index].session = {
          access_token: session.access_token,
          refresh_token: session.refresh_token
        };
        localStorage.setItem('sp_accounts', JSON.stringify(list));
      }
    }
    // Set adding account flag
    localStorage.setItem('sp_adding_account', 'true');
    // Log out locally and navigate to login
    clearActiveSessionLocally();
    navigate('/login');
    window.location.reload();
  };

  const handleSwitch = async (target) => {
    if (target.user_id === user?.id) return;
    setSwitchingId(target.user_id);
    sessionStorage.setItem('sp_switching_account', 'true');
    try {
      const { error } = await supabase.auth.setSession({
        access_token: target.session.access_token,
        refresh_token: target.session.refresh_token
      });
      if (error) throw error;
      
      navigate(target.role === 'platform_admin' ? '/platform-admin' : `/${target.role}`, { replace: true });
      window.location.reload();
    } catch (err) {
      sessionStorage.removeItem('sp_switching_account');
      alert('Failed to switch accounts: Stored session has expired. Please remove and re-add this account.');
      setSwitchingId(null);
    }
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out and remove this account from your saved list?")) {
      logoutAndRemoveAccount(user?.id, navigate);
    }
  };

  const activeAccount = accounts.find(a => a.user_id === user?.id);
  const otherAccounts = accounts.filter(a => a.user_id !== user?.id);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 px-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-slate-200 hover:text-white rounded-xl transition-all"
        style={{ cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.2)', background: 'rgba(99, 102, 241, 0.05)' }}
      >
        <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-black uppercase text-white shadow-md">
          {user?.email?.[0] || 'U'}
        </div>
        <span className="text-xs font-bold hidden sm:inline truncate max-w-[100px]">
          {activeAccount?.name || user?.email?.split('@')[0]}
        </span>
        <ChevronDown size={12} className={`opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl z-[9999]"
          style={{
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            transformOrigin: 'top right'
          }}
        >
          {/* Active Profile Info Header */}
          <div className="border-b border-slate-800/80 pb-3 mb-3">
            <div className="font-black text-slate-200 text-sm truncate">{activeAccount?.name || 'User Profile'}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              {role?.toUpperCase()} • {schoolSettings?.name || 'School Master'}
            </div>
            <div className="text-[9px] text-slate-500 font-medium truncate mt-0.5">{user?.email}</div>
          </div>

          {/* Switch Users Section */}
          {otherAccounts.length > 0 && (
            <>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">
                Switch Account
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 mb-3">
                {otherAccounts.map(acc => (
                  <div
                    key={acc.user_id}
                    onClick={() => !switchingId && handleSwitch(acc)}
                    className="w-full p-2 rounded-xl bg-slate-950/40 border border-slate-950 hover:bg-slate-950/80 hover:border-slate-800 cursor-pointer transition-all flex items-center justify-between text-left group"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-200 text-xs truncate block">{acc.name}</span>
                      <span className="text-[8px] text-slate-500 font-semibold truncate uppercase block mt-0.5">
                        {acc.role} • {acc.school_name}
                      </span>
                    </div>
                    <div className="text-slate-500 group-hover:text-white transition-colors">
                      {switchingId === acc.user_id ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} className="-rotate-90" />}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Action Links */}
          <div className="border-t border-slate-800/80 pt-3 flex flex-col gap-2">
            <button
              onClick={handleAddAccount}
              className="w-full py-2 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700/60 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <UserPlus size={12} />
              Add User Account
            </button>

            <button
              onClick={handleLogout}
              className="w-full py-2 bg-red-950/20 hover:bg-red-950/30 border border-red-500/10 hover:border-red-500/20 text-red-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={12} />
              Logout Current
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
