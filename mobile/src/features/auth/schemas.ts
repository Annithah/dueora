import { z } from 'zod';

export const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email')
  .pipe(z.email('Enter a valid email address'));
export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'That password is too long');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: emailField,
  password: passwordField,
});
export type SignupValues = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({ email: emailField });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: passwordField,
});
export type ResetValues = z.infer<typeof resetSchema>;
