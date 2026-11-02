import LottieView from 'lottie-react-native';
import { Check } from 'lucide-react-native';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { statusBrand, useTheme } from '@/theme';

import successCheck from '../../../assets/lottie/success-check.json';

export interface SuccessCheckProps {
  size?: number;
  onFinish?: () => void;
}

/** The "payment recorded" celebration: disc pop, drawn check, confetti burst. */
export function SuccessCheck({ size = 140, onFinish }: SuccessCheckProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <View
        accessible
        accessibilityLabel="Success"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.greenSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: size,
            backgroundColor: statusBrand.paid,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={size * 0.28} color="#FFFFFF" strokeWidth={3} />
        </View>
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel="Success">
      <LottieView
        source={successCheck}
        autoPlay
        loop={false}
        onAnimationFinish={onFinish}
        style={{ width: size, height: size }}
      />
    </View>
  );
}
