import { Request, Response } from 'express';
import prisma from '../db.js';

// Ownership chain: User -> Workspace -> Board -> List -> Card -> ChecklistItem
// Labels hang off a Board. Each helper resolves the owning user id for a
// resource and writes a 404 (missing) or 403 (owned by someone else) response
// when the authenticated user may not access it. They return true when access
// is allowed, so handlers can simply `if (!(await ...)) return;`.

async function check(
  req: Request,
  res: Response,
  resource: string,
  ownerId: string | undefined
): Promise<boolean> {
  if (ownerId === undefined) {
    res.status(404).json({ error: `${resource} not found` });
    return false;
  }
  if (ownerId !== req.userId) {
    res.status(403).json({ error: 'You do not have access to this resource' });
    return false;
  }
  return true;
}

export async function authorizeWorkspace(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.workspace.findUnique({ where: { id }, select: { userId: true } });
  return check(req, res, 'Workspace', row?.userId);
}

export async function authorizeBoard(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.board.findUnique({
    where: { id },
    select: { workspace: { select: { userId: true } } },
  });
  return check(req, res, 'Board', row?.workspace.userId);
}

export async function authorizeList(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.list.findUnique({
    where: { id },
    select: { board: { select: { workspace: { select: { userId: true } } } } },
  });
  return check(req, res, 'List', row?.board.workspace.userId);
}

export async function authorizeCard(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.card.findUnique({
    where: { id },
    select: { list: { select: { board: { select: { workspace: { select: { userId: true } } } } } } },
  });
  return check(req, res, 'Card', row?.list.board.workspace.userId);
}

export async function authorizeLabel(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.label.findUnique({
    where: { id },
    select: { board: { select: { workspace: { select: { userId: true } } } } },
  });
  return check(req, res, 'Label', row?.board.workspace.userId);
}

export async function authorizeChecklistItem(req: Request, res: Response, id: string): Promise<boolean> {
  const row = await prisma.checklistItem.findUnique({
    where: { id },
    select: {
      card: { select: { list: { select: { board: { select: { workspace: { select: { userId: true } } } } } } } },
    },
  });
  return check(req, res, 'Checklist item', row?.card.list.board.workspace.userId);
}

// Parses a required, non-empty string from a request body field.
export function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 100 ? trimmed : null;
}
