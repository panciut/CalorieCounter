'use strict';
const { buildDailyFacts, dataQuality } = require('./dailyFacts');
const { computeReliability } = require('./reliability');
const { findAssociations } = require('./associations');
const { findTrends } = require('./trends');
const { findAnomalies } = require('./anomalies');
const { findFactorInsights } = require('./factorAnalysis');
const { renderInsight } = require('./templates');

function addDays(date, n) { return new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10); }
function epochDay(date) { return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86400000); }

const SEVERITY_WEIGHT = { strong: 3, notice: 2, info: 1 };
const CONFIDENCE_FACTOR = { high: 1.2, medium: 1.0, low: 0.8 };

function severityForAssoc(r) {
  if (r.weekendControlled.survived && Math.abs(r.stat) >= 0.5 && r.n >= 28) return 'strong';
  if (r.weekendControlled.survived) return 'notice';
  return 'info';
}
function confidenceForAssoc(r) {
  if (!r.weekendControlled.survived) return 'low';
  if (r.qValue <= 0.05 && r.n >= 28) return 'high';
  if (r.qValue <= 0.10 && r.n >= 21) return 'medium';
  return 'low';
}

const MODULE_OF = {
  sleepMin: ['sleep'], sleepQuality: ['sleep'], sleepDebt: ['sleep'], bedtimeHour: ['sleep'], wakeHour: ['sleep'],
  mood: ['journal'], energy: ['journal'], stress: ['journal'],
  kcalIn: ['food'], kcalBalance: ['food'], protein: ['food'], lastMealHour: ['food'],
  weight: ['weight'], weightTrend: ['weight'],
  steps: ['energy'], workoutDone: ['workouts'], workoutMin: ['workouts'], perceivedEffort: ['workouts'],
  taskCompletionPct: ['tasks'], habitPct: ['habits'], focusMin: ['focus'], waterMl: ['water'],
};
function moduleOf(metric) { return MODULE_OF[metric] || ['other']; }

function buildInsights(db, { windowDays = 90, settings, today }) {
  if (!settings || settings.enabled === false) return { insights: [], dataQuality: { windowDays, daysWithAnyData: 0, perSignalCoverage: {}, reliableFoodDays: 0, tierUnlocked: 0 } };
  const from = addDays(today, -(windowDays - 1));
  const facts = buildDailyFacts(db, { from, to: today });
  computeReliability(facts);
  const dq = dataQuality(facts, windowDays);

  const lang = 'it';
  const out = [];

  // Tier 1: trends
  for (const t of findTrends(facts, settings)) {
    const severity = t.confidence === 'high' ? 'notice' : 'info';
    const rendered = renderInsight(t, lang) || {};
    const text = rendered.text || '';
    out.push({ id: `trend:${t.metric}`, type: 'trend', tier: 1, severity, subject: t.metric, relatedModules: moduleOf(t.metric),
      period: { from, to: today }, evidence: { n: t.n, slope: t.slopePerDay }, confidence: t.confidence || 'low', text });
  }
  // Tier 2: anomalies + factors
  if (dq.daysWithAnyData >= 10) {
    for (const a of findAnomalies(facts, settings, today)) {
      const severity = Math.abs(a.z) >= 3.5 ? 'strong' : 'notice';
      const rendered = renderInsight(a, lang) || {};
      const text = rendered.text || '';
      out.push({ id: `anomaly:${a.date}:${a.metric}`, type: 'anomaly', tier: 2, severity, subject: a.metric, relatedModules: moduleOf(a.metric),
        period: { from: a.date, to: a.date }, evidence: { zScore: a.z }, confidence: 'medium', text, recent: true });
    }
    for (const fct of findFactorInsights(facts)) {
      const rendered = renderInsight(fct, lang) || {};
      const text = rendered.text || '';
      out.push({ id: `factor:${fct.tag}:${fct.metric}`, type: 'factor', tier: 2, severity: 'notice', subject: `${fct.tag}~${fct.metric}`,
        relatedModules: fct.tag === 'perceivedEffort' ? ['workouts', moduleOf(fct.metric)[0]] : [...new Set(['sleep', ...moduleOf(fct.metric)])], period: { from, to: today },
        evidence: { n: (fct.withN || fct.highN || 0) + (fct.withoutN || fct.lowN || 0) }, confidence: 'medium', text });
    }
  }
  // Tier 3: associations
  for (const r of findAssociations(facts, settings)) {
    const severity = severityForAssoc(r);
    const confidence = confidenceForAssoc(r);
    const rendered = renderInsight(r, lang) || {};
    const text = rendered.text || '';
    const actionHint = rendered.actionHint;
    out.push({ id: `assoc:${r.x}~${r.y}`, type: 'association', tier: 3, severity, subject: `${r.x}~${r.y}`,
      relatedModules: [...new Set([...moduleOf(r.x), ...moduleOf(r.y)])], period: { from, to: today },
      evidence: { n: r.n, [r.corr === 'spearman' ? 'rho' : 'r']: r.stat, pValue: r.pValue, qValue: r.qValue, lag: r.lag,
        weekendControlled: { [r.corr === 'spearman' ? 'rho' : 'r']: r.weekendControlled.stat, survived: r.weekendControlled.survived },
        contrast: r.contrast, reliabilityBasis: r.reliabilityBasis },
      confidence, text, actionHint });
  }

  // score + sort
  for (const i of out) {
    const recency = i.recent ? 2 : 1;
    const actionability = i.actionHint ? 1.3 : 1;
    i.score = (SEVERITY_WEIGHT[i.severity] || 1) * recency * (CONFIDENCE_FACTOR[i.confidence] || 1) * actionability;
  }
  out.sort((a, b) => b.score - a.score);
  return { insights: out, dataQuality: dq };
}

function pickOfDay(insights, ed) {
  if (!insights || insights.length === 0) return null;
  const top = insights.slice(0, 5);
  return top[((ed % top.length) + top.length) % top.length];
}

module.exports = { buildInsights, pickOfDay, epochDay, moduleOf };
