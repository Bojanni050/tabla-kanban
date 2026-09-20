import { useState, useRef, useEffect } from 'react';
import { Plus, X, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
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
}

function CardItem({ card, onDelete, onEdit }: CardItemProps) {
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

  return (
    <>
      <div className="group relative rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md">
        <p className="pr-14 text-sm leading-snug text-foreground">{card.title}</p>
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleEditOpen}
            title="Edit card"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
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
}

export function ListView({ list, onAddCard, onDeleteList, onDeleteCard, onEditCard }: ListViewProps) {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);
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

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/40">
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
        {list.cards.map((card) => (
          <CardItem key={card.id} card={card} onDelete={onDeleteCard} onEdit={onEditCard} />
        ))}
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
                Add card
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
