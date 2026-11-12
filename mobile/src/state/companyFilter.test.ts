import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialsFor } from '@/features/catalog/CompanyForm';
import { accessIsValid } from '@/features/workspaces/AccessPicker';

import { useCompanyFilter } from './companyFilter';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

async function restart(stored?: unknown) {
  if (stored !== undefined) await AsyncStorage.setItem('dueora.companyFilter', JSON.stringify(stored));
  useCompanyFilter.setState({ byWorkspace: {}, hydrated: false });
  await useCompanyFilter.getState().hydrate();
}

beforeEach(() => AsyncStorage.clear());

describe('company switcher memory', () => {
  it('starts on "All companies"', async () => {
    await restart();
    expect(useCompanyFilter.getState().byWorkspace).toEqual({});
    expect(useCompanyFilter.getState().hydrated).toBe(true);
  });

  it('remembers one company per workspace across restarts', async () => {
    await restart();
    useCompanyFilter.getState().select('ws1', 'c1');
    useCompanyFilter.getState().select('ws2', 'c9');
    useCompanyFilter.getState().select('ws2', null);
    await new Promise((r) => setTimeout(r, 0));
    await restart();
    expect(useCompanyFilter.getState().byWorkspace).toEqual({ ws1: 'c1' });
  });

  it('ignores corrupt saved data', async () => {
    await restart(['nope']);
    expect(useCompanyFilter.getState().byWorkspace).toEqual({});
    await restart({ ws1: 42, ws2: 'c2' });
    expect(useCompanyFilter.getState().byWorkspace).toEqual({ ws2: 'c2' });
  });
});

describe('company helpers', () => {
  it('derives initials like the server', () => {
    expect(initialsFor('Alpha News Ltd')).toBe('AN');
    expect(initialsFor('kivu')).toBe('KI');
    expect(initialsFor('  ')).toBe('');
  });

  it('needs at least one company unless the member sees all (admins always do)', () => {
    expect(accessIsValid('ADMIN', { allCompanies: false, companies: [] })).toBe(true);
    expect(accessIsValid('VIEWER', { allCompanies: true, companies: [] })).toBe(true);
    expect(accessIsValid('FINANCE', { allCompanies: false, companies: [] })).toBe(false);
    expect(accessIsValid('FINANCE', { allCompanies: false, companies: [{ companyId: 'c1', role: 'VIEWER' }] })).toBe(true);
  });
});
