import { describe, expect, it } from 'vitest';
import { inspectImage, MAX_PHOTO_BYTES, MAX_PHOTO_DIMENSION } from '../../server/photo';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];

function makeJpeg(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, ...be16(h), ...be16(w), 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function makePng(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 2, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

describe('validação estrutural de imagens (server/photo)', () => {
  it('identifica corretamente JPEG e extrai largura e altura', () => {
    const img = makeJpeg(640, 480);
    const info = inspectImage(img);
    expect(info.mime).toBe('image/jpeg');
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
  });

  it('identifica corretamente PNG e extrai largura e altura', () => {
    const img = makePng(800, 600);
    const info = inspectImage(img);
    expect(info.mime).toBe('image/png');
    expect(info.width).toBe(800);
    expect(info.height).toBe(600);
  });

  it('rejeita arquivos que excedem o tamanho máximo permitido', () => {
    const huge = new Uint8Array(MAX_PHOTO_BYTES + 10);
    expect(() => inspectImage(huge)).toThrow(/máximo 700 KB/);
  });

  it('rejeita imagens vazias ou arquivos corrompidos', () => {
    expect(() => inspectImage(new Uint8Array(0))).toThrow();
    expect(() => inspectImage(new TextEncoder().encode('<html>not an image</html>'))).toThrow(/inválida/);
  });

  it('rejeita dimensões maiores que o limite configurado', () => {
    const giant = makeJpeg(MAX_PHOTO_DIMENSION + 500, 100);
    expect(() => inspectImage(giant)).toThrow(/Dimensões inválidas/);
  });
});
