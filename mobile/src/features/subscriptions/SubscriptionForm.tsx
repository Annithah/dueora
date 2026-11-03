import { zodResolver } from '@hookform/resolvers/zod';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { FileText, Paperclip, Plus, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, TextInput, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  Avatar,
  BottomSheet,
  Button,
  CategoryIcon,
  Chip,
  DatePickerField,
  FormMessage,
  Input,
  Select,
  Text,
  toast,
} from '@/components/ui';
import { ApiError } from '@/api';
import {
  createPlatform,
  useCategories,
  useListMutation,
  useMembers,
  usePlatforms,
} from '@/features/catalog/api';
import {
  REMINDER_CHOICES,
  isChoiceSelected,
  toggleChoice,
} from '@/features/notifications/reminderOptions';
import { useWorkspace } from '@/features/workspaces/api';
import { CURRENCY_OPTIONS } from '@/lib/locale';
import { currencySymbol } from '@/lib/money';
import { radius, typography, useTheme } from '@/theme';

import { uploadAttachment, useSaveObligation, type Obligation, type UploadableFile } from './api';
import { FREQUENCIES, defaultsFrom, formSchema, toInput, type FormValues } from './form';

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

export interface ObligationFormProps {
  existing?: Obligation;
  today: string;
  /** Called with the saved obligation; `isFirst` is true for the workspace's very first one. */
  onSaved: (saved: Obligation, isFirst: boolean) => void;
}

export function ObligationForm({ existing, today, onSaved }: ObligationFormProps) {
  const { colors } = useTheme();
  const workspace = useWorkspace();
  const platforms = usePlatforms();
  const categories = useCategories();
  const members = useMembers();
  const save = useSaveObligation(existing?.id);
  const addPlatform = useListMutation('platforms', createPlatform);
  const [formError, setFormError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadableFile[]>([]);
  const [newProject, setNewProject] = useState<string | null>(null);

  const { control, handleSubmit, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFrom(existing, {
      currency: workspace.data?.defaultCurrency ?? 'USD',
      offsets: workspace.data?.defaultReminderOffsets ?? [30, 14, 7, 3, 1, 0, -1, -3, -7],
      today,
    }),
  });
  const frequency = useWatch({ control, name: 'frequency' });
  const currency = useWatch({ control, name: 'currency' });
  const startDate = useWatch({ control, name: 'startDate' });

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const ok = result.assets.filter((a) => (a.size ?? 0) <= 5 * 1024 * 1024);
    if (ok.length < result.assets.length)
      toast.error('Some files were skipped', 'Attachments can be up to 5 MB.');
    setFiles((f) => [
      ...f,
      ...ok.map((a) => ({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? 'application/octet-stream',
      })),
    ]);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const isFirst = !existing && (workspace.data?.obligationCount ?? 0) === 0;
      const saved = await save.mutateAsync(toInput(values));
      const failed: string[] = [];
      for (const f of files) {
        try {
          await uploadAttachment({ obligationId: saved.id }, f);
        } catch {
          failed.push(f.name);
        }
      }
      if (failed.length) toast.error('Saved, but some files didn’t upload', failed.join(', '));
      onSaved(saved, isFirst);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this payment');
    }
  });

  const platformOptions = [
    { value: '', label: 'No project' },
    ...(platforms.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    { value: '__new__', label: '+ New project…' },
  ];
  const categoryOptions = (categories.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    leading: <CategoryIcon icon={c.icon} size={32} />,
  }));
  const memberOptions = [
    { value: '', label: 'Nobody in particular' },
    ...(members.data ?? []).map((m) => ({
      value: m.userId,
      label: m.name,
      description: m.email,
      leading: <Avatar name={m.name} size={32} />,
    })),
  ];
  const deptOptions = [
    { value: '', label: 'No department' },
    ...(workspace.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name })),
  ];

  return (
    <Screen
      header={<TopBar title={existing ? 'Edit payment' : 'Add payment'} />}
      footer={
        <Button full size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()}>
          {existing ? 'Save changes' : 'Save payment'}
        </Button>
      }
      contentStyle={{ gap: 24, paddingBottom: 32 }}
    >
      <FormMessage message={formError} />

      <Section n={1} title="Basic information" hint="What are you paying for?">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <Input
              label="Payment name"
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
          name="provider"
          render={({ field, fieldState }) => (
            <Input
              label="Provider"
              placeholder="Provider or vendor"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Controller
            control={control}
            name="platformId"
            render={({ field }) => (
              <Select
                label="Project"
                value={field.value ?? ''}
                options={platformOptions}
                onChange={(v) => (v === '__new__' ? setNewProject('') : field.onChange(v || null))}
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
                onChange={field.onChange}
                placeholder="Choose"
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
      </Section>

      <Section n={2} title="Amount" hint="How much is due each time?">
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
                  {currencySymbol(currency) ?? ''}
                </Text>
                <TextInput
                  accessibilityLabel={`Amount in ${currency}`}
                  value={field.value}
                  onChangeText={field.onChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.placeholder}
                  style={[typography.amountXL, { flex: 1, color: colors.ink, paddingLeft: 6 }]}
                />
                <View style={{ width: 110 }}>
                  <Controller
                    control={control}
                    name="currency"
                    render={({ field: c }) => (
                      <Select
                        value={c.value}
                        options={CURRENCY_OPTIONS}
                        onChange={c.onChange}
                        sheetTitle="Currency"
                      />
                    )}
                  />
                </View>
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
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Controller
            control={control}
            name="startDate"
            render={({ field, fieldState }) => (
              <DatePickerField
                label="Start date"
                value={field.value}
                onChange={(d) => {
                  field.onChange(d);
                  if (!existing) setValue('nextDueDate', d);
                }}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="nextDueDate"
            render={({ field, fieldState }) => (
              <DatePickerField
                label={frequency === 'once' ? 'Due date' : 'Next due'}
                value={field.value}
                minimumDate={startDate}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
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

      <Section n={5} title="Ownership & details" hint="Optional information">
        <Controller
          control={control}
          name="assigneeUserId"
          render={({ field }) => (
            <Select
              label="Assigned to"
              value={field.value ?? ''}
              options={memberOptions}
              onChange={(v) => field.onChange(v || null)}
            />
          )}
        />
        {(workspace.data?.departments.length ?? 0) > 0 ? (
          <Controller
            control={control}
            name="departmentId"
            render={({ field }) => (
              <Select
                label="Department"
                value={field.value ?? ''}
                options={deptOptions}
                onChange={(v) => field.onChange(v || null)}
              />
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Input
              label="Notes"
              placeholder="Add notes for your team..."
              multiline
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        {files.map((f) => (
          <View
            key={f.uri}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: radius.md,
              backgroundColor: colors.primarySoft,
            }}
          >
            <FileText size={20} color={colors.primaryStrong} />
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {f.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${f.name}`}
              hitSlop={12}
              onPress={() => setFiles((fs) => fs.filter((x) => x.uri !== f.uri))}
            >
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => void pickFiles()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 66,
            padding: 12,
            borderRadius: radius.md,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.dashed,
            backgroundColor: colors.surface,
          }}
        >
          <Paperclip size={20} color={colors.primaryStrong} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Add attachments</Text>
            <Text variant="small" tone="muted">
              Contract, invoice or document (PDF or image, 5 MB)
            </Text>
          </View>
          <Plus size={18} color={colors.primaryStrong} />
        </Pressable>
      </Section>

      <BottomSheet
        visible={newProject !== null}
        onClose={() => setNewProject(null)}
        title="New project"
      >
        <Input
          label="Project name"
          placeholder="e.g. KT Radio"
          value={newProject ?? ''}
          onChangeText={setNewProject}
          autoFocus
        />
        <Button
          full
          loading={addPlatform.isPending}
          disabled={!newProject?.trim()}
          onPress={() =>
            addPlatform.mutate(
              { name: newProject!.trim(), color: '#0F5C5C' },
              {
                onSuccess: (p) => {
                  setValue('platformId', (p as { id: string }).id);
                  setNewProject(null);
                },
                onError: (err) =>
                  toast.error(
                    'Could not add the project',
                    err instanceof ApiError ? err.message : undefined,
                  ),
              },
            )
          }
        >
          Add project
        </Button>
      </BottomSheet>
    </Screen>
  );
}

/** Navigate after saving: first payment → ask for notifications, otherwise open it. */
export function afterSave(
  saved: Obligation,
  isFirst: boolean,
  permission: 'granted' | 'denied' | 'undetermined',
) {
  router.replace(`/payments/${saved.id}`);
  if (isFirst && permission === 'undetermined') router.push('/notifications-permission');
}
