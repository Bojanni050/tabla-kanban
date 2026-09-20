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

  // Visual-only reorder of cards within a single list (in-memory, not persisted)
  const handleReorderCard = (listId: string, cardId: string, toIndex: number) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id !== listId) return l;
          const cards = [...l.cards];
          const fromIndex = cards.findIndex((c) => c.id === cardId);
          if (fromIndex === -1) return l;
          const [moved] = cards.splice(fromIndex, 1);
          const target = fromIndex < toIndex ? toIndex - 1 : toIndex;
          cards.splice(target, 0, moved);
          return { ...l, cards };
        }),
      };
    });
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
