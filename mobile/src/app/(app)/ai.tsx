import { router } from 'expo-router';
import {
  Check,
  History,
  Send,
  Sparkles,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api';
import { Illustration } from '@/components/illustrations/Illustration';
import { TopBar } from '@/components/layout/TopBar';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  IconButton,
  ListItem,
  StatusBadge,
  Text,
  toast,
} from '@/components/ui';
import {
  RESTING,
  fetchConversation,
  streamChat,
  useAiStatus,
  useConversations,
  useRateMessage,
  useResolveAction,
  type AiCard,
  type AiMessage,
} from '@/features/ai/api';
import { formatDate } from '@/lib/dates';
import { formatUSD } from '@/lib/money';
import { radius, typography, useTheme, type PaymentStatus } from '@/theme';

const STARTERS = [
  'What’s due this week?',
  'What’s overdue?',
  'How much do we spend per year on software?',
  'Which month is the most expensive?',
  'Compare this month with last month',
  'How do I import my spreadsheet?',
];

/** Three dots that breathe while DueOra AI is thinking. */
function Typing() {
  const { colors } = useTheme();
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityLabel="DueOra AI is typing"
      style={[{ flexDirection: 'row', gap: 4, padding: 12 }, style]}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }}
        />
      ))}
    </Animated.View>
  );
}

function CardView({
  card,
  messageId,
  onUpdate,
}: {
  card: AiCard;
  messageId: string;
  onUpdate: (c: AiCard) => void;
}) {
  const { colors } = useTheme();
  const resolve = useResolveAction();
  if (card.type === 'bills') {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <Text variant="captionStrong" tone="muted" style={{ padding: 10, paddingBottom: 4 }}>
          {card.title}
        </Text>
        {card.items.map((s, i) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push(`/bills/${s.id}`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              minHeight: 48,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.line,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="smallStrong" numberOfLines={1}>
                {s.company} · {s.name}
              </Text>
              <Text variant="caption" tone="muted">
                Due {formatDate(s.nextDueDate)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text variant="smallStrong">{formatUSD(s.amountCents)}</Text>
              <StatusBadge status={s.status as PaymentStatus} />
            </View>
          </Pressable>
        ))}
      </Card>
    );
  }
  if (card.type === 'total') {
    return (
      <Card tone="primary" style={{ gap: 2 }}>
        <Text variant="captionStrong" tone="muted">
          {card.label}
        </Text>
        <Text variant="title">{formatUSD(card.amountCents)}</Text>
        {card.detail ? (
          <Text variant="caption" tone="muted">
            {card.detail}
          </Text>
        ) : null}
      </Card>
    );
  }
  const pending = card.status === 'pending';
  const act = (decision: 'confirm' | 'cancel') =>
    resolve.mutate(
      { messageId, actionId: card.id, decision },
      {
        onSuccess: (c) => onUpdate(c),
        onError: (e) =>
          toast.error('Could not do that', e instanceof ApiError ? e.message : undefined),
      },
    );
  return (
    <Card style={{ gap: 10, borderWidth: 1, borderColor: pending ? colors.primary : colors.line }}>
      <Text variant="eyebrow" tone="primary">
        {pending
          ? 'Confirm this change'
          : card.status === 'confirmed'
            ? 'Done ✅'
            : card.status === 'cancelled'
              ? 'Cancelled'
              : 'Didn’t work'}
      </Text>
      <Text variant="small">{card.summary}</Text>
      {card.result ? (
        <Text variant="small" tone={card.status === 'failed' ? 'danger' : 'muted'}>
          {card.result}
        </Text>
      ) : null}
      {pending ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            loading={resolve.isPending}
            icon={<Check size={16} color={colors.onPrimary} />}
            onPress={() => act('confirm')}
          >
            Confirm
          </Button>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            disabled={resolve.isPending}
            icon={<X size={16} color={colors.primaryStrong} />}
            onPress={() => act('cancel')}
          >
            Cancel
          </Button>
        </View>
      ) : null}
    </Card>
  );
}

function Bubble({ m, onCards }: { m: AiMessage; onCards: (cards: AiCard[]) => void }) {
  const { colors } = useTheme();
  const rate = useRateMessage();
  const [rating, setRating] = useState(m.rating);
  const mine = m.role === 'USER';
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 8 }}
    >
      {m.text ? (
        <View
          style={{
            maxWidth: '88%',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: radius.card,
            borderBottomRightRadius: mine ? 4 : radius.card,
            borderBottomLeftRadius: mine ? radius.card : 4,
            backgroundColor: mine ? colors.primary : colors.surface,
            borderWidth: mine ? 0 : 1,
            borderColor: colors.line,
          }}
        >
          <Text variant="body" color={mine ? colors.onPrimary : colors.ink}>
            {m.text}
          </Text>
        </View>
      ) : null}
      {m.cards.length ? (
        <View style={{ width: '100%', gap: 8 }}>
          {m.cards.map((c, i) => (
            <CardView
              key={c.type === 'action' ? c.id : `${c.type}-${i}`}
              card={c}
              messageId={m.id}
              onUpdate={(updated) => onCards(m.cards.map((x, j) => (j === i ? updated : x)))}
            />
          ))}
        </View>
      ) : null}
      {!mine && m.id !== 'streaming' ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {([1, -1] as const).map((r) => {
            const Icon = r === 1 ? ThumbsUp : ThumbsDown;
            return (
              <IconButton
                key={r}
                accessibilityLabel={r === 1 ? 'Helpful' : 'Not helpful'}
                onPress={() => {
                  setRating(r);
                  rate.mutate({ messageId: m.id, rating: r });
                  if (r === -1) toast.info('Thanks — this helps DueOra AI improve. 🙏');
                }}
              >
                <Icon
                  size={16}
                  color={rating === r ? colors.primaryStrong : colors.muted}
                  fill={rating === r ? colors.primarySoft : 'transparent'}
                />
              </IconButton>
            );
          })}
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function AiChat() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const status = useAiStatus();
  const history = useConversations();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming !== null) return;
    setDraft('');
    const now = new Date().toISOString();
    setMessages((m) => [
      ...m,
      { id: `local-${now}`, role: 'USER', text: message, cards: [], rating: null, createdAt: now },
    ]);
    setStreaming('');
    try {
      const done = await streamChat(
        { conversationId, message },
        {
          onMeta: (id) => setConversationId(id),
          onDelta: (t) => setStreaming((s) => (s ?? '') + t),
        },
      );
      setMessages((m) => [
        ...m,
        {
          id: done.messageId,
          role: 'ASSISTANT',
          text: done.text,
          cards: done.cards,
          rating: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      void history.refetch();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : RESTING;
      setMessages((m) => [
        ...m,
        {
          id: `error-${now}`,
          role: 'ASSISTANT',
          text: msg,
          cards: [],
          rating: null,
          createdAt: now,
        },
      ]);
    } finally {
      setStreaming(null);
    }
  };

  const open = async (id: string) => {
    setHistoryOpen(false);
    try {
      const c = await fetchConversation(id);
      setConversationId(c.id);
      setMessages(c.messages);
    } catch {
      toast.error('Could not open that chat');
    }
  };

  const off = status.data && !status.data.enabled;
  const empty = messages.length === 0 && streaming === null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <TopBar
          title="DueOra AI"
          action={
            <View style={{ flexDirection: 'row' }}>
              <IconButton accessibilityLabel="Chat history" onPress={() => setHistoryOpen(true)}>
                <History size={20} color={colors.ink} />
              </IconButton>
              <IconButton
                accessibilityLabel="New chat"
                onPress={() => {
                  setConversationId(undefined);
                  setMessages([]);
                }}
              >
                <SquarePen size={20} color={colors.ink} />
              </IconButton>
            </View>
          }
        />
      </View>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {off ? (
          <Card tone="accent" style={{ gap: 6 }}>
            <Text variant="bodyStrong">DueOra AI is switched off</Text>
            <Text variant="small" tone="muted">
              An admin can turn it on in More → DueOra AI.
            </Text>
          </Card>
        ) : null}
        {empty ? (
          <Animated.View
            entering={FadeIn}
            style={{ alignItems: 'center', gap: 12, paddingTop: 12 }}
          >
            <Illustration name="track" size={150} />
            <Text variant="title" align="center">
              Hi! I’m DueOra AI ✨
            </Text>
            <Text variant="body" tone="muted" align="center">
              Ask about what’s due, what you spend, or tell me what to add or record — I’ll always
              ask before changing anything.
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                marginTop: 8,
              }}
            >
              {STARTERS.map((s) => (
                <Chip key={s} label={s} onPress={() => void send(s)} />
              ))}
            </View>
          </Animated.View>
        ) : null}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            m={m}
            onCards={(cards) =>
              setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, cards } : x)))
            }
          />
        ))}
        {streaming !== null ? (
          streaming ? (
            <Bubble
              m={{
                id: 'streaming',
                role: 'ASSISTANT',
                text: streaming,
                cards: [],
                rating: null,
                createdAt: '',
              }}
              onCards={() => undefined}
            />
          ) : (
            <Typing />
          )
        ) : null}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        <Sparkles size={20} color={colors.primaryStrong} style={{ marginBottom: 12 }} />
        <TextInput
          accessibilityLabel="Message DueOra AI"
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask DueOra AI…"
          placeholderTextColor={colors.placeholder}
          multiline
          editable={!off}
          style={[
            typography.body,
            { flex: 1, maxHeight: 120, minHeight: 44, paddingVertical: 10, color: colors.ink },
          ]}
          onSubmitEditing={() => void send(draft)}
        />
        <IconButton
          accessibilityLabel="Send"
          disabled={!draft.trim() || streaming !== null || !!off}
          onPress={() => void send(draft)}
        >
          <Send size={20} color={draft.trim() ? colors.primaryStrong : colors.muted} />
        </IconButton>
      </View>

      <BottomSheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Your chats">
        <View>
          {(history.data ?? []).length === 0 ? (
            <Text variant="small" tone="muted">
              No chats yet.
            </Text>
          ) : null}
          {(history.data ?? []).map((c, i) => (
            <ListItem
              key={c.id}
              divider={i > 0}
              title={c.title}
              subtitle={formatDate(c.updatedAt.slice(0, 10))}
              onPress={() => void open(c.id)}
            />
          ))}
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
