import { useState, useMemo } from 'react';
import { useT } from '../i18n/useT';
import type { MuscleActivity } from '../types';

interface Props {
  activity: MuscleActivity[];
  sex: 'male' | 'female' | 'unspecified';
  windowDays: number;
}

// Body layout params by sex (all relative to CX=60, viewBox 0 0 120 275)
const LAYOUT = {
  male:        { sW: 37, aW: 13, wW: 19, hW: 23 },
  female:      { sW: 29, aW: 11, wW: 16, hW: 29 },
  unspecified: { sW: 33, aW: 12, wW: 18, hW: 26 },
};

const DRAWN_FRONT = new Set(['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'obliques', 'quadriceps', 'calves']);
const DRAWN_BACK  = new Set(['traps', 'back', 'triceps', 'forearms', 'glutes', 'hamstrings', 'calves']);
const DRAWN_ALL   = new Set([...DRAWN_FRONT, ...DRAWN_BACK]);

export default function BodyMuscleMap({ activity, sex, windowDays }: Props) {
  const { t } = useT();
  const [hovered, setHovered] = useState<string | null>(null);

  const { sW, aW, wW, hW } = LAYOUT[sex];
  const CX = 60;
  const sL = CX - sW;  // shoulder inner left
  const sR = CX + sW;  // shoulder inner right
  const aL = sL - aW;  // arm outer left
  const aR = sR + aW;  // arm outer right
  const wL = CX - wW;  // waist left
  const wR = CX + wW;  // waist right
  const hL = CX - hW;  // hip left
  const hR = CX + hW;  // hip right

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

  function fillOpacity(muscle: string): number {
    const base = fullBodyGlow ? 0.12 : 0;
    const i = intensityMap[muscle] ?? 0;
    return i > 0 ? 0.22 + 0.78 * i : base;
  }

  function mp(muscle: string) {
    const op = fillOpacity(muscle);
    const trained = op > 0;
    return {
      fill: trained ? 'var(--fb-amber)' : 'var(--fb-text-3)',
      fillOpacity: trained ? op : 0.18,
      stroke: hovered === muscle ? 'var(--fb-amber)' : (trained ? 'var(--fb-amber)' : 'var(--fb-border-strong)'),
      strokeWidth: hovered === muscle ? 1.8 : (trained ? 0.6 : 0.5),
      strokeOpacity: hovered === muscle ? 1 : (trained ? op + 0.2 : 0.4),
      style: { cursor: 'pointer', transition: 'fill-opacity 0.3s' },
      onMouseEnter: () => setHovered(muscle),
      onMouseLeave: () => setHovered(null),
    };
  }

  // ── Path helpers ──────────────────────────────────────────────────────────────

  // Body silhouette (front) — single connected path
  function frontSilhouette(): string {
    const nL = CX - 7, nR = CX + 7;
    const elbL = aL + 2, elbR = aR - 2;
    const qL = hL - 1, qR = hR + 1;
    const qiL = CX - 4, qiR = CX + 4; // inner thigh
    return [
      `M ${nL},30`,
      // Left shoulder curve
      `C ${nL-8},30 ${sL-4},36 ${aL},50`,
      // Left arm outer
      `C ${aL-2},60 ${aL-2},80 ${elbL},92`,
      // Left forearm taper
      `C ${elbL-1},100 ${elbL+1},118 ${elbL+2},132`,
      // Across to hip
      `L ${hL+2},132`,
      // Left hip outer
      `C ${qL-2},132 ${qL-2},136 ${qL},140`,
      // Left thigh outer
      `C ${qL-2},150 ${qL-2},175 ${qL+1},200`,
      // Left knee curve
      `C ${qL+2},205 ${qL+4},208 ${qL+5},210`,
      // Left calf outer
      `C ${qL+4},225 ${qL+2},245 ${qL+6},262`,
      // Left ankle / foot
      `L ${CX-4},262`,
      // Right ankle
      `L ${CX+4},262`,
      // Right calf outer
      `C ${qR-6},245 ${qR-2},225 ${qR-4},210`,
      `C ${qR-5},208 ${qR-4},205 ${qR-5},200`,
      // Right thigh outer
      `C ${qR+2},175 ${qR+2},150 ${qR},140`,
      // Right hip outer
      `C ${qR+2},136 ${qR+2},132 ${hR-2},132`,
      // Across to right forearm
      `L ${aR-4},132`,
      // Right forearm
      `C ${aR-3},118 ${aR-1},100 ${aR-2},92`,
      // Right arm outer
      `C ${aR+2},80 ${aR+2},60 ${aR},50`,
      // Right shoulder
      `C ${sR+4},36 ${nR+8},30 ${nR},30`,
      `Z`,
      // Inner thigh gap (gap between legs) — separate sub-path
      `M ${qiL},142 L ${qiL},200 L ${qiR},200 L ${qiR},142 Z`,
    ].join(' ');
  }

  // Body silhouette (back) — same outer shape
  function backSilhouette(): string {
    return frontSilhouette();
  }

  // Two pec shapes (chest)
  function chestLeft(): string {
    return [
      `M ${CX},50`,
      `C ${CX-4},46 ${sL+12},44 ${sL+4},58`,
      `C ${sL},70 ${CX-10},84 ${CX-2},88`,
      `L ${CX},88`,
      `Z`,
    ].join(' ');
  }
  function chestRight(): string {
    return [
      `M ${CX},50`,
      `C ${CX+4},46 ${sR-12},44 ${sR-4},58`,
      `C ${sR},70 ${CX+10},84 ${CX+2},88`,
      `L ${CX},88`,
      `Z`,
    ].join(' ');
  }

  // Deltoid (shoulder) shapes
  function deltLeft(): string {
    return `M ${sL},50 C ${aL-2},52 ${aL-2},64 ${sL-2},72 C ${sL+4},72 ${sL+8},68 ${sL+10},62 C ${sL+10},56 ${sL+6},50 ${sL},50 Z`;
  }
  function deltRight(): string {
    return `M ${sR},50 C ${aR+2},52 ${aR+2},64 ${sR+2},72 C ${sR-4},72 ${sR-8},68 ${sR-10},62 C ${sR-10},56 ${sR-6},50 ${sR},50 Z`;
  }

  // Bicep shape (front upper arm)
  function bicepLeft(): string {
    const x = aL;
    return `M ${x+2},48 C ${x-1},52 ${x-2},66 ${x},80 C ${x+1},88 ${x+4},92 ${x+8},92 C ${x+13},92 ${x+15},88 ${x+15},82 C ${x+15},70 ${x+14},52 ${x+12},48 Z`;
  }
  function bicepRight(): string {
    const x = aR - 15;
    return `M ${x+13},48 C ${x+16},52 ${x+17},66 ${x+15},80 C ${x+14},88 ${x+11},92 ${x+7},92 C ${x+2},92 ${x},88 ${x},82 C ${x},70 ${x+1},52 ${x+3},48 Z`;
  }

  // Forearm shape (tapered)
  function forearmLeft(): string {
    const x = aL;
    return `M ${x+1},94 C ${x-1},100 ${x-1},116 ${x+1},128 C ${x+3},133 ${x+7},134 ${x+10},134 C ${x+14},134 ${x+16},132 ${x+16},128 C ${x+17},118 ${x+15},100 ${x+14},94 Z`;
  }
  function forearmRight(): string {
    const x = aR - 16;
    return `M ${x+15},94 C ${x+17},100 ${x+17},116 ${x+15},128 C ${x+13},133 ${x+9},134 ${x+6},134 C ${x+2},134 ${x},132 ${x},128 C ${x},118 ${x+2},100 ${x+1},94 Z`;
  }

  // Abs — 6-pack cells
  function absCells(): React.ReactElement[] {
    const cells = [];
    const rows = 3, cols = 2;
    const cellW = 12, cellH = 12, gap = 3;
    const totalW = cols * cellW + gap;
    const startX = CX - totalW / 2;
    const startY = 90;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (cellW + gap);
        const y = startY + r * (cellH + gap);
        cells.push(
          <rect
            key={`abs-${r}-${c}`}
            x={x} y={y} width={cellW} height={cellH} rx={3.5}
            {...mp('abs')}
          />
        );
      }
    }
    return cells;
  }

  // Oblique panels
  function obliqueLeft(): string {
    const x1 = wL - 4, x2 = CX - 15;
    const y1 = 90, y2 = 128;
    return `M ${x2},${y1} C ${x1+4},${y1} ${x1},${y1+8} ${x1-2},${y2} L ${x2-2},${y2} Z`;
  }
  function obliqueRight(): string {
    const x1 = wR + 4, x2 = CX + 15;
    const y1 = 90, y2 = 128;
    return `M ${x2},${y1} C ${x1-4},${y1} ${x1},${y1+8} ${x1+2},${y2} L ${x2+2},${y2} Z`;
  }

  // Quad shapes (wider at top)
  function quadLeft(): string {
    const x = hL - 1;
    return `M ${x+1},142 C ${x-1},148 ${x-2},168 ${x},192 C ${x+2},200 ${x+6},203 ${x+12},203 C ${x+18},203 ${x+22},200 ${x+23},192 C ${x+24},168 ${x+23},148 ${x+22},142 C ${x+16},138 ${x+6},138 ${x+1},142 Z`;
  }
  function quadRight(): string {
    const x = hR - 22;
    return `M ${x+21},142 C ${x+23},148 ${x+24},168 ${x+22},192 C ${x+20},200 ${x+16},203 ${x+10},203 C ${x+4},203 ${x},200 ${x-1},192 C ${x-2},168 ${x-1},148 ${x+1},142 C ${x+6},138 ${x+16},138 ${x+21},142 Z`;
  }

  // Calf shapes (widest in middle — diamond-ish)
  function calfLeft(): string {
    const x = hL + 1;
    return `M ${x+2},206 C ${x-1},218 ${x-2},232 ${x+1},244 C ${x+4},254 ${x+8},260 ${x+12},260 C ${x+16},260 ${x+20},254 ${x+22},244 C ${x+24},232 ${x+23},218 ${x+20},206 Z`;
  }
  function calfRight(): string {
    const x = hR - 22;
    return `M ${x+20},206 C ${x+23},218 ${x+24},232 ${x+21},244 C ${x+18},254 ${x+14},260 ${x+10},260 C ${x+6},260 ${x+2},254 ${x},244 C ${x-2},232 ${x-1},218 ${x+2},206 Z`;
  }

  // Traps (back) — diamond-like from neck to shoulders
  function trapsPath(): string {
    return [
      `M ${CX},36`,
      `C ${CX-10},38 ${sL-4},48 ${sL-2},62`,
      `L ${sL+10},62`,
      `L ${CX},52`,
      `L ${sR-10},62`,
      `L ${sR+2},62`,
      `C ${sR+4},48 ${CX+10},38 ${CX},36`,
      `Z`,
    ].join(' ');
  }

  // Lats (back) — large V
  function latsPath(): string {
    return [
      `M ${sL},64`,
      `C ${sL-4},72 ${wL-4},95 ${wL},118`,
      `L ${wR},118`,
      `C ${wR+4},95 ${sR+4},72 ${sR},64`,
      `C ${CX+12},64 ${CX-12},64 ${sL},64`,
      `Z`,
    ].join(' ');
  }

  // Tricep shapes (back of arm)
  function tricepLeft(): string {
    const x = aL;
    return `M ${x+2},48 C ${x-2},54 ${x-2},68 ${x+1},82 C ${x+3},90 ${x+7},94 ${x+11},94 C ${x+14},94 ${x+15},90 ${x+14},82 C ${x+12},68 ${x+13},52 ${x+11},48 Z`;
  }
  function tricepRight(): string {
    const x = aR - 14;
    return `M ${x+12},48 C ${x+16},54 ${x+16},68 ${x+13},82 C ${x+11},90 ${x+7},94 ${x+3},94 C ${x},94 ${x-1},90 ${x},82 C ${x+2},68 ${x+1},52 ${x+3},48 Z`;
  }

  // Glutes
  function gluteLeft(): string {
    return `M ${CX-2},134 C ${hL-4},134 ${hL-4},140 ${hL},154 C ${hL+2},162 ${CX-4},166 ${CX-2},164 L ${CX-2},134 Z`;
  }
  function gluteRight(): string {
    return `M ${CX+2},134 C ${hR+4},134 ${hR+4},140 ${hR},154 C ${hR-2},162 ${CX+4},166 ${CX+2},164 L ${CX+2},134 Z`;
  }

  // Hamstrings (back of thigh, slightly narrower than quads)
  function hamLeft(): string {
    const x = hL - 1;
    return `M ${x+3},155 C ${x+1},165 ${x},182 ${x+1},196 C ${x+3},204 ${x+8},206 ${x+13},206 C ${x+18},206 ${x+21},204 ${x+22},196 C ${x+23},182 ${x+22},165 ${x+20},155 Z`;
  }
  function hamRight(): string {
    const x = hR - 22;
    return `M ${x+19},155 C ${x+21},165 ${x+22},182 ${x+21},196 C ${x+19},204 ${x+14},206 ${x+9},206 C ${x+4},206 ${x+1},204 ${x},196 C ${x-1},182 ${x},165 ${x+2},155 Z`;
  }

  function TooltipContent({ muscle }: { muscle: string }) {
    const a = actMap[muscle];
    const label = t(`muscle.${muscle}` as never);
    if (!a || a.sets === 0) {
      return <>{label}<br /><span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{t('workouts.muscleMap.notTrained')}</span></>;
    }
    const daysSince = a.last_date ? Math.round((Date.now() - new Date(a.last_date).getTime()) / 86400000) : null;
    return (
      <>
        <strong>{label}</strong><br />
        <span style={{ fontSize: 11 }}>{t('workouts.muscleMap.setsCount').replace('{n}', String(a.sets))}</span>
        {daysSince != null && <><br /><span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{t('workouts.muscleMap.lastTrained').replace('{n}', String(daysSince))}</span></>}
      </>
    );
  }

  const chipTokens = activity.filter(a => a.muscle !== 'full_body' && !DRAWN_ALL.has(a.muscle));

  // ── SVG views ─────────────────────────────────────────────────────────────────

  const VB = '0 0 120 275';
  const SZ = { width: 115, height: 230 };

  // Outline style for body silhouette
  const silhouette = {
    fill: 'var(--fb-card)',
    stroke: 'var(--fb-border-strong)',
    strokeWidth: 1,
    fillRule: 'evenodd' as const,
  };

  return (
    <div style={{ position: 'relative' }}>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
          borderRadius: 8, padding: '6px 10px', zIndex: 10,
          fontSize: 12, color: 'var(--fb-text)', lineHeight: 1.6,
          pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 2px 14px rgba(0,0,0,0.2)',
        }}>
          <TooltipContent muscle={hovered} />
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--fb-text-3)', margin: '0 0 14px', textAlign: 'center' }}>
        {t('workouts.muscleMap.subtitle').replace('{n}', String(windowDays))}
      </p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>

        {/* ── FRONT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('workouts.muscleMap.front')}
          </span>
          <svg viewBox={VB} {...SZ} aria-label={t('workouts.muscleMap.front')}>
            {/* Head */}
            <ellipse cx={CX} cy={17} rx={12} ry={13} fill="var(--fb-card)" stroke="var(--fb-border-strong)" strokeWidth={0.8} />
            {/* Neck */}
            <rect x={CX-7} y={29} width={14} height={14} rx={3} fill="var(--fb-card)" stroke="var(--fb-border-strong)" strokeWidth={0.7} />
            {/* Body silhouette */}
            <path d={frontSilhouette()} {...silhouette} />

            {/* Chest — two pecs */}
            <path d={chestLeft()} {...mp('chest')} />
            <path d={chestRight()} {...mp('chest')} />
            {/* Pec divider line (decorative) */}
            <line x1={CX} y1={50} x2={CX} y2={86} stroke="var(--fb-border-strong)" strokeWidth={0.6} opacity={0.5} />

            {/* Shoulders */}
            <path d={deltLeft()} {...mp('shoulders')} />
            <path d={deltRight()} {...mp('shoulders')} />

            {/* Biceps */}
            <path d={bicepLeft()} {...mp('biceps')} />
            <path d={bicepRight()} {...mp('biceps')} />

            {/* Forearms */}
            <path d={forearmLeft()} {...mp('forearms')} />
            <path d={forearmRight()} {...mp('forearms')} />

            {/* Abs — 6-pack cells */}
            {absCells()}

            {/* Obliques */}
            <path d={obliqueLeft()} {...mp('obliques')} />
            <path d={obliqueRight()} {...mp('obliques')} />

            {/* Quadriceps */}
            <path d={quadLeft()} {...mp('quadriceps')} />
            <path d={quadRight()} {...mp('quadriceps')} />

            {/* Calves */}
            <path d={calfLeft()} {...mp('calves')} />
            <path d={calfRight()} {...mp('calves')} />
          </svg>
        </div>

        {/* ── BACK ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('workouts.muscleMap.back')}
          </span>
          <svg viewBox={VB} {...SZ} aria-label={t('workouts.muscleMap.back')}>
            {/* Head (back) */}
            <ellipse cx={CX} cy={17} rx={12} ry={13} fill="var(--fb-card)" stroke="var(--fb-border-strong)" strokeWidth={0.8} />
            <rect x={CX-7} y={29} width={14} height={14} rx={3} fill="var(--fb-card)" stroke="var(--fb-border-strong)" strokeWidth={0.7} />
            {/* Body silhouette */}
            <path d={backSilhouette()} {...silhouette} />

            {/* Traps */}
            <path d={trapsPath()} {...mp('traps')} />

            {/* Lats / back */}
            <path d={latsPath()} {...mp('back')} />

            {/* Spine hint (decorative) */}
            <line x1={CX} y1={64} x2={CX} y2={118} stroke="var(--fb-border-strong)" strokeWidth={0.7} opacity={0.45} />

            {/* Triceps */}
            <path d={tricepLeft()} {...mp('triceps')} />
            <path d={tricepRight()} {...mp('triceps')} />

            {/* Forearms */}
            <path d={forearmLeft()} {...mp('forearms')} />
            <path d={forearmRight()} {...mp('forearms')} />

            {/* Glutes */}
            <path d={gluteLeft()} {...mp('glutes')} />
            <path d={gluteRight()} {...mp('glutes')} />

            {/* Hamstrings */}
            <path d={hamLeft()} {...mp('hamstrings')} />
            <path d={hamRight()} {...mp('hamstrings')} />

            {/* Calves (back) */}
            <path d={calfLeft()} {...mp('calves')} />
            <path d={calfRight()} {...mp('calves')} />
          </svg>
        </div>
      </div>

      {/* Chip legend for tokens not in the figure */}
      {chipTokens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' }}>
          {chipTokens.map(a => {
            const op = fillOpacity(a.muscle);
            return (
              <span key={a.muscle} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 99,
                background: op > 0 ? `color-mix(in srgb, var(--fb-amber) ${Math.round(op * 100)}%, var(--fb-card))` : 'var(--fb-card)',
                border: `1px solid ${op > 0 ? 'var(--fb-amber)' : 'var(--fb-border)'}`,
                color: op > 0 ? 'var(--fb-amber)' : 'var(--fb-text-3)',
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
    </div>
  );
}
