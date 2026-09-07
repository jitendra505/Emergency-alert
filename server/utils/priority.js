/* ===================================================================
   Priority scoring — transparent, explainable incident triage.
   The score is computed from measurable factors and a human-readable
   reason is always returned so the system is never a black box.
   =================================================================== */

// Base weight per emergency category (operational urgency)
const CATEGORY_WEIGHTS = {
  fire: 30,
  medical: 28,
  crime: 25,
  accident: 22,
  natural_disaster: 26,
  other: 10
};

// Severity weights
const SEVERITY_WEIGHTS = {
  low: 5,
  medium: 15,
  high: 25,
  critical: 30
};

// Bonus per affected person, capped
const AFFECTED_CAP = 15;      // max points from affected people
const AFFECTED_DIVISOR = 2;   // 2 people = 1 point

/**
 * Compute priority from incident attributes.
 * @returns {{ score: number, priority: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL', reason: string, factors: Array }}
 */
function computePriority({ type, severity, affectedPeople = 0, hasImages = false, description = '' }) {
  const factors = [];
  let score = 0;

  const cw = CATEGORY_WEIGHTS[type] ?? CATEGORY_WEIGHTS.other;
  score += cw;
  factors.push({ label: `Emergency type: ${type}`, points: cw });

  const sw = SEVERITY_WEIGHTS[severity] ?? SEVERITY_WEIGHTS.medium;
  score += sw;
  factors.push({ label: `Severity: ${severity}`, points: sw });

  const affected = Math.max(0, parseInt(affectedPeople) || 0);
  const ap = Math.min(AFFECTED_CAP, Math.ceil(affected / AFFECTED_DIVISOR));
  if (ap > 0) {
    score += ap;
    factors.push({ label: `People affected: ${affected}`, points: ap });
  }

  // Evidence may indicate a more verifiable/urgent situation
  if (hasImages) {
    score += 3;
    factors.push({ label: 'Photo evidence attached', points: 3 });
  }

  // Keyword boost from the description (cheap, transparent heuristic)
  const keywords = [
    ['trapped', 5], ['unconscious', 5], ['bleeding', 4], ['burning', 4],
    ['collapse', 4], ['explosion', 6], ['shooting', 6], ['stab', 5],
    ['drowning', 5], ['child', 3], ['elderly', 2], ['rush hour', 2], ['highway', 2]
  ];
  const text = (description || '').toLowerCase();
  let kwPoints = 0;
  const kwHits = [];
  for (const [word, pts] of keywords) {
    if (text.includes(word)) {
      kwPoints += pts;
      kwHits.push(word);
    }
  }
  if (kwPoints > 0) {
    score += kwPoints;
    factors.push({ label: `Urgent keywords (${kwHits.join(', ')})`, points: kwPoints });
  }

  score = Math.min(100, score);

  let priority;
  if (score >= 75) priority = 'CRITICAL';
  else if (score >= 55) priority = 'HIGH';
  else if (score >= 35) priority = 'MEDIUM';
  else priority = 'LOW';

  const reason = factors.map(f => `${f.label} (+${f.points})`).join('; ');

  return { score, priority, reason, factors };
}

module.exports = { computePriority, CATEGORY_WEIGHTS, SEVERITY_WEIGHTS };
