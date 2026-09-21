import { useEffect, useRef } from 'react';
import {
  createBoardStream,
  type BoardRealtimeEvent,
  type RealtimeStatus,
} from '@/lib/realtime';

interface UseBoardRealtimeOptions {
  boardId: string | null;
  userId: string | null;
  onEvent: (event: BoardRealtimeEvent) => void;
  /** Called when the stream reconnects so the board can catch up on missed events. */
  onResync: (boardId: string) => void;
  onStatusChange: (status: RealtimeStatus) => void;
}

/**
 * Subscribes to a board's SSE stream. EventSource reconnects on its own
 * after network failures; on every successful (re)connect following a
 * disconnect the board is resynced from the server.
 */
export function useBoardRealtime({
  boardId,
  userId,
  onEvent,
  onResync,
  onStatusChange,
}: UseBoardRealtimeOptions) {
  const cbRef = useRef({ onEvent, onResync, onStatusChange });
  cbRef.current = { onEvent, onResync, onStatusChange };

  useEffect(() => {
    if (!boardId || !userId) return;

    let stopped = false;
    let hadDisconnect = false;
    cbRef.current.onStatusChange('reconnecting');

    const es = createBoardStream(boardId);

    es.onopen = () => {
      if (stopped) return;
      cbRef.current.onStatusChange('connected');
      if (hadDisconnect) {
        hadDisconnect = false;
        cbRef.current.onResync(boardId);
      }
    };

    const onBoardMessage = (e: MessageEvent) => {
      if (stopped) return;
      try {
        const event = JSON.parse(e.data) as BoardRealtimeEvent;
        if (!event || event.boardId !== boardId) return;
        // Our own REST responses already updated local state - skip the echo.
        if (event.actorId === userId) return;
        cbRef.current.onEvent(event);
      } catch {
        // Ignore malformed payloads; the next resync heals any gap.
      }
    };
    es.addEventListener('board', onBoardMessage as EventListener);

    const onRevoked = () => {
      if (stopped) return;
      // Membership was revoked server-side: stop retrying and resync,
      // which surfaces the access change through the normal UI path.
      hadDisconnect = false;
      es.close();
      cbRef.current.onStatusChange('offline');
      cbRef.current.onResync(boardId);
    };
    es.addEventListener('revoked', onRevoked as EventListener);

    es.onerror = () => {
      if (stopped) return;
      hadDisconnect = true;
      cbRef.current.onStatusChange(
        es.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting'
      );
    };

    const onOffline = () => {
      if (!stopped) cbRef.current.onStatusChange('offline');
    };
    const onOnline = () => {
      if (!stopped) cbRef.current.onStatusChange('reconnecting');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      es.close();
    };
  }, [boardId, userId]);
}
