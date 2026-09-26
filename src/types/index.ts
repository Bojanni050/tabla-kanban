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

// Minimal person shape embedded in cards and activity entries
export interface CardPerson {
  id: string;
  name: string | null;
  email: string;
}

export interface BoardActivityEntry {
  id: string;
  boardId: string;
  actorId: string | null;
  type: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface CardActivityEntry {
  id: string;
  cardId: string;
  actorId: string | null;
  type: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/** External system record linked to a card (created/updated via the integration API). */
export interface ExternalReference {
  id: string;
  cardId: string;
  provider: string;
  externalId: string;
  externalUrl?: string | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Card {
  id: string;
  title: string;
  description: string | null;
  position: number;
  listId: string;
  priority?: Priority | null;
  dueDate?: string | null;
  archived?: boolean;
  assigneeId?: string | null;
  swimlaneId?: string | null;
  swimlane?: { id: string; name: string } | null;
  cardTypeId?: string | null;
  cardType?: { id: string; name: string; color: string } | null;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  externalReferences?: ExternalReference[];
  checklistItems?: ChecklistItem[];
  assignee?: CardPerson | null;
  activities?: CardActivityEntry[];
  list?: {
    id: string;
    title: string;
    boardId: string;
  };
}

export interface Swimlane {
  id: string;
  name: string;
  position: number;
  boardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CardType {
  id: string;
  name: string;
  color: string;
  position: number;
  boardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardWithDetails extends Board {
  lists: List[];
  labels: Label[];
  swimlanes?: Swimlane[];
  cardTypes?: CardType[];
  workspace: Workspace;
  myRole: BoardRole;
}

// Payload for POST /api/boards/:id/apply-template: the workflow structure of
// one board template. Sections other than lists may be empty (lists-only
// templates stay valid).
export interface BoardTemplateSnapshot {
  lists: string[];
  labels: { name: string; color: string }[];
  swimlanes: string[];
  cardTypes: { name: string; color: string }[];
}

export interface BoardTemplateSectionResult<T> {
  created: T[];
  /** Items skipped because the board already has that name (existing data untouched). */
  existing: number;
  /** Items skipped because the caller's role may not manage that section. */
  restricted: number;
}

export interface BoardTemplateResult {
  lists: List[];
  labels: BoardTemplateSectionResult<Label>;
  swimlanes: BoardTemplateSectionResult<Swimlane>;
  cardTypes: BoardTemplateSectionResult<CardType>;
}

export type BoardRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

// Kala AI settings (per user): which provider/model is used and whether keys are saved.
export interface AiProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  openaiCompatible: boolean;
  hasServerKey: boolean;
  hasUserKey: boolean;
  keyHint: string | null; // last 4 characters of the user's own key
  keyHelpUrl: string | null;
}

export interface AiSettings {
  canStoreKeys: boolean;
  providers: AiProviderInfo[];
  selection: { provider: string; model: string } | null;
  serverDefault: { provider: string; model: string | null } | null;
  effective:
    | { ok: true; provider: string; model: string; keySource: 'user' | 'server'; choice: 'user' | 'default' }
    | { ok: false; reason: string; provider: string | null };
}

export interface AiStatus {
  enabled: boolean;
  provider?: string | null;
  model?: string;
  keySource?: 'user' | 'server';
  reason?: string;
  message?: string;
}

// Suggestion-only Kala AI requests about a single card
export type CardAiAction =
  | 'improve_description'
  | 'summarize_card'
  | 'suggest_checklist'
  | 'missing_info'
  | 'suggest_priority'
  | 'suggest_deadline';

// Roles that can be handed out through invitations or role changes
export type AssignableRole = Exclude<BoardRole, 'OWNER'>;

export interface BoardMember {
  userId: string;
  name: string | null;
  email: string;
  role: BoardRole;
  joinedAt: string;
}

// A pending invitation as seen by a board owner/admin
export interface BoardInvitation {
  id: string;
  email: string;
  role: BoardRole;
  token: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string | null; email: string };
  userExists: boolean;
}

export interface BoardMembersResponse {
  myRole: BoardRole;
  members: BoardMember[];
  invitations: BoardInvitation[];
}

// A pending invitation as seen by the invited user
export interface MyInvitation {
  token: string;
  email: string;
  role: BoardRole;
  expiresAt: string;
  board: { id: string; name: string };
  invitedBy: { name: string | null; email: string };
}

// A board the user belongs to but does not own
export interface SharedBoard {
  id: string;
  name: string;
  workspaceId: string;
  role: BoardRole;
  owner: { name: string | null; email: string } | null;
}
