import { createSseParser, createUtf8Decoder } from './sse';

const bytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('DueOra AI streaming', () => {
  it('decodes emoji split across network chunks', () => {
    const all = bytes('Paid ✅ 🎉 é');
    const decode = createUtf8Decoder();
    let out = '';
    for (let i = 0; i < all.length; i += 3) out += decode(all.slice(i, i + 3));
    out += decode(new Uint8Array(), true);
    expect(out).toBe('Paid ✅ 🎉 é');
  });

  it('parses server-sent events across chunk boundaries', () => {
    const parse = createSseParser();
    expect(parse('event: meta\ndata: {"conversationId":"c1"}\n\nevent: del')).toEqual([{ event: 'meta', data: { conversationId: 'c1' } }]);
    expect(parse('ta\ndata: {"text":"Hi"}\n\n')).toEqual([{ event: 'delta', data: { text: 'Hi' } }]);
    expect(parse('event: done\ndata: not json\n\n')).toEqual([]);
  });
});
