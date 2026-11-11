import { act, fireEvent, screen } from '@testing-library/react-native';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';

import { renderWithTheme } from '@/test/render';

import {
  AmountText,
  Avatar,
  Button,
  Chip,
  CountdownRing,
  EmptyState,
  Input,
  ListItem,
  Select,
  StatusBadge,
  Switch,
  SuccessCheck,
  ToastHost,
  initialsOf,
  ringProgress,
  toast,
  useToastStore,
} from '..';

describe('StatusBadge', () => {
  it.each([
    ['PAID', 'Paid'],
    ['UPCOMING', 'Upcoming'],
    ['DUE_SOON', 'Due soon'],
    ['DUE_TODAY', 'Due today'],
    ['OVERDUE', 'Overdue'],
    ['PARTIALLY_PAID', 'Partially paid'],
  ] as const)('shows a text label for %s (never colour alone)', async (status, label) => {
    await renderWithTheme(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText(`Status: ${label}`)).toBeTruthy();
  });

  it('renders in dark mode', async () => {
    await renderWithTheme(<StatusBadge status="OVERDUE" />, { scheme: 'dark' });
    expect(screen.getByText('Overdue')).toBeTruthy();
  });
});

describe('Button', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <Button onPress={onPress} icon={<Plus size={18} />}>
        Add payment
      </Button>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add payment' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled or loading', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <>
        <Button onPress={onPress} disabled>
          Disabled
        </Button>
        <Button onPress={onPress} loading testID="loading-btn">
          Saving
        </Button>
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Disabled' }));
    await fireEvent.press(screen.getByTestId('loading-btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByText('Saving')).toBeNull();
  });
});

describe('AmountText', () => {
  it('formats integer cents as US dollars', async () => {
    await renderWithTheme(
      <>
        <AmountText amountCents={152300} />
        <AmountText amountCents={5} />
      </>,
    );
    expect(screen.getByText('$1,523.00')).toBeTruthy();
    expect(screen.getByText('$0.05')).toBeTruthy();
  });
});

describe('Chip', () => {
  it('exposes checked state for toggle chips', async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Chip label="1 week" showCheck selected={on} onPress={() => setOn((v) => !v)} />;
    }
    await renderWithTheme(<Harness />);
    const chip = screen.getByRole('checkbox', { name: '1 week' });
    expect(chip.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(chip);
    expect(screen.getByRole('checkbox', { name: '1 week' }).props.accessibilityState).toMatchObject(
      { checked: true },
    );
  });
});

describe('Avatar', () => {
  it.each([
    ['Anitha Uwase', 'AU'],
    ['Eric N.', 'EN'],
    ['Isaac', 'IS'],
    ['  ', '?'],
  ])('initialsOf(%s) → %s', async (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it('renders initials with an accessible name', async () => {
    await renderWithTheme(<Avatar name="Nadine Keza" />);
    expect(screen.getByText('NK')).toBeTruthy();
    expect(screen.getByLabelText('Nadine Keza')).toBeTruthy();
  });
});

describe('Input', () => {
  it('shows the label and error message', async () => {
    await renderWithTheme(
      <Input label="Work email" error="Enter a valid email" placeholder="you@company.com" />,
    );
    expect(screen.getByText('Work email')).toBeTruthy();
    expect(screen.getByText('Enter a valid email')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@company.com')).toBeTruthy();
  });
});

describe('Select', () => {
  it('opens the sheet and picks an option', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <Select
        label="Currency"
        value="RWF"
        onChange={onChange}
        options={[
          { value: 'RWF', label: 'RWF' },
          { value: 'USD', label: 'USD' },
        ]}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Currency: RWF' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'USD' }));
    expect(onChange).toHaveBeenCalledWith('USD');
  });
});

describe('Switch', () => {
  it('toggles', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(
      <Switch value={false} onValueChange={onValueChange} accessibilityLabel="Dark mode" />,
    );
    await fireEvent.press(screen.getByRole('switch', { name: 'Dark mode' }));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});

describe('ListItem', () => {
  it('is a button when pressable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<ListItem title="Team & roles" subtitle="4 members" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Team & roles, 4 members' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('CountdownRing', () => {
  it('computes ring progress', async () => {
    expect(ringProgress(-5, 365)).toBe(1);
    expect(ringProgress(0, 365)).toBe(1);
    expect(ringProgress(365, 365)).toBeCloseTo(0.04);
    expect(ringProgress(73, 365)).toBeCloseTo(0.8);
  });

  it('announces the countdown', async () => {
    await renderWithTheme(<CountdownRing days={-263} cycleDays={365} status="OVERDUE" />);
    expect(screen.getByLabelText('Overdue by 263 days')).toBeTruthy();
    expect(screen.getByText('263')).toBeTruthy();
  });

  it('shows "Today" on the due date', async () => {
    await renderWithTheme(<CountdownRing days={0} cycleDays={30} status="DUE_TODAY" />);
    expect(screen.getByText('Today')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders copy and action', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <EmptyState
        illustration="empty-bills"
        title="No payments yet"
        message="Add your first bill and DueOra will keep watch."
        actionLabel="Add payment"
        onAction={onAction}
      />,
    );
    expect(screen.getByText('No payments yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add payment' }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('SuccessCheck', () => {
  it('renders the Lottie animation', async () => {
    await renderWithTheme(<SuccessCheck />);
    expect(screen.getByTestId('lottie')).toBeTruthy();
  });
});

describe('Toast', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await act(async () => {
      useToastStore.setState({ toasts: [] });
    });
  });
  afterEach(() => jest.useRealTimers());

  it('shows and auto-dismisses', async () => {
    await renderWithTheme(<ToastHost />);
    await act(async () => {
      toast.success('Payment recorded', 'Dashboard updated.');
    });
    expect(screen.getByText('Payment recorded')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(4100);
    });
    expect(screen.queryByText('Payment recorded')).toBeNull();
  });

  it('keeps at most three toasts', async () => {
    await act(async () => {
      for (let i = 0; i < 5; i++) toast.info(`Toast ${i}`);
    });
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual([
      'Toast 2',
      'Toast 3',
      'Toast 4',
    ]);
  });
});
