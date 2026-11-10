import { guessCategoryName } from './guess';

describe('category suggestion', () => {
  it('guesses a default category from the name, or nothing', () => {
    expect(guessCategoryName('Website hosting')).toBe('Hosting & domains');
    expect(guessCategoryName('Fibre internet')).toBe('Communication & internet');
    expect(guessCategoryName('Office 365 licence')).toBe('Technology & software');
    expect(guessCategoryName('Office rent')).toBe('Office & rent');
    expect(guessCategoryName('Fuel card')).toBe('Transport');
    expect(guessCategoryName('School fees')).toBe('Education & training');
    expect(guessCategoryName('Zebra')).toBeNull();
    expect(guessCategoryName('ab')).toBeNull();
  });
});
