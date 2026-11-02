import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { PaymentRow } from './PaymentRow';

const item = {
  id: '1',
  name: 'Hosting',
  provider: 'AWS · Yearly',
  icon: 'cloud',
  amountMinor: 152300,
  currency: 'USD',
  date: '2026-10-20',
  status: 'OVERDUE' as const,
  platform: 'KigaliToday',
};

describe('PaymentRow', () => {
  it('shows name, amount, date and status, and is tappable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<PaymentRow item={item} onPress={onPress} />);
    expect(screen.getByText('Hosting')).toBeTruthy();
    expect(screen.getByText('$1,523')).toBeTruthy();
    expect(screen.getByText('20 Oct 2026')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Hosting, KigaliToday, AWS · Yearly' }),
    );
    expect(onPress).toHaveBeenCalled();
  });
});
