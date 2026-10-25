import { describe, expect, it } from 'vitest';
import { clampPoint, pickPosition, type Point, type Rect } from '../../src/lib/noButton';

describe('algoritmo do botão Não (noButton)', () => {
  const viewport = { w: 360, h: 640 };
  const button = { w: 100, h: 44 };

  it('clampPoint mantém o botão 100% dentro da janela', () => {
    // Fora à esquerda e topo
    const p1 = clampPoint({ x: -50, y: -20 }, viewport, button, 16);
    expect(p1.x).toBe(16);
    expect(p1.y).toBe(16);

    // Fora à direita e embaixo
    const p2 = clampPoint({ x: 1000, y: 1000 }, viewport, button, 16);
    expect(p2.x).toBe(360 - 100 - 16);
    expect(p2.y).toBe(640 - 44 - 16);

    // Ponto válido permanece inalterado
    const p3 = clampPoint({ x: 120, y: 200 }, viewport, button, 16);
    expect(p3.x).toBe(120);
    expect(p3.y).toBe(200);
  });

  it('pickPosition retorna sempre um ponto dentro dos limites da janela', () => {
    const avoid: Rect[] = [{ x: 100, y: 250, w: 160, h: 50 }]; // Botão Sim

    for (let i = 0; i < 20; i++) {
      const pos = pickPosition({ viewport, button, avoid, margin: 16 });
      expect(pos.x).toBeGreaterThanOrEqual(16);
      expect(pos.x + button.w).toBeLessThanOrEqual(viewport.w - 16);
      expect(pos.y).toBeGreaterThanOrEqual(16);
      expect(pos.y + button.h).toBeLessThanOrEqual(viewport.h - 16);
    }
  });

  it('evita colidir com os retângulos protegidos ("Sim" e conteúdo)', () => {
    const avoid: Rect[] = [{ x: 120, y: 250, w: 120, h: 50 }];
    const pos = pickPosition({
      viewport,
      button,
      avoid,
      margin: 16,
      padding: 10,
      samples: 100,
    });

    // Confere se o retângulo do botão NÃO sobrepõe a zona do "Sim" (com folga)
    const btnRect = { x: pos.x, y: pos.y, w: button.w, h: button.h };
    const simRect = avoid[0]!;

    const hasOverlap =
      btnRect.x < simRect.x + simRect.w &&
      btnRect.x + btnRect.w > simRect.x &&
      btnRect.y < simRect.y + simRect.h &&
      btnRect.y + btnRect.h > simRect.y;

    expect(hasOverlap).toBe(false);
  });

  it('se move para uma posição significativamente diferente da anterior quando possível', () => {
    const prev: Point = { x: 50, y: 50 };
    const next = pickPosition({
      viewport,
      button,
      avoid: [],
      previous: prev,
      margin: 16,
      samples: 50,
    });

    const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
    expect(dist).toBeGreaterThan(40);
  });
});
