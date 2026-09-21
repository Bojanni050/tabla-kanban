import type { Board, BoardWithDetails, Card, ChecklistItem, Label, List, Priority, Workspace } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Workspaces
  getWorkspaces: () => request<Workspace[]>('/workspaces'),

  // Boards
  getBoards: () => request<Board[]>('/boards'),
  getBoard: (id: string) => request<BoardWithDetails>(`/boards/${id}`),
  createBoard: (name: string, workspaceId: string) =>
    request<Board>('/boards', {
      method: 'POST',
      body: JSON.stringify({ name, workspaceId }),
    }),
  updateBoard: (id: string, data: { name?: string }) =>
    request<Board>(`/boards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteBoard: (id: string) =>
    request<void>(`/boards/${id}`, { method: 'DELETE' }),

  // Lists
  createList: (title: string, boardId: string) =>
    request<List>('/lists', {
      method: 'POST',
      body: JSON.stringify({ title, boardId }),
    }),
  updateList: (id: string, data: { title?: string; position?: number }) =>
    request<List>(`/lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteList: (id: string) =>
    request<void>(`/lists/${id}`, { method: 'DELETE' }),

  // Cards
  getCard: (id: string) => request<Card>(`/cards/${id}`),
  createCard: (
    title: string,
    listId: string,
    data?: { description?: string | null; priority?: Priority | null; dueDate?: string | null }
  ) =>
    request<Card>('/cards', {
      method: 'POST',
      body: JSON.stringify({ title, listId, ...data }),
    }),
  updateCard: (
    id: string,
    data: {
      title?: string;
      description?: string | null;
      position?: number;
      listId?: string;
      priority?: Priority | null;
      dueDate?: string | null;
    }
  ) =>
    request<Card>(`/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteCard: (id: string) =>
    request<void>(`/cards/${id}`, { method: 'DELETE' }),

  // Labels
  createLabel: (data: { name: string; color: string; boardId: string }) =>
    request<Label>('/labels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateLabel: (id: string, data: { name?: string; color?: string }) =>
    request<Label>(`/labels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteLabel: (id: string) =>
    request<void>(`/labels/${id}`, { method: 'DELETE' }),
  addLabelToCard: (cardId: string, labelId: string) =>
    request<Card>(`/cards/${cardId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labelId }),
    }),
  removeLabelFromCard: (cardId: string, labelId: string) =>
    request<Card>(`/cards/${cardId}/labels/${labelId}`, {
      method: 'DELETE',
    }),

  // Checklist
  addChecklistItem: (cardId: string, title: string) =>
    request<ChecklistItem>('/checklist', {
      method: 'POST',
      body: JSON.stringify({ cardId, title }),
    }),
  updateChecklistItem: (id: string, data: { title?: string; completed?: boolean; position?: number }) =>
    request<ChecklistItem>(`/checklist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteChecklistItem: (id: string) =>
    request<void>(`/checklist/${id}`, { method: 'DELETE' }),
  reorderChecklistItems: (cardId: string, itemIds: string[]) =>
    request<ChecklistItem[]>('/checklist/reorder', {
      method: 'POST',
      body: JSON.stringify({ cardId, itemIds }),
    }),
};
