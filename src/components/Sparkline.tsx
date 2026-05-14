interface Props {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}

export default function Sparkline({ points, color = 'var(--fb-accent)', width = 120, height = 32 }: Props) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p - min) / range) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
