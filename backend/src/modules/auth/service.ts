import type { AppContext } from '../../context.js';
import { resetPasswordMessage } from '../../emails/account.js';
import type { EmailTokenPurpose } from '../../generated/prisma/client.js';
import { AppError, conflict, tooMany, unauthorized } from '../../http/errors.js';
import { safeEqualHex, sha256, sixDigitCode } from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

import { issueTokens, revokeAllForUser, type TokenPair } from './tokens.js';

const CODE_TTL_MS = 15 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_COOLDOWN_MS = 60_000;

// Verified against when the email is unknown so response time doesn't reveal accounts.
let dummyHash: Promise<string> | undefined;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function publicUser(ctx: AppContext, userId: string) {
  const user = await ctx.db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: {
        include: { workspace: { select: { id: true, name: true, type: true, timezone: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
    workspaces: user.memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    })),
  };
}

async function createCode(ctx: AppContext, userId: string, purpose: EmailTokenPurpose): Promise<string> {
  const now = ctx.clock.now();
  const recent = await ctx.db.emailToken.findFirst({
    where: { userId, purpose, createdAt: { gt: new Date(now.getTime() - CODE_RESEND_COOLDOWN_MS) } },
  });
  if (recent) throw tooMany('Please wait a minute before requesting another code');
  // Only the newest code is valid.
  await ctx.db.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } });
  const code = sixDigitCode();
  await ctx.db.emailToken.create({
    data: { userId, purpose, codeHash: sha256(code), createdAt: now, expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  });
  return code;
}

async function consumeCode(ctx: AppContext, userId: string, purpose: EmailTokenPurpose, code: string): Promise<void> {
  const now = ctx.clock.now();
  const token = await ctx.db.emailToken.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  const invalid = new AppError(400, 'INVALID_CODE', 'That code is incorrect or has expired');
  if (!token) throw invalid;
  if (token.attempts >= CODE_MAX_ATTEMPTS) throw new AppError(400, 'CODE_LOCKED', 'Too many wrong attempts. Request a new code.');
  if (!safeEqualHex(token.codeHash, sha256(code))) {
    await ctx.db.emailToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw invalid;
  }
  await ctx.db.emailToken.update({ where: { id: token.id }, data: { usedAt: now } });
}

export async function register(
  ctx: AppContext,
  input: { name: string; email: string; password: string },
  userAgent?: string | null,
): Promise<TokenPair & { user: Awaited<ReturnType<typeof publicUser>> }> {
  const email = normalizeEmail(input.email);
  if (await ctx.db.user.findUnique({ where: { email } })) {
    throw conflict('An account with this email already exists');
  }
  const user = await ctx.db.user.create({
    data: { name: input.name.trim(), email, passwordHash: await hashPassword(input.password) },
  });
  const { refreshTokenId: _id, ...tokens } = await issueTokens(ctx, user.id, { userAgent });
  return { ...tokens, user: await publicUser(ctx, user.id) };
}

export async function login(
  ctx: AppContext,
  input: { email: string; password: string },
  userAgent?: string | null,
): Promise<TokenPair & { user: Awaited<ReturnType<typeof publicUser>> }> {
  const user = await ctx.db.user.findUnique({ where: { email: normalizeEmail(input.email) } });
  if (!user) {
    dummyHash ??= hashPassword('not-a-real-password');
    await verifyPassword(await dummyHash, input.password);
    throw unauthorized('Email or password is incorrect');
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw unauthorized('Email or password is incorrect');
  }
  const { refreshTokenId: _id, ...tokens } = await issueTokens(ctx, user.id, { userAgent });
  return { ...tokens, user: await publicUser(ctx, user.id) };
}

/** Always succeeds from the caller's view so it can't be used to discover accounts. */
export async function requestPasswordReset(ctx: AppContext, email: string): Promise<void> {
  const user = await ctx.db.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) return;
  try {
    const code = await createCode(ctx, user.id, 'RESET_PASSWORD');
    await ctx.mailer.send(resetPasswordMessage(user.email, user.name, code));
  } catch (err) {
    if (err instanceof AppError && err.status === 429) return; // silently throttle
    throw err;
  }
}

export async function resetPassword(ctx: AppContext, input: { email: string; code: string; newPassword: string }): Promise<void> {
  const user = await ctx.db.user.findUnique({ where: { email: normalizeEmail(input.email) } });
  if (!user) throw new AppError(400, 'INVALID_CODE', 'That code is incorrect or has expired');
  await consumeCode(ctx, user.id, 'RESET_PASSWORD', input.code);
  await ctx.db.user.update({
    where: { id: user.id },
    // Receiving the code proves ownership of the inbox, so the address is verified too.
    data: { passwordHash: await hashPassword(input.newPassword), emailVerifiedAt: user.emailVerifiedAt ?? ctx.clock.now() },
  });
  await revokeAllForUser(ctx, user.id);
}

export async function changePassword(
  ctx: AppContext,
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Your current password is incorrect');
  }
  await ctx.db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await revokeAllForUser(ctx, userId);
}
