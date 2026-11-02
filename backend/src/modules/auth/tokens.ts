import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

import type { AppContext } from '../../context.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { unauthorized } from '../../http/errors.js';

const ISSUER = 'dueora';
const AUDIENCE = 'dueora-app';

function secret(ctx: AppContext): Uint8Array {
  return new TextEncoder().encode(ctx.env.JWT_ACCESS_SECRET);
}

export async function signAccessToken(ctx: AppContext, userId: string): Promise<string> {
  const now = Math.floor(ctx.clock.now().getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ctx.env.ACCESS_TOKEN_TTL_MINUTES * 60)
    .sign(secret(ctx));
}

/** Returns the user id, or throws 401 (TOKEN_EXPIRED lets the client know to refresh). */
export async function verifyAccessToken(ctx: AppContext, token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret(ctx), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: ctx.clock.now(),
    });
    if (!payload.sub) throw unauthorized('Invalid token');
    return payload.sub;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw unauthorized('Access token expired');
    throw unauthorized('Invalid access token');
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** Issue a new login: fresh refresh-token family. */
export async function issueTokens(
  ctx: AppContext,
  userId: string,
  opts: { familyId?: string; userAgent?: string | null } = {},
): Promise<TokenPair & { refreshTokenId: string }> {
  const raw = randomToken();
  const now = ctx.clock.now();
  const row = await ctx.db.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      familyId: opts.familyId ?? randomToken(12),
      expiresAt: new Date(now.getTime() + ctx.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
    },
  });
  return {
    accessToken: await signAccessToken(ctx, userId),
    refreshToken: raw,
    expiresIn: ctx.env.ACCESS_TOKEN_TTL_MINUTES * 60,
    refreshTokenId: row.id,
  };
}

/**
 * Rotate a refresh token. Each token works once; presenting an already-rotated token
 * means it leaked, so the whole family (that login on every device copy) is revoked.
 */
export async function rotateRefreshToken(ctx: AppContext, raw: string, userAgent?: string | null): Promise<TokenPair> {
  const now = ctx.clock.now();
  const existing = await ctx.db.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!existing) throw unauthorized('Invalid refresh token');

  if (existing.revokedAt) {
    await ctx.db.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    ctx.logger.warn({ userId: existing.userId, familyId: existing.familyId }, 'Refresh token reuse detected; family revoked');
    throw unauthorized('Session expired, please log in again');
  }
  if (existing.expiresAt <= now) throw unauthorized('Session expired, please log in again');

  // Claim the token atomically so two concurrent refreshes can't both succeed.
  const claimed = await ctx.db.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: now },
  });
  if (claimed.count === 0) throw unauthorized('Session expired, please log in again');

  const next = await issueTokens(ctx, existing.userId, { familyId: existing.familyId, userAgent });
  await ctx.db.refreshToken.update({ where: { id: existing.id }, data: { replacedById: next.refreshTokenId } });
  const { refreshTokenId: _id, ...pair } = next;
  return pair;
}

export async function revokeRefreshToken(ctx: AppContext, raw: string): Promise<void> {
  await ctx.db.refreshToken.updateMany({
    where: { tokenHash: sha256(raw), revokedAt: null },
    data: { revokedAt: ctx.clock.now() },
  });
}

export async function revokeAllForUser(ctx: AppContext, userId: string, exceptFamilyId?: string): Promise<void> {
  await ctx.db.refreshToken.updateMany({
    where: { userId, revokedAt: null, ...(exceptFamilyId ? { NOT: { familyId: exceptFamilyId } } : {}) },
    data: { revokedAt: ctx.clock.now() },
  });
}
