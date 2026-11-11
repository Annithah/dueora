import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/navigation/TabBar';
import { usePermissions } from '@/features/workspaces/api';

/** Alerts live behind the bell in the Home header (app/(app)/alerts.tsx), not in the bar. */
export default function TabsLayout() {
  const can = usePermissions();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} canAdd={can.manageBills} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="bills" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
