import type {
  AssignableRole,
  Board,
  BoardActivityEntry,
  BoardInvitation,
  BoardMembersResponse,
  BoardRole,
  AiSettings,
  AiStatus,
  BoardWithDetails,
  Card,
  CardAiAction,
  ChecklistItem,
  Label,
  List,
  MyInvitation,
  Priority,
  SharedBoard,
  User,
  Workspace,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const errorMsg = data?.error || (await res.text().catch(() => '')) || `API error ${res.status}`;
    throw new Error(errorMsg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  register: (data: { email: string; password: string }) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  logout: () =>
    request<{ message: string }>('/auth/logout', {
      method: 'POST',
    }),
  getCurrentUser: () => request<User>('/auth/me'),

  // Workspaces
  getWorkspaces: () => request<Workspace[]>('/workspaces'),
  createWorkspace: (name: string) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateWorkspace: (id: string, data: { name: string }) =>
    request<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteWorkspace: (id: string) =>
    request<void>(`/workspaces/${id}`, { method: 'DELETE' }),

  // Boards
  getBoards: () => request<Board[]>('/boards'),
  getSharedBoards: () => request<SharedBoard[]>('/boards/shared'),
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

  // Board members and sharing
  getBoardMembers: (boardId: string) =>
    request<BoardMembersResponse>(`/boards/${boardId}/members`),
  inviteToBoard: (boardId: string, data: { email: string; role: AssignableRole }) =>
    request<BoardInvitation>(`/boards/${boardId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resendInvitation: (boardId: string, invitationId: string) =>
    request<BoardInvitation>(`/boards/${boardId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    }),
  revokeInvitation: (boardId: string, invitationId: string) =>
    request<void>(`/boards/${boardId}/invitations/${invitationId}`, { method: 'DELETE' }),
  updateMemberRole: (boardId: string, userId: string, role: AssignableRole) =>
    request<{ userId: string; role: BoardRole }>(`/boards/${boardId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (boardId: string, userId: string) =>
    request<void>(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' }),
  leaveBoard: (boardId: string) =>
    request<void>(`/boards/${boardId}/leave`, { method: 'POST', body: '{}' }),
  transferOwnership: (boardId: string, userId: string) =>
    request<{ message: string }>(`/boards/${boardId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  // Invitations (invitee side)
  getMyInvitations: () => request<MyInvitation[]>('/invitations'),
  getInvitation: (token: string) =>
    request<MyInvitation>(`/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) =>
    request<{ boardId: string; role: BoardRole }>(
      `/invitations/${encodeURIComponent(token)}/accept`,
      { method: 'POST', body: '{}' }
    ),
  declineInvitation: (token: string) =>
    request<void>(`/invitations/${encodeURIComponent(token)}/decline`, {
      method: 'POST',
      body: '{}',
    }),

  // Kala AI (read-only assistant; the backend talks to the AI provider, never the browser)
  getAiStatus: () => request<AiStatus>('/ai/status'),
  getAiSettings: () => request<AiSettings>('/ai/settings'),
  saveAiSettings: (data: { provider: string; model: string; apiKey?: string }) =>
    request<AiSettings>('/ai/settings', { method: 'PUT', body: JSON.stringify(data) }),
  resetAiSettings: () => request<AiSettings>('/ai/settings', { method: 'DELETE' }),
  deleteAiKey: (provider: string) =>
    request<AiSettings>(`/ai/settings/keys/${encodeURIComponent(provider)}`, { method: 'DELETE' }),
  listAiModels: (provider: string) =>
    request<{ models: string[] }>(`/ai/models?provider=${encodeURIComponent(provider)}`),
  askKalaAi: (
    boardId: string,
    data: {
      messages: { role: 'user' | 'assistant'; content: string }[];
      cardId?: string;
      action?: CardAiAction;
      today: string;
    }
  ) =>
    request<{ reply: string }>(`/ai/boards/${boardId}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

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
      archived?: boolean;
    }
  ) =>
    request<Card>(`/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteCard: (id: string) =>
    request<void>(`/cards/${id}`, { method: 'DELETE' }),
  archiveCard: (id: string) =>
    request<Card>(`/cards/${id}/archive`, { method: 'POST' }),
  restoreCard: (id: string) =>
    request<Card>(`/cards/${id}/restore`, { method: 'POST' }),
  getArchivedCards: (boardId: string) =>
    request<Card[]>(`/boards/${boardId}/archived`),
  getBoardActivity: (boardId: string) =>
    request<BoardActivityEntry[]>(`/boards/${boardId}/activity`),

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
