import { useState, useRef, useEffect } from 'react';
import { Plus, X, MoreHorizontal, Trash2, Pencil, Calendar as CalendarIcon, Flag, AlignLeft, CheckSquare } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Card } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CardItemProps {
  card: Card;
  onDelete: (cardId: string) => Promise<boolean>;
  onEdit: (cardId: string, title: string) => Promise<boolean>;
  onClick?: () => void;
}

function CardItem({ card, onDelete, onEdit, onClick }: CardItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title);
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    const ok = await onDelete(card.id);
    setDeleting(false);
    if (ok) {
      setConfirmOpen(false);
    }
  };

  useEffect(() => {
    if (editOpen && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editOpen]);

  const handleEditOpen = () => {
    setEditTitle(card.title);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === card.title) {
      setEditOpen(false);
      return;
    }
    setSaving(true);
    const ok = await onEdit(card.id, trimmed);
    setSaving(false);
    if (ok) {
      setEditOpen(false);
    }
  };

  // Due date helpers
  const isOverdue = () => {
    if (!card.dueDate) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(card.dueDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  };

  const isDueTodayCard = () => {
    if (!card.dueDate) return false;
    return isToday(new Date(card.dueDate));
  };

  const formatDueBadge = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return format(d, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div
        onClick={onClick}
        className="group relative rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-all hover:shadow-md hover:border-primary/40 cursor-pointer"
      >
        {/* Attached labels */}
        {card.labels && card.labels.length > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            {card.labels.map((label) => (
              <span
                key={label.id}
                style={{ backgroundColor: label.color }}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white tracking-wide shadow-xs"
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        <p className="pr-14 text-sm leading-snug text-foreground font-medium">{card.title}</p>

        {/* Badges row for Due date, Priority, Checklist progress, and Description */}
        {(card.dueDate || card.priority || (card.checklistItems && card.checklistItems.length > 0) || card.description) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-0.5">
            {card.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border',
                  isOverdue()
                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900'
                    : isDueTodayCard()
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900'
                    : 'bg-muted text-muted-foreground border-border'
                )}
                title={`Due: ${format(new Date(card.dueDate), 'PPP')}`}
              >
                <CalendarIcon className="h-3 w-3" />
                <span>{isOverdue() ? 'Overdue' : isDueTodayCard() ? 'Today' : formatDueBadge(card.dueDate)}</span>
              </span>
            )}

            {card.priority && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border',
                  card.priority === 'HIGH' &&
                    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900',
                  card.priority === 'MEDIUM' &&
                    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
                  card.priority === 'LOW' &&
                    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900'
                )}
              >
                <Flag className="h-3 w-3" />
                <span>{card.priority.charAt(0) + card.priority.slice(1).toLowerCase()}</span>
              </span>
            )}

            {card.checklistItems && card.checklistItems.length > 0 && (() => {
              const completed = card.checklistItems.filter((i) => i.completed).length;
              const total = card.checklistItems.length;
              const isAllComplete = completed === total && total > 0;
              return (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border',
                    isAllComplete
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900'
                      : 'bg-muted text-muted-foreground border-border'
                  )}
                  title={`Checklist: ${completed} of ${total} completed`}
                >
                  <CheckSquare className="h-3 w-3" />
                  <span>{completed}/{total}</span>
                </span>
              );
            })()}

            {card.description && (
              <span
                className="inline-flex items-center text-muted-foreground/70"
                title="This card has a description"
              >
                <AlignLeft className="h-3 w-3" />
              </span>
            )}
          </div>
        )}

        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleEditOpen();
            }}
            title="Edit title"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            title="Delete card"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => {
        if (!deleting) setConfirmOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{card.title}&rdquo; will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={(open) => {
        if (!saving) setEditOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
          </DialogHeader>
          <Input
            ref={editInputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') setEditOpen(false);
            }}
            placeholder="Card title"
            className="text-sm"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ListViewProps {
  list: {
    id: string;
    title: string;
    cards: Card[];
  };
  onAddCard: (title: string, listId: string) => void;
  onDeleteList: (listId: string) => void;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onEditCard: (cardId: string, title: string) => Promise<boolean>;
  onReorderCard: (listId: string, cardId: string, toIndex: number) => void;
  onMoveCard: (cardId: string, fromListId: string, toListId: string, toIndex: number) => void;
  onOpenCard: (card: Card) => void;
  isFiltered?: boolean;
}

// Drag state shared across lists so a card can be dropped into another list
let activeDrag: { cardId: string; fromListId: string } | null = null;

export function ListView({
  list,
  onAddCard,
  onDeleteList,
  onDeleteCard,
  onEditCard,
  onReorderCard,
  onMoveCard,
  onOpenCard,
  isFiltered,
}: ListViewProps) {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isAddingCard && cardInputRef.current) {
      cardInputRef.current.focus();
    }
  }, [isAddingCard]);

  const handleAddCard = () => {
    if (!newCardTitle.trim()) {
      setIsAddingCard(false);
      setNewCardTitle('');
      return;
    }
    onAddCard(newCardTitle.trim(), list.id);
    setNewCardTitle('');
    // keep the input open for adding more cards
  };

  const handleTitleSave = () => {
    setIsEditingTitle(false);
    if (listTitle.trim() && listTitle !== list.title) {
      // Could call onRenameList here; for now just update locally
    }
    if (!listTitle.trim()) setListTitle(list.title);
  };

  const setOverIndex = (idx: number | null) => {
    dragOverIndexRef.current = idx;
    setDragOverIndex(idx);
  };

  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    if (!activeDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = e.clientY - rect.top > rect.height / 2;
    setOverIndex(isAfter ? index + 1 : index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const drag = activeDrag;
    const toIndex = dragOverIndexRef.current;
    if (drag && toIndex !== null) {
      activeDrag = null;
      if (drag.fromListId === list.id) {
        onReorderCard(list.id, drag.cardId, toIndex);
      } else {
        onMoveCard(drag.cardId, drag.fromListId, list.id, toIndex);
      }
    }
    draggingIdRef.current = null;
    setDraggingId(null);
    setOverIndex(null);
  };

  const resetDrag = () => {
    activeDrag = null;
    draggingIdRef.current = null;
    setDraggingId(null);
    setOverIndex(null);
  };

  const showIndicator = (index: number) => dragOverIndex === index;

  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/40"
      onDragOver={(e) => {
        // Fallback for empty lists / gaps: drop at the end of this list
        if (!activeDrag || e.defaultPrevented) return;
        e.preventDefault();
        setOverIndex(list.cards.length);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIndex(null);
      }}
      onDrop={handleDrop}
    >
      {/* List header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        {isEditingTitle ? (
          <Input
            ref={titleInputRef}
            value={listTitle}
            onChange={(e) => setListTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setListTitle(list.title);
                setIsEditingTitle(false);
              }
            }}
            className="h-7 border-none bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-1"
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="flex-1 truncate rounded px-1 text-left text-sm font-semibold text-foreground hover:bg-accent/50"
          >
            {list.title}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onDeleteList(list.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 px-2.5">
        {list.cards.length === 0 && isFiltered && (
          <div className="flex flex-col items-center justify-center py-6 px-3 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg bg-card/30 my-1">
            <span>No matching cards</span>
          </div>
        )}
        {list.cards.map((card, index) => (
          <div key={card.id}>
            <div
              className={cn(
                'h-1 -my-0.5 rounded-full bg-primary/70 transition-opacity',
                showIndicator(index) ? 'opacity-100' : 'opacity-0'
              )}
              data-testid={`drop-indicator-${list.id}-${index}`}
            />
            <div
              draggable
              onDragStart={(e) => {
                isDraggingRef.current = true;
                activeDrag = { cardId: card.id, fromListId: list.id };
                draggingIdRef.current = card.id;
                setDraggingId(card.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.id);
              }}
              onDragEnd={() => {
                resetDrag();
                setTimeout(() => {
                  isDraggingRef.current = false;
                }, 100);
              }}
              onDragOver={(e) => handleCardDragOver(e, index)}
              onDrop={handleDrop}
              className={cn(
                'cursor-grab active:cursor-grabbing',
                draggingId === card.id && 'opacity-40'
              )}
              data-testid={`card-draggable-${card.id}`}
            >
              <CardItem
                card={card}
                onDelete={onDeleteCard}
                onEdit={onEditCard}
                onClick={() => {
                  if (!isDraggingRef.current) {
                    onOpenCard(card);
                  }
                }}
              />
            </div>
          </div>
        ))}
        <div
          className={cn(
            'h-1 -mt-0.5 rounded-full bg-primary/70 transition-opacity',
            showIndicator(list.cards.length) ? 'opacity-100' : 'opacity-0'
          )}
          data-testid={`drop-indicator-${list.id}-end`}
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            setOverIndex(list.cards.length);
          }}
        />
      </div>

      {/* Add card */}
      <div className="p-2.5">
        {isAddingCard ? (
          <div className="flex flex-col gap-2">
            <Input
              ref={cardInputRef}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCard();
                if (e.key === 'Escape') {
                  setIsAddingCard(false);
                  setNewCardTitle('');
                }
              }}
              placeholder="Enter card title..."
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAddCard} className="h-7 text-xs">
                New card
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setIsAddingCard(false);
                  setNewCardTitle('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCard(true)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground',
              'hover:bg-accent hover:text-foreground transition-colors'
            )}
          >
            <Plus className="h-4 w-4" />
            <span>Add a card</span>
          </button>
        )}
      </div>
    </div>
  );
}
