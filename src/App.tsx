import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BoardView } from '@/components/BoardView';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { DEMO_BOARD, DEMO_WORKSPACES } from '@/lib/demo-data';
import type { BoardWithDetails, Card, ChecklistItem, Label, List, Workspace } from '@/types';

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

  const handleUpdateCard = async (
    cardId: string,
    updates: Partial<Card>
  ): Promise<boolean> => {
    let oldCard: Card | null = null;

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) => {
            if (c.id === cardId) {
              oldCard = { ...c };
              return { ...c, ...updates };
            }
            return c;
          }),
        })),
      };
    });

    try {
      const updated = await api.updateCard(cardId, updates);
      if (updated) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((l) => ({
              ...l,
              cards: l.cards.map((c) => (c.id === cardId ? { ...c, ...updated } : c)),
            })),
          };
        });
      }
      return true;
    } catch {
      // Revert on failure
      if (oldCard) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((l) => ({
              ...l,
              cards: l.cards.map((c) => (c.id === cardId ? oldCard! : c)),
            })),
          };
        });
      }
      toast({
        variant: 'destructive',
        title: 'Failed to update card',
        description: 'Your changes could not be saved. Please try again.',
      });
      return false;
    }
  };

  const handleEditCard = async (cardId: string, title: string): Promise<boolean> => {
    return handleUpdateCard(cardId, { title });
  };

  const handleArchiveCard = async (cardId: string): Promise<boolean> => {
    let archivedCard: Card | null = null;
    let originalListId: string | null = null;

    setBoard((prev) => {
      if (!prev) return prev;
      for (const list of prev.lists) {
        const found = list.cards.find((c) => c.id === cardId);
        if (found) {
          archivedCard = found;
          originalListId = list.id;
          break;
        }
      }
      return {
        ...prev,
        lists: prev.lists.map((list) => ({
          ...list,
          cards: list.cards.filter((c) => c.id !== cardId),
        })),
      };
    });

    try {
      await api.archiveCard(cardId);
      toast({ title: 'Card archived' });
      return true;
    } catch {
      if (archivedCard && originalListId) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((list) =>
              list.id === originalListId
                ? { ...list, cards: [...list.cards, archivedCard!] }
                : list
            ),
          };
        });
      }
      toast({
        variant: 'destructive',
        title: 'Failed to archive card',
      });
      return false;
    }
  };

  const handleRestoreCard = async (cardId: string): Promise<boolean> => {
    try {
      const restored = await api.restoreCard(cardId);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((list) =>
            list.id === restored.listId
              ? { ...list, cards: [...list.cards, restored] }
              : list
          ),
        };
      });
      toast({ title: 'Card restored' });
      return true;
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to restore card',
      });
      return false;
    }
  };

  // Label handlers
  const handleCreateLabel = async (name: string, color: string): Promise<Label | null> => {
    if (!board) return null;
    try {
      const newLabel = await api.createLabel({ name, color, boardId: board.id });
      setBoard((prev) => (prev ? { ...prev, labels: [...(prev.labels || []), newLabel] } : prev));
      return newLabel;
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create label' });
      return null;
    }
  };

  const handleUpdateLabel = async (labelId: string, name: string, color: string): Promise<boolean> => {
    try {
      const updated = await api.updateLabel(labelId, { name, color });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          labels: (prev.labels || []).map((l) => (l.id === labelId ? updated : l)),
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) => ({
              ...c,
              labels: (c.labels || []).map((l) => (l.id === labelId ? updated : l)),
            })),
          })),
        };
      });
      return true;
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update label' });
      return false;
    }
  };

  const handleDeleteLabel = async (labelId: string): Promise<boolean> => {
    try {
      await api.deleteLabel(labelId);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          labels: (prev.labels || []).filter((l) => l.id !== labelId),
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) => ({
              ...c,
              labels: (c.labels || []).filter((l) => l.id !== labelId),
            })),
          })),
        };
      });
      return true;
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete label' });
      return false;
    }
  };

  const handleAddLabelToCard = async (cardId: string, labelId: string): Promise<boolean> => {
    const label = board?.labels?.find((l) => l.id === labelId);
    if (!label) return false;

    // Optimistic update
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((list) => ({
          ...list,
          cards: list.cards.map((c) => {
            if (c.id === cardId) {
              const currentLabels = c.labels || [];
              if (currentLabels.some((l) => l.id === labelId)) return c;
              return { ...c, labels: [...currentLabels, label] };
            }
            return c;
          }),
        })),
      };
    });

    try {
      await api.addLabelToCard(cardId, labelId);
      return true;
    } catch {
      // Revert
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) =>
              c.id === cardId ? { ...c, labels: (c.labels || []).filter((l) => l.id !== labelId) } : c
            ),
          })),
        };
      });
      toast({ variant: 'destructive', title: 'Failed to attach label' });
      return false;
    }
  };

  const handleRemoveLabelFromCard = async (cardId: string, labelId: string): Promise<boolean> => {
    const removedLabel = board?.labels?.find((l) => l.id === labelId);

    // Optimistic update
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((list) => ({
          ...list,
          cards: list.cards.map((c) =>
            c.id === cardId ? { ...c, labels: (c.labels || []).filter((l) => l.id !== labelId) } : c
          ),
        })),
      };
    });

    try {
      await api.removeLabelFromCard(cardId, labelId);
      return true;
    } catch {
      // Revert
      if (removedLabel) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((list) => ({
              ...list,
              cards: list.cards.map((c) =>
                c.id === cardId ? { ...c, labels: [...(c.labels || []), removedLabel] } : c
              ),
            })),
          };
        });
      }
      toast({ variant: 'destructive', title: 'Failed to remove label' });
      return false;
    }
  };

  // Checklist handlers
  const handleAddChecklistItem = async (cardId: string, title: string): Promise<boolean> => {
    try {
      const newItem = await api.addChecklistItem(cardId, title);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) =>
              c.id === cardId
                ? { ...c, checklistItems: [...(c.checklistItems || []), newItem] }
                : c
            ),
          })),
        };
      });
      return true;
    } catch {
      toast({ variant: 'destructive', title: 'Failed to add checklist item' });
      return false;
    }
  };

  const handleUpdateChecklistItem = async (
    cardId: string,
    itemId: string,
    updates: { title?: string; completed?: boolean }
  ): Promise<boolean> => {
    let prevItem: ChecklistItem | null = null;

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((list) => ({
          ...list,
          cards: list.cards.map((c) => {
            if (c.id === cardId) {
              const items = (c.checklistItems || []).map((item) => {
                if (item.id === itemId) {
                  prevItem = item;
                  return { ...item, ...updates };
                }
                return item;
              });
              return { ...c, checklistItems: items };
            }
            return c;
          }),
        })),
      };
    });

    try {
      const updated = await api.updateChecklistItem(itemId, updates);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) => {
              if (c.id === cardId) {
                return {
                  ...c,
                  checklistItems: (c.checklistItems || []).map((item) =>
                    item.id === itemId ? updated : item
                  ),
                };
              }
              return c;
            }),
          })),
        };
      });
      return true;
    } catch {
      if (prevItem) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((list) => ({
              ...list,
              cards: list.cards.map((c) => {
                if (c.id === cardId) {
                  return {
                    ...c,
                    checklistItems: (c.checklistItems || []).map((item) =>
                      item.id === itemId ? prevItem! : item
                    ),
                  };
                }
                return c;
              }),
            })),
          };
        });
      }
      toast({ variant: 'destructive', title: 'Failed to update checklist item' });
      return false;
    }
  };

  const handleDeleteChecklistItem = async (cardId: string, itemId: string): Promise<boolean> => {
    let deletedItem: ChecklistItem | null = null;

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((list) => ({
          ...list,
          cards: list.cards.map((c) => {
            if (c.id === cardId) {
              deletedItem = (c.checklistItems || []).find((i) => i.id === itemId) || null;
              return {
                ...c,
                checklistItems: (c.checklistItems || []).filter((i) => i.id !== itemId),
              };
            }
            return c;
          }),
        })),
      };
    });

    try {
      await api.deleteChecklistItem(itemId);
      return true;
    } catch {
      if (deletedItem) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lists: prev.lists.map((list) => ({
              ...list,
              cards: list.cards.map((c) => {
                if (c.id === cardId) {
                  return {
                    ...c,
                    checklistItems: [...(c.checklistItems || []), deletedItem!],
                  };
                }
                return c;
              }),
            })),
          };
        });
      }
      toast({ variant: 'destructive', title: 'Failed to delete checklist item' });
      return false;
    }
  };

  const handleReorderChecklistItems = async (
    cardId: string,
    itemIds: string[]
  ): Promise<boolean> => {
    let previousItems: ChecklistItem[] = [];

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: prev.lists.map((list) => ({
          ...list,
          cards: list.cards.map((c) => {
            if (c.id === cardId) {
              previousItems = c.checklistItems || [];
              const itemMap = new Map(previousItems.map((i) => [i.id, i]));
              const newOrdered = itemIds
                .map((id, index) => {
                  const item = itemMap.get(id);
                  return item ? { ...item, position: index } : null;
                })
                .filter(Boolean) as ChecklistItem[];
              return { ...c, checklistItems: newOrdered };
            }
            return c;
          }),
        })),
      };
    });

    try {
      const updated = await api.reorderChecklistItems(cardId, itemIds);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) =>
              c.id === cardId ? { ...c, checklistItems: updated } : c
            ),
          })),
        };
      });
      return true;
    } catch {
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) =>
              c.id === cardId ? { ...c, checklistItems: previousItems } : c
            ),
          })),
        };
      });
      toast({ variant: 'destructive', title: 'Failed to reorder checklist' });
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
            onUpdateCard={handleUpdateCard}
            onReorderCard={handleReorderCard}
            onMoveCard={handleMoveCard}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
            onCreateLabel={handleCreateLabel}
            onUpdateLabel={handleUpdateLabel}
            onDeleteLabel={handleDeleteLabel}
            onAddLabelToCard={handleAddLabelToCard}
            onRemoveLabelFromCard={handleRemoveLabelFromCard}
            onAddChecklistItem={handleAddChecklistItem}
            onUpdateChecklistItem={handleUpdateChecklistItem}
            onDeleteChecklistItem={handleDeleteChecklistItem}
            onReorderChecklistItems={handleReorderChecklistItems}
            onArchiveCard={handleArchiveCard}
            onRestoreCard={handleRestoreCard}
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
