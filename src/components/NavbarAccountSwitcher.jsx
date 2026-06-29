import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Users, UserPlus, LogOut, ChevronRight, Loader2 } from 'lucide-react';
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
    try {
      const { error } = await supabase.auth.setSession({
        access_token: target.session.access_token,
        refresh_token: target.session.refresh_token
      });
      if (error) throw error;
      
      navigate(target.role === 'platform_admin' ? '/platform-admin' : `/${target.role}`, { replace: true });
      window.location.reload();
    } catch (err) {
      alert('Failed to switch accounts: Stored session has expired. Please remove and re-add this account.');
      setSwitchingId(null);
    }
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out and remove this account from your saved list?")) {
      logoutAndRemoveAccount(user?.id, navigate);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center justify-center"
        title="Switch Account"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        <Users size={18} />
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl z-[9999]"
          style={{
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            transformOrigin: 'top right'
          }}
        >
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">
            Linked Accounts
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {accounts.map(acc => {
              const isActive = acc.user_id === user?.id;
              const isSwitching = switchingId === acc.user_id;

              return (
                <div
                  key={acc.user_id}
                  onClick={() => !isActive && !switchingId && handleSwitch(acc)}
                  className={`w-full p-2.5 rounded-xl border transition-all flex items-center justify-between text-left group ${
                    isActive 
                      ? 'bg-indigo-600/10 border-indigo-500/30' 
                      : 'bg-slate-950/40 border-slate-950 hover:bg-slate-950/80 hover:border-slate-800 cursor-pointer'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-200 text-xs truncate">{acc.name}</span>
                      {isActive && (
                        <span className="text-[8px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-slate-500 font-semibold truncate uppercase mt-0.5">
                      {acc.role} • {acc.school_name}
                    </div>
                  </div>

                  {!isActive && (
                    <div className="text-slate-500 group-hover:text-white transition-colors">
                      {isSwitching ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-800/80 mt-3 pt-3 flex flex-col gap-2">
            <button
              onClick={handleAddAccount}
              className="w-full py-2 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700/60 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <UserPlus size={12} />
              Add User
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
