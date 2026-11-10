import { en } from './en';
import { fr } from './fr';
import { i18n } from './index';
import { rw } from './rw';

type Tree = { [k: string]: string | Tree };
const keys = (t: Tree, prefix = ''): string[] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
const placeholders = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort();
const lookup = (t: Tree, path: string) => path.split('.').reduce<Tree | string | undefined>((o, k) => (typeof o === 'object' ? o[k] : undefined), t);

describe('translations', () => {
  const english = keys(en as unknown as Tree);

  it.each([
    ['fr', fr],
    ['rw', rw],
  ])('%s only uses keys that exist in English, with the same placeholders', (_name, res) => {
    for (const k of keys(res as Tree)) {
      expect(english).toContain(k);
      expect(placeholders(lookup(res as Tree, k) as string)).toEqual(placeholders(lookup(en as unknown as Tree, k) as string));
    }
  });

  it('greets with the user’s own first name and falls back to English', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('home.goodMorning', { firstName: 'Lina' })).toBe('Bonjour, Lina 👋');
    await i18n.changeLanguage('rw');
    expect(i18n.t('home.goodMorning', { firstName: 'Lina' })).toBe('Mwaramutse, Lina 👋');
    expect(i18n.t('more.reportsSub')).toBe(en.more.reportsSub); // not translated yet → English
    await i18n.changeLanguage('en');
    expect(i18n.t('tabs.subscriptions')).toBe('Subscriptions');
  });
});
