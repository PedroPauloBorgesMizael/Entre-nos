// Validação real do conteúdo de imagens enviadas (não confia no Content-Type do cliente):
// confere assinatura, estrutura mínima, final do arquivo e dimensões. Aceita JPEG, PNG e WebP.
import { HttpError } from './http';

export const MAX_PHOTO_BYTES = 700 * 1024; // 716800 — igual ao CHECK da tabela
export const MAX_PHOTO_DIMENSION = 6000;

export interface ImageInfo {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
}

const invalid = () => new HttpError(400, 'invalid_image', 'A imagem é inválida. Use JPEG, PNG ou WebP.');

function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
function ascii(b: Uint8Array, o: number, n: number): string {
  return String.fromCharCode(...b.subarray(o, o + n));
}

function parseJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    let marker = b[o + 1]!;
    while (marker === 0xff && o + 2 < b.length) {
      o++;
      marker = b[o + 1]!;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    if (marker === 0xd9) return null; // fim antes de achar o quadro
    const len = u16be(b, o + 2);
    if (len < 2 || o + 2 + len > b.length) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (len < 8) return null;
      const height = u16be(b, o + 5);
      const width = u16be(b, o + 7);
      return { mime: 'image/jpeg', width, height };
    }
    o += 2 + len;
  }
  return null;
}

function parsePng(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return null;
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') return null;
  const iend = b.subarray(b.length - 12);
  if (u32be(iend, 0) !== 0 || ascii(iend, 4, 4) !== 'IEND') return null;
  return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
}

function parseWebp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  if (u32le(b, 4) + 8 !== b.length) return null;
  const kind = ascii(b, 12, 4);
  if (kind === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { mime: 'image/webp', width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
  }
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    const width = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    const height = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
    return { mime: 'image/webp', width, height };
  }
  return null;
}

export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new HttpError(413, 'image_too_large', 'A imagem deve ter no máximo 700 KB.');
  }
  const info = parseJpeg(bytes) ?? parsePng(bytes) ?? parseWebp(bytes);
  if (!info) throw invalid();
  if (info.width < 1 || info.height < 1 || info.width > MAX_PHOTO_DIMENSION || info.height > MAX_PHOTO_DIMENSION) {
    throw new HttpError(400, 'invalid_image', `Dimensões inválidas (máximo ${MAX_PHOTO_DIMENSION}px).`);
  }
  return info;
}
