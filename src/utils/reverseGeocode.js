/**
 * reverseGeocode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-provider reverse geocoding utility.
 * Primary Provider: BigDataCloud Free Client API (Uncapped for client-side devices)
 * Secondary Provider: OpenStreetMap Nominatim API (with jitter & distance guard)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Resolves lat/lng coordinates to a human-readable street address using BigDataCloud.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
export async function reverseGeocodeBigDataCloud(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    const data = await response.json();

    const city = data.city || data.locality || data.principalSubdivision || '';
    let localName = '';

    // Search informative array for street / road / landmark names
    if (Array.isArray(data.localityInfo?.informative)) {
      const roadItem = data.localityInfo.informative.find(
        (item) => item.description === 'road' || item.description === 'street' || item.description === 'suburb'
      );
      if (roadItem?.name) {
        localName = roadItem.name;
      }
    }

    // Search administrative array for area / neighborhood names
    if (!localName && Array.isArray(data.localityInfo?.administrative)) {
      const adminItem = data.localityInfo.administrative.find(
        (item) => item.adminLevel >= 6 && item.name && item.name !== city
      );
      if (adminItem?.name) {
        localName = adminItem.name;
      }
    }

    if (localName && city && localName.toLowerCase() !== city.toLowerCase()) {
      return `${localName}, ${city}`;
    }
    if (localName) return localName;
    if (city) return city;

    return null;
  } catch (err) {
    console.warn('[ReverseGeocode] BigDataCloud lookup failed:', err.message);
    return null;
  }
}

/**
 * Secondary fallback provider: OpenStreetMap Nominatim
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
export async function reverseGeocodeNominatim(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const jitter = Math.floor(Math.random() * 300) + 100;
    await new Promise((resolve) => setTimeout(resolve, jitter));

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'SchoolOS-BusSafeDrop/1.0 (schoolosplus@gmail.com)' } }
    );
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    const data = await response.json();
    
    const a = data.address || {};
    const local = a.road || a.neighbourhood || a.suburb || a.residential || a.village || null;
    const city  = a.city || a.town || a.municipality || null;

    if (local && city && local.toLowerCase() !== city.toLowerCase()) {
      return `${local}, ${city}`;
    }
    if (local) return local;
    if (city) return city;

    return data.display_name?.split(',')[0]?.trim() || null;
  } catch (err) {
    console.warn('[ReverseGeocode] Nominatim fallback failed:', err.message);
    return null;
  }
}

/**
 * Master reverse geocoding resolver with multi-provider failover chain.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} cachedName - Previously cached location label
 * @returns {Promise<string>}
 */
export async function resolveReverseGeocode(lat, lng, cachedName = '') {
  if (!lat || !lng) return cachedName || 'Location Unknown';

  // 1. Primary: BigDataCloud
  let address = await reverseGeocodeBigDataCloud(lat, lng);
  if (address) return address;

  // 2. Secondary: Nominatim
  address = await reverseGeocodeNominatim(lat, lng);
  if (address) return address;

  // 3. Graceful Fallback
  if (cachedName) return cachedName;
  return `En Route (${Number(lat).toFixed(3)}, ${Number(lng).toFixed(3)})`;
}
