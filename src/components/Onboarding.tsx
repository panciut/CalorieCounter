import { useState } from 'react';
import { useT } from '../i18n/useT';
import { serifItalic, cardOuter } from '../lib/fbUI';
import { api } from '../api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingProps {
  onComplete: () => void;
}

type ObjectiveKey = 'sleep' | 'diet' | 'exercise' | 'focus';

interface SetupValues {
  wakeTime: string;
  calTarget: number;
  exerciseDays: number;
  userName: string;
  sex: 'male' | 'female' | 'unspecified';
}

// ── Spring cubic-bezier constant ──────────────────────────────────────────────

const SPRING = 'cubic-bezier(0.16,1,0.3,1)';

// ── Step dot indicator ────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center',
    }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 22 : 8,
            height: 8,
            borderRadius: 99,
            background: i === current ? 'var(--fb-amber)' : 'var(--fb-border-strong)',
            transition: `all .45s ${SPRING}`,
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  );
}

// ── Objective card ────────────────────────────────────────────────────────────

function ObjectiveCard({
  icon, label, selected, onToggle,
}: {
  icon: string; label: string; selected: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px',
        background: selected
          ? 'color-mix(in srgb, var(--fb-amber) 14%, var(--fb-card))'
          : 'var(--fb-card)',
        border: `1.5px solid ${selected ? 'var(--fb-amber)' : 'var(--fb-border)'}`,
        borderRadius: 16,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: `all .3s ${SPRING}`,
        boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--fb-amber) 20%, transparent)' : 'none',
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontSize: 15, fontWeight: 600,
        color: selected ? 'var(--fb-amber)' : 'var(--fb-text)',
        transition: `color .3s ${SPRING}`,
      }}>{label}</span>
      <span style={{
        marginLeft: 'auto',
        width: 22, height: 22,
        borderRadius: '50%',
        border: `2px solid ${selected ? 'var(--fb-amber)' : 'var(--fb-border-strong)'}`,
        background: selected ? 'var(--fb-amber)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: `all .3s ${SPRING}`,
        fontSize: 12, color: 'white', fontWeight: 700,
      }}>
        {selected && '✓'}
      </span>
    </button>
  );
}

// ── Labeled input ─────────────────────────────────────────────────────────────

function LabeledInput({
  label, type, value, onChange, min, max, placeholder, suffix,
}: {
  label: string;
  type: 'text' | 'number' | 'time';
  value: string | number;
  onChange: (v: string) => void;
  min?: number; max?: number;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 11, fontWeight: 600, letterSpacing: 1.1,
        textTransform: 'uppercase', color: 'var(--fb-text-3)',
      }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min} max={max}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'var(--fb-bg)', border: '1.5px solid var(--fb-border)',
            color: 'var(--fb-text)',
            borderRadius: 12, padding: '11px 14px',
            fontSize: 15, outline: 'none',
            transition: `border-color .25s ${SPRING}`,
            fontFamily: 'inherit',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--fb-amber)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--fb-border)'; }}
        />
        {suffix && (
          <span style={{ fontSize: 13, color: 'var(--fb-text-3)', fontWeight: 500, flexShrink: 0 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useT();

  const [step, setStep] = useState(0);

  const [objectives, setObjectives] = useState<Set<ObjectiveKey>>(new Set());
  const [setup, setSetup] = useState<SetupValues>({
    wakeTime: '07:00',
    calTarget: 2000,
    exerciseDays: 3,
    userName: '',
    sex: 'unspecified',
  });
  const [objError, setObjError] = useState(false);
  const [completing, setCompleting] = useState(false);

  const TOTAL_STEPS = 4;

  function goTo(nextStep: number) {
    setStep(nextStep);
  }

  function handleNext() {
    if (step === 1 && objectives.size === 0) {
      setObjError(true);
      return;
    }
    setObjError(false);
    if (step < TOTAL_STEPS - 1) goTo(step + 1);
  }

  function handleBack() {
    if (step > 0) goTo(step - 1);
  }

  function toggleObjective(key: ObjectiveKey) {
    setObjectives(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setObjError(false);
  }

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);

    try {
      const payload: Record<string, string | number> = { user_sex: setup.sex };
      if (objectives.has('diet') && setup.calTarget) payload.cal_rec = setup.calTarget;
      await window.electronAPI.invoke('settings:save', payload);
    } catch (_) {}

    onComplete();
  }

  // Step container style — uses key-based remount + CSS slideIn animation
  const stepContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    flex: 1,
    animation: `slideIn 280ms cubic-bezier(0.16,1,0.3,1)`,
  };

  // ── Button styles ─────────────────────────────────────────────────────────

  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '14px 32px', borderRadius: 99,
    background: 'var(--fb-amber)', color: '#000',
    border: 0, fontSize: 15, fontWeight: 700,
    cursor: completing ? 'not-allowed' : 'pointer',
    opacity: completing ? 0.6 : 1,
    transition: `all .3s ${SPRING}`,
    letterSpacing: 0.2,
    width: '100%',
    boxShadow: '0 4px 20px color-mix(in srgb, var(--fb-amber) 35%, transparent)',
  };

  const btnGhost: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '13px 24px', borderRadius: 99,
    background: 'transparent', color: 'var(--fb-text-2)',
    border: '1.5px solid var(--fb-border-strong)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    transition: `all .25s ${SPRING}`,
    letterSpacing: 0.1,
  };

  const btnRowStyle: React.CSSProperties = {
    display: 'flex', gap: 12, width: '100%',
    marginTop: 8,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--fb-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Background glow decoration */}
      <div style={{
        position: 'absolute', top: '-15%', left: '50%',
        transform: 'translateX(-50%)',
        width: 600, height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--fb-amber) 8%, transparent) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Content container */}
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 480,
        flex: 1,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Steps wrapper — key forces remount + CSS slideIn on each step change */}
        <div key={step} style={stepContainerStyle}>

          {/* ── Step 0: Welcome ─────────────────────────────────────────── */}
          {step === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 32,
              width: '100%', maxWidth: 400,
            }}>
              {/* Logo badge */}
              <div style={{
                width: 88, height: 88, borderRadius: 26,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 32px color-mix(in srgb, #f59e0b 40%, transparent), 0 0 0 1px rgba(255,255,255,0.1)',
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 34, fontWeight: 800,
                  fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                  color: 'white',
                  letterSpacing: -1,
                  textShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>lb</span>
              </div>

              {/* Heading */}
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h1 style={{
                  ...serifItalic,
                  fontSize: 36, fontWeight: 400,
                  color: 'var(--fb-text)',
                  letterSpacing: -0.8, lineHeight: 1.1,
                  margin: 0,
                }}>
                  {t('onboarding.welcome')}
                </h1>
                <p style={{
                  fontSize: 16, color: 'var(--fb-text-2)',
                  margin: 0, lineHeight: 1.5,
                }}>
                  {t('onboarding.subtitle')}
                </p>
              </div>

              {/* Feature pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {[
                  { icon: '🥗', label: 'Nutrizione' },
                  { icon: '💪', label: 'Allenamento' },
                  { icon: '🌙', label: 'Sonno' },
                  { icon: '🧠', label: 'Focus' },
                  { icon: '🏆', label: 'Obiettivi' },
                ].map(f => (
                  <span key={f.label} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 99,
                    background: 'var(--fb-card)',
                    border: '1px solid var(--fb-border)',
                    fontSize: 12.5, fontWeight: 500,
                    color: 'var(--fb-text-2)',
                  }}>
                    {f.icon} {f.label}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={() => goTo(1)}
                style={{ ...btnPrimary, fontSize: 16 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {t('onboarding.start')}
              </button>
            </div>
          )}

          {/* ── Step 1: Goals ───────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              gap: 24, width: '100%', maxWidth: 400,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: 'var(--fb-amber)',
                  marginBottom: 8,
                }}>
                  {t('onboarding.step').replace('{current}', '2').replace('{total}', '4')}
                </div>
                <h2 style={{
                  ...serifItalic,
                  fontSize: 28, fontWeight: 400,
                  color: 'var(--fb-text)',
                  letterSpacing: -0.5, lineHeight: 1.15,
                  margin: '0 0 6px',
                }}>
                  {t('onboarding.goals')}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--fb-text-2)', margin: 0 }}>
                  {t('onboarding.goalsSubtitle')}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ObjectiveCard
                  icon="🌙" label={t('onboarding.goal.sleep')}
                  selected={objectives.has('sleep')}
                  onToggle={() => toggleObjective('sleep')}
                />
                <ObjectiveCard
                  icon="🥗" label={t('onboarding.goal.diet')}
                  selected={objectives.has('diet')}
                  onToggle={() => toggleObjective('diet')}
                />
                <ObjectiveCard
                  icon="💪" label={t('onboarding.goal.exercise')}
                  selected={objectives.has('exercise')}
                  onToggle={() => toggleObjective('exercise')}
                />
                <ObjectiveCard
                  icon="🧠" label={t('onboarding.goal.focus')}
                  selected={objectives.has('focus')}
                  onToggle={() => toggleObjective('focus')}
                />
              </div>

              {objError && (
                <p style={{
                  fontSize: 12.5, color: 'var(--fb-red)',
                  margin: 0, textAlign: 'center',
                  fontWeight: 500,
                }}>
                  {t('onboarding.selectError')}
                </p>
              )}

              <div style={btnRowStyle}>
                <button type="button" onClick={handleBack} style={btnGhost}>
                  {t('onboarding.back')}
                </button>
                <button
                  type="button" onClick={handleNext}
                  style={{ ...btnPrimary, flex: 1 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {t('onboarding.next')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Quick Setup ─────────────────────────────────────── */}
          {step === 2 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              gap: 24, width: '100%', maxWidth: 400,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: 'var(--fb-amber)',
                  marginBottom: 8,
                }}>
                  {t('onboarding.step').replace('{current}', '3').replace('{total}', '4')}
                </div>
                <h2 style={{
                  ...serifItalic,
                  fontSize: 28, fontWeight: 400,
                  color: 'var(--fb-text)',
                  letterSpacing: -0.5, lineHeight: 1.15,
                  margin: '0 0 6px',
                }}>
                  {t('onboarding.setup')}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--fb-text-2)', margin: 0 }}>
                  {t('onboarding.setupSubtitle')}
                </p>
              </div>

              <div style={{ ...cardOuter, gap: 18 }}>
                {/* Name — always shown */}
                <LabeledInput
                  label={t('onboarding.nameLabel')}
                  type="text"
                  value={setup.userName}
                  onChange={v => setSetup(s => ({ ...s, userName: v }))}
                  placeholder={t('onboarding.namePlaceholder')}
                />

                {/* Sex selector — always shown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.1, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>
                    {t('onboarding.sexLabel')}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['male', 'female', 'unspecified'] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSetup(s => ({ ...s, sex: opt }))}
                        style={{
                          flex: 1, padding: '9px 4px', borderRadius: 10,
                          border: `1.5px solid ${setup.sex === opt ? 'var(--fb-amber)' : 'var(--fb-border)'}`,
                          background: setup.sex === opt ? 'color-mix(in srgb, var(--fb-amber) 12%, var(--fb-card))' : 'var(--fb-card)',
                          color: setup.sex === opt ? 'var(--fb-amber)' : 'var(--fb-text-2)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {t(`onboarding.sex.${opt}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {objectives.has('sleep') && (
                  <LabeledInput
                    label={t('onboarding.wakeTime')}
                    type="time"
                    value={setup.wakeTime}
                    onChange={v => setSetup(s => ({ ...s, wakeTime: v }))}
                  />
                )}

                {objectives.has('diet') && (
                  <LabeledInput
                    label={t('onboarding.caloriesTarget')}
                    type="number"
                    value={setup.calTarget}
                    onChange={v => setSetup(s => ({ ...s, calTarget: parseInt(v) || 2000 }))}
                    min={1000} max={6000}
                    placeholder="2000"
                    suffix="kcal"
                  />
                )}

                {objectives.has('exercise') && (
                  <LabeledInput
                    label={t('onboarding.trainDays')}
                    type="number"
                    value={setup.exerciseDays}
                    onChange={v => setSetup(s => ({ ...s, exerciseDays: Math.min(7, Math.max(1, parseInt(v) || 3)) }))}
                    min={1} max={7}
                    placeholder="3"
                    suffix="giorni"
                  />
                )}
              </div>

              <div style={btnRowStyle}>
                <button type="button" onClick={handleBack} style={btnGhost}>
                  {t('onboarding.back')}
                </button>
                <button
                  type="button" onClick={handleNext}
                  style={{ ...btnPrimary, flex: 1 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {t('onboarding.next')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Ready! ──────────────────────────────────────────── */}
          {step === 3 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 28,
              width: '100%', maxWidth: 400,
              textAlign: 'center',
            }}>
              {/* Level badge */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 6px 24px color-mix(in srgb, #f59e0b 40%, transparent)',
                }}>
                  <span style={{ fontSize: 32 }}>⭐</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: 1.4,
                    textTransform: 'uppercase', color: 'var(--fb-amber)',
                  }}>Livello 1</div>
                  <div style={{
                    ...serifItalic,
                    fontSize: 20, fontWeight: 400,
                    color: 'var(--fb-text)',
                  }}>Principiante</div>
                </div>
              </div>

              {/* Title */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 style={{
                  ...serifItalic,
                  fontSize: 32, fontWeight: 400,
                  color: 'var(--fb-text)',
                  letterSpacing: -0.6, lineHeight: 1.1,
                  margin: 0,
                }}>
                  {t('onboarding.ready')}
                </h2>
                <p style={{ fontSize: 15, color: 'var(--fb-text-2)', margin: 0, lineHeight: 1.5 }}>
                  {t('onboarding.readySubtitle')}
                </p>
              </div>

              {/* Points legend */}
              <div style={{
                ...cardOuter,
                width: '100%',
                gap: 0,
                padding: 0,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--fb-border)',
                  fontSize: 10, fontWeight: 600, letterSpacing: 1.2,
                  textTransform: 'uppercase', color: 'var(--fb-text-3)',
                }}>
                  Come guadagnare punti
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 1,
                  background: 'var(--fb-border)',
                }}>
                  {[
                    { icon: '🌙', label: 'Sonno', pts: '+10pt' },
                    { icon: '✅', label: 'Task', pts: '+5pt' },
                    { icon: '🔥', label: 'Abitudine', pts: '+5pt' },
                    { icon: '🧠', label: 'Focus', pts: '+10pt' },
                    { icon: '🥗', label: 'Dieta', pts: '+5pt' },
                    { icon: '💪', label: 'Allenamento', pts: '+10pt' },
                  ].map(item => (
                    <div key={item.label} style={{
                      padding: '10px 14px',
                      background: 'var(--fb-card)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>{item.icon}</span>
                      <span style={{ fontSize: 12, color: 'var(--fb-text-2)', flex: 1 }}>{item.label}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--fb-amber)',
                        fontFeatureSettings: '"tnum"',
                      }}>{item.pts}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing}
                style={{ ...btnPrimary, fontSize: 16 }}
                onMouseEnter={e => { if (!completing) e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {completing ? t('onboarding.loading') : t('onboarding.begin')}
              </button>

              <button type="button" onClick={handleBack} style={{ ...btnGhost, width: '100%' }}>
                {t('onboarding.back')}
              </button>
            </div>
          )}

        </div>

        {/* Step dots */}
        <div style={{ padding: '20px 24px 32px', flexShrink: 0 }}>
          <StepDots current={step} total={TOTAL_STEPS} />
        </div>
      </div>
    </div>
  );
}
