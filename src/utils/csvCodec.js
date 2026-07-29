/**
 * csvCodec.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Codec utility to compress and decompress live bus tracking payloads
 * into compact CSV strings.
 * 
 * Order of fields:
 *   lat,lng,statusCode,timestamp,locationName,busNumber,driverName
 */

/**
 * Encodes tracking payload into a compact CSV string (~80 bytes).
 * Status codes:
 *   '1' = 'en_route'
 *   '2' = 'trip_ended'
 *   '0' = other
 *
 * @param {Object} payload
 * @returns {string}
 */
export function encodeBusCSV({ lat, lng, status, last_updated_ts, location_name, bus_number, driver_name }) {
  const statusCode = status === 'en_route' ? '1' : status === 'trip_ended' ? '2' : status === 'signal_lost' ? '3' : '0';
  
  // Replace commas with semicolons to avoid CSV split issues
  const safeLocation = (location_name || '').replace(/,/g, ';');
  const safeBus      = (bus_number || '').replace(/,/g, ';');
  const safeDriver   = (driver_name || '').replace(/,/g, ';');

  return [
    lat,
    lng,
    statusCode,
    last_updated_ts,
    safeLocation,
    safeBus,
    safeDriver
  ].join(',');
}

/**
 * Decodes a CSV string back into a tracking payload object.
 * Supports legacy JSON object fallbacks.
 *
 * @param {string|Object} val
 * @returns {Object|null}
 */
export function decodeBusCSV(val) {
  if (!val) return null;
  
  // Fallback for legacy JSON objects
  if (typeof val !== 'string') {
    return val;
  }

  const parts = val.split(',');
  if (parts.length < 4) return null;

  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  const statusCode = parts[2];
  const last_updated_ts = parseInt(parts[3], 10);
  
  const location_name = parts[4] ? parts[4].replace(/;/g, ',') : '';
  const bus_number    = parts[5] ? parts[5].replace(/;/g, ',') : '';
  const driver_name    = parts[6] ? parts[6].replace(/;/g, ',') : '';

  const status = statusCode === '1' ? 'en_route' : statusCode === '2' ? 'trip_ended' : statusCode === '3' ? 'signal_lost' : 'inactive';

  return {
    lat,
    lng,
    status,
    last_updated_ts,
    location_name,
    bus_number,
    driver_name
  };
}
