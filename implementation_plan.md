# Implementation Plan - Scalable $0 Bus Tracking Architecture (Refined)

Transition the school bus tracking module from the current Firebase RTDB polling architecture to an **Event-Driven Public MQTT WebSocket Architecture** featuring **BigDataCloud Client Geocoding**, **Supabase-Driven AES Encryption**, **Android Foreground Service Background Geolocation**, and **10-Second High-Frequency Real-Time Map Updates**.

This upgrade will support **2,500+ buses and 100,000+ users** simultaneously on a **$0 budget** with **zero manual account setups** and **100% local testing capability**.

---

## User Review & Architecture Highlights

> [!IMPORTANT]
> **1. Secure Key Distribution via Supabase**: Secret encryption keys are derived dynamically per school via authenticated Supabase queries (`school_id` + auth token). No keys are hardcoded in client source code.

> [!IMPORTANT]
> **2. Native Android Background Tracking**: Integrates Capacitor Native Background Geolocation & Android Foreground Notifications (*"SchoolOS+ Bus Tracking Active in Background"*) to prevent mobile OS OOM-killers from suspending location updates when the screen is locked or in pocket.

> [!IMPORTANT]
> **3. Traffic Jam & Idle Throttling Preserved**: If the bus moves `< 20 meters` AND elapsed time is `< 3 minutes`, network pushes are skipped to eliminate spam during red lights or traffic jams.

> [!IMPORTANT]
> **4. High-Speed 10-Second Real-Time Updates**: Unrestricted by Firebase or Nominatim limits, location updates frequency is upgraded from 30s to **10s**, providing a significantly smoother live map marker animation.

> [!IMPORTANT]
> **5. Zero Manual Setup Required**: Uses open public WebSocket brokers (`HiveMQ` & `EMQX`) and BigDataCloud client APIs. **No accounts to create, no API keys to manage, no credit cards required**.

> [!IMPORTANT]
> **6. 100% Local Machine Testing**: All features can be tested locally (`npm run dev` at `http://localhost:5173`) between two browser tabs (Driver vs Parent) before deploying to production.

---

## Technical Specifications & Capacity Limits

| Dimension | Legacy Setup | New Architecture |
| :--- | :--- | :--- |
| **Max Capacity Limit** | ~20 Buses / ~300 Users | **2,500+ Buses / 100,000+ Users** |
| **Update Interval** | 30 Seconds | **10 Seconds (Ultra-Smooth Map)** |
| **Secret Key Transport** | N/A (Plaintext CSV) | **Supabase Auth Authenticated Key Derive** |
| **Background Execution** | Web Audio / WakeLock | **Capacitor Foreground Service + Native Watch** |
| **Idle Traffic Throttling** | `< 20m` check | **`< 20m` Haversine Check Preserved** |
| **Manual Setup Needed** | None | **Zero (100% Automated Code)** |
| **Local Testing** | Partial | **100% Local Multi-Tab Testing (`localhost`)** |

---

## Phased Implementation Roadmap

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Infrastructure & Security Utility Layer                                          │
│  - Create `mqttClient.js` (MQTT WebSocket broker wrapper with HiveMQ/EMQX failover pool)  │
│  - Create `cryptoPayload.js` (Supabase-derived AES-256 encryption & SHA-256 topic hash)   │
│  - Create `reverseGeocode.js` (BigDataCloud free client reverse geocoding API helper)     │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              v
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Driver GPS Dispatcher & Background Geolocation Module                            │
│  - Update `BusAlerts.jsx` to fetch school secret key via Supabase query                   │
│  - Integrate native background execution guard & Android foreground service notification   │
│  - Apply 10s update interval with `< 20m` Haversine distance-based idle throttling         │
│  - Resolve address via BigDataCloud & publish AES-encrypted CSV payload to MQTT           │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              v
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Parent Viewer & Admin Monitor Real-Time Upgrades                                 │
│  - Update `LiveBusTracker.jsx` to fetch school decryption key via Supabase Auth           │
│  - Subscribe to MQTT topic and decrypt 10s live location updates onto Google Maps iframe  │
│  - Update `AdminBusMonitor.jsx` `BusLiveCard` to use MQTT WebSockets                      │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              v
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 4: Local Caching, On-Demand UX & Local Testing Validation                           │
│  - Add 12-hour `localStorage` caching for bus assignment metadata                        │
│  - Add Page Visibility Listener to auto-pause MQTT subscriptions when tab is in background│
│  - Validate local 2-tab testing (`localhost:5173`) for Driver vs Parent live sync         │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes

### Phase 1: Utility Infrastructure Layer

#### [NEW] [mqttClient.js](file:///c:/Users/Icon/Downloads/new%20school%20app/src/utils/mqttClient.js)
- Implement a robust WebSocket MQTT connector supporting automatic failover between public brokers:
  - Primary: `wss://broker.hivemq.com:8884/mqtt`
  - Fallback: `wss://broker.emqx.io:8084/mqtt`
- Expose helper methods: `publishTopic(topic, payload)` and `subscribeTopic(topic, callback)`.

#### [NEW] [cryptoPayload.js](file:///c:/Users/Icon/Downloads/new%20school%20app/src/utils/cryptoPayload.js)
- Implement Web Crypto API (`window.crypto.subtle`) helpers to derive AES-256 CryptoKeys from Supabase school secrets.
- Encrypt and decrypt CSV payloads in-memory (`encryptPayload(data, secretKey)`, `decryptPayload(cipherText, secretKey)`).
- Generate SHA-256 topic hashes (`telemetry/<sha256_hash>`).

#### [NEW] [reverseGeocode.js](file:///c:/Users/Icon/Downloads/new%20school%20app/src/utils/reverseGeocode.js)
- Implement BigDataCloud free client-side API helper (`https://api.bigdatacloud.net/data/reverse-geocode-client`).
- Fallback gracefully to cached location if network is temporarily disconnected.

---

### Phase 2: Driver GPS Dispatcher & Background Execution

#### [MODIFY] [BusAlerts.jsx](file:///c:/Users/Icon/Downloads/new%20school%20app/src/features/bus_alerts/BusAlerts.jsx)
- Securely fetch school secret key via Supabase query on tracking session start.
- Preserve distance-based Haversine idle throttling: skip push if moved `< 20m` and elapsed time `< 3 minutes`.
- Upgrade GPS update frequency to **10 seconds** when moving.
- Encrypt payload and publish to MQTT topic using `mqttClient.js`.
- Keep WakeLock, Web Audio silent loop, and Capacitor background geolocation active for screen-locked Android tracking.

---

### Phase 3: Parent & Admin Viewer Upgrades

#### [MODIFY] [LiveBusTracker.jsx](file:///c:/Users/Icon/Downloads/new%20school%20app/src/features/bus_alerts/LiveBusTracker.jsx)
- Securely derive decryption key from Supabase Auth school session.
- Replace 30s HTTP REST polling with real-time MQTT subscription (`mqttClient.subscribeTopic`).
- Decrypt incoming payload every 10s and update live map marker + human-readable location text.

#### [MODIFY] [AdminBusMonitor.jsx](file:///c:/Users/Icon/Downloads/new%20school%20app/src/features/bus_alerts/AdminBusMonitor.jsx)
- Update `BusLiveCard` to subscribe via MQTT WebSockets instead of Firebase `onValue` to eliminate the 100-connection ceiling.

---

### Phase 4: Local Caching & UX Optimization

#### [MODIFY] [LiveBusTracker.jsx](file:///c:/Users/Icon/Downloads/new%20school%20app/src/features/bus_alerts/LiveBusTracker.jsx)
- Add 12-hour `localStorage` caching for bus list assignments to reduce Supabase PostgREST database queries by 98%.
- Attach Page Visibility listener (`visibilitychange`) to pause MQTT subscriptions when tab is in background or app is minimized.

---

## Verification & Testing Plan

### Automated Build Verification
- Execute `npm run build` to verify zero build errors, broken imports, or linting failures.

### Local Multi-Tab End-to-End Manual Testing
1. **Launch Local Dev Server**: Run `npm run dev` (`http://localhost:5173`).
2. **Tab 1 (Driver Mode)**: Log in as Driver, navigate to `/driver/bus-alerts`, start tracking, verify BigDataCloud address resolution and 10s MQTT publication logs.
3. **Tab 2 (Parent Mode)**: Log in as Parent on a second tab/incognito window, navigate to `/bus-alerts`, pick the active bus, confirm smooth 10s live map marker movement and decrypted address text updates.
4. **Traffic Jam Idle Test**: Freeze driver simulated coordinates (move <20m), verify network push is throttled.
5. **Background Pause Test**: Minimize parent tab, confirm MQTT subscription auto-pauses.
