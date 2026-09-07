/* ===================================================================
   Duplicate incident detection
   Compares a candidate report against recent open incidents using:
     - same emergency category (type)
     - geographical proximity (radius km)
     - time window (minutes)
   Returns candidate duplicates for admin review — never auto-deletes.
   =================================================================== */

const Report = require('../models/Report');

const DUP_RADIUS_KM = 1.5;     // incidents within 1.5 km
const DUP_TIME_MINUTES = 90;   // reported within the last 90 minutes

/**
 * Find possible duplicates for a candidate report.
 * @param {Object} candidate { type, lat, lng } (lat/lng may be null)
 * @param {String|null} excludeId report id to exclude (when editing)
 */
async function findPossibleDuplicates(candidate, excludeId = null) {
  const since = new Date(Date.now() - DUP_TIME_MINUTES * 60000);

  const openStatuses = ['REPORTED', 'VERIFIED', 'PRIORITIZED', 'ASSIGNED', 'DISPATCHED', 'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED'];

  const query = {
    type: candidate.type,
    status: { $in: openStatuses },
    createdAt: { $gte: since }
  };
  if (excludeId) query._id = { $ne: excludeId };
  if (candidate.lat !== null && candidate.lat !== undefined && candidate.lng !== null && candidate.lng !== undefined) {
    // Bounding-box prefilter (cheap); precise km check below
    const latDelta = DUP_RADIUS_KM / 111;
    const lngDelta = DUP_RADIUS_KM / (111 * Math.max(0.2, Math.cos(candidate.lat * Math.PI / 180)));
    query['location.lat'] = { $gte: candidate.lat - latDelta, $lte: candidate.lat + latDelta };
    query['location.lng'] = { $gte: candidate.lng - lngDelta, $lte: candidate.lng + lngDelta };
  }

  const candidates = await Report.find(query)
    .select('type title status location severity priority createdAt user')
    .populate('user', 'name')
    .limit(10)
    .lean();

  return candidates;
}

/**
 * Distance in km between candidate and an existing report (null-safe).
 */
function distanceBetween(candidate, report) {
  if (candidate.lat == null || candidate.lng == null || report.location?.lat == null || report.location?.lng == null) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(report.location.lat - candidate.lat);
  const dLng = toRad(report.location.lng - candidate.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(candidate.lat)) * Math.cos(toRad(report.location.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

module.exports = { findPossibleDuplicates, distanceBetween, DUP_RADIUS_KM, DUP_TIME_MINUTES };
