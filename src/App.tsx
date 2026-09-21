import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BoardView } from '@/components/BoardView';
import { AuthPage } from '@/components/AuthPage';
import { InvitePage } from '@/components/InvitePage';
import { EmptyState } from '@/components/EmptyState';
import { NameDialog } from '@/components/NameDialog';
import { AppLoadingShell } from '@/components/LoadingStates';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useBoardRealtime } from '@/hooks/use-board-realtime';
import { api } from '@/lib/api';
import type { BoardRealtimeEvent, RealtimeStatus } from '@/lib/realtime';
import type {
  BoardWithDetails,
  Card,
  ChecklistItem,
  Label,
  List,
  MyInvitation,
  SharedBoard,
  User,
  Workspace,
} from '@/types';

// Invitation links look like /invite/<token>
const readInviteToken = () => {
  const match = window.location.pathname.match(/^\/invite\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sharedBoards, setSharedBoards] = useState<SharedBoard[]>([]);
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(readInviteToken);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('reconnecting');
  // Latest event received from another collaborator (with a counter so that
  // BoardView can react to it even when the payload is referentially equal).
  const [remoteEventTick, setRemoteEventTick] = useState<{ n: number; event: BoardRealtimeEvent } | null>(null);
  const { toast } = useToast();

  // Check current auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch everything the sidebar shows: own workspaces, boards shared with the user and
  // pending invitations.
  const fetchNavigation = useCallback(async () => {
    const [ws, shared, invites] = await Promise.all([
      api.getWorkspaces(),
      api.getSharedBoards(),
      api.getMyInvitations(),
    ]);
    setWorkspaces(ws);
    setSharedBoards(shared);
    setInvitations(invites);
    return { workspaces: ws, shared };
  }, []);

  // Initial load: select the first workspace and its first board (or a shared board)
  const loadWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      const { workspaces: ws, shared } = await fetchNavigation();
      const first = ws[0];
      setActiveWorkspaceId(first?.id ?? null);
      setActiveBoardId(first?.boards?.[0]?.id ?? shared[0]?.id ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchNavigation]);

  // Load board details
  const loadBoard = useCallback(async (boardId: string) => {
    try {
      const data = await api.getBoard(boardId);
      setBoard(data);
    } catch {
      setBoard(null);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadWorkspaces();
    } else {
      setWorkspaces([]);
      setSharedBoards([]);
      setInvitations([]);
      setActiveWorkspaceId(null);
      setActiveBoardId(null);
      setBoard(null);
      setLoading(false);
    }
  }, [user, loadWorkspaces]);

  useEffect(() => {
    if (activeBoardId) {
      loadBoard(activeBoardId);
    } else {
      setBoard(null);
    }
  }, [activeBoardId, loadBoard]);

  // Real-time collaboration: merge another user's persisted change into local
  // board state without reloading. Own events are filtered by the hook, so
  // this only handles remote changes and never duplicates local updates.
  const applyRemoteEvent = useCallback((event: BoardRealtimeEvent) => {
    setRemoteEventTick((prev) => ({ n: (prev?.n ?? 0) + 1, event }));
    setBoard((prev) => {
      if (!prev || prev.id !== event.boardId) return prev;
      const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
      const removeCard = (cardId: string): BoardWithDetails => ({
        ...prev,
        lists: prev.lists.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== cardId) })),
      });

      switch (event.type) {
        case 'list.created': {
          const list = event.data as List;
          if (prev.lists.some((l) => l.id === list.id)) return prev;
          return { ...prev, lists: [...prev.lists, { ...list, cards: list.cards ?? [] }].sort(byPosition) };
        }
        case 'list.updated': {
          const list = event.data as List;
          // Merge title/position only: the payload's cards snapshot may be
          // stale relative to local card state, which events keep in sync.
          return {
            ...prev,
            lists: prev.lists
              .map((l) => (l.id === list.id ? { ...l, title: list.title, position: list.position } : l))
              .sort(byPosition),
          };
        }
        case 'list.deleted': {
          const { listId } = event.data as { listId: string };
          return { ...prev, lists: prev.lists.filter((l) => l.id !== listId) };
        }
        case 'card.created':
        case 'card.restored': {
          const card = event.data as Card;
          if (!prev.lists.some((l) => l.id === card.listId)) return prev;
          return {
            ...prev,
            lists: prev.lists.map((l) =>
              l.id === card.listId
                ? { ...l, cards: [...l.cards.filter((c) => c.id !== card.id), card].sort(byPosition) }
                : { ...l, cards: l.cards.filter((c) => c.id !== card.id) }
            ),
          };
        }
        case 'card.updated': {
          const card = event.data as Card;
          if (card.archived) return removeCard(card.id);
          if (!prev.lists.some((l) => l.id === card.listId)) return removeCard(card.id);
          return {
            ...prev,
            lists: prev.lists.map((l) =>
              l.id === card.listId
                ? { ...l, cards: [...l.cards.filter((c) => c.id !== card.id), card].sort(byPosition) }
                : { ...l, cards: l.cards.filter((c) => c.id !== card.id) }
            ),
          };
        }
        case 'card.archived':
        case 'card.deleted': {
          const cardId = event.type === 'card.archived'
            ? (event.data as Card).id
            : (event.data as { cardId: string }).cardId;
          return removeCard(cardId);
        }
        case 'label.created': {
          const label = event.data as Label;
          if ((prev.labels || []).some((l) => l.id === label.id)) return prev;
          return { ...prev, labels: [...(prev.labels || []), label] };
        }
        case 'label.updated': {
          const label = event.data as Label;
          return {
            ...prev,
            labels: (prev.labels || []).map((l) => (l.id === label.id ? label : l)),
            lists: prev.lists.map((list) => ({
              ...list,
              cards: list.cards.map((c) => ({
                ...c,
                labels: (c.labels || []).map((l) => (l.id === label.id ? label : l)),
              })),
            })),
          };
        }
        case 'label.deleted': {
          const { labelId } = event.data as { labelId: string };
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
        }
        default:
          return prev;
      }
    });
  }, []);

  const handleRealtimeResync = useCallback(
    (boardId: string) => {
      loadBoard(boardId);
    },
    [loadBoard]
  );

  useBoardRealtime({
    boardId: activeBoardId,
    userId: user?.id ?? null,
    onEvent: applyRemoteEvent,
    onResync: handleRealtimeResync,
    onStatusChange: setRealtimeStatus,
  });

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

  // Roles and access can change while the tab is in the background (someone else changed our
  // role, removed us, or invited us). Re-sync when the user comes back to the tab.
  useEffect(() => {
    if (!user) return;
    const onFocus = async () => {
      try {
        const { workspaces: ws, shared } = await fetchNavigation();
        if (!activeBoardId) return;
        const stillListed =
          ws.some((w) => w.boards.some((b) => b.id === activeBoardId)) ||
          shared.some((b) => b.id === activeBoardId);
        if (!stillListed) {
          setActiveBoardId(ws.find((w) => w.id === activeWorkspaceId)?.boards[0]?.id ?? shared[0]?.id ?? null);
          toast({ title: 'You no longer have access to that board' });
          return;
        }
        const fresh = await api.getBoard(activeBoardId);
        setBoard((prev) => (prev && prev.myRole !== fresh.myRole ? fresh : prev));
      } catch {
        // Ignore transient errors; the next action will surface them
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, activeBoardId, activeWorkspaceId, fetchNavigation, toast]);

  // Invitation handlers
  const leaveInvitePage = () => {
    window.history.replaceState(null, '', '/');
    setInviteToken(null);
  };

  const handleInvitationAccepted = async (boardId: string) => {
    leaveInvitePage();
    try {
      await fetchNavigation();
    } catch {
      // The board is still reachable by id below
    }
    setActiveBoardId(boardId);
  };

  const handleInvitePageDone = async () => {
    leaveInvitePage();
    try {
      await fetchNavigation();
    } catch {
      // ignore
    }
  };

  const handleAcceptInvitation = async (token: string) => {
    try {
      const { boardId } = await api.acceptInvitation(token);
      await fetchNavigation();
      setActiveBoardId(boardId);
      toast({ title: 'Invitation accepted' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not accept invitation',
        description: e instanceof Error ? e.message : undefined,
      });
      fetchNavigation().catch(() => {});
    }
  };

  const handleDeclineInvitation = async (token: string) => {
    try {
      await api.declineInvitation(token);
      setInvitations((prev) => prev.filter((i) => i.token !== token));
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not decline invitation',
        description: e instanceof Error ? e.message : undefined,
      });
      fetchNavigation().catch(() => {});
    }
  };

  // Sharing handlers
  const handleLeftBoard = async () => {
    try {
      const { workspaces: ws, shared } = await fetchNavigation();
      setActiveBoardId(ws.find((w) => w.id === activeWorkspaceId)?.boards[0]?.id ?? shared[0]?.id ?? null);
    } catch {
      setActiveBoardId(null);
    }
  };

  const handleOwnershipTransferred = async () => {
    try {
      await fetchNavigation();
      if (activeBoardId) await loadBoard(activeBoardId);
    } catch {
      // ignore
    }
  };

  // Workspace handlers
  const handleSelectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return;
    setActiveWorkspaceId(workspaceId);
    // Keep the open board if it belongs to this workspace, otherwise open its first board
    if (!workspace.boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(workspace.boards[0]?.id ?? null);
    }
  };

  const handleCreateWorkspace = async (name: string) => {
    try {
      const created = await api.createWorkspace(name);
      setWorkspaces((prev) => [...prev, created]);
      setActiveWorkspaceId(created.id);
      setActiveBoardId(null);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create workspace' });
    }
  };

  const handleRenameWorkspace = async (workspaceId: string, name: string) => {
    try {
      const updated = await api.updateWorkspace(workspaceId, { name });
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, name: updated.name } : w))
      );
    } catch {
      toast({ variant: 'destructive', title: 'Failed to rename workspace' });
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      await api.deleteWorkspace(workspaceId);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete workspace' });
      return;
    }
    const remaining = workspaces.filter((w) => w.id !== workspaceId);
    setWorkspaces(remaining);
    if (activeWorkspaceId === workspaceId) {
      const next = remaining[0];
      setActiveWorkspaceId(next?.id ?? null);
      setActiveBoardId(next?.boards[0]?.id ?? null);
    }
    toast({ title: 'Workspace deleted' });
  };

  // Board handlers
  const handleCreateBoard = async (name: string, workspaceId: string) => {
    try {
      const created = await api.createBoard(name, workspaceId);
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === workspaceId ? { ...w, boards: [...w.boards, created] } : w
        )
      );
      setActiveWorkspaceId(workspaceId);
      setActiveBoardId(created.id);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create board' });
    }
  };

  const handleRenameBoard = async (boardId: string, name: string) => {
    try {
      const updated = await api.updateBoard(boardId, { name });
      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          boards: w.boards.map((b) => (b.id === boardId ? { ...b, name: updated.name } : b)),
        }))
      );
      setBoard((prev) => (prev && prev.id === boardId ? { ...prev, name: updated.name } : prev));
    } catch {
      toast({ variant: 'destructive', title: 'Failed to rename board' });
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await api.deleteBoard(boardId);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete board' });
      return;
    }
    const owner = workspaces.find((w) => w.boards.some((b) => b.id === boardId));
    setWorkspaces((prev) =>
      prev.map((w) => ({ ...w, boards: w.boards.filter((b) => b.id !== boardId) }))
    );
    if (activeBoardId === boardId) {
      setActiveBoardId(owner?.boards.find((b) => b.id !== boardId)?.id ?? null);
    }
    toast({ title: 'Board deleted' });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Continue cleanup even if server request fails
    } finally {
      setUser(null);
      setWorkspaces([]);
      setSharedBoards([]);
      setInvitations([]);
      setActiveWorkspaceId(null);
      setActiveBoardId(null);
      setBoard(null);
      toast({ title: 'Logged out successfully' });
    }
  };

  if (authLoading) {
    return <AppLoadingShell />;
  }

  if (!user) {
    return (
      <>
        <AuthPage
          onSuccess={(authenticatedUser) => setUser(authenticatedUser)}
          hasInvitation={inviteToken !== null}
        />
        <Toaster />
      </>
    );
  }

  if (inviteToken) {
    return (
      <>
        <InvitePage
          token={inviteToken}
          user={user}
          onAccepted={handleInvitationAccepted}
          onDone={handleInvitePageDone}
        />
        <Toaster />
      </>
    );
  }

  if (loading && workspaces.length === 0) {
    return <AppLoadingShell />;
  }

  const hasAnyBoards =
    workspaces.some((w) => w.boards.length > 0) || sharedBoards.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex h-screen overflow-hidden bg-[#FAFAF8]">
      <Sidebar
        workspaces={workspaces}
        sharedBoards={sharedBoards}
        invitations={invitations}
        onAcceptInvitation={handleAcceptInvitation}
        onDeclineInvitation={handleDeclineInvitation}
        activeWorkspaceId={activeWorkspaceId}
        activeBoardId={activeBoardId}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onSelectBoard={setActiveBoardId}
        onCreateBoard={handleCreateBoard}
        onRenameBoard={handleRenameBoard}
        onDeleteBoard={handleDeleteBoard}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        user={user}
        onLogout={handleLogout}
      />
      <main className="min-w-0 flex-1 overflow-hidden">
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
            currentUserId={user.id}
            onLeftBoard={handleLeftBoard}
            onOwnershipTransferred={handleOwnershipTransferred}
            connectionStatus={realtimeStatus}
            remoteEventTick={remoteEventTick}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <div className="kala-card w-full max-w-md p-2">
              <EmptyState
                icon={<LayoutDashboard className="h-5 w-5" />}
                title={error ? 'Could not connect to the server' : hasAnyBoards ? 'Select a board to get started' : 'Welcome to Kala'}
                description={
                  error
                    ? 'Please check your connection and try again.'
                    : hasAnyBoards
                      ? 'Choose a board from the sidebar to view its cards.'
                      : 'Create a workspace, then your first board, to start organizing work. Boards you are invited to will appear under Shared with me.'
                }
                action={
                  !error && !hasAnyBoards ? (
                    <Button
                      className="bg-[#2A2F36] text-white hover:bg-[#1E2329]"
                      onClick={() => setNewWorkspaceOpen(true)}
                    >
                      Create workspace
                    </Button>
                  ) : undefined
                }
              />
            </div>
          </div>
        )}
      </main>
      <NameDialog
        open={newWorkspaceOpen}
        onOpenChange={setNewWorkspaceOpen}
        title="Create workspace"
        description="A workspace groups your boards. You can rename it later."
        label="Workspace name"
        placeholder="e.g. Marketing"
        confirmLabel="Create workspace"
        onSubmit={handleCreateWorkspace}
      />
      <Toaster />
    </div>
    </TooltipProvider>
  );
}

export default App;
