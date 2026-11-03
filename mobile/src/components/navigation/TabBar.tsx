import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import {
  Bell,
  CalendarDays,
  House,
  Menu,
  Plus,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: 'Home' },
  subscriptions: { icon: WalletCards, label: 'Subscriptions' },
  calendar: { icon: CalendarDays, label: 'Calendar' },
  alerts: { icon: Bell, label: 'Alerts' },
  more: { icon: Menu, label: 'More' },
};

export interface TabBarProps extends BottomTabBarProps {
  /** Unread alerts count for the badge. */
  unreadAlerts?: number;
  /** Show the floating "+" (hidden for read-only viewers). */
  canAdd?: boolean;
}

/** Prototype bottom navigation: five tabs with a raised "+" button between Subscriptions and Calendar. */
export function TabBar({ state, emitter, navigateToTab, unreadAlerts = 0, canAdd = true }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const meta = ICONS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const Icon = meta.icon;
        const color = focused ? colors.primaryStrong : colors.muted;
        const showBadge = route.name === 'alerts' && unreadAlerts > 0;

        const tab = (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={showBadge ? `${meta.label}, ${unreadAlerts} unread` : meta.label}
            onPress={() => {
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={{
              flex: 1,
              minHeight: 52,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <View>
              <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
              {showBadge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -10,
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 4,
                    borderRadius: 9,
                    backgroundColor: colors.red,
                    borderWidth: 2,
                    borderColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    variant="captionStrong"
                    color="#FFFFFF"
                    allowFontScaling={false}
                    style={{ fontSize: 10, lineHeight: 12 }}
                  >
                    {unreadAlerts > 99 ? '99+' : unreadAlerts}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              variant="caption"
              color={color}
              style={{ fontWeight: focused ? '700' : '500' }}
              allowFontScaling={false}
            >
              {meta.label}
            </Text>
          </Pressable>
        );

        // Leave room for the FAB after the second tab.
        if (index === 1 && canAdd) {
          return [
            tab,
            <View key="fab-slot" style={{ width: 64, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add subscription"
                onPress={() => router.push('/subscriptions/new')}
                style={({ pressed }) => ({
                  position: 'absolute',
                  bottom: 14,
                  width: 60,
                  height: 60,
                  borderRadius: 20,
                  backgroundColor: colors.primary,
                  borderWidth: 5,
                  borderColor: colors.canvas,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  shadowColor: colors.primary,
                  shadowOpacity: 0.3,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 7 },
                  elevation: 8,
                })}
              >
                <Plus size={26} color={colors.onPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>,
          ];
        }
        return tab;
      })}
    </View>
  );
}
