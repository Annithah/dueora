import { fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { renderWithTheme } from '@/test/render';

import { TabBar, tabLabelSize } from './TabBar';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }));

type Props = ComponentProps<typeof TabBar>;

function makeProps(index = 0, canAdd = true) {
  const names = ['index', 'subscriptions', 'calendar', 'more'];
  const navigateToTab = jest.fn();
  const props = {
    state: { index, routes: names.map((name) => ({ key: `${name}-key`, name })) },
    emitter: { emit: jest.fn(() => ({ defaultPrevented: false })) },
    navigateToTab,
    canAdd,
  } as unknown as Props;
  return { props, navigateToTab };
}

describe('TabBar', () => {
  it('shows Home, Subscriptions, +, Calendar, More in that order, each label on one line', async () => {
    const { props } = makeProps();
    await renderWithTheme(<TabBar {...props} />);
    const ids = screen.getAllByTestId(/^tab-/).map((n) => n.props.testID as string);
    expect(ids).toEqual(['tab-index', 'tab-subscriptions', 'tab-add', 'tab-calendar', 'tab-more']);
    for (const label of ['Home', 'Subscriptions', 'Calendar', 'More']) {
      expect(screen.getByText(label).props.numberOfLines).toBe(1);
    }
    expect(screen.queryByText('Alerts')).toBeNull();
  });

  it('marks the focused tab as selected and navigates to another tab', async () => {
    const { props, navigateToTab } = makeProps(0);
    await renderWithTheme(<TabBar {...props} />);
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
    expect(navigateToTab).toHaveBeenCalledWith('calendar-key');
  });

  it('opens the add form from the centre button, and hides it for read-only viewers', async () => {
    const { props } = makeProps();
    await renderWithTheme(<TabBar {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add subscription' }));
    expect(mockPush).toHaveBeenCalledWith('/subscriptions/new');

    const viewer = makeProps(0, false);
    await renderWithTheme(<TabBar {...viewer.props} />);
    expect(screen.queryByRole('button', { name: 'Add subscription' })).toBeNull();
  });
});

describe('tabLabelSize', () => {
  it('uses 11px where the longest label fits and shrinks only on narrow phones', () => {
    // 5 slots: 430px → 86px slots, 412px → 82px, 360px → 72px, 320px → 64px.
    expect(tabLabelSize(86)).toBe(11);
    expect(tabLabelSize(82)).toBe(11);
    expect(tabLabelSize(72)).toBe(10.3);
    expect(tabLabelSize(64)).toBe(9.5);
  });
});
