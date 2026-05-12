import { useState, useMemo, useCallback } from 'react';
import Model, { type IExerciseData, type IMuscleStats, type Muscle } from 'react-body-highlighter';
import { useT } from '../i18n/useT';
import type { MuscleActivity } from '../types';

interface Props {
  activity: MuscleActivity[];
  sex: 'male' | 'female' | 'unspecified';
  windowDays: number;
}

// Our internal muscle tokens → library muscle names
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

const LIB_TO_TOKEN: Record<string, string> = {};
for (const [token, libs] of Object.entries(TOKEN_TO_LIB)) {
  for (const l of libs) LIB_TO_TOKEN[l] = token;
}

const ALL_LIB_MUSCLES = Array.from(new Set(Object.values(TOKEN_TO_LIB).flat()));

// Amber ramp — index = frequency - 1 (clamped by the library)
const HIGHLIGHT_COLORS = ['#f4dcaa', '#edc070', '#e2a23c', '#d97706'];
const BODY_COLOR = 'var(--fb-border-strong)';

function intensityBucket(i: number): number {
  if (i <= 0) return 0;
  if (i <= 0.25) return 1;
  if (i <= 0.5) return 2;
  if (i <= 0.75) return 3;
  return 4;
}

export default function BodyMuscleMap({ activity, sex, windowDays }: Props) {
  const { t } = useT();
  const [selected, setSelected] = useState<string | null>(null);

  const intensityMap = useMemo(() => {
    const maxScore = Math.max(...activity.map(a => a.score), 0);
    const map: Record<string, number> = {};
    for (const a of activity) map[a.muscle] = maxScore > 0 ? a.score / maxScore : 0;
    return map;
  }, [activity]);

  const actMap = useMemo(() => {
    const m: Record<string, MuscleActivity> = {};
    for (const a of activity) m[a.muscle] = a;
    return m;
  }, [activity]);

  const fullBodyGlow = (actMap['full_body']?.score ?? 0) > 0;

  // Build the library data array
  const data = useMemo<IExerciseData[]>(() => {
    const out: IExerciseData[] = [];
    const used = new Set<Muscle>();
    for (const a of activity) {
      if (a.muscle === 'full_body') continue;
      const libs = TOKEN_TO_LIB[a.muscle];
      if (!libs) continue; // unknown token → chip legend
      const bucket = intensityBucket(intensityMap[a.muscle] ?? 0);
      if (bucket === 0) continue;
      out.push({ name: a.muscle, muscles: libs, frequency: bucket });
      for (const l of libs) used.add(l);
    }
    if (fullBodyGlow) {
      const missing = ALL_LIB_MUSCLES.filter(m => !used.has(m));
      if (missing.length) out.push({ name: 'full_body', muscles: missing, frequency: 1 });
    }
    return out;
  }, [activity, intensityMap, fullBodyGlow]);

  const handleClick = useCallback(({ muscle }: IMuscleStats) => {
    const token = LIB_TO_TOKEN[muscle];
    setSelected(prev => (token && prev !== token ? token : null));
  }, []);

  // Sex variant: posterior view doubles as a "wider hips" hint by mirroring;
  // the library has no female model, so we use anterior+posterior and keep
  // the sex prop only for the caption (informative).
  const sexLabel = sex === 'female' ? t('settings.sex.female')
    : sex === 'male' ? t('settings.sex.male')
    : null;

  function Tooltip() {
    if (!selected) return null;
    const a = actMap[selected];
    const label = t(`muscle.${selected}` as never);
    const daysSince = a?.last_date ? Math.round((Date.now() - new Date(a.last_date).getTime()) / 86400000) : null;
    return (
      <div style={{
        position: 'absolute', top: -4, left: '50%', transform: 'translate(-50%,-100%)',
        background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
        borderRadius: 8, padding: '6px 10px', zIndex: 10,
        fontSize: 12, color: 'var(--fb-text)', lineHeight: 1.6,
        whiteSpace: 'nowrap', boxShadow: '0 2px 14px rgba(0,0,0,0.2)',
      }}>
        <strong>{label}</strong>
        {a && a.sets > 0 ? (
          <>
            <br /><span style={{ fontSize: 11 }}>{t('workouts.muscleMap.setsCount').replace('{n}', String(a.sets))}</span>
            {daysSince != null && <><br /><span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{t('workouts.muscleMap.lastTrained').replace('{n}', String(daysSince))}</span></>}
          </>
        ) : (
          <><br /><span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{t('workouts.muscleMap.notTrained')}</span></>
        )}
      </div>
    );
  }

  const chipTokens = activity.filter(a => a.muscle !== 'full_body' && !TOKEN_TO_LIB[a.muscle]);

  const figureStyle = { width: '100%', height: 'auto', maxWidth: 150 } as const;

  return (
    <div style={{ position: 'relative' }}>
      <p style={{ fontSize: 12, color: 'var(--fb-text-3)', margin: '0 0 14px', textAlign: 'center' }}>
        {t('workouts.muscleMap.subtitle').replace('{n}', String(windowDays))}
        {sexLabel && <span style={{ opacity: 0.6 }}> · {sexLabel}</span>}
      </p>

      <div style={{ position: 'relative', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('workouts.muscleMap.front')}
          </span>
          <Model
            data={data}
            type="anterior"
            bodyColor={BODY_COLOR}
            highlightedColors={HIGHLIGHT_COLORS}
            onClick={handleClick}
            svgStyle={figureStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('workouts.muscleMap.back')}
          </span>
          <Model
            data={data}
            type="posterior"
            bodyColor={BODY_COLOR}
            highlightedColors={HIGHLIGHT_COLORS}
            onClick={handleClick}
            svgStyle={figureStyle}
          />
        </div>
        <Tooltip />
      </div>

      {chipTokens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' }}>
          {chipTokens.map(a => {
            const i = intensityMap[a.muscle] ?? 0;
            const on = i > 0;
            return (
              <span key={a.muscle} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 99,
                background: on ? `color-mix(in srgb, var(--fb-amber) ${Math.round(20 + i * 70)}%, var(--fb-card))` : 'var(--fb-card)',
                border: `1px solid ${on ? 'var(--fb-amber)' : 'var(--fb-border)'}`,
                color: on ? 'var(--fb-amber)' : 'var(--fb-text-3)',
              }}>
                {t(`muscle.${a.muscle}` as never)} {a.sets > 0 ? `· ${a.sets}` : ''}
              </span>
            );
          })}
        </div>
      )}

      {fullBodyGlow && (
        <p style={{ fontSize: 11, color: 'var(--fb-amber)', textAlign: 'center', marginTop: 8, opacity: 0.85 }}>
          ✦ {t('muscle.full_body')}
        </p>
      )}

      <p style={{ fontSize: 10, color: 'var(--fb-text-3)', textAlign: 'center', marginTop: 10, opacity: 0.7 }}>
        {t('workouts.muscleMap.tapHint')}
      </p>
    </div>
  );
}
