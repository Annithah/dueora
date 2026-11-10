import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { CircleAlert, Download, FileSpreadsheet, Info, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, Card, FormMessage, SectionHeader, Select, SuccessCheck, Text, toast } from '@/components/ui';
import {
  IMPORT_FIELDS,
  useImportCommit,
  useImportPreview,
  type ImportFile,
  type ImportMapping,
  type ImportPreview,
} from '@/features/account/api';
import { downloadAndShare } from '@/features/insights/api';
import { formatDate } from '@/lib/dates';
import { formatUSD } from '@/lib/money';
import { useTheme } from '@/theme';

const NONE = '-1';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Settings → Import from spreadsheet: template → pick file → map columns → preview → import. */
export default function ImportScreen() {
  const { colors } = useTheme();
  const preview = useImportPreview();
  const commit = useImportCommit();
  const [file, setFile] = useState<ImportFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | undefined>();
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

  const runPreview = async (f: ImportFile, m?: ImportMapping) => {
    setError(null);
    try {
      const r = await preview.mutateAsync({ ...f, mapping: m });
      setResult(r);
      setMapping(r.mapping);
    } catch (e) {
      fail(e);
    }
  };

  const pick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', XLSX, 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if ((asset.size ?? 0) > 2 * 1024 * 1024) return setError('That file is larger than 2 MB. Split it into smaller sheets.');
    const f = { fileName: asset.name, contentBase64: await new File(asset.uri).base64() };
    setFile(f);
    setDone(null);
    await runPreview(f);
  };

  const columnOptions = [
    { value: NONE, label: 'Not in my sheet' },
    ...(result?.headers ?? []).map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
  ];

  if (done) {
    return (
      <Screen header={<TopBar title="Import" />} contentStyle={{ gap: 18, alignItems: 'center', paddingTop: 40 }}>
        <SuccessCheck />
        <Text variant="title" align="center">
          {done.imported} subscription{done.imported === 1 ? '' : 's'} imported 🎉
        </Text>
        {done.skipped ? (
          <Text tone="muted" align="center">
            {done.skipped} row{done.skipped === 1 ? ' was' : 's were'} skipped because of errors.
          </Text>
        ) : null}
        <Button full onPress={() => router.replace('/subscriptions')}>
          See my subscriptions
        </Button>
      </Screen>
    );
  }

  return (
    <Screen
      header={<TopBar title="Import from spreadsheet" />}
      contentStyle={{ gap: 18, paddingBottom: 32 }}
      footer={
        result && file ? (
          <Button
            full
            size="lg"
            loading={commit.isPending}
            disabled={result.valid === 0 || result.missingColumns.length > 0}
            onPress={async () => {
              setError(null);
              try {
                setDone(await commit.mutateAsync({ ...file, mapping }));
              } catch (e) {
                fail(e);
              }
            }}
          >
            {`Import ${result.valid} subscription${result.valid === 1 ? '' : 's'}`}
          </Button>
        ) : undefined
      }
    >
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <FileSpreadsheet size={22} color={colors.primaryStrong} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Move your payment sheet into DueOra in one step
          </Text>
        </View>
        <Text variant="small" tone="muted">
          Columns: company, category, name, provider, amount, frequency, next due date. CSV or Excel (.xlsx), up to 2 MB.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            icon={<Download size={16} color={colors.primaryStrong} />}
            onPress={() => downloadAndShare('/import/template?format=xlsx', 'dueora-import-template.xlsx', XLSX).catch(() => toast.error('Could not download the template'))}
          >
            Excel template
          </Button>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            icon={<Download size={16} color={colors.primaryStrong} />}
            onPress={() => downloadAndShare('/import/template?format=csv', 'dueora-import-template.csv', 'text/csv').catch(() => toast.error('Could not download the template'))}
          >
            CSV template
          </Button>
        </View>
      </Card>

      <Button full icon={<Upload size={18} color={colors.onPrimary} />} loading={preview.isPending} onPress={() => void pick()}>
        {file ? `Choose another file (${file.fileName})` : 'Choose a file'}
      </Button>
      <FormMessage message={error} />

      {result ? (
        <>
          <View style={{ gap: 12 }}>
            <SectionHeader title="Match your columns" />
            {IMPORT_FIELDS.map((f) => (
              <Select
                key={f.key}
                label={`${f.label}${'required' in f ? '' : ' (optional)'}`}
                value={mapping?.[f.key] !== undefined ? String(mapping[f.key]) : NONE}
                options={columnOptions}
                onChange={(v) => {
                  const next = { ...mapping };
                  if (v === NONE) delete next[f.key];
                  else next[f.key] = Number(v);
                  setMapping(next);
                  if (file) void runPreview(file, next);
                }}
              />
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <SectionHeader title={`Preview · ${result.valid} of ${result.total} ready`} />
            {result.truncated ? (
              <Text variant="small" tone="muted">
                Only the first 1,000 rows are read. Import the rest in a second file.
              </Text>
            ) : null}
            {result.rows.slice(0, 50).map((r) => (
              <Card key={r.line} style={{ gap: 4, borderColor: r.errors.length ? colors.red : colors.line, borderWidth: 1 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text variant="smallStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {r.parsed.name || `Row ${r.line}`}
                  </Text>
                  {r.parsed.amountCents ? <Text variant="smallStrong">{formatUSD(r.parsed.amountCents)}</Text> : null}
                </View>
                <Text variant="caption" tone="muted">
                  Row {r.line} · {r.parsed.company || '—'} · {r.parsed.category}
                  {r.parsed.nextDueDate ? ` · due ${formatDate(r.parsed.nextDueDate)}` : ''}
                </Text>
                {r.errors.map((e) => (
                  <View key={e} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <CircleAlert size={14} color={colors.red} />
                    <Text variant="caption" tone="danger" style={{ flex: 1 }}>
                      {e}
                    </Text>
                  </View>
                ))}
                {r.warnings.map((w) => (
                  <View key={w} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Info size={14} color={colors.muted} />
                    <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                      {w}
                    </Text>
                  </View>
                ))}
              </Card>
            ))}
            {result.rows.length > 50 ? (
              <Text variant="small" tone="muted" align="center">
                …and {result.rows.length - 50} more rows.
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
