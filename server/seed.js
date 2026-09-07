/* ===================================================================
   Seed Script — Full demo dataset for the Emergency Alert System
   Creates: admin, citizens, responders (with profiles), reports across
   the full lifecycle, notifications, feedback, and audit logs.
   Run: node seed.js
   =================================================================== */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Report = require('./models/Report');
const Responder = require('./models/Responder');
const Notification = require('./models/Notification');
const Feedback = require('./models/Feedback');
const AuditLog = require('./models/AuditLog');
const { computePriority } = require('./utils/priority');
const { toGeoPoint, addMinutes, slaMinutes } = require('./utils/geo');
const { toLegacyStatus } = require('./utils/lifecycle');

const ADMIN = { name: 'Control Room Admin', email: 'admin@emergency.com', password: 'admin123', phone: '+91 9999999999', role: 'admin' };
const CITIZENS = [
  { name: 'Test User', email: 'user@test.com', password: 'user123', phone: '+91 8888888888', role: 'user' },
  { name: 'Priya Sharma', email: 'priya@test.com', password: 'user123', phone: '+91 8888888881', role: 'user' },
  { name: 'Rahul Verma', email: 'rahul@test.com', password: 'user123', phone: '+91 8888888882', role: 'user' }
];
const RESPONDERS = [
  { name: 'Amit Kumar', email: 'responder1@test.com', password: 'responder123', phone: '+91 7777777771', specialization: 'Medical', zone: 'North Zone' },
  { name: 'Sunita Devi', email: 'responder2@test.com', password: 'responder123', phone: '+91 7777777772', specialization: 'Fire', zone: 'Central Zone' },
  { name: 'Vikram Singh', email: 'responder3@test.com', password: 'responder123', phone: '+91 7777777773', specialization: 'Police', zone: 'South Zone' },
  { name: 'Kavita Joshi', email: 'responder4@test.com', password: 'responder123', phone: '+91 7777777774', specialization: 'Disaster', zone: 'East Zone' },
  { name: 'Ravi Patel', email: 'responder5@test.com', password: 'responder123', phone: '+91 7777777775', specialization: 'General', zone: 'West Zone' }
];

// Demo incidents around a city center (adjust to your city)
const CITY = { lat: 28.6139, lng: 77.2090 }; // New Delhi

const REPORTS = [
  {
    citizenIdx: 0, type: 'fire', severity: 'critical', title: 'Building fire in commercial complex',
    description: 'Large fire spreading on the 3rd floor of a shopping complex. Smoke visible from far away, people possibly trapped inside.',
    address: 'Connaught Place, Block C, New Delhi', lat: CITY.lat + 0.005, lng: CITY.lng + 0.004,
    affectedPeople: 25, status: 'DISPATCHED', minutesAgo: 35,
    responderIdx: 1, timeline: ['REPORT_CREATED', 'REPORT_VERIFIED', 'RESPONDER_ASSIGNED', 'DISPATCHED']
  },
  {
    citizenIdx: 1, type: 'medical', severity: 'critical', title: 'Road accident with serious injuries',
    description: 'Two-wheeler collided with a car near the intersection. One person unconscious and bleeding heavily. Urgent medical help needed.',
    address: 'Ring Road, near AIIMS, New Delhi', lat: CITY.lat - 0.008, lng: CITY.lng - 0.003,
    affectedPeople: 2, status: 'RESPONDER_ACCEPTED', minutesAgo: 20,
    responderIdx: 0, timeline: ['REPORT_CREATED', 'REPORT_VERIFIED', 'RESPONDER_ASSIGNED', 'DISPATCHED', 'RESPONDER_ACCEPTED']
  },
  {
    citizenIdx: 2, type: 'crime', severity: 'high', title: 'Suspicious armed person near school',
    description: 'A person carrying what appears to be a weapon loitering near the school gate during dismissal time. Children are scared.',
    address: 'Govt. Senior Secondary School, Lajpat Nagar', lat: CITY.lat + 0.012, lng: CITY.lng - 0.010,
    affectedPeople: 0, status: 'VERIFIED', minutesAgo: 12, timeline: ['REPORT_CREATED', 'REPORT_VERIFIED']
  },
  {
    citizenIdx: 0, type: 'natural_disaster', severity: 'high', title: 'Flooding in low-lying colony',
    description: 'Drain overflow has flooded streets up to knee height. Water entering ground-floor homes. Elderly residents need evacuation.',
    address: 'Yamuna Bazar, Kashmere Gate', lat: CITY.lat + 0.020, lng: CITY.lng + 0.015,
    affectedPeople: 40, status: 'REPORTED', minutesAgo: 8, timeline: ['REPORT_CREATED']
  },
  {
    citizenIdx: 1, type: 'accident', severity: 'medium', title: 'Minor car collision, traffic blocked',
    description: 'Two cars collided at the signal, no serious injuries but vehicles blocking one lane. Traffic building up.',
    address: 'India Gate Circle, New Delhi', lat: CITY.lat - 0.004, lng: CITY.lng + 0.008,
    affectedPeople: 0, status: 'RESOLVED', minutesAgo: 300,
    responderIdx: 4, timeline: ['REPORT_CREATED', 'REPORT_VERIFIED', 'RESPONDER_ASSIGNED', 'DISPATCHED', 'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED', 'RESOLVED'],
    feedback: { rating: 5, comment: 'Very quick response, area cleared in under an hour. Excellent work!' }
  },
  {
    citizenIdx: 2, type: 'other', severity: 'low', title: 'Broken streetlight on dark stretch',
    description: 'Three consecutive streetlights not working on this road. Very unsafe for pedestrians at night.',
    address: 'Hauz Khas Village lane 4', lat: CITY.lat - 0.025, lng: CITY.lng - 0.018,
    affectedPeople: 0, status: 'CLOSED', minutesAgo: 4320,
    responderIdx: 4, timeline: ['REPORT_CREATED', 'REPORT_VERIFIED', 'RESPONDER_ASSIGNED', 'DISPATCHED', 'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED', 'RESOLVED', 'CLOSED'],
    feedback: { rating: 4, comment: 'Fixed the next day. Good follow-up.' }
  },
  {
    citizenIdx: 1, type: 'fire', severity: 'critical', title: 'Building fire in commercial complex (duplicate)',
    description: 'Huge fire at the shopping complex, smoke everywhere. Please send fire brigade immediately!',
    address: 'Connaught Place, Block C entrance', lat: CITY.lat + 0.0052, lng: CITY.lng + 0.0041,
    affectedPeople: 25, status: 'REPORTED', minutesAgo: 30, timeline: ['REPORT_CREATED'],
    duplicateOfIdx: 0
  },
  {
    citizenIdx: 2, type: 'medical', severity: 'high', title: 'Elderly man collapsed in park',
    description: 'An elderly man collapsed while walking in the park. He is conscious but weak and cannot get up.',
    address: 'Lodhi Garden, near gate 2', lat: CITY.lat - 0.010, lng: CITY.lng + 0.012,
    affectedPeople: 1, status: 'ASSIGNED', minutesAgo: 45,
    responderIdx: 0, timeline: ['REPORT_CREATED', 'REPORT_VERIFIED', 'RESPONDER_ASSIGNED']
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // ---- Wipe collections (idempotent reseed) ----
    await Promise.all([
      User.deleteMany({}), Report.deleteMany({}), Responder.deleteMany({}),
      Notification.deleteMany({}), Feedback.deleteMany({}), AuditLog.deleteMany({})
    ]);
    console.log('Cleared existing data');

    // ---- Admin ----
    const admin = await User.create(ADMIN);
    console.log(`✅ Admin: ${ADMIN.email} / ${ADMIN.password}`);

    // ---- Citizens ----
    const citizens = [];
    for (const c of CITIZENS) {
      citizens.push(await User.create(c));
    }
    console.log(`✅ Citizens: ${CITIZENS.map(c => c.email).join(', ')} (password: user123)`);

    // ---- Responders (User + profile) ----
    const responderUsers = [];
    const responderProfiles = [];
    for (const r of RESPONDERS) {
      const u = await User.create({ ...r, role: 'responder' });
      const p = await Responder.create({
        user: u._id,
        specialization: r.specialization,
        zone: r.zone,
        contactPhone: r.phone,
        availability: 'Available',
        lastLocation: {
          lat: CITY.lat + (Math.random() - 0.5) * 0.03,
          lng: CITY.lng + (Math.random() - 0.5) * 0.03,
          updatedAt: new Date()
        },
        stats: { resolvedCount: Math.floor(Math.random() * 20) + 5, avgRating: Math.round((4 + Math.random()) * 10) / 10, ratingCount: Math.floor(Math.random() * 15) + 5 }
      });
      responderUsers.push(u);
      responderProfiles.push(p);
    }
    console.log(`✅ Responders: ${RESPONDERS.map(r => r.email).join(', ')} (password: responder123)`);

    // ---- Reports across the lifecycle ----
    const createdReports = [];
    for (const def of REPORTS) {
      const citizen = citizens[def.citizenIdx];
      const createdAt = new Date(Date.now() - def.minutesAgo * 60 * 1000);

      const prio = computePriority({
        type: def.type, severity: def.severity,
        affectedPeople: def.affectedPeople, hasImages: false, description: def.description
      });

      const timeline = def.timeline.map((action, i) => {
        const actor = action === 'REPORT_CREATED' ? citizen : admin;
        return {
          action,
          actor: actor._id,
          actorName: actor.name,
          actorRole: actor.role,
          note: '',
          at: new Date(createdAt.getTime() + i * 3 * 60 * 1000)
        };
      });

      const report = await Report.create({
        user: citizen._id,
        type: def.type,
        severity: def.severity,
        title: def.title,
        description: def.description,
        location: { address: def.address, lat: def.lat, lng: def.lng, coords: toGeoPoint(def.lat, def.lng) },
        images: [],
        status: def.status,
        legacyStatus: toLegacyStatus(def.status),
        priority: prio.priority,
        priorityScore: prio.score,
        priorityReason: prio.reason,
        affectedPeople: def.affectedPeople,
        createdAt,
        updatedAt: new Date(),
        timeline
      });

      // Apply lifecycle timestamps + SLA for progressed reports
      const has = a => def.timeline.includes(a);
      if (has('REPORT_VERIFIED')) {
        report.verifiedBy = admin._id;
        report.verifiedAt = new Date(createdAt.getTime() + 3 * 60 * 1000);
        const m = slaMinutes(prio.priority);
        report.sla = {
          verifyDueAt: addMinutes(report.verifiedAt, m.verify),
          dispatchDueAt: addMinutes(report.verifiedAt, m.dispatch),
          resolveDueAt: addMinutes(report.verifiedAt, m.resolve),
          escalated: false
        };
      }
      if (has('RESPONDER_ASSIGNED')) {
        const rp = responderProfiles[def.responderIdx];
        report.assignedResponder = rp.user;
        report.assignedAt = new Date(createdAt.getTime() + 6 * 60 * 1000);
        rp.availability = ['RESOLVED', 'CLOSED'].includes(def.status) ? 'Available' : 'Assigned';
        await rp.save();
      }
      if (has('DISPATCHED')) report.dispatchedAt = new Date(createdAt.getTime() + 9 * 60 * 1000);
      if (has('RESPONDER_ACCEPTED')) report.acceptedAt = new Date(createdAt.getTime() + 12 * 60 * 1000);
      if (has('RESPONDER_ARRIVED')) report.arrivedAt = new Date(createdAt.getTime() + 15 * 60 * 1000);
      if (has('RESOLVED')) report.resolvedAt = new Date(createdAt.getTime() + 60 * 60 * 1000);
      if (has('CLOSED')) report.closedAt = new Date(createdAt.getTime() + 90 * 60 * 1000);

      await report.save();
      createdReports.push(report);

      // Feedback
      if (def.feedback) {
        await Feedback.create({
          report: report._id,
          citizen: citizen._id,
          responder: report.assignedResponder || null,
          rating: def.feedback.rating,
          comment: def.feedback.comment,
          createdAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
        });
      }
    }

    // Link the duplicate
    const dup = createdReports[6];
    const primary = createdReports[0];
    if (dup && primary) {
      dup.duplicateOf = primary._id;
      primary.duplicates = [dup._id];
      await Promise.all([dup.save(), primary.save()]);
    }

    console.log(`✅ Reports: ${createdReports.length} incidents across all lifecycle stages`);

    // ---- Notifications ----
    const notifications = [
      { recipient: admin._id, type: 'newReport', title: '🚨 New CRITICAL priority fire reported', message: 'Building fire in commercial complex — Connaught Place', report: createdReports[0]._id, level: 'critical', read: false },
      { recipient: admin._id, type: 'newReport', title: '🚨 New CRITICAL priority medical reported', message: 'Road accident with serious injuries — Ring Road', report: createdReports[1]._id, level: 'critical', read: false },
      { recipient: admin._id, type: 'assignmentRejected', title: '⚠️ Assignment rejected by responder', message: 'Vikram Singh rejected: Suspicious armed person near school', report: createdReports[2]._id, level: 'warning', read: true },
      { recipient: citizens[0]._id, type: 'reportVerified', title: '✅ Your emergency report has been verified', message: 'Building fire in commercial complex — status: VERIFIED', report: createdReports[0]._id, level: 'success', read: false },
      { recipient: citizens[0]._id, type: 'dispatched', title: '🚑 Responder dispatched to your incident', message: 'Building fire in commercial complex', report: createdReports[0]._id, level: 'critical', read: false },
      { recipient: citizens[1]._id, type: 'reportResolved', title: '✅ Your incident has been resolved', message: 'Minor car collision, traffic blocked — status: RESOLVED', report: createdReports[4]._id, level: 'success', read: true },
      { recipient: responderUsers[1]._id, type: 'responderAssigned', title: '🚨 You have been assigned a CRITICAL priority incident', message: 'Building fire in commercial complex — Connaught Place', report: createdReports[0]._id, level: 'critical', read: false },
      { recipient: responderUsers[0]._id, type: 'responderAssigned', title: '🚨 You have been assigned a CRITICAL priority incident', message: 'Road accident with serious injuries — Ring Road', report: createdReports[1]._id, level: 'critical', read: false }
    ];
    await Notification.insertMany(notifications);
    console.log(`✅ Notifications: ${notifications.length}`);

    // ---- Audit logs ----
    const auditLogs = [
      { actor: admin._id, actorName: admin.name, actorRole: 'admin', action: 'LOGIN', target: { kind: 'User', id: admin._id }, description: 'Admin logged in', ip: '127.0.0.1' },
      { actor: citizens[0]._id, actorName: citizens[0].name, actorRole: 'user', action: 'REPORT_CREATED', target: { kind: 'Report', id: createdReports[0]._id }, description: 'Reported: Building fire in commercial complex', ip: '127.0.0.1' },
      { actor: admin._id, actorName: admin.name, actorRole: 'admin', action: 'REPORT_VERIFIED', target: { kind: 'Report', id: createdReports[0]._id }, description: 'Building fire in commercial complex: VERIFIED', ip: '127.0.0.1' },
      { actor: admin._id, actorName: admin.name, actorRole: 'admin', action: 'RESPONDER_ASSIGNED', target: { kind: 'Report', id: createdReports[0]._id }, description: 'Building fire → Sunita Devi (Fire)', ip: '127.0.0.1' },
      { actor: admin._id, actorName: admin.name, actorRole: 'admin', action: 'DUPLICATE_LINKED', target: { kind: 'Report', id: createdReports[6]._id }, description: 'Duplicate fire report linked to primary', ip: '127.0.0.1' },
      { actor: citizens[1]._id, actorName: citizens[1].name, actorRole: 'user', action: 'FEEDBACK_SUBMITTED', target: { kind: 'Report', id: createdReports[4]._id }, description: 'Minor car collision: 5/5', ip: '127.0.0.1' }
    ];
    await AuditLog.insertMany(auditLogs);
    console.log(`✅ Audit logs: ${auditLogs.length}`);

    console.log('\n🎉 Seed complete! Demo accounts:');
    console.log('   Admin     → admin@emergency.com / admin123');
    console.log('   Citizen   → user@test.com / user123');
    console.log('   Responder → responder1@test.com / responder123');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
