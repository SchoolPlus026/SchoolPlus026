/**
 * cryptoPayload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Native Web Crypto API (window.crypto.subtle) security utility.
 * Handles AES-256-GCM client-side payload encryption/decryption and SHA-256
 * topic obfuscation with ZERO external dependencies or npm packages.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Derives a deterministic 256-bit AES-GCM CryptoKey from a secret key string.
 *
 * @param {string} secretKeyString - School secret key (from Supabase auth context)
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(secretKeyString) {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secretKeyString || 'schoolos_bus_default_secret');
  
  // Hash the secret string to get a clean 256-bit (32-byte) key buffer
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', keyBytes);

  return window.crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a payload string using AES-256-GCM.
 *
 * @param {string} payloadText - Raw CSV string payload
 * @param {string} secretKeyString - School secret key
 * @returns {Promise<string>} Base64-encoded ciphertext with prepended IV
 */
export async function encryptPayload(payloadText, secretKeyString) {
  if (!payloadText) return '';
  try {
    const key = await deriveKey(secretKeyString);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12-byte random IV
    const encoder = new TextEncoder();
    const encodedPayload = encoder.encode(payloadText);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedPayload
    );

    // Combine 12-byte IV + Ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Convert Uint8Array to Base64
    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('[CryptoPayload] Encryption failed:', err.message);
    return payloadText; // Graceful fallback
  }
}

/**
 * Decrypts an AES-256-GCM base64 ciphertext payload.
 *
 * @param {string} cipherBase64 - Base64-encoded encrypted payload
 * @param {string} secretKeyString - School secret key
 * @returns {Promise<string>} Decrypted plaintext payload string
 */
export async function decryptPayload(cipherBase64, secretKeyString) {
  if (!cipherBase64) return null;
  
  // If payload is plaintext CSV (contains comma), return as-is
  if (cipherBase64.includes(',')) {
    return cipherBase64;
  }

  try {
    const binary = atob(cipherBase64);
    const len = binary.length;
    const combined = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    if (combined.length < 13) return cipherBase64; // Invalid format fallback

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await deriveKey(secretKeyString);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.warn('[CryptoPayload] Decryption failed (may be legacy plaintext):', err.message);
    return cipherBase64; // Fallback to raw string
  }
}

/**
 * Obfuscates public MQTT channel names using SHA-256 topic hashing.
 * Output format: `telemetry/<sha256_hex_hash>`
 *
 * @param {string} schoolId
 * @param {string|number} busNumber
 * @returns {Promise<string>}
 */
export async function hashTopic(schoolId, busNumber) {
  const normalizedBus = String(busNumber || '').trim().toLowerCase().replace(/\s+/g, '_');
  const rawString = `schoolos:${schoolId || 'default'}:bus_${normalizedBus}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(rawString);

  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `telemetry/${hexHash.substring(0, 32)}`;
}
