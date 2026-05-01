interface Ring {
  pct: number;
  color: string;
  label: string;
}

interface Props {
  rings: Ring[];
  centerTop: string;
  centerSub: string;
  size?: number;
}

export default function ConcentricRings({ rings, centerTop, centerSub, size = 170 }: Props) {
  const stroke = 11;
  const gap = 4;
  const center = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {rings.map((ring, i) => {
          const r = center - stroke / 2 - i * (stroke + gap);
          const c = 2 * Math.PI * r;
          const pct = Math.min(100, Math.max(0, ring.pct));
          return (
            <g key={i}>
              <circle cx={center} cy={center} r={r}
                stroke="rgba(255,240,220,0.08)"
                strokeWidth={stroke}
                fill="none"
              />
              <circle cx={center} cy={center} r={r}
                stroke={ring.color}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - pct / 100)}
                style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.2,0.8,0.2,1)', opacity: 0.95 }}
              >
                <title>{`${ring.label}: ${Math.round(pct)}%`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
      }}>
        <span style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400,
          color: 'var(--text)', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{centerTop}</span>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 1.2,
          textTransform: 'uppercase', color: 'var(--text-sec)',
        }}>{centerSub}</span>
      </div>
    </div>
  );
}
