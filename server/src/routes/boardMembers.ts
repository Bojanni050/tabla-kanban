import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db.js';
import { authorizeBoard, roleCan } from '../middleware/access.js';
import { wrap } from '../middleware/async.js';
import { broadcast, disconnectUserFromBoard } from '../realtime.js';
import { Prisma } from '@prisma/client';

// Mounted at /api/boards - membership, invitations, leaving and ownership transfer.
const router = Router();

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// OWNER is never assignable: there is exactly one owner, changed only by transfer.
const assignableRole = z.enum(['ADMIN', 'MEMBER', 'VIEWER']);
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  role: assignableRole,
});

const ROLE_ORDER = { OWNER: 0, ADMIN: 1, MEMBER: 2, VIEWER: 3 } as const;

// Board-level activity log (team changes), display-ready metadata.
const logActivity = (
  boardId: string,
  actorId: string,
  type: string,
  metadata: Prisma.InputJsonValue
) =>
  prisma.boardActivity.create({
    data: { boardId, actorId, type, metadata },
  });

const pendingWhere = () => ({
  acceptedAt: null,
  declinedAt: null,
  expiresAt: { gt: new Date() },
});

// GET /api/boards/:id/members - members (any member) plus pending invitations (owner/admin)
router.get('/:id/members', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'view'))) return;

  const members = await prisma.boardMember.findMany({
    where: { boardId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  members.sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.createdAt.getTime() - b.createdAt.getTime()
  );

  let invitations: unknown[] = [];
  if (roleCan(req.boardRole!, 'manage')) {
    const pending = await prisma.invitation.findMany({
      where: { boardId, ...pendingWhere() },
      include: { invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const users = await prisma.user.findMany({
      where: { OR: pending.map((i) => ({ email: { equals: i.email, mode: 'insensitive' as const } })) },
      select: { email: true },
    });
    const registered = new Set(users.map((u) => u.email.toLowerCase()));
    invitations = pending.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      token: i.token,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      invitedBy: i.invitedBy,
      userExists: registered.has(i.email),
    }));
  }

  res.json({
    myRole: req.boardRole,
    members: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    })),
    invitations,
  });
}));

// POST /api/boards/:id/invitations - invite a user by email (owner/admin)
router.post('/:id/invitations', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'manage'))) return;

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { email, role } = parsed.data;

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existingUser) {
    const alreadyMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: existingUser.id } },
    });
    if (alreadyMember) {
      res.status(409).json({ error: 'This user is already a member of the board' });
      return;
    }
  }

  const pending = await prisma.invitation.findFirst({
    where: { boardId, email, ...pendingWhere() },
  });
  if (pending) {
    res.status(409).json({
      error: 'There is already a pending invitation for this email. Revoke it to send a new one.',
    });
    return;
  }

  const invitation = await prisma.invitation.create({
    data: {
      boardId,
      email,
      role,
      invitedById: req.userId!,
      token: randomBytes(32).toString('base64url'), // 256 bits of entropy
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
  });

  res.status(201).json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token: invitation.token,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    userExists: existingUser !== null,
  });
}));

// DELETE /api/boards/:id/invitations/:invitationId - revoke a pending invitation (owner/admin)
router.delete('/:id/invitations/:invitationId', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'manage'))) return;

  const result = await prisma.invitation.deleteMany({
    where: { id: req.params.invitationId, boardId, acceptedAt: null },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Invitation not found' });
    return;
  }
  res.status(204).send();
}));

// PATCH /api/boards/:id/members/:userId - change a member's role (owner/admin)
router.patch('/:id/members/:userId', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'manage'))) return;

  const target = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: req.params.userId } },
  });
  if (!target) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  if (target.userId === req.userId) {
    res.status(403).json({ error: 'You cannot change your own role' });
    return;
  }
  if (target.role === 'OWNER') {
    res.status(403).json({ error: 'The owner role cannot be changed. Transfer ownership instead.' });
    return;
  }

  const parsed = assignableRole.safeParse(req.body?.role);
  if (!parsed.success) {
    res.status(400).json({ error: 'role must be ADMIN, MEMBER or VIEWER' });
    return;
  }

  const updated = await prisma.boardMember.update({
    where: { id: target.id },
    data: { role: parsed.data },
  });
  const renamed = await prisma.user.findUnique({
    where: { id: target.userId },
    select: { name: true, email: true },
  });
  await logActivity(boardId, req.userId!, 'member.role_changed', {
    userId: target.userId,
    memberName: renamed ? (renamed.name ?? renamed.email) : null,
    role: updated.role,
  });
  broadcast(boardId, 'member.updated', { userId: updated.userId, role: updated.role }, req.userId!);
  res.json({ userId: updated.userId, role: updated.role });
}));

// DELETE /api/boards/:id/members/:userId - remove a member (owner/admin)
router.delete('/:id/members/:userId', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'manage'))) return;

  const target = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: req.params.userId } },
  });
  if (!target) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  if (target.userId === req.userId) {
    res.status(400).json({ error: 'Use "leave board" to remove yourself' });
    return;
  }
  if (target.role === 'OWNER') {
    res.status(403).json({ error: 'The owner cannot be removed' });
    return;
  }

  await prisma.boardMember.delete({ where: { id: target.id } });
  // Their card assignments are nulled by the database (Card.assigneeId ON DELETE SET NULL).
  const removed = await prisma.user.findUnique({
    where: { id: target.userId },
    select: { name: true, email: true },
  });
  await logActivity(boardId, req.userId!, 'member.removed', {
    userId: target.userId,
    memberName: removed ? (removed.name ?? removed.email) : null,
  });
  // Stop pushing board events to the removed member immediately.
  disconnectUserFromBoard(boardId, target.userId);
  broadcast(boardId, 'member.removed', { userId: target.userId, boardId }, req.userId!);
  res.status(204).send();
}));

// POST /api/boards/:id/leave - leave a board (any member except the owner)
router.post('/:id/leave', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'view'))) return;

  if (req.boardRole === 'OWNER') {
    res.status(403).json({ error: 'The owner cannot leave the board. Transfer ownership first.' });
    return;
  }
  const leaving = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { name: true, email: true },
  });
  await prisma.boardMember.delete({
    where: { boardId_userId: { boardId, userId: req.userId! } },
  });
  await logActivity(boardId, req.userId!, 'member.left', {
    userId: req.userId!,
    memberName: leaving ? (leaving.name ?? leaving.email) : null,
  });
  disconnectUserFromBoard(boardId, req.userId!);
  broadcast(boardId, 'member.removed', { userId: req.userId!, boardId }, req.userId!);
  res.status(204).send();
}));

// POST /api/boards/:id/transfer - hand ownership to another member (owner only)
// The previous owner becomes an admin. The board moves into the new owner's workspace so
// that it lives with (and is managed alongside) its owner's boards.
router.post('/:id/transfer', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'owner'))) return;

  const newOwnerId = req.body?.userId;
  if (typeof newOwnerId !== 'string' || !newOwnerId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }
  if (newOwnerId === req.userId) {
    res.status(400).json({ error: 'You already own this board' });
    return;
  }
  const target = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: newOwnerId } },
  });
  if (!target) {
    res.status(400).json({ error: 'Ownership can only be transferred to an existing board member' });
    return;
  }

  const ok = await prisma.$transaction(async (tx) => {
    // Guard against a concurrent transfer: only proceed if we are still the owner
    const demoted = await tx.boardMember.updateMany({
      where: { boardId, userId: req.userId!, role: 'OWNER' },
      data: { role: 'ADMIN' },
    });
    if (demoted.count !== 1) return false;

    await tx.boardMember.update({
      where: { boardId_userId: { boardId, userId: newOwnerId } },
      data: { role: 'OWNER' },
    });

    const workspace =
      (await tx.workspace.findFirst({ where: { userId: newOwnerId }, orderBy: { createdAt: 'asc' } })) ??
      (await tx.workspace.create({ data: { name: 'My Workspace', userId: newOwnerId } }));
    await tx.board.update({ where: { id: boardId }, data: { workspaceId: workspace.id } });
    return true;
  });

  if (!ok) {
    res.status(409).json({ error: 'Board ownership has changed. Please refresh and try again.' });
    return;
  }
  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerId },
    select: { name: true, email: true },
  });
  await logActivity(boardId, req.userId!, 'member.ownership_transferred', {
    userId: newOwnerId,
    memberName: newOwner ? (newOwner.name ?? newOwner.email) : null,
  });
  broadcast(boardId, 'member.updated', { userId: newOwnerId, role: 'OWNER', boardId }, req.userId!);
  res.json({ message: 'Ownership transferred', newOwnerId });
}));

export default router;
