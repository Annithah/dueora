import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui';

export interface PageHeaderProps {
  /** Small muted line above the title ("All bills", "Plan ahead"). */
  eyebrow?: string;
  title: string;
  right?: ReactNode;
}

/** Tab-screen header from the prototype: muted kicker + large title, action on the right. */
export function PageHeader({ eyebrow, title, right }: PageHeaderProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Text variant="small" tone="muted" style={{ marginBottom: 3 }}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="pageTitle" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}
