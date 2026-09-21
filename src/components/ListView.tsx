import { useState, useRef, useEffect } from 'react';
import { Plus, X, MoreHorizontal, Trash2, Pencil, Calendar as CalendarIcon, Flag, AlignLeft, CheckSquare, GripVertical } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Card } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { EmptyState } from '@/components/EmptyState';
import { MemberAvatar } from '@/components/MemberAvatar';

interface CardItemProps {
  card: Card;
  onDelete: (cardId: string) => Promise<boolean>;
  onEdit: (cardId: string, title: string) => Promise<boolean>;
  onClick?: () => void;
  readOnly?: boolean;
}

function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CardItem({ card, onDelete, onEdit, onClick, readOnly }: CardItemProps) {
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
    if (ok) setConfirmOpen(false);
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
    if (ok) setEditOpen(false);
  };

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
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const checklist = card.checklistItems ?? [];
  const completed = checklist.filter((i) => i.completed).length;

  return (
    <>
      <div
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') onClick?.();
        }}
        role="button"
        tabIndex={0}
        aria-label={`Open card: ${card.title}`}
        className="kala-card group relative cursor-pointer px-3 py-2.5 transition-[border-color,box-shadow] duration-150 hover:border-[#CFCBC1] hover:shadow-[0_2px_8px_-2px_rgba(42,47,54,0.12)] focus-visible:outline-none"
      >
        {card.labels && card.labels.length > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1" aria-label={`${card.labels.length} labels`}>
            {card.labels.map((label) => (
              <span
                key={label.id}
                style={{ backgroundColor: label.color }}
                className="inline-flex max-w-full items-center truncate rounded px-1.5 py-px text-[10px] font-semibold tracking-wide text-white"
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        <p className="pr-12 text-[13px] font-medium leading-snug text-foreground">{card.title}</p>
        {card.description && (
          <p className="mt-1 line-clamp-2 whitespace-pre-line pr-6 text-[11px] leading-snug text-muted-foreground">
            {card.description}
          </p>
        )}

        {(card.dueDate || card.priority || checklist.length > 0 || card.description || card.assignee) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {card.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                  isOverdue()
                    ? 'border-[#EAC5B8] bg-[#FAECE6] text-[#9A4A30]'
                    : isDueTodayCard()
                      ? 'border-[#E8D9B8] bg-[#FAF3E2] text-[#7A5F1F]'
                      : 'border-border bg-muted/70 text-muted-foreground'
                )}
                title={`Due: ${format(new Date(card.dueDate), 'PPP')}`}
              >
                <CalendarIcon className="h-3 w-3" aria-hidden />
                <span>{isOverdue() ? `Overdue · ${formatDueBadge(card.dueDate)}` : isDueTodayCard() ? 'Due today' : formatDueBadge(card.dueDate)}</span>
              </span>
            )}

            {card.priority && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                  card.priority === 'HIGH' && 'border-[#EAC5B8] bg-[#FAECE6] text-[#9A4A30]',
                  card.priority === 'MEDIUM' && 'border-[#E8D9B8] bg-[#FAF3E2] text-[#7A5F1F]',
                  card.priority === 'LOW' && 'border-[#C9DCD2] bg-[#EDF4F0] text-[#3E6355]'
                )}
                title={`Priority: ${card.priority.charAt(0) + card.priority.slice(1).toLowerCase()}`}
              >
                <Flag className="h-3 w-3" aria-hidden />
                <span>{card.priority.charAt(0) + card.priority.slice(1).toLowerCase()}</span>
              </span>
            )}

            {checklist.length > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                  completed === checklist.length
                    ? 'border-[#C9DCD2] bg-[#EDF4F0] text-[#3E6355]'
                    : 'border-border bg-muted/70 text-muted-foreground'
                )}
                title={`Checklist: ${completed} of ${checklist.length} completed`}
              >
                <CheckSquare className="h-3 w-3" aria-hidden />
                <span aria-label={`${completed} of ${checklist.length} checklist items complete`}>{completed}/{checklist.length}</span>
              </span>
            )}

            {card.description && (
              <span className="inline-flex items-center text-muted-foreground/70" title="This card has a description" aria-label="Has description">
                <AlignLeft className="h-3 w-3" aria-hidden />
              </span>
            )}
            {card.assignee && (
              <span className="ml-auto" aria-label={`Assigned to ${card.assignee.name || card.assignee.email}`}>
                <MemberAvatar person={card.assignee} size="sm" />
              </span>
            )}
          </div>
        )}

        {!readOnly && (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
            <IconTip label="Rename card">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 bg-white/80 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); handleEditOpen(); }}
                aria-label={`Rename card ${card.title}`}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </IconTip>
            <IconTip label="Delete card">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 bg-white/80 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
                aria-label={`Delete card ${card.title}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </IconTip>
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!deleting) setConfirmOpen(open); }}>
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
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={(open) => { if (!saving) setEditOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename card</DialogTitle>
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
            aria-label="Card title"
            className="bg-white text-sm"
            maxLength={255}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()} className="bg-[#2A2F36] text-white hover:bg-[#1E2329]">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ListViewProps {
  list: { id: string; title: string; cards: Card[] };
  onAddCard: (title: string, listId: string) => void;
  onDeleteList: (listId: string) => void;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onEditCard: (cardId: string, title: string) => Promise<boolean>;
  onReorderCard: (listId: string, cardId: string, toIndex: number) => void;
  onMoveCard: (cardId: string, fromListId: string, toListId: string, toIndex: number) => void;
  onOpenCard: (card: Card) => void;
  isFiltered?: boolean;
  readOnly?: boolean;
}

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
  readOnly,
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
    if (isAddingCard && cardInputRef.current) cardInputRef.current.focus();
  }, [isAddingCard]);

  const handleAddCard = () => {
    if (!newCardTitle.trim()) {
      setIsAddingCard(false);
      setNewCardTitle('');
      return;
    }
    onAddCard(newCardTitle.trim(), list.id);
    setNewCardTitle('');
  };

  const handleTitleSave = () => {
    setIsEditingTitle(false);
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
      if (drag.fromListId === list.id) onReorderCard(list.id, drag.cardId, toIndex);
      else onMoveCard(drag.cardId, drag.fromListId, list.id, toIndex);
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
      className="kala-list flex max-h-full w-72 shrink-0 flex-col rounded-xl"
      onDragOver={(e) => {
        if (!activeDrag || e.defaultPrevented) return;
        e.preventDefault();
        setOverIndex(list.cards.length);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIndex(null);
      }}
      onDrop={handleDrop}
      aria-label={`List: ${list.title}, ${list.cards.length} cards`}
    >
      {/* List header: clear title + count + menu */}
      <div className="flex items-center gap-1 px-2.5 pb-1 pt-2.5">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
        {isEditingTitle ? (
          <Input
            ref={titleInputRef}
            value={listTitle}
            onChange={(e) => setListTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') { setListTitle(list.title); setIsEditingTitle(false); }
            }}
            aria-label="List title"
            className="h-7 border bg-white px-1.5 text-[13px] font-semibold shadow-none"
            maxLength={100}
          />
        ) : (
          <button
            onClick={() => !readOnly && setIsEditingTitle(true)}
            title={readOnly ? list.title : 'Rename list'}
            aria-label={readOnly ? `List: ${list.title}` : `Rename list ${list.title}`}
            className={cn(
              'min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[13px] font-semibold text-foreground',
              !readOnly && 'hover:bg-black/[0.04]'
            )}
          >
            {list.title}
          </button>
        )}
        <span
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.06] px-1.5 text-[11px] font-semibold text-muted-foreground"
          aria-label={`${list.cards.length} cards`}
        >
          {list.cards.length}
        </span>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-black/[0.05] hover:text-foreground" aria-label={`List menu for ${list.title}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsAddingCard(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" /> Add card
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDeleteList(list.id)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Cards */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-1">
        {list.cards.length === 0 && !isFiltered && !isAddingCard && (
          <p className="rounded-lg border border-dashed border-[#D8D5CD] bg-white/50 px-3 py-4 text-center text-xs text-muted-foreground">
            No cards yet.
          </p>
        )}
        {list.cards.length === 0 && isFiltered && (
          <div className="my-1 rounded-lg border border-dashed border-[#D8D5CD] bg-white/50">
            <EmptyState compact icon={<CheckSquare className="h-4 w-4" />} title="No matching cards" description="Try adjusting your search or filters." />
          </div>
        )}
        {list.cards.map((card, index) => (
          <div key={card.id}>
            <div
              className={cn('h-0.5 rounded-full transition-opacity', showIndicator(index) ? 'bg-[#CE6F51] opacity-100' : 'opacity-0')}
              data-testid={`drop-indicator-${list.id}-${index}`}
            />
            <div
              draggable={!readOnly}
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
                setTimeout(() => { isDraggingRef.current = false; }, 100);
              }}
              onDragOver={(e) => handleCardDragOver(e, index)}
              onDrop={handleDrop}
              className={cn(!readOnly && 'cursor-grab active:cursor-grabbing', draggingId === card.id && 'opacity-40')}
              data-testid={`card-draggable-${card.id}`}
            >
              <CardItem
                card={card}
                onDelete={onDeleteCard}
                onEdit={onEditCard}
                readOnly={readOnly}
                onClick={() => { if (!isDraggingRef.current) onOpenCard(card); }}
              />
            </div>
          </div>
        ))}
        <div
          className={cn('h-0.5 shrink-0 rounded-full transition-opacity', showIndicator(list.cards.length) ? 'bg-[#CE6F51] opacity-100' : 'opacity-0')}
          data-testid={`drop-indicator-${list.id}-end`}
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            setOverIndex(list.cards.length);
          }}
        />
      </div>

      {/* Add card: obvious action */}
      {!readOnly && (
        <div className="p-2.5 pt-1.5">
          {isAddingCard ? (
            <div className="kala-card flex flex-col gap-2 p-2">
              <Input
                ref={cardInputRef}
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCard();
                  if (e.key === 'Escape') { setIsAddingCard(false); setNewCardTitle(''); }
                }}
                placeholder="Enter card title..."
                aria-label={`New card title in ${list.title}`}
                className="h-8 border-0 bg-transparent px-2 text-[13px] shadow-none focus-visible:ring-1"
                maxLength={255}
              />
              <div className="flex items-center gap-1.5 px-1 pb-1">
                <Button size="sm" onClick={handleAddCard} disabled={!newCardTitle.trim()} className="h-7 bg-[#2A2F36] px-3 text-xs text-white hover:bg-[#1E2329]">
                  Add card
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Cancel adding card" onClick={() => { setIsAddingCard(false); setNewCardTitle(''); }}>
                  <X className="h-4 w-4" />
                </Button>
                <span className="ml-auto hidden text-[11px] text-muted-foreground lg:inline">Enter to add</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingCard(true)}
              aria-label={`Add a card to ${list.title}`}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add a card
            </button>
          )}
        </div>
      )}
    </div>
  );
}
