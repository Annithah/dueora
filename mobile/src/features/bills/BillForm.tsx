import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Eye, EyeOff, KeyRound, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, TextInput, View } from 'react-native';

import { ApiError } from '@/api';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  BottomSheet,
  Button,
  CategoryIcon,
  Chip,
  DateField,
  DatePickerField,
  FormMessage,
  Input,
  Segmented,
  Select,
  Switch,
  Text,
  toast,
} from '@/components/ui';
import {
  categoryTree,
  createCategory,
  createCompany,
  useCategories,
  useCompanies,
  useCustomFields,
  useListMutation,
  type Company,
} from '@/features/catalog/api';
import { CategoryForm } from '@/features/catalog/CategoryForm';
import {
  REMINDER_CHOICES,
  isChoiceSelected,
  toggleChoice,
} from '@/features/notifications/reminderOptions';
import { usePermissions, useWorkspace } from '@/features/workspaces/api';
import { useSelectedCompanyId } from '@/state/companyFilter';
import { formatDate } from '@/lib/dates';
import { suggestCategory, useAiStatus } from '@/features/ai/api';
import { guessCategoryName } from '@/lib/guess';
import { radius, typography, useTheme } from '@/theme';

import { METHOD_LABELS, useSaveBill, type PaymentMethod, type Bill } from './api';
import {
  FREQUENCIES,
  autoNextDueDate,
  defaultsFrom,
  formSchema,
  toInput,
  type FormValues,
} from './form';

const NEW_COMPANY = '__new__';
const NEW_CATEGORY = '__new_category__';

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: 15,
        paddingTop: n > 1 ? 22 : 0,
        borderTopWidth: n > 1 ? 1 : 0,
        borderTopColor: colors.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="captionStrong" color={colors.onPrimary}>
            {n}
          </Text>
        </View>
        <View>
          <Text variant="bodyStrong" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

export interface BillFormProps {
  existing?: Bill;
  /** Today in the workspace timezone. */
  today: string;
  /** Called with the saved bill; `isFirst` is true for the workspace's very first one. */
  onSaved: (saved: Bill, isFirst: boolean) => void;
}

export function BillForm({ existing, today, onSaved }: BillFormProps) {
  const { colors } = useTheme();
  const workspace = useWorkspace();
  const allCompanies = useCompanies();
  const can = usePermissions();
  const switcherCompany = useSelectedCompanyId();
  // Only companies this user may add bills to (their role there is Admin or Finance),
  // plus the bill's own company when editing.
  const pickable = (allCompanies.data ?? []).filter(
    (c) => c.myRole === 'ADMIN' || c.myRole === 'FINANCE' || c.id === existing?.company.id,
  );
  const companies = { data: allCompanies.data ? pickable : undefined };
  const save = useSaveBill(existing?.id);
  const addCompany = useListMutation('companies', createCompany);
  const [formError, setFormError] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const { control, handleSubmit, setValue, getValues, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFrom(existing, {
      offsets: workspace.data?.defaultReminderOffsets ?? [30, 14, 7, 3, 1, 0, -1, -3, -7],
      today,
    }),
  });
  const [
    frequency,
    customUnit,
    customInterval,
    startDate,
    nextDueManual,
    removeKey,
    name,
    provider,
    categoryId,
    isTrial,
    companyId,
    amountType,
  ] = useWatch({
    control,
    name: [
      'frequency',
      'customUnit',
      'customInterval',
      'startDate',
      'nextDueManual',
      'removeKey',
      'name',
      'provider',
      'categoryId',
      'isTrial',
      'companyId',
      'amountType',
    ],
  });
  // Categories and custom fields belong to the chosen company.
  const categories = useCategories({ companyId: companyId || undefined });
  const customFields = useCustomFields(companyId || undefined);
  const company = allCompanies.data?.find((c) => c.id === companyId);
  const canAddCategory = company?.myRole === 'ADMIN' || company?.myRole === 'FINANCE';
  const [newCategory, setNewCategory] = useState(false);
  const addCategory = useListMutation('categories', createCategory);
  const fieldsHere = (customFields.data ?? []).filter((f) => !f.categoryIds || (categoryId && f.categoryIds.includes(categoryId)));

  // Switching company clears a category of the previous company.
  useEffect(() => {
    if (!categories.data || !categoryId) return;
    if (!categories.data.some((c) => c.id === categoryId)) setValue('categoryId', '');
  }, [categories.data, categoryId, setValue]);

  // A new bill takes its category's defaults (how often, fixed/variable, method, reminders).
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (existing || !categoryId || appliedFor.current === categoryId) return;
    const c = categories.data?.find((x) => x.id === categoryId);
    if (!c) return;
    appliedFor.current = categoryId;
    const d = c.defaults;
    if (d.frequencyUnit) {
      const preset = FREQUENCIES.find((f) => f.key !== 'custom' && f.unit === d.frequencyUnit && f.interval === (d.frequencyInterval ?? 1));
      if (preset) setValue('frequency', preset.key);
      else if (d.frequencyUnit !== 'ONCE') {
        setValue('frequency', 'custom');
        setValue('customUnit', d.frequencyUnit);
        setValue('customInterval', d.frequencyInterval ?? 1);
      }
    }
    if (d.amountType) setValue('amountType', d.amountType);
    if (d.paymentMethod) setValue('defaultPaymentMethod', d.paymentMethod);
    if (d.reminderOffsets?.length) setValue('reminderOffsets', d.reminderOffsets);
  }, [existing, categoryId, categories.data, setValue]);
  // "Hosting" → suggest Hosting & domains (only while no category is chosen). Keywords answer
  // instantly; when they don't know, DueOra AI is asked (debounced) if it's switched on.
  const ai = useAiStatus();
  const [aiSuggestion, setAiSuggestion] = useState<{ for: string; name: string } | null>(null);
  const text = `${name ?? ''} ${provider ?? ''}`.trim();
  const keywordName = !categoryId ? guessCategoryName(text) : null;
  useEffect(() => {
    if (categoryId || keywordName || !ai.data?.enabled || text.length < 4) return;
    const handle = setTimeout(() => {
      suggestCategory(name ?? '', provider || undefined, companyId || undefined)
        .then((s) => (s ? setAiSuggestion({ for: text, name: s.categoryName }) : undefined))
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(handle);
  }, [text, categoryId, keywordName, ai.data?.enabled, name, provider, companyId]);
  const suggestedName = categoryId
    ? null
    : (keywordName ?? (aiSuggestion?.for === text ? aiSuggestion.name : null));
  const suggested = suggestedName
    ? categories.data?.find((c) => c.name === suggestedName)
    : undefined;

  // Preselect the only company (or the one the switcher shows), so most people never choose.
  const pickableIds = pickable.map((c) => c.id).join(',');
  useEffect(() => {
    const ids = pickableIds ? pickableIds.split(',') : [];
    if (existing || getValues('companyId')) return;
    if (switcherCompany && ids.includes(switcherCompany)) setValue('companyId', switcherCompany);
    else if (ids.length === 1) setValue('companyId', ids[0]!);
  }, [pickableIds, switcherCompany, existing, getValues, setValue]);

  // The next due date follows the start date and frequency until the user overrides it.
  useEffect(() => {
    if (nextDueManual || !startDate) return;
    setValue(
      'nextDueDate',
      autoNextDueDate({ frequency, customUnit, customInterval, startDate }, today),
      {
        shouldValidate: formState.isSubmitted,
      },
    );
  }, [
    frequency,
    customUnit,
    customInterval,
    startDate,
    nextDueManual,
    today,
    setValue,
    formState.isSubmitted,
  ]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const isFirst = !existing && (workspace.data?.billCount ?? 0) === 0;
      const saved = await save.mutateAsync(toInput(values, existing));
      onSaved(saved, isFirst);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this bill');
    }
  });

  const companyOptions = [
    ...(companies.data ?? []).map((c: Company) => ({
      value: c.id,
      label: c.name,
      leading: (
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.color }} />
      ),
    })),
    // Only admins create companies.
    ...(can.manageCompanies ? [{ value: NEW_COMPANY, label: '+ New company…' }] : []),
  ];
  const categoryOptions = [
    ...categoryTree(categories.data ?? []).map(({ category: c, depth }) => ({
      value: c.id,
      label: depth ? `${c.parent?.name ?? ''} › ${c.name}` : c.name,
      leading: <CategoryIcon icon={c.icon} size={depth ? 26 : 32} />,
    })),
    ...(canAddCategory ? [{ value: NEW_CATEGORY, label: '+ New category…' }] : []),
  ];

  return (
    <Screen
      header={<TopBar title={existing ? 'Edit bill' : 'Add bill'} />}
      footer={
        <Button full size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()}>
          {existing ? 'Save changes' : 'Save bill'}
        </Button>
      }
      contentStyle={{ gap: 24, paddingBottom: 32 }}
    >
      <FormMessage message={formError} />

      <Section n={1} title="Basics" hint="What is it, and who is it for?">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <Input
              label="Bill name"
              placeholder="e.g. Website hosting"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="companyId"
          render={({ field, fieldState }) => (
            <Select
              label="Company"
              value={field.value}
              options={companyOptions}
              placeholder="Choose a company"
              onChange={(v) => (v === NEW_COMPANY ? setNewCompany('') : field.onChange(v))}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="categoryId"
          render={({ field, fieldState }) => (
            <Select
              label="Category"
              value={field.value}
              options={categoryOptions}
              onChange={(v) => (v === NEW_CATEGORY ? setNewCategory(true) : field.onChange(v))}
              placeholder={companyId ? 'Choose a category' : 'Choose the company first'}
              disabled={!companyId}
              error={fieldState.error?.message}
            />
          )}
        />
        {suggested ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="small" tone="muted">
              Suggested:
            </Text>
            <Chip
              label={suggested.name}
              accessibilityHint="Use this category"
              onPress={() =>
                setValue('categoryId', suggested.id, { shouldValidate: formState.isSubmitted })
              }
            />
          </View>
        ) : null}
        <Controller
          control={control}
          name="provider"
          render={({ field }) => (
            <Input
              label="Provider (optional)"
              placeholder="Who you pay, e.g. your hosting provider"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </Section>

      <Section n={2} title="Amount" hint={amountType === 'VARIABLE' ? 'An estimate — set the real amount each cycle' : 'How much is due each time, in US dollars'}>
        <Controller
          control={control}
          name="amountType"
          render={({ field }) => (
            <Segmented
              accessibilityLabel="Amount type"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'FIXED', label: 'Fixed amount' },
                { value: 'VARIABLE', label: 'Variable amount' },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <View style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 76,
                  paddingHorizontal: 15,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: fieldState.error ? colors.red : colors.line,
                  backgroundColor: colors.surface,
                }}
              >
                <Text variant="title" tone="muted">
                  $
                </Text>
                <TextInput
                  accessibilityLabel="Amount in US dollars"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.placeholder}
                  style={[typography.amountXL, { flex: 1, color: colors.ink, paddingLeft: 6 }]}
                />
                <Text variant="smallStrong" tone="muted">
                  USD
                </Text>
              </View>
              {fieldState.error ? (
                <Text variant="small" tone="danger">
                  {fieldState.error.message}
                </Text>
              ) : null}
            </View>
          )}
        />
      </Section>

      <Section n={3} title="Schedule" hint="When does it renew?">
        <Text variant="label">Frequency</Text>
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <View
              accessibilityRole="radiogroup"
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
            >
              {FREQUENCIES.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  selected={field.value === f.key}
                  onPress={() => field.onChange(f.key)}
                />
              ))}
            </View>
          )}
        />
        {frequency === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Controller
              control={control}
              name="customInterval"
              render={({ field, fieldState }) => (
                <Input
                  label="Every"
                  keyboardType="number-pad"
                  value={String(field.value ?? '')}
                  onChangeText={(t) => field.onChange(t.replace(/\D/g, ''))}
                  error={fieldState.error?.message}
                  containerStyle={{ flex: 1 }}
                />
              )}
            />
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="customUnit"
                render={({ field }) => (
                  <Select
                    label="Unit"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'WEEK', label: 'Weeks' },
                      { value: 'MONTH', label: 'Months' },
                      { value: 'YEAR', label: 'Years' },
                    ]}
                  />
                )}
              />
            </View>
          </View>
        ) : null}
        <Controller
          control={control}
          name="startDate"
          render={({ field, fieldState }) => (
            <DateField
              label="Start date"
              today={today}
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="nextDueDate"
          render={({ field, fieldState }) => (
            <View style={{ gap: 6 }}>
              <DateField
                label={frequency === 'once' ? 'Due date' : 'Next due date'}
                today={today}
                value={field.value}
                minimumDate={startDate}
                hint={
                  nextDueManual
                    ? 'Set by you'
                    : 'Calculated from the start date and frequency — tap to change'
                }
                onChange={(d) => {
                  setValue('nextDueManual', true);
                  field.onChange(d);
                }}
                error={fieldState.error?.message}
              />
              {nextDueManual ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setValue('nextDueManual', false)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
                >
                  <RotateCcw size={16} color={colors.primaryStrong} />
                  <Text variant="smallStrong" tone="primary">
                    Calculate automatically (
                    {formatDate(
                      autoNextDueDate({ frequency, customUnit, customInterval, startDate }, today),
                    )}
                    )
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      </Section>

      <Section n={4} title="Reminders" hint="Choose as many as you need">
        <Controller
          control={control}
          name="reminderOffsets"
          render={({ field }) => (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REMINDER_CHOICES.map((c) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  showCheck
                  selected={isChoiceSelected(field.value, c)}
                  onPress={() => field.onChange(toggleChoice(field.value, c))}
                />
              ))}
            </View>
          )}
        />
      </Section>

      <Section n={5} title="Renewal & payment" hint="Trials, auto-renewal and how you usually pay">
        <Controller
          control={control}
          name="autoRenew"
          render={({ field }) => (
            <ToggleRow
              label="Renews automatically"
              hint="We'll warn you a week before it charges"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="isTrial"
          render={({ field }) => (
            <ToggleRow
              label="Free trial"
              hint="Get a reminder before the trial ends"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {isTrial ? (
          <Controller
            control={control}
            name="trialEndsOn"
            render={({ field, fieldState }) => (
              <DateField
                label="Trial ends on"
                today={today}
                value={field.value || today}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="defaultPaymentMethod"
          render={({ field }) => (
            <Select
              label="Usual payment method (optional)"
              value={field.value}
              placeholder="Choose when recording a payment"
              onChange={field.onChange}
              options={[
                { value: '', label: 'No default' },
                ...(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => ({
                  value: m,
                  label: METHOD_LABELS[m],
                })),
              ]}
            />
          )}
        />
      </Section>

      <Section n={6} title="Details" hint="Optional">
        <Controller
          control={control}
          name="accountReference"
          render={({ field }) => (
            <View style={{ gap: 8 }}>
              <Input
                label="Reference / account number (optional)"
                placeholder={
                  existing?.accountReference
                    ? `Leave blank to keep ${existing.accountReference.masked}`
                    : 'License key, account number, customer ID, tax ID, meter number…'
                }
                hint="Stored encrypted. Only admins and finance can reveal it."
                value={field.value}
                onChangeText={(t) => {
                  field.onChange(t);
                  if (t) setValue('removeKey', false);
                }}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!removeKey}
                icon={<KeyRound size={18} color={colors.muted} />}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showKey ? 'Hide account reference' : 'Show account reference'}
                    hitSlop={12}
                    onPress={() => setShowKey((v) => !v)}
                  >
                    {showKey ? (
                      <EyeOff size={18} color={colors.muted} />
                    ) : (
                      <Eye size={18} color={colors.muted} />
                    )}
                  </Pressable>
                }
              />
              {existing?.accountReference ? (
                <Controller
                  control={control}
                  name="removeKey"
                  render={({ field: remove }) => (
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
                    >
                      <Text variant="small" tone="muted" style={{ flex: 1 }}>
                        Remove the saved reference ({existing.accountReference!.masked})
                      </Text>
                      <Switch
                        accessibilityLabel="Remove the saved account reference"
                        value={remove.value}
                        onValueChange={(on) => {
                          remove.onChange(on);
                          if (on) setValue('accountReference', '');
                        }}
                      />
                    </View>
                  )}
                />
              ) : null}
            </View>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Input
              label="Notes"
              placeholder="Anything your team should know…"
              multiline
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
      </Section>

      {fieldsHere.length ? (
        <Section n={7} title="More details" hint={`${company?.name ?? 'This company'}’s own fields`}>
          {fieldsHere.map((f) => (
            <Controller
              key={f.id}
              control={control}
              name={`customValues.${f.id}`}
              render={({ field }) =>
                f.type === 'DROPDOWN' ? (
                  <Select
                    label={`${f.name}${f.required ? '' : ' (optional)'}`}
                    value={field.value || null}
                    options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                    onChange={field.onChange}
                  />
                ) : f.type === 'DATE' ? (
                  <DatePickerField label={`${f.name}${f.required ? '' : ' (optional)'}`} value={field.value || null} onChange={field.onChange} />
                ) : (
                  <Input
                    label={`${f.name}${f.required ? '' : ' (optional)'}`}
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    keyboardType={f.type === 'NUMBER' ? 'decimal-pad' : 'default'}
                  />
                )
              }
            />
          ))}
        </Section>
      ) : null}

      <BottomSheet visible={newCategory} onClose={() => setNewCategory(false)} title={`New category in ${company?.name ?? 'this company'}`}>
        {newCategory ? (
          <CategoryForm
            compact
            parents={(categories.data ?? []).filter((c) => !c.parentId)}
            submitLabel="Add category"
            loading={addCategory.isPending}
            onSubmit={(f) =>
              addCategory.mutate(
                { ...f, companyId },
                {
                  onSuccess: (c) => {
                    setValue('categoryId', c.id, { shouldValidate: true });
                    setNewCategory(false);
                  },
                  onError: (err) => toast.error('Could not add the category', err instanceof ApiError ? err.message : undefined),
                },
              )
            }
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={newCompany !== null}
        onClose={() => setNewCompany(null)}
        title="New company"
      >
        <View style={{ gap: 16 }}>
          <Input
            label="Company name"
            placeholder="Company name"
            value={newCompany ?? ''}
            onChangeText={setNewCompany}
            autoFocus
          />
          <Button
            full
            loading={addCompany.isPending}
            disabled={!newCompany?.trim()}
            onPress={() =>
              addCompany.mutate(
                { name: newCompany!.trim() },
                {
                  onSuccess: (c) => {
                    setValue('companyId', c.id, { shouldValidate: true });
                    setNewCompany(null);
                  },
                  onError: (err) =>
                    toast.error(
                      'Could not add the company',
                      err instanceof ApiError ? err.message : undefined,
                    ),
                },
              )
            }
          >
            Add company
          </Button>
        </View>
      </BottomSheet>
    </Screen>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

/** Navigate after saving: first bill → ask for notifications, otherwise open it. */
export function afterSave(
  saved: Bill,
  isFirst: boolean,
  permission: 'granted' | 'denied' | 'undetermined',
) {
  router.replace(`/bills/${saved.id}`);
  if (isFirst && permission === 'undetermined') router.push('/notifications-permission');
}
