import { fireEvent, screen } from '@testing-library/react-native';

import { useSession } from '@/state/session';
import { renderWithTheme } from '@/test/render';

import Index from '@/app/index';
import Onboarding from '@/app/onboarding';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() };
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  // Getter: jest.mock is hoisted above the mockRouter declaration.
  get router() {
    return mockRouter;
  },
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));
jest.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedOut', hasOnboarded: false, tokens: null });
});

describe('entry gate', () => {
  it.each([
    ['first launch', 'signedOut', false, '/splash'],
    ['seen the intro, logged out', 'signedOut', true, '/login'],
    ['already logged in', 'signedIn', true, '/(app)/(tabs)'],
  ] as const)('%s → %s', async (_name, status, hasOnboarded, href) => {
    useSession.setState({ status, hasOnboarded });
    await renderWithTheme(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith(href);
  });
});

describe('onboarding', () => {
  it('walks three slides with Next, then "Get started" opens Welcome and remembers it', async () => {
    await renderWithTheme(<Onboarding />);
    expect(screen.getByText('Add everything you pay')).toBeTruthy();
    await fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText("Get reminded before it's due")).toBeTruthy();
    await fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('Track every payment in one place')).toBeTruthy();
    expect(screen.queryByText('Skip')).toBeNull();

    await fireEvent.press(screen.getByText('Get started'));
    expect(useSession.getState().hasOnboarded).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/welcome');
  });

  it('Skip goes straight to Welcome', async () => {
    await renderWithTheme(<Onboarding />);
    await fireEvent.press(screen.getByText('Skip'));
    expect(useSession.getState().hasOnboarded).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/welcome');
  });

  it('replayed while signed in ("View intro again"), it just closes', async () => {
    useSession.setState({ status: 'signedIn', hasOnboarded: true });
    await renderWithTheme(<Onboarding />);
    await fireEvent.press(screen.getByText('Skip'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
