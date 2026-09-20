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

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  lists?: List[];
  workspace?: Workspace;
}

export interface List {
  id: string;
  title: string;
  position: number;
  boardId: string;
  cards: Card[];
}

export interface Card {
  id: string;
  title: string;
  description: string | null;
  position: number;
  listId: string;
}

export interface BoardWithDetails extends Board {
  lists: List[];
  workspace: Workspace;
}
