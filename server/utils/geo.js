/* ===================================================================
   Geo utilities — distance calculations for responder recommendation
   and hotspot analysis. Pure functions, no DB access.
   =================================================================== */

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance between two points in kilometers.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v === null || v === undefined || isNaN(v))) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/**
 * Build a GeoJSON Point from lat/lng (or null when coordinates missing).
 */
function toGeoPoint(lat, lng) {
  if (lat === null || lng === null || lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return undefined;
  }
  return { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
}

/**
 * SLA windows (minutes) per priority for verification/dispatch/resolution.
 */
const SLA_MINUTES = {
  CRITICAL: { verify: 10, dispatch: 15, resolve: 120 },
  HIGH:     { verify: 20, dispatch: 30, resolve: 240 },
  MEDIUM:   { verify: 60, dispatch: 120, resolve: 1440 },
  LOW:      { verify: 240, dispatch: 480, resolve: 4320 }
};

function slaMinutes(priority) {
  return SLA_MINUTES[priority] || SLA_MINUTES.MEDIUM;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

module.exports = { haversineKm, toGeoPoint, slaMinutes, addMinutes, SLA_MINUTES };
