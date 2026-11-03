import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithTheme } from '@/test/render';

import {
  ActiveFilters,
  countFilters,
  DateField,
  EMPTY_FILTERS,
  FilterSheet,
  SearchBar,
  SortSheet,
  type ChipSection,
  type FilterState,
} from '..';

// Test-only options.
const SECTIONS: ChipSection[] = [
  { key: 'status', title: 'Status', options: [{ value: 'OVERDUE', label: 'Overdue' }, { value: 'PAID', label: 'Paid' }] },
  { key: 'company', title: 'Company', options: [{ value: 'c1', label: 'Acme Co' }] },
];

describe('SearchBar', () => {
  it('has search, Sort and Filter buttons with an active-filter badge', async () => {
    const onSort = jest.fn();
    const onFilter = jest.fn();
    const onChange = jest.fn();
    await renderWithTheme(
      <SearchBar value="host" onChangeText={onChange} placeholder="Search subscriptions" onSortPress={onSort} onFilterPress={onFilter} filterCount={2} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Sort' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Filter, 2 active' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSort).toHaveBeenCalled();
    expect(onFilter).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByText('2')).toBeTruthy();
  });
});

describe('SortSheet', () => {
  it('marks the current sort and applies a new one', async () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    await renderWithTheme(
      <SortSheet
        visible
        onClose={onClose}
        value="due_asc"
        onChange={onChange}
        options={[
          { value: 'due_asc', label: 'Due date — soonest first' },
          { value: 'amount_desc', label: 'Amount — high to low' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Due date — soonest first' }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Amount — high to low' }));
    expect(onChange).toHaveBeenCalledWith('amount_desc');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('FilterSheet and ActiveFilters', () => {
  it('applies chip selections and shows them as removable chips', async () => {
    function Harness() {
      const [value, setValue] = useState<FilterState>(EMPTY_FILTERS);
      return (
        <>
          <FilterSheet visible onClose={() => undefined} sections={SECTIONS} value={value} onApply={setValue} />
          <ActiveFilters sections={SECTIONS} value={value} onChange={setValue} />
        </>
      );
    }
    await renderWithTheme(<Harness />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Overdue' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Acme Co' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Show results' }));
    expect(screen.getByRole('button', { name: 'Remove filter Overdue' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter Acme Co' }));
    expect(screen.queryByRole('button', { name: 'Remove filter Acme Co' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove filter Overdue' })).toBeTruthy();
  });

  it('counts filters, including a date range as one', () => {
    expect(countFilters(EMPTY_FILTERS)).toBe(0);
    expect(countFilters({ selections: { status: ['OVERDUE', 'PAID'], company: [] }, from: '2026-01-01' })).toBe(3);
  });
});

describe('DateField', () => {
  it('offers Today, +1 week, +1 month, +3 months and +1 year quick picks', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<DateField label="Start date" today="2026-11-03" value="2026-11-03" onChange={onChange} />);
    for (const label of ['Today', '+1 week', '+1 month', '+3 months', '+1 year']) expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '+3 months' }));
    expect(onChange).toHaveBeenCalledWith('2027-02-03');
    await fireEvent.press(screen.getByRole('button', { name: '+1 year' }));
    expect(onChange).toHaveBeenCalledWith('2027-11-03');
  });
});
