/**
 * webauthnWeb.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standard browser WebAuthn helper for registering and authenticating Passkeys
 * on Web/PWA platforms (iOS Safari, Android Chrome, etc.).
 * Converts base64url strings from Edge Functions into binary buffers and back.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function base64urlToArrayBuffer(base64url) {
  if (!base64url) return new ArrayBuffer(0);
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function arrayBufferToBase64url(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Registers a new Passkey credential on the browser.
 */
export async function registerWebAuthnWeb(options) {
  const publicKey = { ...options };
  
  // Convert challenge
  if (typeof publicKey.challenge === 'string') {
    publicKey.challenge = base64urlToArrayBuffer(publicKey.challenge);
  }
  
  // Convert user.id
  if (publicKey.user && typeof publicKey.user.id === 'string') {
    publicKey.user.id = base64urlToArrayBuffer(publicKey.user.id);
  }
  
  // Convert excludeCredentials
  if (publicKey.excludeCredentials) {
    publicKey.excludeCredentials = publicKey.excludeCredentials.map(cred => ({
      ...cred,
      id: typeof cred.id === 'string' ? base64urlToArrayBuffer(cred.id) : cred.id
    }));
  }

  const credential = await navigator.credentials.create({ publicKey });
  
  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
      clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
      transports: credential.response.getTransports ? credential.response.getTransports() : ['internal']
    }
  };
}

/**
 * Authenticates an existing Passkey credential on the browser.
 */
export async function authenticateWebAuthnWeb(options) {
  const publicKey = { ...options };
  
  // Convert challenge
  if (typeof publicKey.challenge === 'string') {
    publicKey.challenge = base64urlToArrayBuffer(publicKey.challenge);
  }

  // Convert allowCredentials
  if (publicKey.allowCredentials) {
    publicKey.allowCredentials = publicKey.allowCredentials.map(cred => ({
      ...cred,
      id: typeof cred.id === 'string' ? base64urlToArrayBuffer(cred.id) : cred.id
    }));
  }

  const assertion = await navigator.credentials.get({ publicKey });

  return {
    id: assertion.id,
    rawId: arrayBufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: arrayBufferToBase64url(assertion.response.authenticatorData),
      clientDataJSON: arrayBufferToBase64url(assertion.response.clientDataJSON),
      signature: arrayBufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle ? arrayBufferToBase64url(assertion.response.userHandle) : null
    }
  };
}
