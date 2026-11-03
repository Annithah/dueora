import type { SelectOption } from '@/components/ui';

const ZONES: [string, string][] = [
  ['Africa/Kigali', 'Kigali (GMT+2)'],
  ['Africa/Nairobi', 'Nairobi (GMT+3)'],
  ['Africa/Kampala', 'Kampala (GMT+3)'],
  ['Africa/Dar_es_Salaam', 'Dar es Salaam (GMT+3)'],
  ['Africa/Lagos', 'Lagos (GMT+1)'],
  ['Africa/Johannesburg', 'Johannesburg (GMT+2)'],
  ['Europe/London', 'London'],
  ['Europe/Paris', 'Paris / Brussels'],
  ['America/New_York', 'New York'],
  ['UTC', 'UTC'],
];

/** Common zones plus the device's own zone if it isn't already listed. */
export function timezoneOptions(): SelectOption<string>[] {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = ZONES.map(([value, label]) => ({ value, label }));
  if (device && !options.some((o) => o.value === device)) {
    options.unshift({ value: device, label: `${device.replace(/_/g, ' ')} (this device)` });
  }
  return options;
}
