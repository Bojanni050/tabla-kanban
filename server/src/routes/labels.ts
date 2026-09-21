import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, authorizeLabel } from '../middleware/access.js';

const router = Router();

// GET /api/labels/board/:boardId - get all labels for a board
router.get('/board/:boardId', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.boardId))) return;
  const labels = await prisma.label.findMany({
    where: { boardId: req.params.boardId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(labels);
});

// POST /api/labels - create a new label for a board
router.post('/', async (req: Request, res: Response) => {
  const { name, color, boardId } = req.body;
  if (!name || !color || typeof boardId !== 'string') {
    res.status(400).json({ error: 'name, color, and boardId are required' });
    return;
  }
  if (!(await authorizeBoard(req, res, boardId, 'edit'))) return;

  const label = await prisma.label.create({
    data: {
      name: name.trim(),
      color: color.trim(),
      boardId,
    },
  });
  res.status(201).json(label);
});

// PATCH /api/labels/:id - update a label name or color
router.patch('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeLabel(req, res, req.params.id, 'edit'))) return;
  const { name, color } = req.body;
  try {
    const label = await prisma.label.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color: color.trim() }),
      },
    });
    res.json(label);
  } catch (error) {
    console.error('Error updating label:', error);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

// DELETE /api/labels/:id - delete a label from a board
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeLabel(req, res, req.params.id, 'edit'))) return;
  try {
    await prisma.label.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting label:', error);
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

export default router;
