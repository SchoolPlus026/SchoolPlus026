import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Users, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSavedAccounts, removeAccount } from '../utils/multiAccount';

export default function AccountSwitcher() {
  const { user, role, schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [switchingId, setSwitchingId] = useState(null);

  useEffect(() => {
    setAccounts(getSavedAccounts());
  }, [user]);

  const handleAddAccount = async () => {
    // Save current active account session tokens just in case
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
    // Log out of active session
    await supabase.auth.signOut();
    // Redirect to login
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
      
      // Navigate to new role route
      navigate(target.role === 'platform_admin' ? '/platform-admin' : `/${target.role}`, { replace: true });
      window.location.reload();
    } catch (err) {
      sessionStorage.removeItem('sp_switching_account');
      alert('Failed to switch accounts: Stored session has expired. Please remove and re-add this account.');
      setSwitchingId(null);
    }
  };

  const handleRemove = (targetId) => {
    const confirmMsg = targetId === user?.id 
      ? "Are you sure you want to log out and remove your current active account? You will be switched to another account or returned to the login screen."
      : "Are you sure you want to remove this saved account? You will need to log in again to add it back.";
      
    if (window.confirm(confirmMsg)) {
      const filtered = removeAccount(targetId);
      setAccounts(filtered);
      
      if (targetId === user?.id) {
        if (filtered.length > 0) {
          handleSwitch(filtered[0]);
        } else {
          supabase.auth.signOut().then(() => {
            navigate('/login', { replace: true });
            window.location.reload();
          });
        }
      }
    }
  };

  return (
    <div className="card mt-6" style={{ width: '100%' }}>
      <div className="settings-header" style={{ marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div className="icon-box" style={{ 
          background: 'rgba(99, 102, 241, 0.1)', 
          color: '#6366f1', 
          width: '40px', 
          height: '40px', 
          borderRadius: '12px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Users size={20} />
        </div>
        <div className="text-content">
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>Switch User / Multi-Account</h4>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Link multiple accounts and switch between them instantly (e.g. parent with multiple students, teacher with dual roles).</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {accounts.map(acc => {
          const isActive = acc.user_id === user?.id;
          const isSwitching = switchingId === acc.user_id;

          return (
            <div 
              key={acc.user_id} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                gap: '16px', 
                padding: '14px 18px', 
                borderRadius: '16px', 
                border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--card-border, rgba(255, 255, 255, 0.08))', 
                backgroundColor: isActive ? 'var(--accent-light, rgba(99, 102, 241, 0.05))' : 'var(--bg-main, transparent)',
                transition: 'all 0.2s ease-in-out'
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-main)' }}>{acc.name}</span>
                  {isActive && (
                    <span style={{ 
                      fontSize: '9px', 
                      fontWeight: 900, 
                      background: '#4f46e5', 
                      color: '#fff', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.05em' 
                    }}>
                      Active
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="uppercase text-[9px] bg-slate-200/50 dark:bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-500 font-bold">{acc.role}</span>
                  <span>•</span>
                  <span className="truncate">{acc.school_name}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!isActive && (
                  <button
                    onClick={() => handleSwitch(acc)}
                    disabled={switchingId !== null}
                    style={{ 
                      padding: '8px 14px', 
                      borderRadius: '10px', 
                      border: 'none', 
                      background: 'var(--accent, #6366f1)', 
                      color: '#fff', 
                      fontSize: '11px', 
                      fontWeight: 800, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      opacity: switchingId !== null ? 0.6 : 1
                    }}
                  >
                    {isSwitching ? <Loader2 size={12} className="animate-spin" /> : 'Switch'}
                  </button>
                )}
                <button
                  onClick={() => handleRemove(acc.user_id)}
                  style={{ 
                    padding: '8px', 
                    borderRadius: '10px', 
                    border: '1px solid var(--card-border, rgba(255, 255, 255, 0.08))', 
                    background: 'transparent', 
                    color: '#ef4444', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Remove account"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add Account Button */}
        <button
          onClick={handleAddAccount}
          style={{ 
            marginTop: '8px',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '8px', 
            width: '100%', 
            padding: '12px', 
            borderRadius: '12px', 
            border: '2px dashed var(--card-border, rgba(255, 255, 255, 0.12))', 
            background: 'transparent', 
            color: 'var(--text-muted)', 
            fontSize: '12px', 
            fontWeight: 700, 
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          className="hover:border-indigo-500 hover:text-indigo-400"
        >
          <UserPlus size={16} />
          {accounts.length === 1 ? 'Add 1 more user' : 'Add another user account'}
        </button>
      </div>
    </div>
  );
}
