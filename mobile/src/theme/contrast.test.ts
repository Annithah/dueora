import { contrastRatio } from './contrast';
import { darkColors, lightColors, type ColorScheme } from './tokens';

const AA = 4.5;

function textPairs(c: ColorScheme): [string, string, string][] {
  return [
    ['ink on canvas', c.ink, c.canvas],
    ['ink on surface', c.ink, c.surface],
    ['muted on surface', c.muted, c.surface],
    ['muted on canvas', c.muted, c.canvas],
    ['onPrimary on primary', c.onPrimary, c.primary],
    ['primaryStrong (links) on surface', c.primaryStrong, c.surface],
    ['primary on primarySoft (secondary button)', c.primaryStrong, c.primarySoft],
    ['green on greenSoft', c.green, c.greenSoft],
    ['blue on blueSoft', c.blue, c.blueSoft],
    ['amberText on amberTextSoft', c.amberText, c.amberTextSoft],
    ['orange on orangeSoft', c.orange, c.orangeSoft],
    ['red on redSoft', c.red, c.redSoft],
    ['purple on purpleSoft', c.purple, c.purpleSoft],
    ['red on surface (danger text)', c.red, c.surface],
    ['onDanger on danger (danger button)', c.onDanger, c.danger],
    ['onBadge on badge (unread count)', c.onBadge, c.badge],
  ];
}

describe('palette contrast (WCAG AA 4.5:1)', () => {
  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  describe.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('%s scheme', (_name, colors) => {
    it.each(textPairs(colors))('%s', (_label, fg, bg) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
    });
  });
});
