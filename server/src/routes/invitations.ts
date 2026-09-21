import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { wrap } from '../middleware/async.js';

// Mounted at /api/invitations - the invitee's side of the invitation flow.
const router = Router();

const invitationInclude = {
  board: { select: { id: true, name: true } },
  invitedBy: { select: { name: true, email: true } },
} satisfies Prisma.InvitationInclude;

type InvitationWithRelations = Prisma.InvitationGetPayload<{ include: typeof invitationInclude }>;

function serialize(i: InvitationWithRelations) {
  return {
    token: i.token,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt,
    board: i.board,
    invitedBy: i.invitedBy,
  };
}

async function currentUserEmail(req: Request): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  return user ? user.email.toLowerCase() : null;
}

// Looks up an invitation by token and verifies it is usable by the caller. Writes the
// error response and returns null if not: 404 unknown token, 403 addressed to another
// email, 410 already used / declined / expired.
async function loadUsableInvitation(req: Request, res: Response): Promise<InvitationWithRelations | null> {
  const invitation = await prisma.invitation.findUnique({
    where: { token: req.params.token },
    include: invitationInclude,
  });
  if (!invitation) {
    res.status(404).json({ error: 'Invitation not found' });
    return null;
  }
  if ((await currentUserEmail(req)) !== invitation.email.toLowerCase()) {
    res.status(403).json({ error: 'This invitation was sent to a different email address' });
    return null;
  }
  if (invitation.acceptedAt) {
    res.status(410).json({ error: 'This invitation has already been used' });
    return null;
  }
  if (invitation.declinedAt) {
    res.status(410).json({ error: 'This invitation was declined' });
    return null;
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    res.status(410).json({ error: 'This invitation has expired' });
    return null;
  }
  return invitation;
}

// GET /api/invitations - pending invitations addressed to the current user
router.get('/', wrap(async (req: Request, res: Response) => {
  const email = await currentUserEmail(req);
  if (!email) {
    res.json([]);
    return;
  }
  const invitations = await prisma.invitation.findMany({
    where: { email, acceptedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
    include: invitationInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(invitations.map(serialize));
}));

// GET /api/invitations/:token - details of an invitation addressed to the current user
router.get('/:token', wrap(async (req: Request, res: Response) => {
  const invitation = await loadUsableInvitation(req, res);
  if (!invitation) return;
  res.json(serialize(invitation));
}));

// POST /api/invitations/:token/accept - join the board (single use)
router.post('/:token/accept', wrap(async (req: Request, res: Response) => {
  const invitation = await loadUsableInvitation(req, res);
  if (!invitation) return;

  const already = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: invitation.board.id, userId: req.userId! } },
  });
  if (already) {
    res.status(409).json({ error: 'You are already a member of this board' });
    return;
  }

  try {
    const accepted = await prisma.$transaction(async (tx) => {
      // Atomically claim the invitation so concurrent requests cannot both accept it
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.boardMember.create({
        data: { boardId: invitation.board.id, userId: req.userId!, role: invitation.role },
      });
      return true;
    });
    if (!accepted) {
      res.status(410).json({ error: 'This invitation is no longer valid' });
      return;
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'You are already a member of this board' });
      return;
    }
    throw err;
  }

  res.json({ boardId: invitation.board.id, role: invitation.role });
}));

// POST /api/invitations/:token/decline
router.post('/:token/decline', wrap(async (req: Request, res: Response) => {
  const invitation = await loadUsableInvitation(req, res);
  if (!invitation) return;

  const claimed = await prisma.invitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, declinedAt: null },
    data: { declinedAt: new Date() },
  });
  if (claimed.count !== 1) {
    res.status(410).json({ error: 'This invitation is no longer valid' });
    return;
  }
  res.status(204).send();
}));

export default router;
