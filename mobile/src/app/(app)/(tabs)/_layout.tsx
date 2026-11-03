import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/navigation/TabBar';
import { useInbox } from '@/features/notifications/api';
import { usePermissions } from '@/features/workspaces/api';

export default function TabsLayout() {
  const unread = useInbox().data?.unreadCount ?? 0;
  const can = usePermissions();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} unreadAlerts={unread} canAdd={can.manageSubscriptions} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="subscriptions" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
