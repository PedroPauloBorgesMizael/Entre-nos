// Cálculo da posição do botão "Não" — função pura, testável.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PickInput {
  /** área visível real (innerWidth/innerHeight ou visualViewport) */
  viewport: { w: number; h: number };
  /** dimensões reais do botão */
  button: { w: number; h: number };
  /** retângulos (em coordenadas da janela) que o botão não deve cobrir: "Sim", textos, controles */
  avoid: Rect[];
  /** posição anterior — a nova precisa ser claramente diferente quando possível */
  previous?: Point | null;
  /** margem mínima até as bordas da janela */
  margin?: number;
  /** folga em volta dos elementos a evitar */
  padding?: number;
  rng?: () => number;
  samples?: number;
}

/** Garante que o botão fique 100% dentro da janela, qualquer que seja o tamanho dela. */
export function clampPoint(p: Point, viewport: { w: number; h: number }, button: { w: number; h: number }, margin = 8): Point {
  const maxX = Math.max(0, viewport.w - button.w - margin);
  const maxY = Math.max(0, viewport.h - button.h - margin);
  const minX = Math.min(margin, maxX);
  const minY = Math.min(margin, maxY);
  return { x: Math.min(Math.max(p.x, minX), maxX), y: Math.min(Math.max(p.y, minY), maxY) };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/**
 * Sorteia uma posição válida: dentro da janela, sem cobrir os elementos protegidos
 * e diferente da anterior. Se for impossível evitar tudo (janela minúscula), escolhe o
 * candidato com menor sobreposição — sempre devolvendo uma posição totalmente visível.
 */
export function pickPosition(input: PickInput): Point {
  const { viewport, button, avoid, previous = null } = input;
  const margin = input.margin ?? 12;
  const padding = input.padding ?? 10;
  const rng = input.rng ?? Math.random;
  const samples = input.samples ?? 60;

  const maxX = Math.max(margin, viewport.w - button.w - margin);
  const maxY = Math.max(margin, viewport.h - button.h - margin);
  const zones = avoid.map((r) => inflate(r, padding));
  const minMove = Math.min(Math.max(viewport.w, viewport.h) * 0.22, 140);

  let best: { p: Point; score: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const raw = { x: margin + rng() * (maxX - margin), y: margin + rng() * (maxY - margin) };
    const p = clampPoint(raw, viewport, button, margin);
    const rect: Rect = { x: p.x, y: p.y, w: button.w, h: button.h };
    const overlap = zones.reduce((sum, z) => sum + overlapArea(rect, z), 0);
    const moved = previous ? Math.hypot(p.x - previous.x, p.y - previous.y) : Infinity;
    // penaliza sobreposição pesadamente e movimentos curtos de forma leve
    const score = overlap * 10 + (moved < minMove ? (minMove - moved) * 50 : 0);
    if (!best || score < best.score) best = { p, score };
    if (score === 0) return p;
  }
  return best!.p;
}
