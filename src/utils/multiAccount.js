import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { encryptData, decryptData } from './secureStorage';

/**
 * Retrieves the saved accounts list from localStorage, decrypting it securely.
 * Automatically performs self-healing migration if plain text legacy data is detected.
 */
export async function getSavedAccounts() {
  const rawData = localStorage.getItem('sp_accounts');
  if (!rawData) return [];
  
  try {
    const decrypted = await decryptData(rawData);
    return JSON.parse(decrypted || '[]');
  } catch (e) {
    // Self-healing fallback: check if it is legacy plain-text JSON
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) {
        console.log('[MultiAccount] Legacy plain-text accounts list found. Migrating to encrypted storage...');
        // Immediately encrypt and save to transition to secure state
        const encrypted = await encryptData(rawData);
        localStorage.setItem('sp_accounts', encrypted);
        return parsed;
      }
    } catch (_) {}
    
    console.warn('[MultiAccount] Failed to decrypt or parse saved accounts, resetting list.');
    return [];
  }
}

export async function saveAccount(session, profile, schoolSettings) {
  if (!session || !profile) return;
  const accounts = await getSavedAccounts();
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
  
  try {
    const encrypted = await encryptData(JSON.stringify(accounts));
    localStorage.setItem('sp_accounts', encrypted);
  } catch (err) {
    console.error('[MultiAccount] Failed to save encrypted accounts:', err.message);
  }
}

export async function updateAccountTokens(userId, access_token, refresh_token) {
  const accounts = await getSavedAccounts();
  const index = accounts.findIndex(a => a.user_id === userId);
  if (index > -1) {
    accounts[index].session = { access_token, refresh_token };
    try {
      const encrypted = await encryptData(JSON.stringify(accounts));
      localStorage.setItem('sp_accounts', encrypted);
    } catch (err) {
      console.error('[MultiAccount] Failed to update encrypted account tokens:', err.message);
    }
  }
}

export async function removeAccount(userId) {
  const accounts = await getSavedAccounts();
  const filtered = accounts.filter(a => a.user_id !== userId);
  try {
    const encrypted = await encryptData(JSON.stringify(filtered));
    localStorage.setItem('sp_accounts', encrypted);
  } catch (err) {
    console.error('[MultiAccount] Failed to save accounts list after removal:', err.message);
  }
  return filtered;
}

export function clearActiveSessionLocally() {
  const tokenKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
  if (tokenKey) {
    localStorage.removeItem(tokenKey);
  }
  try {
    useAppStore.getState().clearSession();
  } catch (e) {
    console.error("Zustand clearSession failed:", e);
  }
}

export async function logoutAndRemoveAccount(userId, navigate) {
  const list = await removeAccount(userId);
  if (list.length > 0) {
    const target = list[0];
    try {
      const { error } = await supabase.auth.setSession({
        access_token: target.session.access_token,
        refresh_token: target.session.refresh_token
      });
      if (error) throw error;
      navigate(target.role === 'platform_admin' ? '/platform-admin' : `/${target.role}`, { replace: true });
      window.location.reload();
    } catch (err) {
      await logoutAndRemoveAccount(target.user_id, navigate);
    }
  } else {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error(err);
    }
    clearActiveSessionLocally();
    navigate('/login', { replace: true });
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }
}

