// Standalone preview page rendering proposed widget layouts at every size.
// Access via http://localhost:5199/#widget-preview while running `npm run dev`.
// All data is mocked inline — this page is for design review, not live data.

import { useState, type CSSProperties, type ReactNode } from 'react';
import Model, { type IExerciseData, type Muscle } from 'react-body-highlighter';

// ── Shared mock data ────────────────────────────────────────────────────────────
const MOCK = {
  cal: { actual: 1535, min: 1900, max: 2450, rec: 2100 },
  protein: 79.5, carbs: 133.5, fat: 70.5,
  net: -565, in: 1535, out: 2100, steps: 4200,
  waterL: 1.5, waterGoalL: 2.7,
  tasksDone: 1, tasksTotal: 2,
  tasks: [
    { id: 1, title: 'Iniziare ricerca recognition systems', priority: 2, done: 1 },
    { id: 2, title: 'Iniziare leggere file recognition', priority: 1, done: 0 },
    { id: 3, title: 'Workout serale 25 min',              priority: 1, done: 0 },
    { id: 4, title: 'Bere altri 750ml di acqua',          priority: 0, done: 0 },
    { id: 5, title: 'Prep meal domani',                   priority: 0, done: 0 },
    { id: 6, title: 'Rivedere appunti corso',             priority: 0, done: 0 },
  ],
  habitsDone: 1, habitsTotal: 3,
  habits: [
    { id: 1, icon: '💪', name: 'Daily pushups',     color: '#d97706', done: true },
    { id: 2, icon: '📚', name: 'Lettura 30 min',    color: '#7aa6c8', done: false },
    { id: 3, icon: '🧘', name: 'Meditazione',       color: '#7cba6c', done: false },
    { id: 4, icon: '💧', name: 'Bere 2L acqua',     color: '#7aa6c8', done: false },
    { id: 5, icon: '🌿', name: 'Walk 15 min',       color: '#7cba6c', done: false },
    { id: 6, icon: '✍️', name: 'Journaling',        color: '#e0a93a', done: false },
  ],
  sleep: { duration: '7h', bedtime: '01:15', wake: '08:15', quality: 3, weekMin: [420, 480, 360, 510, 390, 420, 420] },
  moodVal: 4, energy: 4, stress: 2, moodNote: 'Giornata buona, energia alta dopo pranzo.',
  focus: { todayMin: 35, weekPts: [30, 0, 45, 20, 0, 35, 35], project: 'Tesi' },
  workout: { durationMin: 10, kcal: 80, effort: 7, sessions: [{ name: 'Push pulldown', dur: 10, kcal: 80 }] },
  streaks: [
    { section: 'sleep',   icon: '🌙', name: 'Sleep',   current: 7, best: 14 },
    { section: 'diet',    icon: '🍽️', name: 'Diet',    current: 7, best: 21 },
    { section: 'focus',   icon: '🧠', name: 'Focus',   current: 1, best: 9  },
    { section: 'workout', icon: '💪', name: 'Workout', current: 2, best: 12 },
  ],
  meal: {
    slot: 'Snack pomeridiano', remaining: 665,
    macroGap: { protein: 80, carbs: 76, fat: -5, kcal: 665 },
    suggestions: [
      { name: 'Yogurt greco + pesca',     emoji: '🥣', kcal: 129, g: 150, p: 14, c: 12, f: 2,  pantry: true,  expiring: false, prep: 1, score: 92, why: 'high protein' },
      { name: 'Pane segale + tonno',      emoji: '🥪', kcal: 280, g: 180, p: 22, c: 30, f: 4,  pantry: true,  expiring: false, prep: 5, score: 88, why: 'balanced macros' },
      { name: 'Hummus + carote',          emoji: '🥕', kcal: 229, g: 200, p: 9,  c: 18, f: 12, pantry: true,  expiring: true,  prep: 3, score: 78, why: 'expiring + fiber' },
      { name: 'Frutta a guscio mix',      emoji: '🥜', kcal: 647, g: 100, p: 22, c: 18, f: 55, pantry: true,  expiring: true,  prep: 0, score: 71, why: 'expiring' },
      { name: 'Avocado toast',            emoji: '🥑', kcal: 320, g: 150, p: 8,  c: 30, f: 18, pantry: false, expiring: false, prep: 7, score: 64, why: 'healthy fats' },
    ],
  },
  tdee: {
    value: 2100, confidence: 'high', dataPoints: 18, suggestion: 1600,
    avgIntake: 1800, delta: -300, kgPerWeek: -0.3,
    trend: [2240, 2200, 2180, 2150, 2120, 2110, 2100, 2105, 2120, 2100, 2095, 2080, 2100, 2100],
    intakeWeek: [1850, 1700, 1900, 1650, 1820, 1750, 1535],
    proj: { w4: -1.2, w8: -2.4, w12: -3.6 },
  },
  insight: { severity: 'notice', text: 'Dormi mediamente 45 min in meno quando ti alleni dopo le 21. Anticipa la sessione.' },
};

// ── Local style helpers ───────────────────────────────────────────────────────
const card: CSSProperties = {
  background: 'var(--fb-card)',
  border: '1px solid var(--fb-border)',
  borderRadius: 18,
  padding: 14,
  display: 'flex', flexDirection: 'column', gap: 10,
  height: '100%', boxSizing: 'border-box',
  position: 'relative', overflow: 'hidden',
};
const eyebrow: CSSProperties = {
  fontSize: 9.5, fontWeight: 600, letterSpacing: 1.4,
  textTransform: 'uppercase', color: 'var(--fb-text-3)',
};
const numSerif = (size: number, color = 'var(--fb-text)'): CSSProperties => ({
  fontFamily: 'var(--font-serif)', fontStyle: 'italic',
  fontSize: size, fontWeight: 400, letterSpacing: -1, color, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
});

// Real production dimensions per size, hardcoded for the preview so each variant
// renders isolated and unaffected by grid auto-flow quirks.
const DIM: Record<'XS'|'S'|'M'|'L', { width: number | string; height: number }> = {
  XS: { width: 158,  height: 152 },
  S:  { width: 318,  height: 152 },
  M:  { width: 484,  height: 318 },
  L:  { width: 1024, height: 318 },
};

function Cell({ size, label, children }: { size: 'XS'|'S'|'M'|'L'; label: string; children: ReactNode }) {
  const dims = DIM[size];
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6, color: 'var(--fb-text-3)',
        textTransform: 'uppercase', fontFamily: 'var(--font-display)', marginBottom: 8,
      }}>
        {label} · {size} <span style={{ color: 'var(--fb-text-3)', fontWeight: 400 }}>
          ({typeof dims.width === 'number' ? `${dims.width}×${dims.height}` : dims.height + 'px tall'})
        </span>
      </div>
      <div style={{ width: dims.width, height: dims.height, maxWidth: '100%' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 48 }}>
      <h2 style={{
        fontFamily: 'var(--font-serif)', fontStyle: 'italic',
        fontSize: 24, fontWeight: 400, color: 'var(--fb-text)',
        margin: 0, paddingBottom: 8, borderBottom: '1px solid var(--fb-divider)',
        letterSpacing: -0.3,
      }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        {children}
      </div>
    </section>
  );
}

// ── Tiny SVG bits ─────────────────────────────────────────────────────────────
function Ring({ size = 80, pct = 70, color = 'var(--fb-orange)', label }: { size?: number; pct?: number; color?: string; label?: string }) {
  const r = (size - 10) / 2; const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--fb-border)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      {label && (
        <text x={size/2} y={size/2 + 4} textAnchor="middle"
          style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: size * 0.22, fill: 'var(--fb-text)' }}>
          {label}
        </text>
      )}
    </svg>
  );
}

function ConcentricRings({ size = 130 }: { size?: number }) {
  const calP = 70, proP = 47, carP = 64, fatP = 100;
  const SW = 4; const gap = 1;
  const colors = ['var(--fb-orange)', 'var(--fb-red)', 'var(--fb-amber)', 'var(--fb-green)'];
  const pcts = [calP, proP, carP, fatP];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {pcts.map((pct, i) => {
        const r = (size / 2) - SW - i * (SW + gap);
        const c = 2 * Math.PI * r;
        return (
          <g key={i}>
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--fb-border)" strokeWidth={SW} />
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors[i]} strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)}
              transform={`rotate(-90 ${size/2} ${size/2})`} />
          </g>
        );
      })}
      <text x={size/2} y={size/2 - 2} textAnchor="middle"
        style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: size * 0.16, fontWeight: 400, fill: 'var(--fb-text)' }}>
        {calP}%
      </text>
      <text x={size/2} y={size/2 + 12} textAnchor="middle"
        style={{ fontSize: size * 0.06, letterSpacing: 1.3, textTransform: 'uppercase', fill: 'var(--fb-text-3)' }}>
        TARGET
      </text>
    </svg>
  );
}

function Spark({ points, color = 'var(--fb-accent)', height = 24 }: { points: number[]; color?: string; height?: number }) {
  const max = Math.max(...points, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, width: '100%' }}>
      {points.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: Math.max(3, (v / max) * height),
          borderRadius: 2, background: v > 0 ? color : 'var(--fb-border-strong, var(--fb-border))',
          opacity: i === points.length - 1 ? 1 : 0.55,
        }} />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// WIDGETS — each function returns the rendered layout for a given size
// ────────────────────────────────────────────────────────────────────────────

// 1) DAILY INTAKE ────────────────────────────────────────────────────────────
function DailyIntake({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
      <ConcentricRings size={96} />
    </div>
  );
  if (size === 'S') return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: '92px 1fr', alignItems: 'center', gap: 10, padding: 12 }}>
      <ConcentricRings size={92} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={eyebrow}>Intake</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={numSerif(26)}>1535</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--fb-text-2)' }}>kcal</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--fb-green)', fontWeight: 600 }}>+665 rem</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
          {[
            { l: 'P', actual: 79, max: 169, color: 'var(--fb-red)' },
            { l: 'C', actual: 133, max: 210, color: 'var(--fb-amber)' },
            { l: 'F', actual: 70, max: 65, color: 'var(--fb-green)' },
          ].map(m => (
            <div key={m.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: m.color, width: 8 }}>{m.l}</span>
              <div style={{ flex: 1, height: 3, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${Math.min(100,(m.actual/m.max)*100)}%`, background: m.color, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 9, color: 'var(--fb-text-3)', minWidth: 26, textAlign: 'right' }} className="tnum">{m.actual}g</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  // M (484×318) — hero + 3 macro cards stacked vertically with full detail
  if (size === 'M') return (
    <div style={{ ...card, padding: 18, gap: 14, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16, alignItems: 'center' }}>
        <ConcentricRings size={150} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={eyebrow}>Daily intake</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={numSerif(54)}>1535</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text-2)' }}>kcal</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-green)', fontWeight: 600 }}>665 remaining</div>
          <div style={{ fontSize: 10.5, color: 'var(--fb-text-3)' }}>1900 – 2450 · goal {MOCK.cal.rec}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 12, borderTop: '1px solid var(--fb-divider)', minHeight: 0 }}>
        {[
          { label: 'Protein', actual: 79.5, min: 142, rec: 169, max: 196, color: 'var(--fb-red)' },
          { label: 'Carbs',   actual: 133.5, min: 156, rec: 210, max: 264, color: 'var(--fb-amber)' },
          { label: 'Fat',     actual: 70.5,  min: 53,  rec: 65,  max: 77,  color: 'var(--fb-green)' },
        ].map(m => {
          const pct = Math.min(100, (m.actual / m.max) * 100);
          const minPct = (m.min / m.max) * 100;
          const recPct = (m.rec / m.max) * 100;
          const macroPct = Math.round((m.actual / m.rec) * 100);
          return (
            <div key={m.label} style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                  <span style={{ display:'inline-block', width:5, height:5, borderRadius:99, background:m.color, marginRight:5 }}/>{m.label}
                </span>
                <span style={{ fontSize: 9.5, color: m.color, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `color-mix(in srgb, ${m.color} 14%, transparent)` }}>{macroPct}%</span>
              </div>
              <div style={{ display:'flex', alignItems:'baseline', gap: 3 }}>
                <span style={numSerif(24)}>{m.actual.toFixed(2)}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--fb-text-3)' }}>g</span>
              </div>
              <div style={{ height: 6, background: 'var(--fb-bg-2)', borderRadius: 99, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${minPct}%`, width: `${100 - minPct}%`, background: 'var(--fb-border-strong, var(--fb-border))', borderRadius: 99, opacity: 0.45 }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, background: m.color, borderRadius: 99 }} />
                <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${recPct}%`, width: 1.5, background: 'var(--fb-text-2)', opacity: 0.6 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
                <span className="tnum">min {m.min}g</span>
                <span className="tnum">rec {m.rec}g</span>
                <span className="tnum">max {m.max}g</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // L (1024×318) — full row: hero left + 3 macro center + week trend right
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr 260px', gap: 18, overflow: 'hidden' }}>
      {/* LEFT — hero */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={eyebrow}>Daily intake · oggi</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={numSerif(64)}>1535</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--fb-text-2)' }}>kcal</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fb-green)', fontWeight: 600, marginTop: 4 }}>665 remaining</div>
          <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>1900 – 2450 · goal {MOCK.cal.rec}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ConcentricRings size={130} />
        </div>
      </div>

      {/* CENTER — 3 macro cards horizontal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignContent: 'stretch' }}>
        {[
          { label: 'Protein', actual: 79.5, min: 142, rec: 169, max: 196, color: 'var(--fb-red)' },
          { label: 'Carbs',   actual: 133.5, min: 156, rec: 210, max: 264, color: 'var(--fb-amber)' },
          { label: 'Fat',     actual: 70.5,  min: 53,  rec: 65,  max: 77,  color: 'var(--fb-green)' },
        ].map(m => {
          const pct = Math.min(100, (m.actual / m.max) * 100);
          const minPct = (m.min / m.max) * 100;
          const recPct = (m.rec / m.max) * 100;
          const macroPct = Math.round((m.actual / m.rec) * 100);
          return (
            <div key={m.label} style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  <span style={{ display:'inline-block', width:6, height:6, borderRadius:99, background:m.color, marginRight:5 }}/>{m.label}
                </span>
                <span style={{ fontSize: 10, color: m.color, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `color-mix(in srgb, ${m.color} 14%, transparent)` }}>{macroPct}%</span>
              </div>
              <div style={{ display:'flex', alignItems:'baseline', gap: 3 }}>
                <span style={numSerif(30)}>{m.actual.toFixed(2)}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-3)' }}>g</span>
              </div>
              <div style={{ height: 7, background: 'var(--fb-bg-2)', borderRadius: 99, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${minPct}%`, width: `${100 - minPct}%`, background: 'var(--fb-border-strong, var(--fb-border))', borderRadius: 99, opacity: 0.45 }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, background: m.color, borderRadius: 99 }} />
                <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${recPct}%`, width: 1.5, background: 'var(--fb-text-2)', opacity: 0.6 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)' }}>
                <span className="tnum">{m.min}g</span>
                <span className="tnum" style={{ color: 'var(--fb-text-2)', fontWeight: 600 }}>{m.rec}g</span>
                <span className="tnum">{m.max}g</span>
              </div>
              <div style={{ marginTop: 'auto', fontSize: 9.5, color: 'var(--fb-text-3)', letterSpacing: 0.3 }}>
                {macroPct < 80 ? '↑ aumenta' : macroPct > 110 ? '↓ riduci' : '✓ on target'}
              </div>
            </div>
          );
        })}
      </div>

      {/* RIGHT — trend + breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 5 }}>
            <span>Last 7 days kcal</span>
            <span className="tnum">avg 1980</span>
          </div>
          <Spark points={[2100, 1850, 1535, 2200, 1700, 1950, 1535]} color="var(--fb-orange)" height={50} />
        </div>
        <div style={{ paddingTop: 10, borderTop: '1px solid var(--fb-divider)' }}>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>By meal</div>
          {[
            { label: 'Colazione', kcal: 320, color: '#fbbf24' },
            { label: 'Pranzo',    kcal: 690, color: '#f59e0b' },
            { label: 'Snack',     kcal: 150, color: '#d97706' },
            { label: 'Cena',      kcal: 375, color: '#b45309' },
          ].map(m => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: m.color }} />
              <span style={{ fontSize: 11, color: 'var(--fb-text-2)', flex: 1 }}>{m.label}</span>
              <span style={{ fontSize: 11, color: 'var(--fb-text)' }} className="tnum">{m.kcal}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 2) BALANCE ─────────────────────────────────────────────────────────────────
function Balance({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 }}>
      <span style={{ ...eyebrow, color: 'var(--fb-orange)' }}>⚡ Balance</span>
      <span style={numSerif(44, 'var(--fb-green)')}>{MOCK.net}</span>
      <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>net kcal</span>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--fb-text-2)', marginTop: 2 }}>
        <span className="tnum"><span style={{ color: 'var(--fb-green)' }}>↑</span> {MOCK.in}</span>
        <span className="tnum"><span style={{ color: 'var(--fb-orange)' }}>↓</span> {MOCK.out}</span>
      </div>
    </div>
  );
  if (size === 'S') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12, gap: 6 }}>
      <span style={{ ...eyebrow, color: 'var(--fb-orange)' }}>⚡ Balance</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={numSerif(42, 'var(--fb-green)')}>{MOCK.net}</span>
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--fb-text-2)' }}>net kcal</span>
      </div>
      <div style={{ width: '85%' }}>
        <div style={{ position: 'relative', height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
          <div style={{ position: 'absolute', inset: 0, width: '42%', background: 'var(--fb-green)', borderRadius: 99 }} />
          <div style={{ position: 'absolute', inset: 0, left: '42%', right: 0, background: 'var(--fb-orange)', borderRadius: 99 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 4, fontWeight: 600 }}>
          <span style={{ color: 'var(--fb-green)' }} className="tnum">↑ {MOCK.in}</span>
          <span style={{ color: 'var(--fb-orange)' }} className="tnum">↓ {MOCK.out}</span>
        </div>
      </div>
    </div>
  );
  // M (484×318) — hero + bar + sparkline + 4 stat cards, fit in 282 internal
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div>
        <span style={{ ...eyebrow, color: 'var(--fb-orange)' }}>⚡ Energy balance</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={numSerif(48, 'var(--fb-green)')}>{MOCK.net}</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>net kcal</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fb-text-3)', marginTop: 2 }}>Deficit healthy · ~80g grasso/sett</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          <span style={{ color: 'var(--fb-green)' }}>↑ in {MOCK.in}</span>
          <span style={{ color: 'var(--fb-orange)' }}>↓ out {MOCK.out}</span>
        </div>
        <div style={{ position: 'relative', height: 8, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
          <div style={{ position: 'absolute', inset: 0, width: '42%', background: 'var(--fb-green)', borderRadius: 99 }} />
          <div style={{ position: 'absolute', inset: 0, left: '42%', right: 0, background: 'var(--fb-orange)', borderRadius: 99 }} />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
          <span>Last 7 days</span>
          <span>avg -420 kcal</span>
        </div>
        <Spark points={[300, 650, 480, 560, 120, 380, 565]} color="var(--fb-green)" height={24} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, paddingTop: 10, borderTop: '1px solid var(--fb-divider)', marginTop: 'auto' }}>
        {[
          { l: 'Resting', v: 2100, hint: true  },
          { l: 'Active',  v: 0,    hint: false },
          { l: 'Extra',   v: 0,    hint: false },
          { l: 'Steps',   v: MOCK.steps, hint: false },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{s.l}</span>
            <span style={numSerif(15)}>{s.v.toLocaleString('it-IT')}</span>
            {s.hint && <span style={{ fontSize: 7.5, color: 'var(--fb-accent)' }}>yesterday</span>}
          </div>
        ))}
      </div>
    </div>
  );

  // L (1024×318) — full row: hero | bar/spark | week stats | inputs
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr 220px 240px', gap: 20, overflow: 'hidden' }}>
      {/* hero */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span style={{ ...eyebrow, color: 'var(--fb-orange)' }}>⚡ Energy balance</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={numSerif(72, 'var(--fb-green)')}>{MOCK.net}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--fb-text-2)' }}>net kcal</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)', marginTop: 4 }}>Deficit healthy</div>
          <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>~80g grasso / settimana</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <span style={{ color: 'var(--fb-green)' }}>↑ in {MOCK.in}</span>
            <span style={{ color: 'var(--fb-orange)' }}>↓ out {MOCK.out}</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: 'var(--fb-bg-2)', borderRadius: 99, marginTop: 5 }}>
            <div style={{ position: 'absolute', inset: 0, width: '42%', background: 'var(--fb-green)', borderRadius: 99 }} />
            <div style={{ position: 'absolute', inset: 0, left: '42%', right: 0, background: 'var(--fb-orange)', borderRadius: 99 }} />
          </div>
        </div>
      </div>

      {/* sparkline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days deficit</span>
          <span className="tnum">avg -420 kcal</span>
        </div>
        <Spark points={[300, 650, 480, 560, 120, 380, 565]} color="var(--fb-green)" height={130} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d}>{d}</span>)}
        </div>
      </div>

      {/* week stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Settimana</div>
        {[
          { l: 'Deficit totale', v: '-2,940', c: 'var(--fb-green)' },
          { l: 'Sett. scorsa', v: '-1,820', c: 'var(--fb-text-2)' },
          { l: 'Δ',            v: '-1,120', c: 'var(--fb-green)' },
          { l: 'Proiezione', v: '-0.35 kg/sett', c: 'var(--fb-text)' },
        ].map(s => (
          <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--fb-text-3)' }}>{s.l}</span>
            <span style={{ color: s.c, fontWeight: 600 }} className="tnum">{s.v}</span>
          </div>
        ))}
      </div>

      {/* inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['Resting', 2100, true], ['Active', 0, false], ['Extra', 0, false], ['Steps', MOCK.steps, false]].map(([l, v, hint]) => (
          <div key={l as string} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 8, padding: '8px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{l as string}</span>
            <span style={numSerif(18)}>{(v as number).toLocaleString('it-IT')}</span>
            {hint as boolean && <span style={{ fontSize: 8, color: 'var(--fb-accent)' }}>yesterday</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 3) WATER ───────────────────────────────────────────────────────────────────
function Water({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const pct = Math.round((MOCK.waterL / MOCK.waterGoalL) * 100);
  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <span style={{ ...eyebrow, color: 'var(--fb-blue)' }}>💧 Water</span>
      <div style={numSerif(34, 'var(--fb-blue)')}>{MOCK.waterL}L</div>
      <div style={{ height: 3, width: '70%', background: 'var(--fb-bg-2)', borderRadius: 99 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99 }} />
      </div>
    </div>
  );
  if (size === 'S') return (
    <div style={{ ...card, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ ...eyebrow, color: 'var(--fb-blue)' }}>💧 Water</span>
        <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>{pct}%</span>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={numSerif(32, 'var(--fb-blue)')}>{MOCK.waterL.toFixed(2)}</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--fb-text-2)' }}>L</span>
        </div>
        <div style={{ height: 4, background: 'var(--fb-bg-2)', borderRadius: 99, marginTop: 6 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {[250, 500].map(ml => <Chip key={ml}>+{ml}</Chip>)}
      </div>
    </div>
  );
  // M (484×318) — hero + bar + sparkline + chips + stats
  if (size === 'M') return (
    <div style={{ ...card, justifyContent: 'flex-start', gap: 12, padding: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ ...eyebrow, color: 'var(--fb-blue)' }}>💧 Water</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={numSerif(54, 'var(--fb-blue)')}>{MOCK.waterL.toFixed(2)}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--fb-text-2)' }}>L</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>of {MOCK.waterGoalL.toFixed(2)}L · {(MOCK.waterGoalL - MOCK.waterL).toFixed(2)}L to goal</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ ...numSerif(28, 'var(--fb-blue)') }}>{pct}%</span>
          <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>completato</span>
        </div>
      </div>

      <div style={{ height: 8, background: 'var(--fb-bg-2)', borderRadius: 99, position: 'relative' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99, transition: 'width .6s' }} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
          <span>Last 7 days</span>
          <span>avg 1.8L</span>
        </div>
        <Spark points={[2.0, 1.6, 2.4, 1.8, 1.2, 2.0, 1.5]} color="var(--fb-blue)" height={42} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 6 }}>
        {[250, 500, 750, 1000].map(ml => <Chip key={ml}>+{ml}ml</Chip>)}
        <Chip>Custom</Chip>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 10, borderTop: '1px solid var(--fb-divider)', marginTop: 'auto' }}>
        {[
          { l: 'Best 7gg', v: '2.4 L' },
          { l: 'Streak', v: '4 gg' },
          { l: 'Tot oggi', v: '6 sips' },
        ].map(s => (
          <div key={s.l}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={numSerif(15, 'var(--fb-blue)')}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // L (1024×318) — 4-col: hero | sparkline (contained) | stats | quick add
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr 200px 220px', gap: 20, overflow: 'hidden' }}>
      {/* hero */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span style={{ ...eyebrow, color: 'var(--fb-blue)' }}>💧 Water · oggi</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={numSerif(72, 'var(--fb-blue)')}>{MOCK.waterL.toFixed(2)}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--fb-text-2)' }}>L</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)', marginTop: 2 }}>of {MOCK.waterGoalL.toFixed(2)}L</div>
          <div style={{ fontSize: 11, color: 'var(--fb-blue)', fontWeight: 600 }}>{(MOCK.waterGoalL - MOCK.waterL).toFixed(2)}L to goal</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            <span>Progress</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 9, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99 }} />
          </div>
        </div>
      </div>

      {/* sparkline contained — no stretch */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days</span>
          <span className="tnum">avg 1.8 L · best 2.4 L</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', maxWidth: 320, alignSelf: 'center', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <Spark points={[2.0, 1.6, 2.4, 1.8, 1.2, 2.0, 1.5]} color="var(--fb-blue)" height={130} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', marginTop: 4 }}>
              {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* stats column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Settimana</div>
        {[
          { l: 'Tot',        v: '12.5 L' },
          { l: 'Avg/giorno', v: '1.8 L'  },
          { l: 'Streak',     v: '4 gg'  },
          { l: 'vs sett',    v: '+0.3 L', positive: true },
        ].map(s => (
          <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--fb-text-3)' }}>{s.l}</span>
            <span className="tnum" style={{ color: s.positive ? 'var(--fb-green)' : 'var(--fb-text)', fontWeight: 600 }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* quick add */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Quick add</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[250, 500, 750, 1000].map(ml => (
            <button key={ml} style={{ padding: '10px 6px', borderRadius: 10, border: '1px solid var(--fb-border)', background: 'var(--fb-bg-2)', color: 'var(--fb-blue)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', letterSpacing: 0.3 }}>
              +{ml}ml
            </button>
          ))}
        </div>
        <Chip>Custom amount…</Chip>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <button style={{
      padding: '4px 10px', borderRadius: 99,
      border: '1px solid var(--fb-border)', background: 'var(--fb-bg-2)',
      color: 'var(--fb-text-2)', fontSize: 10.5, fontWeight: 500,
      cursor: 'pointer', fontFamily: 'var(--font-body)',
    }}>{children}</button>
  );
}

// 4) TASKS ───────────────────────────────────────────────────────────────────
function TaskRow({ task, size = 'M' }: { task: typeof MOCK.tasks[0]; size?: 'S'|'M'|'L' }) {
  const fontSize = size === 'S' ? 10.5 : size === 'M' ? 12 : 12.5;
  const dotSize = size === 'S' ? 5 : 6;
  const checkSize = size === 'S' ? 12 : 14;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: checkSize, height: checkSize, borderRadius: 4,
        border: `1.5px solid ${task.done ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))'}`,
        background: task.done ? 'var(--fb-accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: checkSize - 4, flexShrink: 0,
      }}>{task.done ? '✓' : ''}</span>
      <span style={{ width: dotSize, height: dotSize, borderRadius: 99, background: ['#6b7280','#f59e0b','#ef4444'][task.priority], flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize,
        color: task.done ? 'var(--fb-text-3)' : 'var(--fb-text)',
        textDecoration: task.done ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{task.title}</span>
    </div>
  );
}

function Tasks({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const pct = (MOCK.tasksDone / MOCK.tasksTotal) * 100;

  // XS (158×152) — todo list with completion badge top-right
  if (size === 'XS') return (
    <div style={{ ...card, padding: 12, gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...eyebrow, fontSize: 8.5 }}>Tasks</span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: 'var(--fb-accent)',
          background: 'var(--fb-accent-soft)', padding: '2px 6px', borderRadius: 99,
          fontFamily: 'var(--font-display)', letterSpacing: 0.3,
        }}>{MOCK.tasksDone}/{MOCK.tasksTotal}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
        {MOCK.tasks.slice(0, 3).map(t => <TaskRow key={t.id} task={t} size="S" />)}
      </div>
    </div>
  );

  // S (318×152) — todo list with bigger badge + 3-4 items
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={eyebrow}>Tasks</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...numSerif(18), color: 'var(--fb-accent)' }}>{MOCK.tasksDone}</span>
          <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>/ {MOCK.tasksTotal} · {Math.round(pct)}%</span>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
        {MOCK.tasks.slice(0, 4).map(t => <TaskRow key={t.id} task={t} size="S" />)}
      </div>
    </div>
  );

  // M (484×318) — 2-col: ring+list left, priority chart right
  if (size === 'M') return (
    <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: '1fr 130px', gap: 16, overflow: 'hidden' }}>
      {/* LEFT — header + list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Ring size={70} pct={pct} color="var(--fb-accent)" />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}>
              <span style={{ ...numSerif(20), color: 'var(--fb-accent)' }}>{MOCK.tasksDone}</span>
              <span style={{ fontSize: 8, color: 'var(--fb-text-3)', marginTop: -2 }}>/ {MOCK.tasksTotal}</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={eyebrow}>Tasks · oggi</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
              <span style={numSerif(26)}>{Math.round(pct)}%</span>
              <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>completato</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid var(--fb-divider)', overflow: 'hidden' }}>
          {MOCK.tasks.slice(0, 5).map(t => <TaskRow key={t.id} task={t} size="M" />)}
        </div>
      </div>

      {/* RIGHT — priority breakdown vertical chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 14, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Priority</div>
        {[
          { l: 'Alta', c: '#ef4444', count: 1, max: 3 },
          { l: 'Media', c: '#f59e0b', count: 2, max: 3 },
          { l: 'Bassa', c: '#6b7280', count: 3, max: 3 },
        ].map(p => (
          <div key={p.l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: p.c, fontWeight: 600 }}>● {p.l}</span>
              <span className="tnum" style={{ color: 'var(--fb-text-2)' }}>{p.count}</span>
            </div>
            <div style={{ height: 5, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${(p.count/p.max)*100}%`, background: p.c, borderRadius: 99 }} />
            </div>
          </div>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--fb-divider)' }}>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>Week</div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28 }}>
            {[80, 60, 100, 40, 75, 90, 50].map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${v}%`, background: i === 6 ? 'var(--fb-accent)' : 'color-mix(in srgb, var(--fb-accent) 35%, transparent)', borderRadius: 2 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // L (1024×318) — 3-col: ring | (todo+done stacked) | priority+week (wider)
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '240px 1fr 340px', gap: 22, overflow: 'hidden' }}>
      {/* RING column */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <span style={eyebrow}>Tasks · oggi</span>
        <div style={{ position: 'relative' }}>
          <Ring size={170} pct={pct} color="var(--fb-accent)" />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 0,
          }}>
            <span style={numSerif(46, 'var(--fb-accent)')}>{MOCK.tasksDone}</span>
            <span style={{ fontSize: 12, color: 'var(--fb-text-3)' }}>/ {MOCK.tasksTotal}</span>
            <span style={{ fontSize: 10, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginTop: 4 }}>{Math.round(pct)}% done</span>
          </div>
        </div>
      </div>

      {/* TODO + DONE stacked */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>
            <span>To do</span>
            <span>{MOCK.tasks.filter(t => !t.done).length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
            {MOCK.tasks.filter(t => !t.done).slice(0, 4).map(t => <TaskRow key={t.id} task={t} size="M" />)}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid var(--fb-divider)', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>
            <span>Done</span>
            <span>{MOCK.tasksDone}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
            {MOCK.tasks.filter(t => t.done).slice(0, 4).map(t => <TaskRow key={t.id} task={t} size="M" />)}
            {MOCK.tasksDone === 0 && (
              <span style={{ fontSize: 11, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>Nessuna completata</span>
            )}
          </div>
        </div>
      </div>

      {/* STATS column wider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>Priority breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { l: 'Alta', c: '#ef4444', count: 1, max: 3 },
              { l: 'Media', c: '#f59e0b', count: 2, max: 3 },
              { l: 'Bassa', c: '#6b7280', count: 3, max: 3 },
            ].map(p => (
              <div key={p.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: p.c, fontWeight: 600 }}>● {p.l}</span>
                  <span className="tnum" style={{ color: 'var(--fb-text-2)' }}>{p.count}/{p.max}</span>
                </div>
                <div style={{ height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${(p.count/p.max)*100}%`, background: p.c, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ paddingTop: 12, borderTop: '1px solid var(--fb-divider)', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>
            <span>Completion · 7 days</span>
            <span className="tnum">avg 71%</span>
          </div>
          <div style={{ flex: 1, display: 'flex', gap: 5, alignItems: 'flex-end', minHeight: 50 }}>
            {[80, 60, 100, 40, 75, 90, 50].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${v}%`, background: i === 6 ? 'var(--fb-accent)' : 'color-mix(in srgb, var(--fb-accent) 35%, transparent)', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 8.5, color: 'var(--fb-text-3)' }}>{['L','M','M','G','V','S','D'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 5) HABITS ──────────────────────────────────────────────────────────────────
function Habits({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const pct = (MOCK.habitsDone / MOCK.habitsTotal) * 100;

  // XS (158×152) — ring + count + 2 mini habit dots
  if (size === 'XS') return (
    <div style={{ ...card, padding: 12, gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>Habits</span>
      <div style={{ position: 'relative' }}>
        <Ring size={70} pct={pct} color="var(--fb-accent)" />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ ...numSerif(20), color: 'var(--fb-accent)' }}>{MOCK.habitsDone}</span>
          <span style={{ fontSize: 8, color: 'var(--fb-text-3)', marginTop: -2 }}>/ {MOCK.habitsTotal}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {MOCK.habits.slice(0, 3).map(h => (
          <span key={h.id} style={{
            width: 10, height: 10, borderRadius: 99,
            border: `1.5px solid ${h.done ? h.color : 'var(--fb-border-strong, var(--fb-border))'}`,
            background: h.done ? h.color : 'transparent',
          }} title={h.name} />
        ))}
      </div>
    </div>
  );

  // S (318×152) — ring left + 3 habit rows right (no flat bar)
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, display: 'grid', gridTemplateColumns: '78px 1fr', gap: 12, alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <Ring size={78} pct={pct} color="var(--fb-accent)" />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ ...numSerif(22), color: 'var(--fb-accent)' }}>{MOCK.habitsDone}</span>
          <span style={{ fontSize: 8, color: 'var(--fb-text-3)', marginTop: -2 }}>/ {MOCK.habitsTotal}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ ...eyebrow, fontSize: 9 }}>Habits</span>
        {MOCK.habits.slice(0, 3).map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 14, height: 14, borderRadius: 4,
              border: `1.5px solid ${h.done ? h.color : 'var(--fb-border-strong, var(--fb-border))'}`,
              background: h.done ? h.color : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 9, flexShrink: 0,
            }}>{h.done ? '✓' : ''}</span>
            <span style={{ fontSize: 11.5 }}>{h.icon}</span>
            <span style={{ fontSize: 11, color: h.done ? 'var(--fb-text-3)' : 'var(--fb-text)', textDecoration: h.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // M (484×318) — big ring left + 5 habits right + week dots row
  const weekGrid = ['L','M','M','G','V','S','D'];
  if (size === 'M') return (
    <div style={{ ...card, padding: 18, gap: 14, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Ring size={130} pct={pct} color="var(--fb-accent)" />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ ...numSerif(40), color: 'var(--fb-accent)' }}>{MOCK.habitsDone}</span>
            <span style={{ fontSize: 10, color: 'var(--fb-text-3)', marginTop: -2 }}>/ {MOCK.habitsTotal}</span>
            <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginTop: 3 }}>{Math.round(pct)}% oggi</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={eyebrow}>Habits</span>
          <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: 'var(--fb-text-2)', marginTop: 4 }}>
            <span><span className="tnum">{MOCK.habitsDone}</span> oggi</span>
            <span><span className="tnum">5</span> streak</span>
            <span><span className="tnum">78%</span> sett</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 10, borderTop: '1px solid var(--fb-divider)', overflow: 'hidden' }}>
        {MOCK.habits.slice(0, 4).map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 20, height: 20, borderRadius: 99,
              border: `2px solid ${h.done ? h.color : 'var(--fb-border)'}`,
              background: h.done ? h.color : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, flexShrink: 0,
            }}>{h.done ? '✓' : ''}</span>
            <span style={{ fontSize: 13 }}>{h.icon}</span>
            <span style={{ flex: 1, fontSize: 12, color: h.done ? 'var(--fb-text-3)' : 'var(--fb-text)', textDecoration: h.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {weekGrid.map((d, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: (i < 5 && Math.random() > 0.3) || (i === 6 && h.done) ? h.color : 'var(--fb-border-strong, var(--fb-border))',
                  opacity: i === 6 ? 1 : 0.55,
                }} title={d} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // L (1024×318) — ring + habits list + BIG heatmap dominante
  const WEEKS = 20;
  function hatch(seed: number, total: number) {
    return Array.from({ length: total }, (_, i) => Math.floor(((seed + i * 7) % 11) / 2.5));
  }
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '180px 200px 1fr', gap: 20, overflow: 'hidden' }}>
      {/* RING column */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <span style={eyebrow}>Habits · oggi</span>
        <div style={{ position: 'relative' }}>
          <Ring size={150} pct={pct} color="var(--fb-accent)" />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={numSerif(44, 'var(--fb-accent)')}>{MOCK.habitsDone}</span>
            <span style={{ fontSize: 12, color: 'var(--fb-text-3)' }}>/ {MOCK.habitsTotal}</span>
            <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginTop: 4 }}>{Math.round(pct)}% done</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
          <span style={{ color: 'var(--fb-text-3)' }}>🔥 <strong style={{ color: 'var(--fb-accent)' }} className="tnum">5</strong></span>
          <span style={{ color: 'var(--fb-text-3)' }}>best <strong style={{ color: 'var(--fb-text)' }} className="tnum">14</strong></span>
        </div>
      </div>

      {/* HABITS LIST compact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Today</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
          {MOCK.habits.slice(0, 6).map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 16, height: 16, borderRadius: 99,
                border: `2px solid ${h.done ? h.color : 'var(--fb-border)'}`,
                background: h.done ? h.color : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 9, flexShrink: 0,
              }}>{h.done ? '✓' : ''}</span>
              <span style={{ fontSize: 11.5, width: 14, textAlign: 'center' }}>{h.icon}</span>
              <span style={{ flex: 1, fontSize: 11, color: h.done ? 'var(--fb-text-3)' : 'var(--fb-text)', textDecoration: h.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* HEATMAP — BIG, riempie tutto lo spazio rimanente */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Activity · {WEEKS} weeks</div>
            <div style={{ fontSize: 11, color: 'var(--fb-text-2)', marginTop: 2 }}>
              <span className="tnum" style={{ color: 'var(--fb-accent)', fontWeight: 700 }}>78%</span> media · <span className="tnum" style={{ color: 'var(--fb-text)' }}>92</span> giorni attivi
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--fb-text-3)' }}>
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                width: 11, height: 11, borderRadius: 2,
                background: i === 0 ? 'var(--fb-bg-2)' : `color-mix(in srgb, var(--fb-accent) ${i*22}%, transparent)`,
              }} />
            ))}
            <span>More</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center', minHeight: 0 }}>
          {/* Day labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9, color: 'var(--fb-text-3)', lineHeight: 1 }}>
            {['Lu','','Me','','Ve','','Do'].map((d, i) => (
              <span key={i} style={{ height: 18, display: 'flex', alignItems: 'center' }}>{d}</span>
            ))}
          </div>
          {/* Heatmap */}
          <div style={{ display: 'flex', gap: 3, flex: 1, height: '100%' }}>
            {Array.from({ length: WEEKS }, (_, w) => (
              <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                {hatch(w * 13, 7).map((intensity, d) => {
                  const colors = [
                    'var(--fb-bg-2)',
                    'color-mix(in srgb, var(--fb-accent) 22%, transparent)',
                    'color-mix(in srgb, var(--fb-accent) 44%, transparent)',
                    'color-mix(in srgb, var(--fb-accent) 70%, transparent)',
                    'var(--fb-accent)',
                  ];
                  return (
                    <div key={d} style={{
                      width: '100%', height: 18, borderRadius: 3,
                      background: colors[Math.min(4, intensity)],
                    }} title={`week ${w+1}, day ${d+1}`} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Month labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', paddingLeft: 18 }}>
          {['Gen','Feb','Mar','Apr','Mag'].map(m => <span key={m}>{m}</span>)}
        </div>
      </div>
    </div>
  );
}

// 6) SLEEP ───────────────────────────────────────────────────────────────────
function Sleep({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const targetMin = 480; // 8h
  const actualMin = 420; // 7h
  const debtMin = targetMin - actualMin;

  // XS (158×152) — duration only, big
  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>🌙 Sleep</span>
      <div style={numSerif(40)}>{MOCK.sleep.duration}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1,2,3,4,5].map(n => (
          <span key={n} style={{
            width: 6, height: 6, borderRadius: 99,
            background: n <= MOCK.sleep.quality ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
          }} />
        ))}
      </div>
    </div>
  );

  // S (318×152) — duration + bedtime/wake + quality + mini sparkline
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={eyebrow}>🌙 Sleep</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={numSerif(32)}>{MOCK.sleep.duration}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 10.5, color: 'var(--fb-text-3)' }}>
              {MOCK.sleep.bedtime} → {MOCK.sleep.wake}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Quality</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1,2,3,4,5].map(n => (
              <span key={n} style={{
                width: 7, height: 7, borderRadius: 99,
                background: n <= MOCK.sleep.quality ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
              }} />
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>7-day avg</span>
          <span className="tnum">7h 20m</span>
        </div>
        <Spark points={MOCK.sleep.weekMin} color="var(--fb-accent)" height={22} />
      </div>
    </div>
  );

  // M (484×318) — hero + quality + stats grid + sparkline
  if (size === 'M') return (
    <div style={{ ...card, padding: 18, gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={eyebrow}>🌙 Sleep · ieri notte</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={numSerif(54)}>{MOCK.sleep.duration}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>
              {MOCK.sleep.bedtime} → {MOCK.sleep.wake}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fb-amber)', fontWeight: 600, marginTop: 2 }}>Debt -{Math.floor(debtMin/60)}h {debtMin%60}m vs target 8h</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Quality</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5].map(n => (
              <span key={n} style={{
                width: 9, height: 9, borderRadius: 99,
                background: n <= MOCK.sleep.quality ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
              }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--fb-text)', fontWeight: 600 }} className="tnum">{MOCK.sleep.quality}/5</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, paddingTop: 8, borderTop: '1px solid var(--fb-divider)' }}>
        {[
          { l: 'Bed',   v: MOCK.sleep.bedtime, c: 'var(--fb-text)' },
          { l: 'Wake',  v: MOCK.sleep.wake,    c: 'var(--fb-text)' },
          { l: 'Avg 7g', v: '7h 20m',          c: 'var(--fb-text-2)' },
          { l: 'Streak', v: '5 gg',            c: 'var(--fb-accent)' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.l}</span>
            <span style={numSerif(15, s.c)}>{s.v}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--fb-divider)', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days</span>
          <span className="tnum">avg 7h 20m · target 8h</span>
        </div>
        <Spark points={MOCK.sleep.weekMin} color="var(--fb-accent)" height={50} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'var(--fb-text-3)' }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
        </div>
      </div>
    </div>
  );

  // L (1024×318) — 4-col: hero | sparkline 7gg | sleep stats | bed→wake timeline
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '240px 1fr 200px 240px', gap: 22, overflow: 'hidden' }}>
      {/* HERO */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span style={eyebrow}>🌙 Sleep · ieri</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={numSerif(72)}>{MOCK.sleep.duration}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)', marginTop: 2 }}>
            {MOCK.sleep.bedtime} → {MOCK.sleep.wake}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fb-amber)', fontWeight: 600, marginTop: 2 }}>
            Debt -{Math.floor(debtMin/60)}h {debtMin%60}m
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10 }}>
          <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Quality {MOCK.sleep.quality}/5</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5].map(n => (
              <span key={n} style={{
                flex: 1, height: 8, borderRadius: 99,
                background: n <= MOCK.sleep.quality ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* SPARKLINE 7gg */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days</span>
          <span className="tnum">avg 7h 20m · target 8h</span>
        </div>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
          {/* target line */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '20%', height: 1, borderTop: '1px dashed var(--fb-amber)', opacity: 0.5 }}>
            <span style={{ position: 'absolute', right: 0, top: -14, fontSize: 8.5, color: 'var(--fb-amber)' }}>target 8h</span>
          </div>
          <div style={{ flex: 1 }}>
            <Spark points={MOCK.sleep.weekMin} color="var(--fb-accent)" height={130} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
        </div>
      </div>

      {/* STATS column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Settimana</div>
        {[
          { l: 'Avg',     v: '7h 20m', c: 'var(--fb-text)' },
          { l: 'Best',    v: '8h 30m', c: 'var(--fb-green)' },
          { l: 'Worst',   v: '6h 00m', c: 'var(--fb-red)' },
          { l: 'Debt tot', v: '-4h 12m', c: 'var(--fb-amber)' },
          { l: 'Streak',  v: '5 gg', c: 'var(--fb-accent)' },
        ].map(s => (
          <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--fb-text-3)' }}>{s.l}</span>
            <span className="tnum" style={{ color: s.c, fontWeight: 600 }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* TIMELINE — bed→wake graphic */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 16, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Timeline</div>
        <div style={{ position: 'relative', flex: 1, background: 'linear-gradient(180deg, var(--fb-bg-2) 0%, color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2)) 50%, var(--fb-bg-2) 100%)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ fontSize: 14 }}>🌙</span>
            <span style={{ color: 'var(--fb-text-3)' }}>Bed</span>
            <span style={{ marginLeft: 'auto', color: 'var(--fb-text)', fontWeight: 600 }} className="tnum">{MOCK.sleep.bedtime}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ fontSize: 14 }}>💤</span>
            <span style={{ color: 'var(--fb-text-3)' }}>Sonno</span>
            <span style={{ marginLeft: 'auto', color: 'var(--fb-accent)', fontWeight: 700 }} className="tnum">{MOCK.sleep.duration}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ fontSize: 14 }}>☀️</span>
            <span style={{ color: 'var(--fb-text-3)' }}>Wake</span>
            <span style={{ marginLeft: 'auto', color: 'var(--fb-text)', fontWeight: 600 }} className="tnum">{MOCK.sleep.wake}</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--fb-text-3)', textAlign: 'center' }}>
          Sleep score <strong style={{ color: 'var(--fb-accent)' }} className="tnum">72/100</strong>
        </div>
      </div>
    </div>
  );
}

// 7) MOOD ────────────────────────────────────────────────────────────────────
function Mood({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const metrics = [
    { label: '😊', name: 'Mood',    val: MOCK.moodVal, color: 'var(--fb-accent)', trend: '+12%', week: [3, 4, 3, 4, 5, 3, 4] },
    { label: '⚡', name: 'Energy',  val: MOCK.energy,  color: '#10b981',          trend: '+5%',  week: [3, 3, 4, 4, 4, 4, 4] },
    { label: '😰', name: 'Stress',  val: MOCK.stress,  color: '#ef4444',          trend: '-18%', week: [3, 4, 3, 3, 2, 2, 2] },
  ];

  // XS (158×152) — emoji + mood number
  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 }}>
      <span style={{ fontSize: 36 }}>😊</span>
      <span style={numSerif(22)}>{MOCK.moodVal}/5</span>
      <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Mood</span>
    </div>
  );

  // S (318×152) — 3 metric rows with mini sparklines
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, gap: 7, justifyContent: 'space-between' }}>
      <span style={eyebrow}>Mood</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {metrics.map(m => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{m.label}</span>
            <span style={{ fontSize: 10.5, color: 'var(--fb-text-2)', minWidth: 44 }}>{m.name}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Spark points={m.week} color={m.color} height={14} />
            </div>
            <span style={{ ...numSerif(14, m.color) }}>{m.val}</span>
            <span style={{ fontSize: 9, color: m.trend.startsWith('-') && m.name === 'Stress' ? 'var(--fb-green)' : m.trend.startsWith('-') ? 'var(--fb-red)' : 'var(--fb-green)', fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{m.trend}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // M (484×318) — 3 metric cards + trend sparklines + insight
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, gap: 10, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={eyebrow}>Mood · oggi</span>
        <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>vs settimana scorsa</span>
      </div>

      {/* 3 metric cards inline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {metrics.map(m => {
          const trendGood = m.name === 'Stress' ? m.trend.startsWith('-') : !m.trend.startsWith('-');
          return (
            <div key={m.name} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>{m.label}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: trendGood ? 'var(--fb-green)' : 'var(--fb-red)' }}>{m.trend}</span>
              </div>
              <span style={{ ...numSerif(24, m.color) }}>{m.val}<span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>/5</span></span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{m.name}</span>
            </div>
          );
        })}
      </div>

      {/* Trend sparklines */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 6, minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days</span>
          <span>1–5 scale</span>
        </div>
        {metrics.map(m => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, width: 16 }}>{m.label}</span>
            <div style={{ flex: 1 }}>
              <Spark points={m.week} color={m.color} height={16} />
            </div>
          </div>
        ))}
      </div>

      {/* Insight */}
      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2))', border: '1px solid var(--fb-border)', fontSize: 10.5, color: 'var(--fb-text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12 }}>💡</span>
        <span><strong style={{ color: 'var(--fb-text)' }}>Mood ↑</strong> nei giorni con sonno &gt; 7h <span style={{ color: 'var(--fb-text-3)' }}>(r=0.71)</span></span>
      </div>
    </div>
  );

  // L (1024×318) — hero | 3 big trend charts | correlations panel
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 22, overflow: 'hidden' }}>
      {/* HERO */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
        <span style={eyebrow}>Mood · oggi</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {metrics.map(m => {
            const trendGood = m.name === 'Stress' ? m.trend.startsWith('-') : !m.trend.startsWith('-');
            return (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, width: 28, textAlign: 'center' }}>{m.label}</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{m.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ ...numSerif(30, m.color) }}>{m.val}</span>
                    <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>/5</span>
                  </div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: trendGood ? 'var(--fb-green)' : 'var(--fb-red)', padding: '2px 7px', borderRadius: 99, background: trendGood ? 'color-mix(in srgb, var(--fb-green) 12%, transparent)' : 'color-mix(in srgb, var(--fb-red) 12%, transparent)' }}>{m.trend}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* TREND CHARTS — big stacked sparklines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Trend · 7 days</span>
          <span>1–5 scale</span>
        </div>
        {metrics.map(m => (
          <div key={m.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{m.label}</span>
              <span style={{ fontSize: 10, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{m.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fb-text-3)' }} className="tnum">avg {(m.week.reduce((a,b)=>a+b,0)/m.week.length).toFixed(2)}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Spark points={m.week} color={m.color} height={42} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'var(--fb-text-3)', paddingTop: 2 }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
        </div>
      </div>

      {/* CORRELATIONS panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Insights</div>
        {[
          { icon: '💡', text: <><strong style={{ color: 'var(--fb-text)' }}>Mood ↑</strong> nei giorni con sonno &gt; 7h</>, hint: 'r=0.71 · strong', color: 'var(--fb-green)' },
          { icon: '⚠️', text: <><strong style={{ color: 'var(--fb-text)' }}>Stress ↑</strong> quando caffeina &gt; 2 tazze</>, hint: 'r=0.54 · medium', color: 'var(--fb-amber)' },
          { icon: '🎯', text: <><strong style={{ color: 'var(--fb-text)' }}>Energy ↑</strong> dopo workout entro 24h</>, hint: 'r=0.62 · medium', color: 'var(--fb-green)' },
        ].map((ins, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13 }}>{ins.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--fb-text-2)', lineHeight: 1.4 }}>{ins.text}</span>
                <div style={{ fontSize: 9, color: ins.color, marginTop: 2, fontWeight: 600 }}>{ins.hint}</div>
              </div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: '6px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2))', border: '1px solid var(--fb-border)', fontSize: 10.5, color: 'var(--fb-text-2)', fontStyle: 'italic' }}>
          “{MOCK.moodNote}”
        </div>
      </div>
    </div>
  );
}

// 8) FOCUS ───────────────────────────────────────────────────────────────────
function AreaChart({ points, color, height, target }: { points: number[]; color: string; height: number; target?: number }) {
  const max = Math.max(...points, target ?? 0, 1);
  const w = 100;
  const stepX = w / (points.length - 1);
  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${100 - (v / max) * 100}`).join(' ');
  const areaPath = `${linePath} L ${w} 100 L 0 100 Z`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={`focus-area-${color.replace(/[^\w]/g,'')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {target != null && (
        <line x1="0" y1={100 - (target / max) * 100} x2="100" y2={100 - (target / max) * 100}
          stroke="var(--fb-amber)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.6" vectorEffect="non-scaling-stroke" />
      )}
      <path d={areaPath} fill={`url(#focus-area-${color.replace(/[^\w]/g,'')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((v, i) => (
        <circle key={i} cx={i * stepX} cy={100 - (v / max) * 100} r="1.4"
          fill={i === points.length - 1 ? color : 'transparent'}
          stroke={color} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Focus({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const goalMin = 90;
  const todayPct = Math.min(100, (MOCK.focus.todayMin / goalMin) * 100);
  const weekTotal = MOCK.focus.weekPts.reduce((a, b) => a + b, 0);
  const pomos = Math.floor(MOCK.focus.todayMin / 25);
  const projects = [
    { icon: '🎓', name: MOCK.focus.project, min: 95, color: 'var(--fb-accent)' },
    { icon: '💻', name: 'Coding',          min: 45, color: '#7aa6c8' },
    { icon: '📚', name: 'Lettura',         min: 25, color: '#7cba6c' },
  ];
  const projectMax = Math.max(...projects.map(p => p.min));

  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>🧠 Focus</span>
      <div style={numSerif(34)}>{MOCK.focus.todayMin}m</div>
      <div style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>{pomos} pomodori</div>
    </div>
  );

  if (size === 'S') return (
    <div style={{ ...card, padding: 12, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={eyebrow}>🧠 Focus</span>
        <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>{pomos} 🍅</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={numSerif(32)}>{MOCK.focus.todayMin}</span>
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--fb-text-2)' }}>min · goal {goalMin}m</span>
      </div>
      <Spark points={MOCK.focus.weekPts} height={20} />
    </div>
  );

  // M (484×318) — 2x2 quadrant layout: ring | pomodoro grid | area chart | projects
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14, overflow: 'hidden' }}>
      {/* TL: ring + minutes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Ring size={86} pct={todayPct} color="var(--fb-accent)" />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...numSerif(22), color: 'var(--fb-accent)' }}>{MOCK.focus.todayMin}</span>
            <span style={{ fontSize: 8.5, color: 'var(--fb-text-3)', letterSpacing: 0.5 }}>/ {goalMin}m</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={eyebrow}>🧠 Focus</span>
          <span style={{ fontSize: 11, color: 'var(--fb-text-2)' }}>Oggi</span>
          <span style={{ fontSize: 10.5, color: 'var(--fb-accent)', fontWeight: 700 }}>{Math.round(todayPct)}% goal</span>
        </div>
      </div>

      {/* TR: pomodoro grid */}
      <div style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Pomodori</span>
          <span style={{ ...numSerif(20, 'var(--fb-accent)') }}>{pomos}</span>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} style={{
              width: 18, height: 18, borderRadius: 5,
              background: i < pomos ? 'var(--fb-accent)' : 'transparent',
              border: i < pomos ? 'none' : '1.5px dashed var(--fb-border-strong, var(--fb-border))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: i < pomos ? 'white' : 'transparent',
            }}>🍅</span>
          ))}
        </div>
      </div>

      {/* BL: area chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1 / 2' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>7 days</span>
          <span className="tnum">{Math.floor(weekTotal/60)}h {weekTotal%60}m</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AreaChart points={MOCK.focus.weekPts} color="var(--fb-accent)" height={60} target={goalMin} />
        </div>
      </div>

      {/* BR: projects */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '2 / 3' }}>
        <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Top projects</span>
        {projects.slice(0, 3).map(p => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, width: 14 }}>{p.icon}</span>
            <span style={{ flex: 1, fontSize: 10.5, color: 'var(--fb-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <div style={{ width: 50, height: 4, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${(p.min/projectMax)*100}%`, background: p.color, borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }} className="tnum">{p.min}m</span>
          </div>
        ))}
      </div>
    </div>
  );

  // L (1024×318) — ring + big area chart hero + pomodoros + projects+stats
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '230px 1fr 280px', gap: 22, overflow: 'hidden' }}>
      {/* LEFT — ring + pomodoros */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={eyebrow}>🧠 Focus · oggi</span>
          <div style={{ position: 'relative' }}>
            <Ring size={150} pct={todayPct} color="var(--fb-accent)" />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ ...numSerif(40, 'var(--fb-accent)') }}>{MOCK.focus.todayMin}</span>
              <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>/ {goalMin}m</span>
              <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginTop: 3 }}>{Math.round(todayPct)}% goal</span>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Pomodori</span>
            <span style={{ ...numSerif(16, 'var(--fb-accent)') }}>{pomos}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{
                flex: 1, aspectRatio: '1', maxWidth: 20, borderRadius: 4,
                background: i < pomos ? 'var(--fb-accent)' : 'transparent',
                border: i < pomos ? 'none' : '1.5px dashed var(--fb-border-strong, var(--fb-border))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: i < pomos ? 'white' : 'transparent',
              }}>🍅</span>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER — big area chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Last 7 days</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ ...numSerif(24) }}>{Math.floor(weekTotal/60)}h {weekTotal%60}m</span>
              <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>tot · avg {Math.round(weekTotal/7)}m/giorno</span>
            </div>
          </div>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-amber) 12%, transparent)', color: 'var(--fb-amber)', fontWeight: 700, letterSpacing: 0.4 }}>goal {goalMin}m/d</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AreaChart points={MOCK.focus.weekPts} color="var(--fb-accent)" height={150} target={goalMin} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
        </div>
      </div>

      {/* RIGHT — projects + stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Top projects</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {projects.map(p => (
              <div key={p.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--fb-text-2)' }}>{p.icon} {p.name}</span>
                  <span className="tnum" style={{ color: 'var(--fb-text)', fontWeight: 600 }}>{p.min}m</span>
                </div>
                <div style={{ height: 5, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${(p.min/projectMax)*100}%`, background: p.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--fb-divider)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { l: 'Avg/giorno', v: `${Math.round(weekTotal/7)}m` },
            { l: 'Best day',   v: `${Math.max(...MOCK.focus.weekPts)}m` },
            { l: 'Streak',     v: '5 gg', accent: true },
            { l: 'Pomos sett', v: `${Math.floor(weekTotal/25)}`, accent: true },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.l}</div>
              <div style={numSerif(15, s.accent ? 'var(--fb-accent)' : 'var(--fb-text)')}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Real anatomical body using react-body-highlighter (same lib as ExercisePage)
const TOKEN_TO_LIB: Record<string, Muscle[]> = {
  chest:       ['chest'],
  back:        ['upper-back', 'lower-back'],
  shoulders:   ['front-deltoids', 'back-deltoids'],
  biceps:      ['biceps'],
  triceps:     ['triceps'],
  forearms:    ['forearm'],
  quadriceps:  ['quadriceps'],
  hamstrings:  ['hamstring'],
  glutes:      ['gluteal'],
  calves:      ['calves'],
  abs:         ['abs'],
  obliques:    ['obliques'],
  traps:       ['trapezius'],
  adductors:   ['adductor', 'abductors'],
};

const BODY_HIGHLIGHT_COLORS = ['#f4dcaa', '#edc070', '#e2a23c', '#d97706'];

function intensityToData(intensity: Record<string, 0|1|2|3|4>): IExerciseData[] {
  const out: IExerciseData[] = [];
  for (const [token, value] of Object.entries(intensity)) {
    if (value === 0) continue;
    const libs = TOKEN_TO_LIB[token];
    if (!libs) continue;
    out.push({ name: token, muscles: libs, frequency: value });
  }
  return out;
}

function BodyMap({
  width, view = 'front', intensity = {},
}: {
  width: number;
  view?: 'front' | 'back';
  intensity?: Record<string, 0|1|2|3|4>;
}) {
  const data = intensityToData(intensity);
  return (
    <Model
      data={data}
      type={view === 'front' ? 'anterior' : 'posterior'}
      bodyColor="var(--fb-border-strong)"
      highlightedColors={BODY_HIGHLIGHT_COLORS}
      svgStyle={{ width, height: 'auto', display: 'block' }}
    />
  );
}

// 9) WORKOUT ─────────────────────────────────────────────────────────────────
function Workout({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  // Last-7-days muscle activity (intensity 0-4)
  const muscles: Record<string, 0|1|2|3|4> = {
    chest: 4, shoulders: 3, triceps: 4, biceps: 1,
    abs: 2, forearms: 1, quadriceps: 2, calves: 1,
    obliques: 1, traps: 2, hamstrings: 0, glutes: 0,
    back: 1, adductors: 0,
  };

  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>💪 Workout</span>
      <div style={numSerif(32)}>{MOCK.workout.durationMin}m</div>
      <div style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>{MOCK.workout.kcal} kcal</div>
    </div>
  );

  // S (318×152) — duration/kcal left + small body silhouette right
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, display: 'grid', gridTemplateColumns: '1fr 60px', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={eyebrow}>💪 Workout</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={numSerif(32)}>{MOCK.workout.durationMin}m</span>
            <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>· {MOCK.workout.kcal} kcal</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--fb-text-3)', marginTop: 2 }}>Effort {MOCK.workout.effort}/10</div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i < MOCK.workout.effort ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <BodyMap width={56} intensity={muscles} />
      </div>
    </div>
  );

  // M (484×318) — body map left + stats grid + trend chart right
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '110px 1fr', gap: 14, overflow: 'hidden' }}>
      {/* LEFT — body map */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Front</span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <BodyMap width={100} intensity={muscles} />
        </div>
      </div>

      {/* RIGHT — stats column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={eyebrow}>💪 Workout · oggi</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={numSerif(40)}>{MOCK.workout.durationMin}m</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>{MOCK.workout.kcal} kcal</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fb-text-3)' }}>1 sessione · Push pulldown</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 3 }}>Effort {MOCK.workout.effort}/10</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < MOCK.workout.effort ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))' }} />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
            <span>Last 7 days</span>
            <span className="tnum">110m tot</span>
          </div>
          <AreaChart points={[20, 0, 35, 0, 25, 0, 10]} color="var(--fb-accent)" height={60} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: 'Sessioni', v: '4', c: 'var(--fb-text)' },
            { l: 'Volume',   v: '12.4t', c: 'var(--fb-text)' },
            { l: 'Streak',   v: '2 gg', c: 'var(--fb-accent)' },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '5px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.l}</div>
              <div style={numSerif(14, s.c)}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // L (1024×318) — body front+back + stats hero + chart + sessions list
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '180px 220px 1fr 240px', gap: 22, overflow: 'hidden' }}>
      {/* Body maps front+back */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around', gap: 4, paddingTop: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Front</span>
          <BodyMap width={80} intensity={muscles} view="front" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Back</span>
          <BodyMap width={80} intensity={muscles} view="back" />
        </div>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingLeft: 12, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <span style={eyebrow}>💪 Workout · oggi</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={numSerif(56)}>{MOCK.workout.durationMin}m</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)' }}>{MOCK.workout.kcal} kcal · 1 sessione</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>Effort {MOCK.workout.effort}/10</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 7, borderRadius: 2, background: i < MOCK.workout.effort ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { l: 'Sett',   v: '4 ses' },
            { l: 'Volume', v: '12.4 t' },
            { l: 'Streak', v: '2 gg', accent: true },
            { l: 'PR',     v: '+5kg', accent: true },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '5px 8px' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.l}</div>
              <div style={numSerif(13, s.accent ? 'var(--fb-accent)' : 'var(--fb-text)')}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 14, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Volume · 7 days</span>
          <span className="tnum">12.4 t</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AreaChart points={[2.4, 0, 3.2, 0, 2.8, 0, 1.2]} color="var(--fb-accent)" height={160} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
        </div>
      </div>

      {/* Sessions list + muscle legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 14, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Top muscoli 7gg</div>
          {[
            { name: 'Petto',      level: 4 },
            { name: 'Tricipiti',  level: 4 },
            { name: 'Spalle',     level: 3 },
            { name: 'Quadricipiti', level: 2 },
            { name: 'Addominali', level: 2 },
          ].map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--fb-text-2)' }}>{m.name}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {[1, 2, 3, 4].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: 2,
                    background: i <= m.level ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
                  }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--fb-divider)', fontSize: 10.5, color: 'var(--fb-text-3)' }}>
          <strong style={{ color: 'var(--fb-amber)' }}>Recovery:</strong> petto/tricipiti carichi · gambe scariche
        </div>
      </div>
    </div>
  );
}

// 10) STREAKS ────────────────────────────────────────────────────────────────
function Streaks({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const best = Math.max(...MOCK.streaks.map(s => s.current));
  const flameColor = (n: number) => n === 0 ? '#6b7280' : n < 7 ? '#f97316' : n < 30 ? '#f59e0b' : '#ef4444';
  // Mock 7-day history per section (1 = done, 0 = missed)
  const history: Record<string, number[]> = {
    sleep:   [1, 1, 1, 1, 1, 1, 1],
    diet:    [1, 1, 1, 1, 1, 1, 1],
    focus:   [0, 0, 0, 0, 0, 0, 1],
    workout: [0, 0, 0, 0, 0, 1, 1],
  };

  if (size === 'XS') return (
    <div style={{ ...card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>Streak</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 24 }}>🔥</span>
        <span style={numSerif(28)}>{best}</span>
      </div>
      <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>{MOCK.streaks.filter(s => s.current > 0).length}/4 active</span>
    </div>
  );

  // S (318×152) — 2×2 grid of streak chips
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, justifyContent: 'space-between' }}>
      <span style={eyebrow}>Streaks</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 6 }}>
        {MOCK.streaks.map(s => {
          const active = s.current > 0;
          return (
            <div key={s.section} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px',
              background: active ? 'color-mix(in srgb, var(--fb-accent) 10%, transparent)' : 'var(--fb-bg-2)',
              border: `1px solid ${active ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 13 }}>{s.icon}</span>
              <span style={{ flex: 1, fontSize: 10, color: 'var(--fb-text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ fontSize: 11 }}>🔥</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: flameColor(s.current) }} className="tnum">{s.current}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // M (484×318) — 4 streaks row + history grid table (4 rows × 7 days)
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={eyebrow}>Streaks · 4 sezioni</span>
        <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{MOCK.streaks.filter(s => s.current > 0).length}/4 attive</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        {MOCK.streaks.map(s => {
          const active = s.current > 0;
          return (
            <div key={s.section} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px',
              background: active ? 'color-mix(in srgb, var(--fb-accent) 8%, transparent)' : 'var(--fb-bg-2)',
              border: `1px solid ${active ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
              borderRadius: 10,
            }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{s.name}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 12 }}>🔥</span>
                <span style={numSerif(20, flameColor(s.current))}>{s.current}</span>
              </div>
              <span style={{ fontSize: 8.5, color: 'var(--fb-text-3)' }}>best {s.best}</span>
            </div>
          );
        })}
      </div>

      {/* History grid 4 sections × 14 days */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 8, borderTop: '1px solid var(--fb-divider)', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 14 days</span>
          <span>● done · ○ missed</span>
        </div>
        {MOCK.streaks.map(s => {
          // Generate 14-day history
          const days = Array.from({ length: 14 }, (_, i) => {
            const recent = i >= 14 - s.current;
            return recent ? 1 : Math.random() > 0.4 ? 1 : 0;
          });
          return (
            <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, width: 16 }}>{s.icon}</span>
              <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                {days.map((d, i) => (
                  <div key={i} style={{
                    flex: 1, height: 14, borderRadius: 2,
                    background: d ? flameColor(s.current) : 'var(--fb-border-strong, var(--fb-border))',
                    opacity: d ? (i >= 14 - s.current ? 1 : 0.55) : 0.5,
                  }} />
                ))}
              </div>
              <span style={numSerif(11, flameColor(s.current))} className="tnum" >{s.current}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // L (1024×318) — 4 streaks left | timeline chart center | records right
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '280px 1fr 260px', gap: 22, overflow: 'hidden' }}>
      {/* LEFT — 4 section cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>Streaks · oggi</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MOCK.streaks.map(s => {
            const active = s.current > 0;
            return (
              <div key={s.section} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: active ? 'color-mix(in srgb, var(--fb-accent) 8%, transparent)' : 'var(--fb-bg-2)',
                border: `1px solid ${active ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--fb-text)' }}>{s.name}</span>
                <span style={{ fontSize: 14 }}>🔥</span>
                <span style={numSerif(22, flameColor(s.current))}>{s.current}</span>
                <span style={{ fontSize: 9, color: 'var(--fb-text-3)', minWidth: 36, textAlign: 'right' }}>best {s.best}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* CENTER — heatmap-style table 4 sections × 21 days */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Activity · last 21 days</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--fb-text-3)' }}>
            <span>missed</span>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--fb-border-strong)' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f97316' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />
            <span>active</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
          {MOCK.streaks.map(s => {
            const days = Array.from({ length: 21 }, (_, i) => {
              const recent = i >= 21 - s.current;
              return recent ? 1 : Math.random() > 0.45 ? 1 : 0;
            });
            return (
              <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 88 }}>
                  <span style={{ fontSize: 13 }}>{s.icon}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fb-text-2)' }}>{s.name}</span>
                </div>
                <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                  {days.map((d, i) => (
                    <div key={i} style={{
                      flex: 1, height: 22, borderRadius: 3,
                      background: d ? flameColor(s.current) : 'var(--fb-border-strong, var(--fb-border))',
                      opacity: d ? (i >= 21 - s.current ? 1 : 0.45) : 0.6,
                    }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', fontSize: 9, color: 'var(--fb-text-3)', paddingLeft: 96 }}>
          <span style={{ flex: 1 }}>3w fa</span>
          <span>oggi</span>
        </div>
      </div>

      {/* RIGHT — records & stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>Records 🏆</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {MOCK.streaks.slice().sort((a, b) => b.best - a.best).map(s => (
              <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--fb-text-2)' }}>{s.name}</span>
                <span style={numSerif(15)} className="tnum">{s.best}</span>
                <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>days</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ paddingTop: 10, borderTop: '1px solid var(--fb-divider)' }}>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Totale</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Sum oggi</div>
              <div style={numSerif(18, 'var(--fb-accent)')}>{MOCK.streaks.reduce((a, b) => a + b.current, 0)}</div>
            </div>
            <div style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>All-time</div>
              <div style={numSerif(18, 'var(--fb-text)')}>{MOCK.streaks.reduce((a, b) => a + b.best, 0)}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', fontSize: 10.5, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
          🔥 +6 giorni alla milestone <strong style={{ color: 'var(--fb-text)' }}>30</strong>
        </div>
      </div>
    </div>
  );
}

// 11) MEAL SUGGESTION — Smart Coach (macro gap + ranked suggestions)
function MealSuggest({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const { macroGap, suggestions, slot, remaining } = MOCK.meal;
  // Identify biggest macro gap for headline
  const gaps = [
    { key: 'P', label: 'Protein', val: macroGap.protein, color: 'var(--fb-red)',   unit: 'g' },
    { key: 'C', label: 'Carbs',   val: macroGap.carbs,   color: 'var(--fb-amber)', unit: 'g' },
    { key: 'F', label: 'Fat',     val: macroGap.fat,     color: 'var(--fb-green)', unit: 'g' },
  ];
  const biggest = gaps.slice().filter(g => g.val > 0).sort((a, b) => b.val - a.val)[0];

  function MacroDeltaBadge({ p, c, f }: { p: number; c: number; f: number }) {
    return (
      <div style={{ display: 'flex', gap: 4, fontSize: 9 }}>
        <span style={{ color: 'var(--fb-red)', fontWeight: 700 }} className="tnum">+{p}P</span>
        <span style={{ color: 'var(--fb-amber)', fontWeight: 700 }} className="tnum">+{c}C</span>
        <span style={{ color: 'var(--fb-green)', fontWeight: 700 }} className="tnum">+{f}F</span>
      </div>
    );
  }

  // XS (158×152) — biggest macro gap headline + 1 suggestion icon
  if (size === 'XS') return (
    <div style={{ ...card, padding: 12, gap: 4, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>Eat next</span>
      {biggest && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ ...numSerif(28, biggest.color) }}>+{biggest.val}</span>
            <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{biggest.unit} {biggest.key}</span>
          </div>
          <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>{biggest.label} mancanti</span>
        </>
      )}
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {suggestions.slice(0, 3).map(s => (
          <span key={s.name} style={{ fontSize: 14 }}>{s.emoji}</span>
        ))}
      </div>
    </div>
  );

  // S (318×152) — macro gap bars + 1 top suggestion
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, gap: 8, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={eyebrow}>Eat next · snack</span>
        <span style={{ ...numSerif(16, 'var(--fb-orange)') }}>{remaining}<span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}> kcal</span></span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {gaps.map(g => (
          <div key={g.key} style={{ flex: 1, padding: '4px 6px', background: 'var(--fb-bg-2)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: g.color, letterSpacing: 0.4 }}>{g.key}</div>
            <div style={{ ...numSerif(13, g.val > 0 ? g.color : 'var(--fb-text-3)') }}>
              {g.val > 0 ? '+' : ''}{g.val}{g.unit}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2))', border: '1px solid var(--fb-accent)', borderRadius: 8 }}>
        <span style={{ fontSize: 18 }}>{suggestions[0].emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggestions[0].name}</div>
          <MacroDeltaBadge p={suggestions[0].p} c={suggestions[0].c} f={suggestions[0].f} />
        </div>
      </div>
    </div>
  );

  // M (484×318) — macro gaps + 3 ranked suggestions
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, gap: 11, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={eyebrow}>Smart coach · {slot}</span>
          <div style={{ fontSize: 10.5, color: 'var(--fb-text-3)', marginTop: 2 }}>
            <span style={{ ...numSerif(22, 'var(--fb-orange)') }}>{remaining}</span>
            <span style={{ marginLeft: 4 }}>kcal · macro residui</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
        {gaps.map(g => {
          const target = g.key === 'P' ? 169 : g.key === 'C' ? 210 : 65;
          const filled = target - g.val;
          const pct = Math.max(0, Math.min(100, (filled / target) * 100));
          return (
            <div key={g.key} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 8, padding: '6px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: g.color, letterSpacing: 0.6, textTransform: 'uppercase' }}>{g.label}</span>
                <span style={{ ...numSerif(15, g.val > 0 ? g.color : 'var(--fb-text-3)') }}>{g.val > 0 ? '+' : ''}{g.val}<span style={{ fontSize: 9 }}>g</span></span>
              </div>
              <div style={{ height: 4, background: 'var(--fb-bg)', borderRadius: 99, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: g.color, borderRadius: 99 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Suggested · ranked</span>
          <span>match score</span>
        </div>
        {suggestions.slice(0, 3).map((s, i) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: i === 0 ? 'color-mix(in srgb, var(--fb-accent) 7%, var(--fb-bg-2))' : 'var(--fb-bg-2)', border: `1px solid ${i === 0 ? 'var(--fb-accent)' : 'var(--fb-border)'}`, borderRadius: 8 }}>
            <span style={{ fontSize: 18 }}>{s.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)' }} className="tnum">{s.kcal} kcal</span>
                <MacroDeltaBadge p={s.p} c={s.c} f={s.f} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <span style={{ ...numSerif(13, 'var(--fb-accent)') }}>{s.score}</span>
              {s.expiring && <span style={{ fontSize: 7.5, padding: '1px 5px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-red) 12%, transparent)', color: 'var(--fb-red)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>expiring</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // L (1024×318) — macro gap viz | 4 ranked suggestions | smart hints
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '240px 1fr 240px', gap: 22, overflow: 'hidden' }}>
      {/* LEFT — macro gap visualization */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <span style={eyebrow}>Smart coach · {slot}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span style={numSerif(40, 'var(--fb-orange)')}>{remaining}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>kcal residue</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Macro gap</div>
          {gaps.map(g => {
            const target = g.key === 'P' ? 169 : g.key === 'C' ? 210 : 65;
            const filled = target - g.val;
            const pct = Math.max(0, Math.min(100, (filled / target) * 100));
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: g.color }}>{g.label}</span>
                  <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: g.val > 0 ? g.color : 'var(--fb-text-3)' }}>
                    {g.val > 0 ? `+${g.val}g needed` : g.val === 0 ? '✓ done' : `${g.val}g over`}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--fb-bg-2)', borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: g.color, borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', marginTop: 2 }} className="tnum">{filled.toFixed(0)}/{target}g</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CENTER — 4 ranked suggestions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Suggested · ranked by match</span>
          <span>{suggestions.length} opzioni</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
          {suggestions.slice(0, 4).map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px', background: i === 0 ? 'color-mix(in srgb, var(--fb-accent) 7%, var(--fb-bg-2))' : 'var(--fb-bg-2)', border: `1px solid ${i === 0 ? 'var(--fb-accent)' : 'var(--fb-border)'}`, borderRadius: 9 }}>
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  {s.pantry && <span style={{ fontSize: 7.5, padding: '1px 5px', borderRadius: 99, background: 'var(--fb-accent-soft)', color: 'var(--fb-accent)', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>pantry</span>}
                  {s.expiring && <span style={{ fontSize: 7.5, padding: '1px 5px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-red) 14%, transparent)', color: 'var(--fb-red)', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>expiring</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }} className="tnum">{s.g}g · {s.kcal} kcal · {s.prep}m prep</span>
                  <MacroDeltaBadge p={s.p} c={s.c} f={s.f} />
                </div>
                <div style={{ fontSize: 9, color: 'var(--fb-text-3)', fontStyle: 'italic', marginTop: 1 }}>{s.why}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ ...numSerif(16, 'var(--fb-accent)') }}>{s.score}</span>
                <span style={{ fontSize: 7.5, color: 'var(--fb-text-3)', letterSpacing: 0.5, textTransform: 'uppercase' }}>match</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — smart hints + filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Filter</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['Pantry', '⚠ Expiring', 'High P', 'Quick (<5m)', 'Vegan'].map((f, i) => (
              <span key={f} style={{
                fontSize: 9.5, padding: '3px 8px', borderRadius: 99,
                background: i < 2 ? 'var(--fb-accent-soft)' : 'var(--fb-bg-2)',
                border: `1px solid ${i < 2 ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                color: i < 2 ? 'var(--fb-accent)' : 'var(--fb-text-3)',
                fontWeight: 600, cursor: 'pointer',
              }}>{f}</span>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 12px', background: 'color-mix(in srgb, var(--fb-accent) 10%, var(--fb-bg-2))', border: '1px solid var(--fb-accent)', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--fb-accent)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
            <span>💡</span><span>Coach tip</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fb-text)', lineHeight: 1.4, marginTop: 4 }}>
            Ti mancano <strong>80g proteine</strong>. Lo yogurt greco copre il <strong style={{ color: 'var(--fb-red)' }}>18%</strong> del gap in 1 min.
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Pantry expiring</div>
            <div style={{ fontSize: 11, color: 'var(--fb-text)', fontWeight: 600 }}>2 items in 3gg</div>
          </div>
          <span style={{ fontSize: 16 }}>⚠️</span>
        </div>
      </div>
    </div>
  );
}

// 12) ADAPTIVE TDEE — Energy Story (intake vs TDEE → weight projection)
function AdaptiveTdee({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  const { value, confidence, dataPoints, avgIntake, delta, kgPerWeek, trend, proj } = MOCK.tdee;
  const confColor = confidence === 'high' ? 'var(--fb-green)' : confidence === 'medium' ? 'var(--fb-amber)' : 'var(--fb-red)';
  const deltaColor = delta < 0 ? 'var(--fb-green)' : delta > 0 ? 'var(--fb-orange)' : 'var(--fb-text-2)';
  const trendNormalized = trend.map(v => v - 1900);

  // XS (158×152) — TDEE big + projection
  if (size === 'XS') return (
    <div style={{ ...card, padding: 12, gap: 3, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>TDEE</span>
      <div style={numSerif(28)}>{value.toLocaleString('it-IT')}</div>
      <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>kcal/day</span>
      <div style={{ marginTop: 3, padding: '2px 7px', borderRadius: 99, background: `color-mix(in srgb, ${deltaColor} 14%, transparent)`, color: deltaColor, fontWeight: 700, fontSize: 10 }}>
        {kgPerWeek > 0 ? '+' : ''}{kgPerWeek} kg/w
      </div>
    </div>
  );

  // S (318×152) — TDEE + intake bars + Δ
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, gap: 6, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ ...eyebrow, fontSize: 9 }}>Adaptive TDEE</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
            <span style={numSerif(26)}>{value.toLocaleString('it-IT')}</span>
            <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>kcal/d</span>
          </div>
        </div>
        <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 99, color: confColor, border: `1px solid ${confColor}`, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{confidence}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--fb-green)', width: 24, fontWeight: 700 }}>↑ IN</span>
          <div style={{ flex: 1, height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${(avgIntake/value)*100}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
          </div>
          <span className="tnum" style={{ fontSize: 9.5, color: 'var(--fb-text-2)', minWidth: 32, textAlign: 'right' }}>{avgIntake.toLocaleString('it-IT')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--fb-orange)', width: 24, fontWeight: 700 }}>↓ OUT</span>
          <div style={{ flex: 1, height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: '100%', background: 'var(--fb-orange)', borderRadius: 99 }} />
          </div>
          <span className="tnum" style={{ fontSize: 9.5, color: 'var(--fb-text-2)', minWidth: 32, textAlign: 'right' }}>{value.toLocaleString('it-IT')}</span>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: deltaColor, fontWeight: 600 }}>
        <span className="tnum">Δ {delta > 0 ? '+' : ''}{delta}</span> → <span className="tnum">{kgPerWeek > 0 ? '+' : ''}{kgPerWeek} kg/sett</span>
      </div>
    </div>
  );

  // M (484×318) — full story compact
  if (size === 'M') return (
    <div style={{ ...card, padding: 16, gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={eyebrow}>Adaptive TDEE · 14 days</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={numSerif(44)}>{value.toLocaleString('it-IT')}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>kcal/day</span>
          </div>
        </div>
        <span style={{ fontSize: 9.5, padding: '4px 10px', borderRadius: 99, color: confColor, border: `1px solid ${confColor}`, background: `color-mix(in srgb, ${confColor} 8%, transparent)`, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{confidence} · {dataPoints} dp</span>
      </div>

      {/* Intake vs TDEE bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--fb-green)', width: 50, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>↑ IN</span>
          <div style={{ flex: 1, height: 10, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${(avgIntake/value)*100}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
          </div>
          <span className="tnum" style={{ fontSize: 12, color: 'var(--fb-text)', fontWeight: 600, minWidth: 46, textAlign: 'right' }}>{avgIntake.toLocaleString('it-IT')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--fb-orange)', width: 50, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>↓ OUT</span>
          <div style={{ flex: 1, height: 10, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: '100%', background: 'var(--fb-orange)', borderRadius: 99 }} />
          </div>
          <span className="tnum" style={{ fontSize: 12, color: 'var(--fb-text)', fontWeight: 600, minWidth: 46, textAlign: 'right' }}>{value.toLocaleString('it-IT')}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: `color-mix(in srgb, ${deltaColor} 8%, var(--fb-bg-2))`, border: `1px solid ${deltaColor}` }}>
        <div>
          <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Daily Δ</div>
          <div style={{ ...numSerif(20, deltaColor) }}>{delta > 0 ? '+' : ''}{delta}<span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}> kcal</span></div>
        </div>
        <span style={{ fontSize: 18, color: deltaColor }}>→</span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Proiezione</div>
          <div style={{ ...numSerif(20, deltaColor) }}>{kgPerWeek > 0 ? '+' : ''}{kgPerWeek}<span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}> kg/sett</span></div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>TDEE trend · 14 days</span>
          <span>steady ↘</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AreaChart points={trendNormalized} color="var(--fb-accent)" height={60} />
        </div>
      </div>
    </div>
  );

  // L (1024×318) — 3-col: hero/comparison | trend chart | projections
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '280px 1fr 240px', gap: 22, overflow: 'hidden' }}>
      {/* LEFT — hero + intake/out + delta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={eyebrow}>Adaptive TDEE</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={numSerif(54)}>{value.toLocaleString('it-IT')}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--fb-text-2)' }}>kcal/d</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>misurato · 14 giorni</span>
          </div>
          <span style={{ fontSize: 9.5, padding: '3px 8px', borderRadius: 99, color: confColor, border: `1px solid ${confColor}`, background: `color-mix(in srgb, ${confColor} 8%, transparent)`, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{confidence} · {dataPoints}dp</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--fb-green)', width: 36, fontWeight: 700 }}>↑ IN</span>
            <div style={{ flex: 1, height: 9, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${(avgIntake/value)*100}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
            </div>
            <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text)', fontWeight: 600, minWidth: 42, textAlign: 'right' }}>{avgIntake}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--fb-orange)', width: 36, fontWeight: 700 }}>↓ OUT</span>
            <div style={{ flex: 1, height: 9, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
              <div style={{ height: '100%', width: '100%', background: 'var(--fb-orange)', borderRadius: 99 }} />
            </div>
            <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text)', fontWeight: 600, minWidth: 42, textAlign: 'right' }}>{value}</span>
          </div>
        </div>

        <div style={{ padding: '10px 12px', borderRadius: 10, background: `color-mix(in srgb, ${deltaColor} 10%, var(--fb-bg-2))`, border: `1px solid ${deltaColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Daily Δ</div>
              <div style={{ ...numSerif(22, deltaColor) }}>{delta > 0 ? '+' : ''}{delta}</div>
            </div>
            <span style={{ fontSize: 18, color: deltaColor }}>→</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Weight</div>
              <div style={{ ...numSerif(22, deltaColor) }}>{kgPerWeek > 0 ? '+' : ''}{kgPerWeek} <span style={{ fontSize: 11 }}>kg/w</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER — trend chart big */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>TDEE trend · 14 days</span>
            <div style={{ fontSize: 11, color: 'var(--fb-text-2)', marginTop: 2 }}>
              <span className="tnum" style={{ color: 'var(--fb-text)', fontWeight: 600 }}>2,240</span> → <span className="tnum" style={{ color: 'var(--fb-text)', fontWeight: 600 }}>2,100</span>
              <span style={{ marginLeft: 8, color: 'var(--fb-amber)' }}>↘ -6.3% adaptive drop</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <AreaChart points={trendNormalized} color="var(--fb-accent)" height={160} target={trend.reduce((a,b)=>a+b,0)/trend.length - 1900} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          <span>14d ago</span>
          <span>7d</span>
          <span>oggi</span>
        </div>
      </div>

      {/* RIGHT — projections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Proiezione peso</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: '4 settimane', kg: proj.w4 },
            { label: '8 settimane', kg: proj.w8 },
            { label: '12 settimane', kg: proj.w12 },
          ].map(p => (
            <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 8 }}>
              <span style={{ fontSize: 10.5, color: 'var(--fb-text-2)', fontWeight: 600 }}>{p.label}</span>
              <span style={{ ...numSerif(18, p.kg < 0 ? 'var(--fb-green)' : p.kg > 0 ? 'var(--fb-orange)' : 'var(--fb-text)') }}>
                {p.kg > 0 ? '+' : ''}{p.kg} <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>kg</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2))', border: '1px solid var(--fb-accent)', fontSize: 10.5, color: 'var(--fb-text-2)' }}>
          <span style={{ fontSize: 9, color: 'var(--fb-accent)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>💡 Suggerimento</span>
          <div style={{ marginTop: 2 }}>Continuando, raggiungi il goal in <strong style={{ color: 'var(--fb-text)' }} className="tnum">~10 settimane</strong></div>
        </div>
      </div>
    </div>
  );
}

// 13) INSIGHT — Network Graph (correlation map)
type GNode = { id: string; emoji: string; label: string; x: number; y: number };
type GEdge = { from: string; to: string; r: number };

function NetworkGraph({
  width, height, nodes, edges, nodeR = 16, showLabels = true, highlightEdge,
}: {
  width: number; height: number; nodes: GNode[]; edges: GEdge[];
  nodeR?: number; showLabels?: boolean;
  highlightEdge?: { from: string; to: string };
}) {
  const isHi = (e: GEdge) => highlightEdge && ((e.from === highlightEdge.from && e.to === highlightEdge.to) || (e.from === highlightEdge.to && e.to === highlightEdge.from));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Edges */}
      {edges.map((e, i) => {
        const from = nodes.find(n => n.id === e.from)!;
        const to = nodes.find(n => n.id === e.to)!;
        const strokeWidth = Math.abs(e.r) * 4 + 0.5;
        const color = e.r > 0 ? 'var(--fb-green)' : 'var(--fb-red)';
        const op = isHi(e) ? 1 : Math.max(0.25, Math.abs(e.r));
        // Midpoint for label
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        return (
          <g key={i}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={color} strokeWidth={strokeWidth} strokeOpacity={op}
              strokeLinecap="round" />
            {showLabels && (
              <g transform={`translate(${mx}, ${my})`}>
                <rect x="-12" y="-7" width="24" height="14" rx="7"
                  fill="var(--fb-bg-2)" stroke={color} strokeOpacity={op + 0.2} strokeWidth="0.6" />
                <text x="0" y="3.5" textAnchor="middle"
                  style={{ fontSize: 8.5, fontWeight: 700, fill: color, fontFamily: 'var(--font-display)' }}>
                  {e.r > 0 ? '+' : ''}{e.r.toFixed(2)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {/* Nodes */}
      {nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={nodeR + 2} fill="var(--fb-bg)" />
          <circle cx={n.x} cy={n.y} r={nodeR} fill="var(--fb-bg-2)" stroke="var(--fb-border-strong, var(--fb-border))" strokeWidth="1" />
          <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: nodeR * 1.05 }}>
            {n.emoji}
          </text>
          {showLabels && (
            <text x={n.x} y={n.y + nodeR + 9} textAnchor="middle"
              style={{ fontSize: 8.5, fontWeight: 700, fill: 'var(--fb-text-3)', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
              {n.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Insight({ size }: { size: 'XS'|'S'|'M'|'L' }) {
  // Compact 3-node graph for S (viewBox 280×130, fit emoji + label below)
  const smallNodes: GNode[] = [
    { id: 'sleep',   emoji: '😴', label: 'Sleep',   x: 40,  y: 32 },
    { id: 'mood',    emoji: '😊', label: 'Mood',    x: 240, y: 32 },
    { id: 'workout', emoji: '💪', label: 'Workout', x: 140, y: 100 },
  ];
  const smallEdges: GEdge[] = [
    { from: 'sleep',   to: 'mood',    r: 0.71 },
    { from: 'workout', to: 'mood',    r: 0.55 },
    { from: 'sleep',   to: 'workout', r: -0.40 },
  ];

  // 6-node graph — M uses portrait viewBox, L uses landscape
  const bigNodesM: GNode[] = [
    { id: 'sleep',    emoji: '😴', label: 'Sleep',    x: 55,  y: 40 },
    { id: 'mood',     emoji: '😊', label: 'Mood',     x: 215, y: 40 },
    { id: 'workout',  emoji: '💪', label: 'Workout',  x: 55,  y: 160 },
    { id: 'energy',   emoji: '⚡', label: 'Energy',   x: 215, y: 160 },
    { id: 'caffeine', emoji: '☕', label: 'Caffeine', x: 55,  y: 280 },
    { id: 'stress',   emoji: '😰', label: 'Stress',   x: 215, y: 280 },
  ];
  const bigNodesL: GNode[] = [
    { id: 'sleep',    emoji: '😴', label: 'Sleep',    x: 60,  y: 35 },
    { id: 'mood',     emoji: '😊', label: 'Mood',     x: 260, y: 35 },
    { id: 'workout',  emoji: '💪', label: 'Workout',  x: 60,  y: 130 },
    { id: 'energy',   emoji: '⚡', label: 'Energy',   x: 260, y: 130 },
    { id: 'caffeine', emoji: '☕', label: 'Caffeine', x: 60,  y: 225 },
    { id: 'stress',   emoji: '😰', label: 'Stress',   x: 260, y: 225 },
  ];
  const bigEdges: GEdge[] = [
    { from: 'sleep',    to: 'mood',     r:  0.71 },
    { from: 'workout',  to: 'energy',   r:  0.62 },
    { from: 'caffeine', to: 'stress',   r:  0.54 },
    { from: 'sleep',    to: 'stress',   r: -0.45 },
    { from: 'workout',  to: 'sleep',    r: -0.40 },
    { from: 'mood',     to: 'energy',   r:  0.55 },
  ];

  // XS — top correlation as story
  if (size === 'XS') return (
    <div style={{ ...card, padding: 12, gap: 4, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ ...eyebrow, fontSize: 8.5 }}>Top insight</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
        <span style={{ fontSize: 22 }}>😴</span>
        <div style={{ width: 30, height: 2, background: 'var(--fb-green)', borderRadius: 99, position: 'relative' }}>
          <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 700, color: 'var(--fb-green)', background: 'var(--fb-bg-2)', padding: '0 3px', borderRadius: 99 }}>+0.71</span>
        </div>
        <span style={{ fontSize: 22 }}>😊</span>
      </div>
      <span style={{ fontSize: 9.5, color: 'var(--fb-text-2)', textAlign: 'center', lineHeight: 1.3 }}>
        Sonno ↑ <strong style={{ color: 'var(--fb-text)' }}>mood +24%</strong>
      </span>
    </div>
  );

  // S — small graph 3 nodes (full-width wider format)
  if (size === 'S') return (
    <div style={{ ...card, padding: 12, gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...eyebrow, fontSize: 9 }}>Connection map</span>
        <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>3 correlazioni</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <NetworkGraph width={280} height={130} nodes={smallNodes} edges={smallEdges} nodeR={14} highlightEdge={{ from: 'sleep', to: 'mood' }} />
      </div>
    </div>
  );

  // M (484×318) — full graph + top insight panel
  if (size === 'M') return (
    <div style={{ ...card, padding: 14, display: 'grid', gridTemplateColumns: '230px 1fr', gap: 12, overflow: 'hidden' }}>
      {/* Graph */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...eyebrow, fontSize: 9 }}>Connection map</span>
        <div style={{ flex: 1, minHeight: 0 }}>
          <NetworkGraph width={270} height={320} nodes={bigNodesM} edges={bigEdges} nodeR={18} highlightEdge={{ from: 'sleep', to: 'mood' }} />
        </div>
      </div>

      {/* Right panel — top insight */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fb-green)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Top correlation</span>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-green) 14%, transparent)', color: 'var(--fb-green)', fontWeight: 700 }}>r = +0.71</span>
            <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>strong</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 24 }}>😴</span>
            <span style={{ fontSize: 16, color: 'var(--fb-green)' }}>→</span>
            <span style={{ fontSize: 24 }}>😊</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--fb-text)', marginLeft: 4 }}>+24% mood</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fb-text-2)', lineHeight: 1.4, marginTop: 6 }}>
            Quando dormi <strong style={{ color: 'var(--fb-text)' }}>7h+</strong>, il tuo <strong style={{ color: 'var(--fb-text)' }}>mood medio</strong> sale del <strong style={{ color: 'var(--fb-green)' }}>24%</strong>.
          </div>
          <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2))', border: '1px solid var(--fb-accent)', fontSize: 10.5, color: 'var(--fb-text-2)' }}>
            💡 Punta a <strong style={{ color: 'var(--fb-text)' }}>7.5h</strong> nelle prossime 2 settimane
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--fb-divider)', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Altre connessioni</div>
          {[
            { from: '💪', to: '⚡', r: 0.62, label: 'Workout → Energy' },
            { from: '☕', to: '😰', r: 0.54, label: 'Caffè → Stress' },
            { from: '😴', to: '😰', r: -0.45, label: 'Sonno → Stress' },
          ].map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
              <span>{e.from}</span>
              <span style={{ color: e.r > 0 ? 'var(--fb-green)' : 'var(--fb-red)' }}>→</span>
              <span>{e.to}</span>
              <span style={{ flex: 1, color: 'var(--fb-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
              <span className="tnum" style={{ fontSize: 9.5, fontWeight: 700, color: e.r > 0 ? 'var(--fb-green)' : 'var(--fb-red)' }}>{e.r > 0 ? '+' : ''}{e.r.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // L (1024×318) — big graph + insight detail + ranked list
  return (
    <div style={{ ...card, padding: 20, display: 'grid', gridTemplateColumns: '340px 1fr 280px', gap: 22, overflow: 'hidden' }}>
      {/* Graph dominant */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={eyebrow}>Connection map</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'var(--fb-text-3)' }}>
            <span style={{ width: 18, height: 2, background: 'var(--fb-green)', borderRadius: 99 }} />
            <span>positiva</span>
            <span style={{ width: 18, height: 2, background: 'var(--fb-red)', borderRadius: 99, marginLeft: 6 }} />
            <span>negativa</span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <NetworkGraph width={320} height={260} nodes={bigNodesL} edges={bigEdges} nodeR={20} highlightEdge={{ from: 'sleep', to: 'mood' }} />
        </div>
      </div>

      {/* Featured insight */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fb-green)', letterSpacing: 0.6, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-green) 12%, transparent)', border: '1px solid var(--fb-green)' }}>Insight of the week</span>
          <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }} className="tnum">r = +0.71 · strong</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 40 }}>😴</span>
          <div style={{ flex: 1, height: 3, background: 'linear-gradient(90deg, var(--fb-text-3), var(--fb-green))', borderRadius: 99, position: 'relative' }}>
            <span style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: 'var(--fb-green)', background: 'var(--fb-card)', padding: '2px 8px', borderRadius: 99, border: '1px solid var(--fb-green)' }}>+24% mood</span>
          </div>
          <span style={{ fontSize: 40 }}>😊</span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--fb-text-2)', lineHeight: 1.5 }}>
          Quando dormi <strong style={{ color: 'var(--fb-text)' }}>≥ 7h</strong>, il tuo mood medio sale del <strong style={{ color: 'var(--fb-green)' }}>24%</strong> rispetto a notti più brevi. Pattern osservato in <strong>14/18 giornate</strong>.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ flex: 1, padding: '8px 10px', background: 'color-mix(in srgb, var(--fb-accent) 8%, var(--fb-bg-2))', border: '1px solid var(--fb-accent)', borderRadius: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--fb-accent)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>💡 Azione</span>
            <div style={{ fontSize: 11, color: 'var(--fb-text)', marginTop: 2 }}>Punta a <strong>7.5h</strong> nelle prossime 2 settimane</div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', fontSize: 9, color: 'var(--fb-text-3)' }}>
          Data quality: <strong style={{ color: 'var(--fb-amber)' }}>Tier 2</strong> · 18 punti dato · p &lt; 0.05
        </div>
      </div>

      {/* Ranked list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>All correlations</span>
          <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>6 found</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {bigEdges.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map((e, i) => {
            const fromN = bigNodesL.find(n => n.id === e.from)!;
            const toN = bigNodesL.find(n => n.id === e.to)!;
            const isTop = i === 0;
            const color = e.r > 0 ? 'var(--fb-green)' : 'var(--fb-red)';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: isTop ? 'color-mix(in srgb, var(--fb-green) 6%, var(--fb-bg-2))' : 'var(--fb-bg-2)', border: `1px solid ${isTop ? 'var(--fb-green)' : 'var(--fb-border)'}`, borderRadius: 7 }}>
                <span style={{ fontSize: 13 }}>{fromN.emoji}</span>
                <span style={{ color: color, fontSize: 10 }}>{e.r > 0 ? '→' : '⊣'}</span>
                <span style={{ fontSize: 13 }}>{toN.emoji}</span>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--fb-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 4 }}>{fromN.label} → {toN.label}</span>
                <span className="tnum" style={{ fontSize: 10, fontWeight: 700, color }}>{e.r > 0 ? '+' : ''}{e.r.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', fontSize: 9.5, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
          Click un nodo per dettagli
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page shell
// ────────────────────────────────────────────────────────────────────────────
const WIDGETS: Array<{ name: string; comp: (props: { size: 'XS'|'S'|'M'|'L' }) => ReactNode }> = [
  { name: 'Daily Intake', comp: DailyIntake },
  { name: 'Balance',      comp: Balance      },
  { name: 'Water',        comp: Water        },
  { name: 'Tasks',        comp: Tasks        },
  { name: 'Habits',       comp: Habits       },
  { name: 'Sleep',        comp: Sleep        },
  { name: 'Mood',         comp: Mood         },
  { name: 'Focus',        comp: Focus        },
  { name: 'Workout',      comp: Workout      },
  { name: 'Streaks',      comp: Streaks      },
  { name: 'Meal Suggest', comp: MealSuggest  },
  { name: 'Adaptive TDEE',comp: AdaptiveTdee },
  { name: 'Insight',      comp: Insight      },
];

export default function WidgetPreviewPage() {
  const [filter, setFilter] = useState<string>('all');
  const filtered = filter === 'all' ? WIDGETS : WIDGETS.filter(w => w.name === filter);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--fb-bg)', color: 'var(--fb-text)',
      fontFamily: 'var(--font-body)', padding: '40px 32px 80px',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--fb-accent)' }}>
            LifeBuddy · Widget design preview
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 42, fontWeight: 400, margin: '6px 0 4px',
            letterSpacing: -1, color: 'var(--fb-text)',
          }}>
            Proposed layouts at every size
          </h1>
          <p style={{ fontSize: 13, color: 'var(--fb-text-2)', maxWidth: 720 }}>
            Ogni widget mostrato in XS, S, M, L. Dati fittizi. Le proporzioni sono quelle reali
            del bento grid in produzione (auto-rows 152px, gap 14px). Apri questa pagina nel browser:
            <code style={{ color: 'var(--fb-accent)', marginLeft: 6 }}>http://localhost:5199/#widget-preview</code>
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
            <button onClick={() => setFilter('all')} style={chipStyle(filter === 'all')}>All</button>
            {WIDGETS.map(w => (
              <button key={w.name} onClick={() => setFilter(w.name)} style={chipStyle(filter === w.name)}>{w.name}</button>
            ))}
          </div>
        </header>

        {filtered.map(w => (
          <Row key={w.name} title={w.name}>
            <Cell size="XS" label={w.name}>{w.comp({ size: 'XS' })}</Cell>
            <Cell size="S"  label={w.name}>{w.comp({ size: 'S'  })}</Cell>
            <Cell size="M"  label={w.name}>{w.comp({ size: 'M'  })}</Cell>
            <Cell size="L"  label={w.name}>{w.comp({ size: 'L'  })}</Cell>
          </Row>
        ))}
      </div>
    </div>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 99,
    border: active ? '1px solid var(--fb-accent)' : '1px solid var(--fb-border)',
    background: active ? 'var(--fb-accent-soft)' : 'transparent',
    color: active ? 'var(--fb-accent)' : 'var(--fb-text-2)',
    fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-display)', letterSpacing: 0.3,
  };
}
