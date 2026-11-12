import { View } from 'react-native';

import { Avatar, Card, Segmented, Switch, Text } from '@/components/ui';
import type { Role } from '@/features/auth/api';
import { useCompanies, type CompanyAccessInput, type CompanyGrant } from '@/features/catalog/api';

type Level = 'NONE' | 'VIEWER' | 'FINANCE';
const LEVELS: { value: Level; label: string }[] = [
  { value: 'NONE', label: 'No access' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'FINANCE', label: 'Finance' },
];

/** Valid when the member sees all companies, or at least one is picked. */
export function accessIsValid(role: Role, a: CompanyAccessInput): boolean {
  return role === 'ADMIN' || a.allCompanies || a.companies.length > 0;
}

/**
 * Which companies a member can see: all of them (current and future, with their role), or
 * a chosen list with a role per company. Admins always see every company.
 */
export function AccessPicker({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: CompanyAccessInput;
  onChange: (next: CompanyAccessInput) => void;
}) {
  const companies = useCompanies();

  if (role === 'ADMIN') {
    return (
      <Text variant="small" tone="muted">
        Admins see and manage every company.
      </Text>
    );
  }

  const levelOf = (companyId: string): Level => value.companies.find((g) => g.companyId === companyId)?.role ?? 'NONE';
  const setLevel = (companyId: string, level: Level) => {
    const rest = value.companies.filter((g) => g.companyId !== companyId);
    const companies: CompanyGrant[] = level === 'NONE' ? rest : [...rest, { companyId, role: level }];
    onChange({ ...value, companies });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">All companies</Text>
          <Text variant="small" tone="muted">
            Current and future companies, as {role === 'FINANCE' ? 'Finance' : 'Viewer'}.
          </Text>
        </View>
        <Switch accessibilityLabel="Access to all companies" value={value.allCompanies} onValueChange={(allCompanies) => onChange({ ...value, allCompanies })} />
      </View>
      {!value.allCompanies ? (
        <>
          {(companies.data ?? []).map((c) => (
            <Card key={c.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={c.shortName || c.name} color={c.color} size={30} />
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {c.name}
                </Text>
              </View>
              <Segmented accessibilityLabel={`Access to ${c.name}`} options={LEVELS} value={levelOf(c.id)} onChange={(l) => setLevel(c.id, l)} />
            </Card>
          ))}
          {value.companies.length === 0 ? (
            <Text variant="small" tone="danger">
              Pick at least one company.
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
