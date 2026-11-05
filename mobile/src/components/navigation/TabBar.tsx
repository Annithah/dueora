import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { CalendarDays, House, Menu, Plus, WalletCards, type LucideIcon } from 'lucide-react-native';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, useTheme } from '@/theme';

const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: 'Home' },
  subscriptions: { icon: WalletCards, label: 'Subscriptions' },
  calendar: { icon: CalendarDays, label: 'Calendar' },
  more: { icon: Menu, label: 'More' },
};

/** Height of the tappable row (icon + label), excluding the safe-area inset. */
export const TAB_ROW_HEIGHT = 58;
/** How far the "+" button rises above the bar's top edge. */
const FAB_RAISE = 14;
const FAB_SIZE = 54;
const ICON_SIZE = 24;
const LABEL_SIZE = 11;
/** Width of the longest label ("Subscriptions") in bold at 11px with -0.2 letter spacing. */
const LONGEST_LABEL_WIDTH = 72;

/**
 * Label size for a given slot width: 11px wherever the longest label fits with a few px to
 * spare, otherwise scaled down just enough (≈10.4px on a 360px-wide phone, never below 9.5px).
 * Computed up front because adjustsFontSizeToFit is native-only and not guaranteed.
 */
export function tabLabelSize(slotWidth: number): number {
  const fit = (LABEL_SIZE * (slotWidth - 4)) / LONGEST_LABEL_WIDTH;
  return Math.max(9.5, Math.min(LABEL_SIZE, Math.floor(fit * 10) / 10));
}

export interface TabBarProps extends BottomTabBarProps {
  /** Show the centre "+" (hidden for read-only viewers). */
  canAdd?: boolean;
}

/**
 * Bottom navigation: equal slots — Home, Subscriptions, [+], Calendar, More.
 *
 * Every slot has the same fixed structure (24px icon over a one-line 11px label), so icons
 * and labels line up on one baseline. The "+" sits in its own slot and rises FAB_RAISE px
 * above the bar. The slots are FAB_RAISE px taller than the visible bar (whose background is
 * drawn behind them), so the raised part of the "+" stays inside its parents' bounds —
 * Android ignores touches outside a parent's bounds.
 */
export function TabBar({ state, emitter, navigateToTab, canAdd = true }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { width } = useWindowDimensions();
  const raise = canAdd ? FAB_RAISE : 0;
  const slotHeight = TAB_ROW_HEIGHT + raise;

  const tabs = state.routes
    .map((route, index) => ({ route, index, meta: TABS[route.name] }))
    .filter((t): t is typeof t & { meta: { icon: LucideIcon; label: string } } => !!t.meta);

  const slotCount = tabs.length + (canAdd ? 1 : 0);
  const labelSize = tabLabelSize((width - insets.left - insets.right) / Math.max(slotCount, 1));

  const renderTab = ({ route, index, meta }: (typeof tabs)[number]) => {
    const focused = state.index === index;
    const Icon = meta.icon;
    const color = focused ? colors.primaryStrong : colors.muted;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        testID={`tab-${route.name}`}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        }}
        style={{
          flex: 1,
          height: slotHeight,
          paddingTop: raise,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {/* Active indicator: a short teal pill on the bar's top edge. */}
        <View
          style={{
            position: 'absolute',
            top: raise,
            width: 20,
            height: 3,
            borderBottomLeftRadius: 3,
            borderBottomRightRadius: 3,
            backgroundColor: focused ? colors.primaryStrong : 'transparent',
          }}
        />
        <Icon size={ICON_SIZE} color={color} strokeWidth={focused ? 2.4 : 2} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          allowFontScaling={false}
          style={{
            width: '100%',
            textAlign: 'center',
            fontFamily: focused ? fontFamily.bold : fontFamily.semibold,
            fontSize: labelSize,
            letterSpacing: labelSize < LABEL_SIZE ? -0.2 : 0,
            lineHeight: 14,
            color,
          }}
        >
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  const addSlot = (
    <View key="add" style={{ flex: 1, height: slotHeight, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add subscription"
        testID="tab-add"
        hitSlop={6}
        onPress={() => router.push('/subscriptions/new')}
        style={({ pressed }) => ({
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          backgroundColor: pressed ? colors.primaryStrong : colors.primary,
          borderWidth: 4,
          borderColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.95 : 1 }],
          shadowColor: colors.shadow,
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        })}
      >
        <Plus size={26} color={colors.onPrimary} strokeWidth={2.5} />
      </Pressable>
    </View>
  );

  const slots = tabs.map(renderTab);
  // Home, Subscriptions, [+], Calendar, More.
  if (canAdd) slots.splice(2, 0, addSlot);

  return (
    <View accessibilityRole="tablist" style={{ backgroundColor: colors.canvas }}>
      {/* The visible bar, drawn behind the slots; the strip above it shows the canvas. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: raise,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          paddingBottom: Math.max(insets.bottom, 6),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {slots}
      </View>
    </View>
  );
}
