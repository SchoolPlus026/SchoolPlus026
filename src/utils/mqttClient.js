/**
 * mqttClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency, lightweight MQTT v3.1.1 client over WebSockets.
 * Designed for 100% browser and Capacitor compatibility with zero npm overhead.
 * 
 * Features:
 *   - Auto-failover pool between public WebSocket brokers:
 *       1. wss://broker.hivemq.com:8884/mqtt
 *       2. wss://broker.emqx.io:8084/mqtt
 *   - Built-in automatic reconnect & ping keepalive (30s).
 *   - Full spec compliant MQTT variable byte length encoding/decoding.
 *   - QoS 0 publish and subscribe with binary UTF-8 packet encoding.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BROKER_POOL = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
];

/**
 * Encodes integer length into MQTT 3.1.1 variable-length byte array (1 to 4 bytes).
 */
function encodeVarLength(num) {
  const bytes = [];
  do {
    let digit = num % 128;
    num = Math.floor(num / 128);
    if (num > 0) {
      digit = digit | 0x80;
    }
    bytes.push(digit);
  } while (num > 0);
  return bytes;
}

/**
 * Decodes MQTT 3.1.1 variable-length byte array from Uint8Array at offset.
 */
function decodeVarLength(bytes, offset) {
  let value = 0;
  let multiplier = 1;
  let bytesRead = 0;
  let digit = 0;
  do {
    digit = bytes[offset + bytesRead];
    value += (digit & 127) * multiplier;
    multiplier *= 128;
    bytesRead++;
  } while ((digit & 128) !== 0 && bytesRead < 4);
  return { value, bytesRead };
}

class MqttWebSocketClient {
  constructor() {
    this.ws = null;
    this.brokerIndex = 0;
    this.clientId = 'sp_bus_' + Math.random().toString(36).substring(2, 10);
    this.isConnected = false;
    this.subscriptions = new Map(); // topic -> Set(callbacks)
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.isExplicitDisconnect = false;
    this.publishQueue = [];
    this.lwt = null; // { topic, payload, retain }
  }

  /**
   * Set or update Last Will & Testament (LWT) for abrupt disconnects.
   */
  setWill(topic, payload, retain = true) {
    this.lwt = topic ? { topic, payload, retain } : null;
  }

  clearWill() {
    this.lwt = null;
  }

  /**
   * Connect to the MQTT broker via WebSocket.
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return Promise.resolve();
    }

    this.isExplicitDisconnect = false;
    const url = BROKER_POOL[this.brokerIndex];
    console.log(`[MQTT] Connecting to broker [${this.brokerIndex + 1}/${BROKER_POOL.length}]: ${url}`);

    return new Promise((resolve, reject) => {
      let connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          console.warn('[MQTT] Connection attempt timed out.');
          this.handleFailover();
          reject(new Error('MQTT connection timeout'));
        }
      }, 10000);

      try {
        // Pass subprotocol 'mqtt' as required by MQTT over WebSocket spec
        this.ws = new WebSocket(url, 'mqtt');
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          console.log('[MQTT] WebSocket connected. Sending CONNECT packet...');
          this.sendConnectPacket();
        };

        this.ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            this.handleIncomingPacket(new Uint8Array(event.data), resolve);
          }
        };

        this.ws.onerror = (err) => {
          console.warn('[MQTT] WebSocket error:', err.message || err);
        };

        this.ws.onclose = () => {
          console.warn('[MQTT] WebSocket closed.');
          clearTimeout(connectionTimeout);
          this.cleanupTimers();
          this.isConnected = false;

          if (!this.isExplicitDisconnect) {
            this.handleFailover();
          }
        };
      } catch (err) {
        clearTimeout(connectionTimeout);
        console.error('[MQTT] Connection initialization failed:', err.message);
        this.handleFailover();
        reject(err);
      }
    });
  }

  /**
   * Failover to the next available MQTT broker in the pool.
   */
  handleFailover() {
    this.cleanup();
    if (this.isExplicitDisconnect) return;

    this.brokerIndex = (this.brokerIndex + 1) % BROKER_POOL.length;
    console.log(`[MQTT] Switching broker failover index to: ${this.brokerIndex}`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((e) => console.warn('[MQTT] Reconnect attempt failed:', e.message));
    }, 3000);
  }

  /**
   * Encode and send MQTT 3.1.1 CONNECT packet (0x10) with optional LWT
   */
  sendConnectPacket() {
    const encoder = new TextEncoder();
    const clientBytes = encoder.encode(this.clientId);
    
    // Connect Flags byte:
    // Bit 1: Clean Session (1) -> 0x02
    // Bit 2: Will Flag
    // Bit 3-4: Will QoS (00)
    // Bit 5: Will Retain
    let connectFlags = 0x02;
    let willTopicBytes = null;
    let willPayloadBytes = null;

    if (this.lwt && this.lwt.topic) {
      connectFlags |= (1 << 2); // Will Flag = 1
      if (this.lwt.retain) {
        connectFlags |= (1 << 5); // Will Retain = 1
      }
      willTopicBytes = encoder.encode(this.lwt.topic);
      const payloadStr = typeof this.lwt.payload === 'object' ? JSON.stringify(this.lwt.payload) : String(this.lwt.payload || '');
      willPayloadBytes = encoder.encode(payloadStr);
    }
    
    // Header: Protocol Name 'MQTT' (4 bytes), Level 4 (0x04), Connect Flags, Keep Alive 30s (0x00 0x1E)
    const varHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, connectFlags, 0x00, 0x1e];
    
    const clientLen = clientBytes.length;
    let payload = [ (clientLen >> 8) & 0xff, clientLen & 0xff, ...clientBytes ];

    // Append Will Topic and Will Message if Will Flag is set
    if (willTopicBytes && willPayloadBytes) {
      const wtLen = willTopicBytes.length;
      const wpLen = willPayloadBytes.length;
      payload.push((wtLen >> 8) & 0xff, wtLen & 0xff, ...willTopicBytes);
      payload.push((wpLen >> 8) & 0xff, wpLen & 0xff, ...willPayloadBytes);
    }

    const remainingLengthBytes = encodeVarLength(varHeader.length + payload.length);
    const packet = new Uint8Array([0x10, ...remainingLengthBytes, ...varHeader, ...payload]);

    this.ws.send(packet.buffer);
  }

  /**
   * Handle incoming binary MQTT packets.
   */
  handleIncomingPacket(bytes, connectResolve) {
    if (bytes.length === 0) return;
    const packetType = bytes[0] & 0xf0;

    // 0x20 = CONNACK
    if (packetType === 0x20) {
      const { bytesRead } = decodeVarLength(bytes, 1);
      const returnCode = bytes[1 + bytesRead + 1]; // header (1) + lengthBytes + ackFlags (1)
      if (returnCode === 0x00) {
        console.log('[MQTT] Connected successfully (CONNACK received). Client ID:', this.clientId);
        this.isConnected = true;
        this.startPingInterval();

        // Flush queued publish packets
        while (this.publishQueue.length > 0) {
          const queuedPacket = this.publishQueue.shift();
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(queuedPacket.buffer);
          }
        }

        // Re-subscribe to active topics
        this.resubscribeAll();
        if (connectResolve) connectResolve();
      } else {
        console.error('[MQTT] CONNACK rejected with code:', returnCode);
      }
    }
    // 0x30 = PUBLISH
    else if (packetType === 0x30) {
      this.parsePublishPacket(bytes);
    }
  }

  /**
   * Parse incoming PUBLISH packet (0x30) and notify topic subscribers.
   */
  parsePublishPacket(bytes) {
    // Header is byte 0, remaining length starts at byte 1
    const { bytesRead } = decodeVarLength(bytes, 1);
    let offset = 1 + bytesRead;
    
    // Read topic length (2 bytes)
    const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    // Read topic name string
    const decoder = new TextDecoder();
    const topic = decoder.decode(bytes.subarray(offset, offset + topicLen));
    offset += topicLen;

    // Remaining bytes are the payload
    const payload = decoder.decode(bytes.subarray(offset));
    
    // Dispatch to registered subscribers
    if (this.subscriptions.has(topic)) {
      const callbacks = this.subscriptions.get(topic);
      callbacks.forEach((cb) => {
        try {
          cb(payload, topic);
        } catch (e) {
          console.error('[MQTT] Error in subscriber callback:', e.message);
        }
      });
    }
  }

  /**
   * Publish a payload string to an MQTT topic with spec-compliant variable length encoding.
   * @param {string} topic
   * @param {string|Object} payload
   * @param {boolean} retain - If true, sets MQTT RETAIN flag (0x31)
   */
  async publish(topic, payload, retain = false) {
    if (!this.isConnected) {
      this.connect().catch(() => {});
    }

    const encoder = new TextEncoder();
    const topicBytes = encoder.encode(topic);
    const payloadBytes = encoder.encode(typeof payload === 'object' ? JSON.stringify(payload) : String(payload));

    const topicLen = topicBytes.length;
    const varHeader = [(topicLen >> 8) & 0xff, topicLen & 0xff, ...topicBytes];
    const totalRemaining = varHeader.length + payloadBytes.length;

    const remainingLengthBytes = encodeVarLength(totalRemaining);
    const fixedHeader = retain ? 0x31 : 0x30;
    const packet = new Uint8Array([fixedHeader, ...remainingLengthBytes, ...varHeader, ...payloadBytes]);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isConnected) {
      this.ws.send(packet.buffer);
    } else {
      this.publishQueue.push(packet);
    }
  }

  /**
   * Subscribe to an MQTT topic and register a message handler.
   */
  async subscribe(topic, callback) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic).add(callback);

    if (!this.isConnected) {
      await this.connect();
    }

    this.sendSubscribePacket(topic);
  }

  /**
   * Unsubscribe from an MQTT topic.
   */
  unsubscribe(topic, callback) {
    if (this.subscriptions.has(topic)) {
      const callbacks = this.subscriptions.get(topic);
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(topic);
      }
    }
  }

  /**
   * Send MQTT SUBSCRIBE packet (0x82) with variable length encoding.
   */
  sendSubscribePacket(topic) {
    const encoder = new TextEncoder();
    const topicBytes = encoder.encode(topic);
    const topicLen = topicBytes.length;

    // Header: Packet ID (2 bytes) + Topic Length (2 bytes) + Topic + Requested QoS (0x00)
    const packetId = [0x00, 0x01];
    const payload = [...packetId, (topicLen >> 8) & 0xff, topicLen & 0xff, ...topicBytes, 0x00];
    const remainingLengthBytes = encodeVarLength(payload.length);
    
    const packet = new Uint8Array([0x82, ...remainingLengthBytes, ...payload]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
    }
  }

  /**
   * Re-subscribe all active topics on connection recovery.
   */
  resubscribeAll() {
    this.subscriptions.forEach((_, topic) => {
      this.sendSubscribePacket(topic);
    });
  }

  /**
   * Send PINGREQ (0xC0 0x00) keepalive.
   */
  startPingInterval() {
    this.cleanupTimers();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(new Uint8Array([0xc0, 0x00]).buffer);
      }
    }, 30000);
  }

  cleanupTimers() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  cleanup() {
    this.cleanupTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  disconnect() {
    this.isExplicitDisconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(new Uint8Array([0xe0, 0x00]).buffer);
    }
    this.cleanup();
  }
}

// Singleton instance export
export const mqttClient = new MqttWebSocketClient();
export default mqttClient;
