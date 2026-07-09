/**
 * secureStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure storage manager using browser's native Web Crypto API and IndexedDB.
 * Generates and stores a non-extractable AES-GCM 256-bit key in IndexedDB.
 * Since the key's raw bytes cannot be exported or read by Javascript,
 * this protects localStorage authentication tokens from remote XSS exfiltration.
 */

const DB_NAME = 'sp_secure_store';
const STORE_NAME = 'keys';
const KEY_ALIAS = 'sp_master_key';

let cachedKey = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOrCreateKey() {
  if (cachedKey) return cachedKey;
  
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(KEY_ALIAS);
      
      getReq.onsuccess = async () => {
        if (getReq.result) {
          cachedKey = getReq.result;
          resolve(cachedKey);
        } else {
          try {
            const newKey = await window.crypto.subtle.generateKey(
              { name: 'AES-GCM', length: 256 },
              false, // extractable = false (CRITICAL: cannot be exported or read by XSS)
              ['encrypt', 'decrypt']
            );
            const putReq = store.put(newKey, KEY_ALIAS);
            putReq.onsuccess = () => {
              cachedKey = newKey;
              resolve(cachedKey);
            };
            putReq.onerror = () => reject(putReq.error);
          } catch (genErr) {
            reject(genErr);
          }
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[SecureStorage] IndexedDB not available, falling back to temporary in-memory session key:', err.message);
    if (!globalThis.__sp_temp_key) {
      globalThis.__sp_temp_key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable = true for memory fallback
        ['encrypt', 'decrypt']
      );
    }
    return globalThis.__sp_temp_key;
  }
}

/**
 * Encrypts a plaintext string into a Base64 encoded AES-GCM ciphertext payload
 */
export async function encryptData(plaintext) {
  if (!plaintext) return '';
  try {
    const key = await getOrCreateKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);
    
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );
    
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('[SecureStorage] Encryption failed:', err.message);
    throw err;
  }
}

/**
 * Decrypts a Base64 encoded AES-GCM ciphertext payload back to plaintext
 */
export async function decryptData(ciphertextBase64) {
  if (!ciphertextBase64) return '';
  try {
    const key = await getOrCreateKey();
    const binary = atob(ciphertextBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    if (bytes.length < 12) {
      throw new Error('Invalid cipher payload length');
    }
    
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('[SecureStorage] Decryption failed:', err.message);
    throw err;
  }
}

/**
 * Custom secure storage provider for Supabase client auth
 */
export const secureSupabaseStorage = {
  async getItem(key) {
    const rawVal = localStorage.getItem(key);
    if (!rawVal) return null;
    try {
      return await decryptData(rawVal);
    } catch (err) {
      console.warn(`[SecureStorage] Failed to decrypt ${key}, clearing value...`, err.message);
      localStorage.removeItem(key);
      return null;
    }
  },
  async setItem(key, value) {
    try {
      const encrypted = await encryptData(value);
      localStorage.setItem(key, encrypted);
    } catch (err) {
      console.error(`[SecureStorage] Failed to encrypt ${key}`, err.message);
    }
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  }
};
