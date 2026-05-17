# 🔐 Biometric Login — Post-Deployment Setup Checklist

## Step 1 — Run the SQL Migration
In the **Supabase Dashboard → SQL Editor**, run:
```
database/v70_biometric_passkeys.sql
```
This creates the `user_passkeys` and `webauthn_challenges` tables with RLS.

---

## Step 2 — Set Edge Function Secrets
In **Supabase Dashboard → Edge Functions → Secrets**, add:

| Secret Key           | Value                                    |
|---------------------|------------------------------------------|
| `WEBAUTHN_RP_ID`    | `schoolpro-d95a8.web.app`               |
| `WEBAUTHN_RP_ORIGIN`| `https://schoolpro-d95a8.web.app`       |

> ⚠️ **WEBAUTHN_RP_ORIGIN must match exactly** what the browser reports as `window.location.origin`.
> For the Android APK, this is typically `https://schoolpro-d95a8.web.app` (your Firebase Hosting domain).
> For local dev, it would be `http://localhost:5173`.

---

## Step 3 — Get Your Android Keystore SHA-256 Fingerprint

Run the following command (replace `your-keystore.jks` and alias):
```bash
keytool -list -v -keystore android/app/your-keystore.jks -alias your-alias
```
Or if using Android Studio's debug keystore:
```bash
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```
Copy the **SHA-256** fingerprint (format: `AB:CD:EF:...`).

Then update `public/.well-known/assetlinks.json`:
```json
"sha256_cert_fingerprints": ["YOUR:ACTUAL:SHA256:HERE"]
```

---

## Step 4 — Deploy via CI/CD (Automatic)
The workflow `deploy-web.yml` now automatically deploys `webauthn-start` and `webauthn-verify` on every push to `main`. No manual deployment needed after this.

---

## Step 5 — Test
1. Log in normally with password first.
2. Go to **Settings → Biometric Login**.
3. Tap **"Enable on This Device"** — enter a device name → OS biometric prompt appears.
4. Log out.
5. On Login screen (Step 2), enter username → tap **"Login with Fingerprint / Face ID"**.

---

## Important Reminder
The `REPLACE_WITH_YOUR_RELEASE_KEYSTORE_SHA256_FINGERPRINT` placeholder in
`public/.well-known/assetlinks.json` **must be replaced** before testing on a physical
Android device. Without this, Android's Credential Manager will silently reject passkey creation.
The web/PWA flow does not need this file.
