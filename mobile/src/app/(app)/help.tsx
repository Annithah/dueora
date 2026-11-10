import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp, Mail, MessageSquareHeart } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { ApiError, api } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, Card, Input, SearchBar, Text, toast } from '@/components/ui';
import { useSendFeedback } from '@/features/account/api';
import { useTheme } from '@/theme';

interface Article {
  slug: string;
  title: string;
  body: string;
}

/** Same articles DueOra AI answers "How do I…?" from (backend/src/ai/knowledge). */
function useArticles() {
  return useQuery({
    queryKey: ['help-articles'],
    queryFn: () => api.request<Article[]>('/help/articles', { auth: false, org: false }),
    staleTime: 60 * 60_000,
  });
}

/** **bold** → bold text; the articles use nothing fancier. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text variant="body" tone="muted" style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <Text key={i} variant="bodyStrong">
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export default function Help() {
  const { colors } = useTheme();
  const articles = useArticles();
  const feedback = useSendFeedback();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');

  return (
    <Screen header={<TopBar title="Help & feedback" />} contentStyle={{ gap: 18, paddingBottom: 32 }}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search help" />
      <QueryState query={articles}>
        {(list) => {
          const needle = q.trim().toLowerCase();
          const shown = needle ? list.filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(needle)) : list;
          return (
            <Card padding={0} style={{ overflow: 'hidden' }}>
              {shown.length === 0 ? (
                <Text variant="small" tone="muted" style={{ padding: 14 }}>
                  Nothing matches “{q}”. Try other words, or ask DueOra AI. ✨
                </Text>
              ) : null}
              {shown.map((a, i) => (
                <View key={a.slug} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open === a.slug }}
                    onPress={() => setOpen(open === a.slug ? null : a.slug)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14 }}
                  >
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {a.title}
                    </Text>
                    {open === a.slug ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
                  </Pressable>
                  {open === a.slug ? <Rich text={a.body} /> : null}
                </View>
              ))}
            </Card>
          );
        }}
      </QueryState>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <MessageSquareHeart size={20} color={colors.primaryStrong} />
          <Text variant="bodyStrong">Send feedback</Text>
        </View>
        <Text variant="small" tone="muted">
          Something confusing, missing or lovely? Tell us — we read every message. 💬
        </Text>
        <Input label="Your message" multiline value={message} onChangeText={setMessage} placeholder="What should we improve?" />
        <Button
          loading={feedback.isPending}
          disabled={message.trim().length < 3}
          onPress={() =>
            feedback.mutate(message.trim(), {
              onSuccess: () => {
                setMessage('');
                toast.success('Thank you! 💚', 'Your feedback reached the DueOra team.');
              },
              onError: (e) => toast.error('Could not send', e instanceof ApiError ? e.message : undefined),
            })
          }
        >
          Send feedback
        </Button>
      </Card>

      <Card tone="primary" style={{ gap: 10 }}>
        <Text variant="bodyStrong">Still stuck?</Text>
        <Text variant="small" tone="muted">
          Write to us and a person will get back to you within one working day.
        </Text>
        <Button
          variant="secondary"
          icon={<Mail size={18} color={colors.primaryStrong} />}
          onPress={() => void Linking.openURL('mailto:support@dueora.app?subject=DueOra%20help')}
        >
          Email support
        </Button>
      </Card>
      {/* Low-key on purpose: most people never need the intro again. */}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/onboarding')}
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="small" tone="muted">
          View intro again
        </Text>
      </Pressable>
    </Screen>
  );
}
