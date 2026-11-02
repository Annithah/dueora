import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/navigation/TabBar';
import { useInbox } from '@/features/notifications/api';

export default function TabsLayout() {
  const unread = useInbox().data?.unreadCount ?? 0;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} unreadAlerts={unread} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
