import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { BillRow } from './BillRow';

// Test-only fixture.
const item = {
  id: '1',
  name: 'Test hosting',
  icon: 'server',
  amountCents: 152_300,
  date: '2026-10-20',
  status: 'OVERDUE' as const,
  subtitle: 'Acme Co · Yearly',
};

describe('BillRow', () => {
  it('shows name, company, USD amount, due date and status, and is tappable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<BillRow item={item} onPress={onPress} />);
    expect(screen.getByText('Test hosting')).toBeTruthy();
    expect(screen.getByText('Acme Co · Yearly')).toBeTruthy();
    expect(screen.getByText('$1,523.00')).toBeTruthy();
    expect(screen.getByText('20 Oct 2026')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Test hosting, Acme Co · Yearly' }));
    expect(onPress).toHaveBeenCalled();
  });
});
