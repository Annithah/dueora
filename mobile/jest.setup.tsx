import { setUpTests } from 'react-native-reanimated';

setUpTests();

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Lottie needs the native view; render a plain View in tests.
jest.mock('lottie-react-native', () => {
  const { View } = require('react-native');
  const LottieView = (props: Record<string, unknown>) => <View testID="lottie" {...props} />;
  return { __esModule: true, default: LottieView };
});
