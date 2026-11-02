import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ApiError } from '@/api/client';
import { CodeInput } from '@/components/ui';
import { applyApiError } from '@/lib/forms';
import { renderWithTheme } from '@/test/render';

import { loginSchema, resetSchema, signupSchema } from './schemas';

describe('auth schemas', () => {
  it('trims emails and enforces password length', () => {
    expect(loginSchema.parse({ email: '  a@b.co ', password: 'x' }).email).toBe('a@b.co');
    expect(signupSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success).toBe(
      false,
    );
    expect(
      signupSchema.safeParse({ name: ' ', email: 'a@b.co', password: 'long-enough' }).success,
    ).toBe(false);
    expect(resetSchema.safeParse({ code: '12345', newPassword: 'long-enough' }).success).toBe(
      false,
    );
    expect(resetSchema.safeParse({ code: '123456', newPassword: 'long-enough' }).success).toBe(
      true,
    );
  });
});

describe('applyApiError', () => {
  it('maps validation details onto fields', () => {
    const setError = jest.fn();
    const err = new ApiError(400, 'VALIDATION_ERROR', 'Some fields are invalid', [
      { path: 'email', message: 'Taken' },
    ]);
    expect(applyApiError(err, setError, ['email', 'password'] as const)).toBeNull();
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Taken' });
  });

  it('returns other API errors as a form message', () => {
    const err = new ApiError(401, 'UNAUTHORIZED', 'Email or password is incorrect');
    expect(applyApiError(err, jest.fn(), ['email'] as const)).toBe(
      'Email or password is incorrect',
    );
    expect(applyApiError(new Error('boom'), jest.fn(), ['email'] as const)).toMatch(
      /Something went wrong/,
    );
  });
});

describe('CodeInput', () => {
  it('keeps only up to 6 digits and shows them in boxes', async () => {
    function Harness() {
      const [v, setV] = useState('');
      return <CodeInput value={v} onChange={setV} autoFocus={false} />;
    }
    await renderWithTheme(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '12a3-45678');
    for (const d of ['1', '2', '3', '4', '5', '6']) expect(screen.getByText(d)).toBeTruthy();
    expect(screen.queryByText('7')).toBeNull();
  });
});
