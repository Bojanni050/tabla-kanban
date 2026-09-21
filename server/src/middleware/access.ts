import { Request, Response } from 'express';
import { BoardRole } from '@prisma/client';
import prisma from '../db.js';

// Access model
// - Workspaces are personal: only the user who owns a workspace can touch it.
// - Everything inside a board (lists, cards, labels, checklist items) is governed by the
//   caller's BoardMember role on that board. Each helper below resolves the board a
//   resource belongs to and checks the required permission, writing a 404 (missing) or
//   403 (not a member / role too low) response on failure. They return true when access
//   is allowed, so handlers can simply `if (!(await ...)) return;`.
//
// Permissions:
//   view   - any member (owner, admin, member, viewer)
//   edit   - cards, lists, labels, checklists: owner, admin, member
//   manage - board settings and membership: owner, admin
//   owner  - delete board, transfer ownership: owner only

export type Permission = 'view' | 'edit' | 'manage' | 'owner';

const ROLES_FOR: Record<Permission, BoardRole[]> = {
  view: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
  edit: ['OWNER', 'ADMIN', 'MEMBER'],
  manage: ['OWNER', 'ADMIN'],
  owner: ['OWNER'],
};

export function roleCan(role: BoardRole, permission: Permission): boolean {
  return ROLES_FOR[permission].includes(role);
}

declare global {
  namespace Express {
    interface Request {
      // Set by the authorize* helpers to the caller's role on the board being accessed
      boardRole?: BoardRole;
    }
  }
}

async function checkBoard(
  req: Request,
  res: Response,
  resource: string,
  boardId: string | undefined,
  permission: Permission
): Promise<boolean> {
  if (boardId === undefined) {
    res.status(404).json({ error: `${resource} not found` });
    return false;
  }
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: req.userId! } },
    select: { role: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'You do not have access to this board' });
    return false;
  }
  if (!roleCan(membership.role, permission)) {
    res.status(403).json({ error: 'Your role on this board does not allow this action' });
    return false;
  }
  req.boardRole = membership.role;
  return true;
}

export async function authorizeBoard(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.board.findUnique({ where: { id }, select: { id: true } });
  return checkBoard(req, res, 'Board', row?.id, permission);
}

export async function authorizeList(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.list.findUnique({ where: { id }, select: { boardId: true } });
  return checkBoard(req, res, 'List', row?.boardId, permission);
}

export async function authorizeSwimlane(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.swimlane.findUnique({ where: { id }, select: { boardId: true } });
  return checkBoard(req, res, 'Swimlane', row?.boardId, permission);
}

export async function authorizeCardType(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.cardType.findUnique({ where: { id }, select: { boardId: true } });
  return checkBoard(req, res, 'Card type', row?.boardId, permission);
}

export async function authorizeCard(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.card.findUnique({
    where: { id },
    select: { list: { select: { boardId: true } } },
  });
  return checkBoard(req, res, 'Card', row?.list.boardId, permission);
}

export async function authorizeLabel(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.label.findUnique({ where: { id }, select: { boardId: true } });
  return checkBoard(req, res, 'Label', row?.boardId, permission);
}

export async function authorizeChecklistItem(
  req: Request,
  res: Response,
  id: string,
  permission: Permission = 'view'
): Promise<boolean> {
  const row = await prisma.checklistItem.findUnique({
    where: { id },
    select: { card: { select: { list: { select: { boardId: true } } } } },
  });
  return checkBoard(req, res, 'Checklist item', row?.card.list.boardId, permission);
}

// Workspaces are personal to the user who created them.
export async function authorizeWorkspace(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.workspace.findUnique({ where: { id }, select: { userId: true } });
  if (!row) {
    res.status(404).json({ error: 'Workspace not found' });
    return false;
  }
  if (row.userId !== req.userId) {
    res.status(403).json({ error: 'You do not have access to this resource' });
    return false;
  }
  return true;
}

// Parses a required, non-empty string from a request body field.
export function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 100 ? trimmed : null;
}
