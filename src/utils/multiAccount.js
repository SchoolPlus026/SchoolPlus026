import { supabase } from '../config/supabaseClient';

export function getSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem('sp_accounts') || '[]');
  } catch (e) {
    return [];
  }
}

export function saveAccount(session, profile, schoolSettings) {
  if (!session || !profile) return;
  const accounts = getSavedAccounts();
  const existingIndex = accounts.findIndex(a => a.user_id === session.user.id);
  const accountData = {
    user_id: session.user.id,
    email: session.user.email,
    name: profile.name || session.user.email,
    role: profile.role,
    school_id: profile.school_id,
    school_name: schoolSettings?.name || 'School Master',
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token
    }
  };
  
  if (existingIndex > -1) {
    accounts[existingIndex] = accountData;
  } else {
    accounts.push(accountData);
  }
  localStorage.setItem('sp_accounts', JSON.stringify(accounts));
}

export function updateAccountTokens(userId, access_token, refresh_token) {
  const accounts = getSavedAccounts();
  const index = accounts.findIndex(a => a.user_id === userId);
  if (index > -1) {
    accounts[index].session = { access_token, refresh_token };
    localStorage.setItem('sp_accounts', JSON.stringify(accounts));
  }
}

export function removeAccount(userId) {
  const accounts = getSavedAccounts();
  const filtered = accounts.filter(a => a.user_id !== userId);
  localStorage.setItem('sp_accounts', JSON.stringify(filtered));
  return filtered;
}

export function clearActiveSessionLocally() {
  const tokenKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
  if (tokenKey) {
    localStorage.removeItem(tokenKey);
  }
}

export function logoutAndRemoveAccount(userId, navigate) {
  const list = removeAccount(userId);
  if (list.length > 0) {
    const target = list[0];
    (async () => {
      try {
        const { error } = await supabase.auth.setSession({
          access_token: target.session.access_token,
          refresh_token: target.session.refresh_token
        });
        if (error) throw error;
        navigate(target.role === 'platform_admin' ? '/platform-admin' : `/${target.role}`, { replace: true });
        window.location.reload();
      } catch (err) {
        logoutAndRemoveAccount(target.user_id, navigate);
      }
    })();
  } else {
    supabase.auth.signOut().catch(console.error);
    clearActiveSessionLocally();
    navigate('/login', { replace: true });
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }
}
