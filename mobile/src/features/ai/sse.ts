/**
 * Tiny streaming helpers for DueOra AI's server-sent events: a UTF-8 decoder that copes
 * with multi-byte characters (emoji!) split across chunks, and an SSE parser.
 * Kept dependency-free so it runs the same on Hermes, the web preview and Jest.
 */
export function createUtf8Decoder() {
  let pending: number[] = [];
  return (bytes: Uint8Array, final = false): string => {
    const all = pending.length ? Uint8Array.from([...pending, ...bytes]) : bytes;
    pending = [];
    let out = '';
    let i = 0;
    while (i < all.length) {
      const b = all[i]!;
      const len =
        b < 0x80 ? 1 : b >> 5 === 0b110 ? 2 : b >> 4 === 0b1110 ? 3 : b >> 3 === 0b11110 ? 4 : 1;
      if (i + len > all.length) {
        if (!final) pending = Array.from(all.slice(i));
        break;
      }
      let cp = len === 1 ? b : b & (0xff >> (len + 1));
      for (let k = 1; k < len; k++) cp = (cp << 6) | (all[i + k]! & 0x3f);
      out += String.fromCodePoint(cp);
      i += len;
    }
    return out;
  };
}

export interface SseEvent {
  event: string;
  data: unknown;
}

/** Feed text chunks; get back complete events (an event ends with a blank line). */
export function createSseParser() {
  let buffer = '';
  return (text: string): SseEvent[] => {
    buffer += text;
    const out: SseEvent[] = [];
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      if (!data.length) continue;
      try {
        out.push({ event, data: JSON.parse(data.join('\n')) });
      } catch {
        // Ignore a malformed event rather than breaking the stream.
      }
    }
    return out;
  };
}
