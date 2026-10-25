import { useEffect, useMemo, useState } from 'react';

interface PetalSpec {
  id: number;
  left: number; // % da largura
  size: number; // px
  fall: number; // s
  delay: number; // s
  drift: number; // px de deriva lateral
  sway: number; // s por oscilação
  spin: number; // graus finais
  tone: 0 | 1 | 2;
  opacity: number;
}

const COUNT = 26;

function makePetals(): PetalSpec[] {
  return Array.from({ length: COUNT }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: 11 + Math.random() * 12,
    fall: 4.6 + Math.random() * 3,
    delay: Math.random() * 1.8,
    drift: (Math.random() - 0.5) * 140,
    sway: 1.6 + Math.random() * 1.6,
    spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
    tone: (id % 3) as 0 | 1 | 2,
    opacity: 0.55 + Math.random() * 0.35,
  }));
}

const MAX_MS = (4.6 + 3 + 1.8) * 1000 + 400;

interface Props {
  /** Muda a cada disparo (ex.: contador). Quando muda para um valor > 0, uma nova chuva de pétalas começa. */
  burst: number;
  reducedMotion: boolean;
}

/**
 * Chuva delicada de pétalas. Só usa transform/opacity (composição na GPU), ~26 elementos,
 * não captura cliques e se remove sozinha. Com movimento reduzido, nada é animado.
 */
export function Petals({ burst, reducedMotion }: Props) {
  const [live, setLive] = useState<{ key: number; petals: PetalSpec[] } | null>(null);

  useEffect(() => {
    if (burst <= 0 || reducedMotion) return;
    setLive({ key: burst, petals: makePetals() });
    const t = window.setTimeout(() => setLive((cur) => (cur?.key === burst ? null : cur)), MAX_MS);
    return () => window.clearTimeout(t);
  }, [burst, reducedMotion]);

  const petals = useMemo(() => live?.petals ?? [], [live]);
  if (!live || reducedMotion) return null;

  return (
    <div className="petals" aria-hidden="true" data-testid="petals" key={live.key}>
      {petals.map((p) => (
        <span
          key={p.id}
          className="petal"
          style={
            {
              left: `${p.left}%`,
              '--size': `${p.size}px`,
              '--fall': `${p.fall}s`,
              '--delay': `${p.delay}s`,
              '--drift': `${p.drift}px`,
              '--sway': `${p.sway}s`,
              '--spin': `${p.spin}deg`,
              '--op': p.opacity,
            } as React.CSSProperties
          }
        >
          <span className={`petal__shape petal__shape--${p.tone}`} />
        </span>
      ))}
    </div>
  );
}
