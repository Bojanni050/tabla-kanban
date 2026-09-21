export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  userId: string;
  boards: Board[];
}

export interface Label {
  id: string;
  name: string;
  color: string;
  boardId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  position: number;
  cardId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  lists?: List[];
  labels?: Label[];
  workspace?: Workspace;
}

export interface List {
  id: string;
  title: string;
  position: number;
  boardId: string;
  cards: Card[];
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Card {
  id: string;
  title: string;
  description: string | null;
  position: number;
  listId: string;
  priority?: Priority | null;
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  checklistItems?: ChecklistItem[];
  list?: {
    id: string;
    title: string;
    boardId: string;
  };
}

export interface BoardWithDetails extends Board {
  lists: List[];
  labels: Label[];
  workspace: Workspace;
}
