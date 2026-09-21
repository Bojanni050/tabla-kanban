// Real-time board events over Server-Sent Events.
//
// Mutations still go through the REST API (PostgreSQL stays the source of
// truth). This module only opens the notification stream for one board and
// describes the messages the server sends after a change is persisted.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export type RealtimeStatus = 'connected' | 'reconnecting' | 'offline';

export type BoardRealtimeEventType =
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'card.created'
  | 'card.updated'
  | 'card.archived'
  | 'card.restored'
  | 'card.deleted'
  | 'label.created'
  | 'label.updated'
  | 'label.deleted'
  | 'member.added'
  | 'member.updated'
  | 'member.removed';

export interface BoardRealtimeEvent {
  id: string;
  type: BoardRealtimeEventType;
  boardId: string;
  /** User whose REST request caused the change. */
  actorId: string;
  at: string;
  data: any;
}

export function realtimeUrl(boardId: string): string {
  return `${API_URL}/realtime?boardId=${encodeURIComponent(boardId)}`;
}

/** Open the SSE stream for a board. Cookies authenticate the connection. */
export function createBoardStream(boardId: string): EventSource {
  return new EventSource(realtimeUrl(boardId), { withCredentials: true });
}
