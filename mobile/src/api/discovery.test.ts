import { parseDiscovered } from './discovery';

describe('parseDiscovered', () => {
  it('accepts an https origin and trims a trailing slash', () => {
    expect(parseDiscovered({ apiUrl: 'https://abc.trycloudflare.com/' }, false)).toBe('https://abc.trycloudflare.com');
  });

  it('rejects http in release builds, paths, and junk', () => {
    expect(parseDiscovered({ apiUrl: 'http://abc.trycloudflare.com' }, false)).toBeNull();
    expect(parseDiscovered({ apiUrl: 'https://abc.example/evil path' }, false)).toBeNull();
    expect(parseDiscovered({ apiUrl: 42 }, false)).toBeNull();
    expect(parseDiscovered(null, false)).toBeNull();
  });

  it('allows http only in development', () => {
    expect(parseDiscovered({ apiUrl: 'http://192.168.1.5:4000' }, true)).toBe('http://192.168.1.5:4000');
  });
});
