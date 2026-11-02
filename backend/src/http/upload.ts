import multer from 'multer';

import { badRequest } from './errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB ("PNG or JPG, max 5 MB")

export type AllowedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'application/pdf';

/** Identify a file by its magic bytes — never trust the client's Content-Type. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp' && /^(heic|heix|mif1|msf1)$/.test(buf.toString('ascii', 8, 12))) {
    return 'image/heic';
  }
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export const EXTENSIONS: Record<AllowedMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/** Multer instance keeping a single file in memory, capped at 5 MB. */
export const singleFile = (field = 'file') =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single(field);

/** Validate an uploaded file against an allow-list; returns its sniffed type. */
export function checkUpload(file: Express.Multer.File | undefined, allowed: readonly AllowedMime[]): AllowedMime {
  if (!file) throw badRequest('Attach a file in the "file" field');
  const sniffed = sniffMime(file.buffer);
  if (!sniffed || !allowed.includes(sniffed)) {
    throw badRequest(`Unsupported file type. Allowed: ${allowed.map((m) => EXTENSIONS[m].toUpperCase()).join(', ')}`);
  }
  return sniffed;
}

/** Strip path parts and odd characters from a client file name. */
export function safeFileName(name: string, fallbackExt: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\w.\- ]+/g, '').trim().slice(0, 120);
  return cleaned || `file.${fallbackExt}`;
}
