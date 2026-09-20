import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BoardView } from '@/components/BoardView';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { DEMO_BOARD, DEMO_WORKSPACES } from '@/lib/demo-data';
import type { BoardWithDetails, Card, List, Workspace } from '@/types';

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { toast } = useToast();

  // Load workspaces
  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.getWorkspaces();
      if (data.length > 0) {
        setWorkspaces(data);
        const firstBoard = data[0]?.boards?.[0];
        if (firstBoard) {
          setActiveBoardId(firstBoard.id);
        }
      } else {
        // No data in DB, use demo data
        setWorkspaces(DEMO_WORKSPACES);
        setActiveBoardId(DEMO_BOARD.id);
      }
    } catch {
      // API not available, use demo data
      setError(true);
      setWorkspaces(DEMO_WORKSPACES);
      setActiveBoardId(DEMO_BOARD.id);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load board details
  const loadBoard = useCallback(async (boardId: string) => {
    if (boardId === DEMO_BOARD.id) {
      setBoard(DEMO_BOARD);
      return;
    }
    try {
      const data = await api.getBoard(boardId);
      setBoard(data);
    } catch {
      setBoard(null);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (activeBoardId) {
      loadBoard(activeBoardId);
    } else {
      setBoard(null);
    }
  }, [activeBoardId, loadBoard]);

  // Mutations - update local state immediately, try API in background
  const handleAddList = async (title: string, boardId: string) => {
    const tempId = `temp-list-${Date.now()}`;
    const newList: List = {
      id: tempId,
      title,
      position: board?.lists?.length ?? 0,
      boardId,
      cards: [],
    };
    setBoard((prev) =>
      prev ? { ...prev, lists: [...prev.lists, newList] } : prev
    );

    try {
      const created = await api.createList(title, boardId);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              lists: prev.lists.map((l) => (l.id === tempId ? created : l)),
            }
          : prev
      );
    } catch {
      // Keep the local list if API fails
    }
  };

  const handleAddCard = async (title: string, listId: string) => {
    const tempId = `temp-card-${Date.now()}`;
    const newCard: Card = {
      id: tempId,
      title,
      description: null,
      position: 0,
      listId,
    };
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === listId ? { ...l, cards: [...l.cards, newCard] } : l
        ),
      };
    });

    try {
      const created = await api.createCard(title, listId);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  cards: l.cards.map((c) => (c.id === tempId ? created : c)),
                }
              : l
          ),
        };
      });
    } catch {
      // Keep local card if API fails
    }
  };

  const handleDeleteList = async (listId: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return { ...prev, lists: prev.lists.filter((l) => l.id !== listId) };
    });
    try {
      await api.deleteList(listId);
    } catch {
      // Keep local state if API fails
    }
  };

  const handleDeleteCard = async (cardId: string): Promise<boolean> => {
    let removedCard: Card | null = null;

    setBoard((prev) => {
      if (!prev) return prev;
      for (const list of prev.lists) {
        const found = list.cards.find((c) => c.id === cardId);
        if (found) removedCard = found;
      }
      return {
        ...prev,
        lists: prev.lists.map((l) => ({
          ...l,
          cards: l.cards.filter((c) => c.id !== cardId),
        })),
      };
    });

    try {
      await api.deleteCard(cardId);
      return true;
    } catch {
      // Restore the card if deletion failed
      if (removedCard) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((l) =>
              l.id === removedCard!.listId
                ? { ...l, cards: [...l.cards, removedCard!] }
                : l
            ),
          };
        });
      }
      toast({
        variant: 'destructive',
        title: 'Failed to delete card',
        description: 'The card could not be deleted. Please try again.',
      });
      return false;
    }
  };

  const handleEditCard = async (cardId: string, title: string): Promise<boolean> => {
    let oldTitle = '';

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) => {
            if (c.id === cardId) {
              oldTitle = c.title;
              return { ...c, title };
            }
            return c;
          }),
        })),
      };
    });

    try {
      await api.updateCard(cardId, { title });
      return true;
    } catch {
      // Revert on failure
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => ({
            ...l,
            cards: l.cards.map((c) =>
              c.id === cardId ? { ...c, title: oldTitle } : c
            ),
          })),
        };
      });
      toast({
        variant: 'destructive',
        title: 'Failed to rename card',
        description: 'The card could not be renamed. Please try again.',
      });
      return false;
    }
  };

  // Reorder cards within a single list and persist position in PostgreSQL
  const handleReorderCard = async (listId: string, cardId: string, toIndex: number) => {
    if (!board) return;

    const currentList = board.lists.find((l) => l.id === listId);
    if (!currentList) return;

    const previousCards = currentList.cards;
    const cards = [...previousCards];
    const fromIndex = cards.findIndex((c) => c.id === cardId);
    if (fromIndex === -1) return;

    const targetIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    if (targetIndex === fromIndex) return;

    const [movedCard] = cards.splice(fromIndex, 1);
    cards.splice(targetIndex, 0, movedCard);

    let newPosition: number;
    let needsReindex = false;

    if (cards.length <= 1) {
      newPosition = 0;
    } else if (targetIndex === 0) {
      const nextPos = cards[1].position;
      newPosition = nextPos - 1;
    } else if (targetIndex === cards.length - 1) {
      const prevPos = cards[targetIndex - 1].position;
      newPosition = prevPos + 1;
    } else {
      const prevPos = cards[targetIndex - 1].position;
      const nextPos = cards[targetIndex + 1].position;
      if (prevPos >= nextPos || nextPos - prevPos < 1e-6) {
        needsReindex = true;
        newPosition = targetIndex;
      } else {
        newPosition = (prevPos + nextPos) / 2;
      }
    }

    const updatedCards = cards.map((c, i) => {
      if (needsReindex) {
        return { ...c, position: i };
      }
      if (c.id === cardId) {
        return { ...c, position: newPosition };
      }
      return c;
    });

    // Optimistically update board state
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === listId ? { ...l, cards: updatedCards } : l
        ),
      };
    });

    if (board.id === DEMO_BOARD.id) {
      return;
    }

    try {
      if (needsReindex) {
        await Promise.all(
          updatedCards.map((c, i) => api.updateCard(c.id, { position: i }))
        );
      } else {
        await api.updateCard(cardId, { position: newPosition });
      }
    } catch {
      // Revert to previous order and notify user
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId ? { ...l, cards: previousCards } : l
          ),
        };
      });
      toast({
        variant: 'destructive',
        title: 'Failed to reorder card',
        description: 'The new card order could not be saved. Please try again.',
      });
    }
  };

  // Move a card to another list at toIndex and persist listId + position
  const handleMoveCard = async (
    cardId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => {
    if (!board || fromListId === toListId) return;

    const fromList = board.lists.find((l) => l.id === fromListId);
    const toList = board.lists.find((l) => l.id === toListId);
    const card = fromList?.cards.find((c) => c.id === cardId);
    if (!fromList || !toList || !card) return;

    const previousLists = board.lists;
    const targetCards = [...toList.cards];
    const index = Math.max(0, Math.min(toIndex, targetCards.length));
    targetCards.splice(index, 0, { ...card, listId: toListId });

    let newPosition: number;
    let needsReindex = false;

    if (targetCards.length === 1) {
      newPosition = 0;
    } else if (index === 0) {
      newPosition = targetCards[1].position - 1;
    } else if (index === targetCards.length - 1) {
      newPosition = targetCards[index - 1].position + 1;
    } else {
      const prevPos = targetCards[index - 1].position;
      const nextPos = targetCards[index + 1].position;
      if (prevPos >= nextPos || nextPos - prevPos < 1e-6) {
        needsReindex = true;
        newPosition = index;
      } else {
        newPosition = (prevPos + nextPos) / 2;
      }
    }

    const updatedTarget = targetCards.map((c, i) => {
      if (needsReindex) return { ...c, position: i };
      return c.id === cardId ? { ...c, position: newPosition } : c;
    });

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id === fromListId) {
            return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
          }
          if (l.id === toListId) return { ...l, cards: updatedTarget };
          return l;
        }),
      };
    });

    if (board.id === DEMO_BOARD.id) return;

    try {
      await api.updateCard(cardId, { listId: toListId, position: newPosition });
      if (needsReindex) {
        await Promise.all(
          updatedTarget
            .filter((c) => c.id !== cardId)
            .map((c) => api.updateCard(c.id, { position: c.position }))
        );
      }
    } catch {
      setBoard((prev) => (prev ? { ...prev, lists: previousLists } : prev));
      toast({
        variant: 'destructive',
        title: 'Failed to move card',
        description: 'The card could not be moved. Please try again.',
      });
    }
  };

  const handleCreateBoard = async (name: string, workspaceId: string) => {
    try {
      const created = await api.createBoard(name, workspaceId);
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === workspaceId
            ? { ...w, boards: [...w.boards, created] }
            : w
        )
      );
      setActiveBoardId(created.id);
    } catch {
      // If API fails, add to demo workspace locally
      const tempBoard = {
        id: `temp-board-${Date.now()}`,
        name,
        workspaceId,
      };
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === workspaceId
            ? { ...w, boards: [...w.boards, tempBoard] }
            : w
        )
      );
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        workspaces={workspaces}
        activeBoardId={activeBoardId}
        onSelectBoard={setActiveBoardId}
        onCreateBoard={handleCreateBoard}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />
      <main className="flex-1 overflow-hidden">
        {board ? (
          <BoardView
            board={board}
            onAddList={handleAddList}
            onAddCard={handleAddCard}
            onDeleteList={handleDeleteList}
            onDeleteCard={handleDeleteCard}
            onEditCard={handleEditCard}
            onReorderCard={handleReorderCard}
            onMoveCard={handleMoveCard}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {error
                ? 'Could not connect to the server. Showing demo data.'
                : 'Select a board to get started.'}
            </p>
          </div>
        )}
      </main>
      <Toaster />
    </div>
  );
}

export default App;
