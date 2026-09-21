import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Card, Swimlane } from '@/types';
import { CardItem } from './ListView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SwimlaneBoardProps {
  swimlanes: Swimlane[];
  lists: { id: string; title: string; cards: Card[] }[];
  canEdit: boolean;
  canManage: boolean;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onEditCard: (cardId: string, title: string) => Promise<boolean>;
  onOpenCard: (card: Card) => void;
  onAddCard: (title: string, listId: string) => void;
  onMoveCard: (args: { cardId: string; toListId: string; toSwimlaneId: string | null; toIndex: number }) => void;
  onAddSwimlane: (name: string) => Promise<boolean>;
  onRenameSwimlane: (swimlaneId: string, name: string) => Promise<boolean>;
  onDeleteSwimlane: (swimlaneId: string) => Promise<boolean>;
  onReorderSwimlanes: (orderedIds: string[]) => void;
  isFiltered?: boolean;
}

// Tracks the in-flight card drag across the swimlane grid.
let activeDrag: { cardId: string; fromSwimlaneId: string | null } | null = null;
let activeSwimlaneDrag: string | null = null;

export function SwimlaneBoard({
  swimlanes,
  lists,
  canEdit,
  canManage,
  onDeleteCard,
  onEditCard,
  onOpenCard,
  onAddCard,
  onMoveCard,
  onAddSwimlane,
  onRenameSwimlane,
  onDeleteSwimlane,
  onReorderSwimlanes,
  isFiltered,
}: SwimlaneBoardProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addingCell, setAddingCell] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragOverSwimlaneIndex, setDragOverSwimlaneIndex] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (addingCell && cardInputRef.current) cardInputRef.current.focus();
  }, [addingCell]);

  const handleAddCardInCell = (listId: string) => {
    const title = newCardTitle.trim();
    if (title) onAddCard(title, listId);
    setNewCardTitle('');
    setAddingCell(null);
  };

  // Cards of one list within one swimlane row (or the Unassigned row when swimlaneId is null).
  const cardsForCell = (listId: string, swimlaneId: string | null): Card[] => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return [];
    return list.cards.filter((c) => (c.swimlaneId ?? null) === swimlaneId);
  };

  const swimlaneCardCount = (swimlaneId: string | null): number =>
    lists.reduce(
      (acc, l) => acc + l.cards.filter((c) => (c.swimlaneId ?? null) === swimlaneId).length,
      0
    );

  const hasUnassigned = lists.some((l) => l.cards.some((c) => !c.swimlaneId));

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSwimlane = async () => {
    const name = newName.trim();
    if (!name) {
      setIsAdding(false);
      setNewName('');
      return;
    }
    const ok = await onAddSwimlane(name);
    if (ok) {
      setNewName('');
      setIsAdding(false);
    }
  };

  const handleRenameSave = async () => {
    const name = renameValue.trim();
    const id = renamingId;
    setRenamingId(null);
    if (!id) return;
    if (!name) return;
    await onRenameSwimlane(id, name);
  };

  const handleDropOnCell = (e: React.DragEvent, listId: string, swimlaneId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = activeDrag;
    setDragOver(null);
    if (!drag) return;
    activeDrag = null;
    const cellCards = cardsForCell(listId, swimlaneId);
    // Dropping on the empty area of a cell appends; the same card is a no-op.
    if (drag.cardId === cellCards[cellCards.length - 1]?.id && drag.fromSwimlaneId === swimlaneId) return;
    onMoveCard({
      cardId: drag.cardId,
      toListId: listId,
      toSwimlaneId: swimlaneId,
      toIndex: cellCards.length,
    });
  };

  const handleDropOnCard = (
    e: React.DragEvent,
    listId: string,
    swimlaneId: string | null,
    index: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = activeDrag;
    setDragOver(null);
    if (!drag) return;
    activeDrag = null;
    if (drag.cardId === cardsForCell(listId, swimlaneId)[index]?.id) return;
    onMoveCard({
      cardId: drag.cardId,
      toListId: listId,
      toSwimlaneId: swimlaneId,
      toIndex: index,
    });
  };

  const handleSwimlaneDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = activeSwimlaneDrag;
    activeSwimlaneDrag = null;
    setDragOverSwimlaneIndex(null);
    if (!draggedId) return;
    const ids = swimlanes.map((sl) => sl.id);
    const from = ids.indexOf(draggedId);
    if (from === -1 || from === index) return;
    ids.splice(from, 1);
    ids.splice(index, 0, draggedId);
    onReorderSwimlanes(ids);
  };

  const renderRow = (swimlane: { id: string; name: string } | null, rowIndex: number) => {
    const swimlaneId = swimlane ? swimlane.id : null;
    const isCollapsed = swimlane ? collapsed.has(swimlane.id) : false;
    const count = swimlaneCardCount(swimlaneId);
    const dropKey = (listId: string) => `${swimlaneId ?? 'unassigned'}:${listId}`;
    return (
      <div
        key={swimlaneId ?? '__unassigned'}
        className="flex gap-3 border-b pb-2 last:border-b-0"
        style={{ borderColor: 'var(--kala-line)' }}
      >
        {/* Swimlane header: fixed left column */}
        <div
          className={cn(
            'kala-card flex w-44 shrink-0 flex-col gap-1 self-start p-2',
            activeSwimlaneDrag === swimlaneId && 'opacity-40'
          )}
          onDragOver={(e) => {
            if (!activeSwimlaneDrag || !swimlane) return;
            e.preventDefault();
            setDragOverSwimlaneIndex(rowIndex);
          }}
          onDrop={(e) => swimlane && handleSwimlaneDrop(e, rowIndex)}
        >
          <div className="flex items-center gap-1">
            {swimlane && canManage && (
              <span
                draggable
                onDragStart={(e) => {
                  activeSwimlaneDrag = swimlane.id;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', swimlane.id);
                }}
                onDragEnd={() => {
                  activeSwimlaneDrag = null;
                  setDragOverSwimlaneIndex(null);
                }}
                className="cursor-grab active:cursor-grabbing text-muted-foreground/40"
                aria-hidden
                title="Drag to reorder swimlane"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            {swimlane ? (
              <button
                type="button"
                onClick={() => toggleCollapse(swimlane.id)}
                className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5 text-left text-[13px] font-semibold text-foreground hover:bg-black/[0.04]"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} swimlane ${swimlane.name}`}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="truncate">{swimlane.name}</span>
              </button>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-1 px-0.5 py-0.5 text-[13px] font-semibold text-muted-foreground">
                <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">Unassigned</span>
              </span>
            )}
            <span
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.06] px-1.5 text-[11px] font-semibold text-muted-foreground"
              aria-label={`${count} cards`}
            >
              {count}
            </span>
            {swimlane && canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-black/[0.05] hover:text-foreground"
                    aria-label={`Swimlane menu for ${swimlane.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameValue(swimlane.name);
                      setRenamingId(swimlane.id);
                    }}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDeleteSwimlane(swimlane.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete swimlane
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {/* Cells: one per list */}
        {!isCollapsed &&
          lists.map((list) => {
            const cellCards = cardsForCell(list.id, swimlaneId);
            const isOver = dragOver === dropKey(list.id);
            return (
              <div
                key={list.id}
                className={cn(
                  'kala-card min-h-16 w-72 shrink-0 rounded-xl p-1.5',
                  isOver && 'ring-2 ring-[#CE6F51]'
                )}
                onDragOver={(e) => {
                  if (!activeDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOver(dropKey(list.id));
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
                }}
                onDrop={(e) => handleDropOnCell(e, list.id, swimlaneId)}
                aria-label={`${swimlane ? swimlane.name : 'Unassigned'} / ${list.title}`}
              >
                {cellCards.length === 0 && isFiltered ? (
                  <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/70">No matching cards</p>
                ) : (
                  <ul className="space-y-1.5">
                    {cellCards.map((card, index) => (
                      <li
                        key={card.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          activeDrag = { cardId: card.id, fromSwimlaneId: swimlaneId };
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', card.id);
                        }}
                        onDragEnd={() => {
                          activeDrag = null;
                          setDragOver(null);
                        }}
                        onDragOver={(e) => {
                          if (!activeDrag) return;
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOver(dropKey(list.id));
                        }}
                        onDrop={(e) => handleDropOnCard(e, list.id, swimlaneId, index)}
                        className={cn(
                          canEdit && 'cursor-grab active:cursor-grabbing',
                          activeDrag?.cardId === card.id && 'opacity-40'
                        )}
                      >
                        <CardItem
                          card={card}
                          onDelete={onDeleteCard}
                          onEdit={onEditCard}
                          readOnly={!canEdit}
                          onClick={() => onOpenCard(card)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && addingCell === dropKey(list.id) && (
                  <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-dashed border-[#D8D5CD] bg-white p-1.5">
                    <Input
                      ref={cardInputRef}
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddCardInCell(list.id);
                        if (e.key === 'Escape') { setAddingCell(null); setNewCardTitle(''); }
                      }}
                      placeholder="Card title..."
                      aria-label={`New card title in ${list.title}`}
                      className="h-8 border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-1"
                      maxLength={255}
                    />
                    <Button size="sm" className="h-7 shrink-0 bg-[#2A2F36] px-2.5 text-[11px] text-white hover:bg-[#1E2329]" onClick={() => handleAddCardInCell(list.id)}>
                      Add
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Cancel adding card" onClick={() => { setAddingCell(null); setNewCardTitle(''); }}>
                      <span aria-hidden className="text-muted-foreground text-sm leading-none">×</span>
                    </Button>
                  </div>
                )}
                {canEdit && addingCell !== dropKey(list.id) && !isCollapsed && (
                  <button
                    onClick={() => { setAddingCell(dropKey(list.id)); setNewCardTitle(''); }}
                    className="mt-1 flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:bg-black/[0.05] hover:text-foreground"
                    aria-label={`Add a card to ${swimlane ? swimlane.name : 'Unassigned'} / ${list.title}`}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add card
                  </button>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-col gap-2" aria-label="Swimlane board">
      {/* Column headers: the lists stay on top as columns */}
      <div className="flex gap-3" aria-hidden>
        <div className="w-44 shrink-0" />
        {lists.map((list) => (
          <div key={list.id} className="w-72 shrink-0 px-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{list.title}</p>
          </div>
        ))}
      </div>
      {swimlanes.map((swimlane, i) => renderRow(swimlane, i))}
      {hasUnassigned && renderRow(null, swimlanes.length)}
      {/* Insert indicator between swimlanes while reordering */}
      {dragOverSwimlaneIndex !== null && (
        <div className="h-0.5 shrink-0 rounded-full bg-[#CE6F51]" aria-hidden />
      )}
      {canManage && (
        <div className="pt-1">
          {isAdding ? (
            <div className="kala-card flex w-64 items-center gap-2 p-2">
              <Input
                ref={addInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSwimlane();
                  if (e.key === 'Escape') {
                    setIsAdding(false);
                    setNewName('');
                  }
                }}
                placeholder="Swimlane name..."
                aria-label="New swimlane name"
                className="h-8 border bg-white text-[13px]"
                maxLength={100}
              />
              <Button size="sm" onClick={handleAddSwimlane} className="h-8 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]">
                Add
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Cancel adding swimlane"
                onClick={() => {
                  setIsAdding(false);
                  setNewName('');
                }}
              >
                <span aria-hidden className="text-muted-foreground">×</span>
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed bg-white/60 px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
              style={{ borderColor: 'var(--kala-line)' }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add swimlane
            </button>
          )}
        </div>
      )}
      {renamingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={() => setRenamingId(null)}>
          <div className="kala-card w-full max-w-sm p-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rename swimlane">
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSave();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              aria-label="Swimlane name"
              className="h-9 border bg-white text-sm"
              maxLength={100}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8 bg-white" onClick={() => setRenamingId(null)}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]" onClick={handleRenameSave}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
