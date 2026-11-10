import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { can } from '../../domain/permissions.js';
import { badRequest, forbidden } from '../../http/errors.js';
import { actorOf, workspaceIdOf, requireAuth, requireWorkspace, requirePermission, userIdOf } from '../../http/middleware/auth.js';
import { email, id, minutesOfDay, reminderOffsets, timeZone } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';
import { renderLayout } from '../../emails/layout.js';
import { unsubscribeEmail, verifyUnsubscribeToken } from '../../notifications/unsubscribe.js';
import { publicUser } from '../auth/service.js';
import { exportWorkbook, exportWorkspaceData } from '../account/service.js';

import * as ws from './service.js';

const roleEnum = z.enum(['ADMIN', 'FINANCE', 'VIEWER']);

const CreateBody = z.object({
  name: z.string().trim().min(1, 'Enter a workspace name').max(100),
  type: z.enum(['COMPANY', 'PERSONAL']).default('COMPANY'),
  /** The phone's timezone at sign-up (the app always sends it). */
  timezone: timeZone.default('UTC'),
  /** The first company in this workspace (defaults to the workspace name). */
  firstCompanyName: z.string().trim().min(1).max(60).optional(),
});

const UpdateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['COMPANY', 'PERSONAL']),
    timezone: timeZone,
    reminderHour: z.number().int().min(0).max(23),
    quietHoursStart: minutesOfDay.nullable(),
    quietHoursEnd: minutesOfDay.nullable(),
    defaultReminderOffsets: reminderOffsets,
    aiEnabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine(
    (b) => (b.quietHoursStart === undefined) === (b.quietHoursEnd === undefined) && (b.quietHoursStart === null) === (b.quietHoursEnd === null),
    { message: 'Set both quiet-hours start and end (or clear both)' },
  );

const MemberBody = z.object({ role: roleEnum });
const InviteBody = z.object({ email, role: roleEnum.default('VIEWER') });
const TokenBody = z.object({ token: z.string().min(20).max(200) });
const DeleteBody = z.object({ confirmName: z.string() });

export function workspacesRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx));
  const org = requireWorkspace(ctx);

  // --- Collection (no workspace selected yet) ---
  router.get('/', async (req, res) => {
    res.json((await publicUser(ctx, userIdOf(req))).workspaces);
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await ws.createWorkspace(ctx, userIdOf(req), parseBody(req, CreateBody)));
  });

  // --- Current workspace (X-Workspace-Id) ---
  router.get('/current', org, async (req, res) => {
    res.json({ ...(await ws.getWorkspace(ctx, workspaceIdOf(req))), myRole: req.workspace?.role });
  });

  router.patch('/current', org, requirePermission('workspace:update'), async (req, res) => {
    const body = parseBody(req, UpdateBody);
    await ctx.db.workspace.update({ where: { id: workspaceIdOf(req) }, data: body });
    await ws.audit(ctx, workspaceIdOf(req), userIdOf(req), 'workspace.update', 'Workspace', workspaceIdOf(req), body);
    res.json(await ws.getWorkspace(ctx, workspaceIdOf(req)));
  });

  router.delete('/current', org, requirePermission('workspace:delete'), async (req, res) => {
    const { confirmName } = parseBody(req, DeleteBody);
    const current = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceIdOf(req) } });
    if (confirmName.trim() !== current.name) throw badRequest('Type the workspace name exactly to confirm');
    await ctx.db.workspace.delete({ where: { id: current.id } });
    res.status(204).end();
  });

  /** Export all workspace data (Settings → Data & privacy). Keys stay masked. */
  router.get('/current/export', org, requirePermission('data:export'), async (req, res) => {
    const { format } = parseQuery(req, z.object({ format: z.enum(['json', 'xlsx']).default('json') }));
    const data = await exportWorkspaceData(ctx, workspaceIdOf(req));
    const stamp = data.exportedAt.slice(0, 10);
    await ws.audit(ctx, workspaceIdOf(req), userIdOf(req), 'workspace.export', 'Workspace', workspaceIdOf(req), { format });
    res.setHeader('Cache-Control', 'no-store');
    if (format === 'xlsx') {
      res
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .setHeader('Content-Disposition', `attachment; filename="dueora-export-${stamp}.xlsx"`)
        .send(await exportWorkbook(data));
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="dueora-export-${stamp}.json"`);
    res.json(data);
  });

  // --- Members ---
  router.get('/current/members', org, async (req, res) => {
    res.json(await ws.listMembers(ctx, workspaceIdOf(req)));
  });

  router.patch('/current/members/:id', org, requirePermission('members:manage'), async (req, res) => {
    const { id: membershipId } = parseParams(req, z.object({ id }));
    res.json(await ws.updateMember(ctx, workspaceIdOf(req), userIdOf(req), membershipId, parseBody(req, MemberBody)));
  });

  router.delete('/current/members/:id', org, async (req, res) => {
    const { id: membershipId } = parseParams(req, z.object({ id }));
    const target = await ctx.db.membership.findFirst({ where: { id: membershipId, workspaceId: workspaceIdOf(req) } });
    // Anyone may leave; removing someone else needs members:manage.
    if (target?.userId !== userIdOf(req) && !can(actorOf(req).role, 'members:manage')) throw forbidden();
    await ws.removeMember(ctx, workspaceIdOf(req), userIdOf(req), membershipId);
    res.status(204).end();
  });

  // --- Invites (admin side) ---
  router.get('/current/invites', org, requirePermission('invites:manage'), async (req, res) => {
    res.json(await ws.listInvites(ctx, workspaceIdOf(req)));
  });

  router.post('/current/invites', org, requirePermission('invites:manage'), async (req, res) => {
    res.status(201).json(await ws.createInvite(ctx, workspaceIdOf(req), userIdOf(req), parseBody(req, InviteBody)));
  });

  router.delete('/current/invites/:id', org, requirePermission('invites:manage'), async (req, res) => {
    const { id: inviteId } = parseParams(req, z.object({ id }));
    await ws.revokeInvite(ctx, workspaceIdOf(req), userIdOf(req), inviteId);
    res.status(204).end();
  });

  // --- Invites (invitee side) ---
  router.post('/accept-invite', async (req, res) => {
    const { token } = parseBody(req, TokenBody);
    res.json(await ws.acceptInvite(ctx, userIdOf(req), token));
  });

  return router;
}

/** Unauthenticated routes: invite preview. */
export function publicRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/invites/preview', async (req, res) => {
    const { token } = parseQuery(req, z.object({ token: z.string().min(20).max(200) }));
    res.json(await ws.previewInvite(ctx, token));
  });

  /** One-click unsubscribe from notification emails (link in every email footer). */
  const unsubscribe = async (req: Request, res: Response) => {
    const token = String(req.query.token ?? '').slice(0, 300);
    const target = verifyUnsubscribeToken(ctx, token);
    const ok = target ? await unsubscribeEmail(ctx, target.userId, target.workspaceId) : false;
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(
        renderLayout({
          preheader: ok ? 'You won’t get DueOra emails any more.' : 'This link is not valid.',
          heading: ok ? 'You’re unsubscribed ✅' : 'This link didn’t work',
          bodyHtml: ok
            ? '<p style="margin:0">You won’t receive DueOra emails for this workspace any more. Push and in-app alerts are unchanged — manage everything in Settings → Notifications.</p>'
            : '<p style="margin:0">Open DueOra and go to Settings → Notifications to change your email preferences.</p>',
        }),
      );
  };
  router.get('/unsubscribe', unsubscribe);
  router.post('/unsubscribe', unsubscribe);


  return router;
}
