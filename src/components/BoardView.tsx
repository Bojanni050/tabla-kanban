import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Tag,
  Search,
  SlidersHorizontal,
  Check,
  Flag,
} from 'lucide-react';
import { isPast, isToday, isThisWeek, startOfDay } from 'date-fns';
import type { BoardWithDetails, Card, Label, Priority } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ListView } from './ListView';
import { CardDetailModal } from './CardDetailModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DueDateFilterOption = 'all' | 'overdue' | 'today' | 'this_week' | 'no_due_date';

const DUE_DATE_OPTIONS: { id: DueDateFilterOption; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'this_week', label: 'Due this week' },
  { id: 'no_due_date', label: 'No due date' },
];

const PRIORITY_OPTIONS: { id: Priority; label: string; colorClass: string }[] = [
  { id: 'HIGH', label: 'High', colorClass: 'text-rose-600 dark:text-rose-400' },
  { id: 'MEDIUM', label: 'Medium', colorClass: 'text-amber-600 dark:text-amber-400' },
  { id: 'LOW', label: 'Low', colorClass: 'text-blue-600 dark:text-blue-400' },
];

const isCardOverdue = (dueDateStr: string | null | undefined) => {
  if (!dueDateStr) return false;
  const d = new Date(dueDateStr);
  return isPast(startOfDay(d)) && !isToday(d);
};

const isCardDueToday = (dueDateStr: string | null | undefined) => {
  if (!dueDateStr) return false;
  return isToday(new Date(dueDateStr));
};

const isCardDueThisWeek = (dueDateStr: string | null | undefined) => {
  if (!dueDateStr) return false;
  return isThisWeek(new Date(dueDateStr), { weekStartsOn: 1 });
};

interface BoardViewProps {
  board: BoardWithDetails;
  onAddList: (title: string, boardId: string) => void;
  onAddCard: (title: string, listId: string) => void;
  onDeleteList: (listId: string) => void;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onEditCard: (cardId: string, title: string) => Promise<boolean>;
  onUpdateCard: (cardId: string, updates: Partial<Card>) => Promise<boolean>;
  onReorderCard: (listId: string, cardId: string, toIndex: number) => void;
  onMoveCard: (cardId: string, fromListId: string, toListId: string, toIndex: number) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  // Labels
  onCreateLabel?: (name: string, color: string) => Promise<Label | null>;
  onUpdateLabel?: (labelId: string, name: string, color: string) => Promise<boolean>;
  onDeleteLabel?: (labelId: string) => Promise<boolean>;
  onAddLabelToCard: (cardId: string, labelId: string) => Promise<boolean>;
  onRemoveLabelFromCard: (cardId: string, labelId: string) => Promise<boolean>;
  // Checklist
  onAddChecklistItem: (cardId: string, title: string) => Promise<boolean>;
  onUpdateChecklistItem: (cardId: string, itemId: string, updates: { title?: string; completed?: boolean }) => Promise<boolean>;
  onDeleteChecklistItem: (cardId: string, itemId: string) => Promise<boolean>;
  onReorderChecklistItems: (cardId: string, itemIds: string[]) => Promise<boolean>;
}

export function BoardView({
  board,
  onAddList,
  onAddCard,
  onDeleteList,
  onDeleteCard,
  onEditCard,
  onUpdateCard,
  onReorderCard,
  onMoveCard,
  sidebarCollapsed,
  onToggleSidebar,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  onAddLabelToCard,
  onRemoveLabelFromCard,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onReorderChecklistItems,
}: BoardViewProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isBoardLabelsOpen, setIsBoardLabelsOpen] = useState(false);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const listInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilterOption>('all');
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  // Number of active filters in the filter popover (excluding text search)
  const filterBadgeCount =
    selectedLabelIds.length +
    selectedPriorities.length +
    (dueDateFilter !== 'all' ? 1 : 0);

  // True if any search or filter criteria is currently applied
  const isFiltered = Boolean(
    searchQuery.trim() ||
    selectedLabelIds.length > 0 ||
    selectedPriorities.length > 0 ||
    dueDateFilter !== 'all'
  );

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSelectedLabelIds([]);
    setSelectedPriorities([]);
    setDueDateFilter('all');
  };

  const toggleLabelFilter = (labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    );
  };

  const togglePriorityFilter = (priority: Priority) => {
    setSelectedPriorities((prev) =>
      prev.includes(priority) ? prev.filter((p) => p !== priority) : [...prev, priority]
    );
  };

  // Find the selected card and its list
  const selectedCard = selectedCardId
    ? board.lists.flatMap((l) => l.cards).find((c) => c.id === selectedCardId) ?? null
    : null;
  const selectedList = selectedCardId
    ? board.lists.find((l) => l.cards.some((c) => c.id === selectedCardId))
    : undefined;

  // Filtered lists computation (preserves list layout even if 0 matching cards)
  const filteredLists = useMemo(() => {
    if (!isFiltered) return board.lists;

    const q = searchQuery.trim().toLowerCase();

    return board.lists.map((list) => ({
      ...list,
      cards: list.cards.filter((card) => {
        // Search filter (title or description)
        if (q) {
          const titleMatch = card.title.toLowerCase().includes(q);
          const descMatch = card.description
            ? card.description.toLowerCase().includes(q)
            : false;
          if (!titleMatch && !descMatch) return false;
        }

        // Label filter (must match at least one selected label)
        if (selectedLabelIds.length > 0) {
          const hasMatchingLabel = card.labels?.some((l) => selectedLabelIds.includes(l.id));
          if (!hasMatchingLabel) return false;
        }

        // Priority filter (must match one selected priority)
        if (selectedPriorities.length > 0) {
          if (!card.priority || !selectedPriorities.includes(card.priority)) {
            return false;
          }
        }

        // Due date filter
        if (dueDateFilter === 'overdue' && !isCardOverdue(card.dueDate)) {
          return false;
        }
        if (dueDateFilter === 'today' && !isCardDueToday(card.dueDate)) {
          return false;
        }
        if (dueDateFilter === 'this_week' && !isCardDueThisWeek(card.dueDate)) {
          return false;
        }
        if (dueDateFilter === 'no_due_date' && card.dueDate) {
          return false;
        }

        return true;
      }),
    }));
  }, [board.lists, isFiltered, searchQuery, selectedLabelIds, selectedPriorities, dueDateFilter]);

  const totalCardsCount = useMemo(() => {
    return board.lists.reduce((acc, l) => acc + l.cards.length, 0);
  }, [board.lists]);

  const filteredCardsCount = useMemo(() => {
    return filteredLists.reduce((acc, l) => acc + l.cards.length, 0);
  }, [filteredLists]);

  useEffect(() => {
    if (isAddingList && listInputRef.current) {
      listInputRef.current.focus();
    }
  }, [isAddingList]);

  const handleAddList = () => {
    if (!newListTitle.trim()) {
      setIsAddingList(false);
      setNewListTitle('');
      return;
    }
    onAddList(newListTitle.trim(), board.id);
    setNewListTitle('');
    setIsAddingList(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Board header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {board.name}
          </h1>
          <span className="text-sm text-muted-foreground">
            {board.workspace?.name}
          </span>
        </div>

        {/* Header controls: Search, Filter Popover, Labels */}
        <div className="flex items-center gap-2">
          {/* Search field */}
          <div className="relative flex items-center w-48 sm:w-60">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards..."
              className="h-8 pl-8 pr-7 text-xs bg-background"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter Popover */}
          <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={filterBadgeCount > 0 ? 'secondary' : 'outline'}
                size="sm"
                className={cn(
                  'h-8 gap-1.5 text-xs bg-card',
                  filterBadgeCount > 0 && 'font-medium border-primary/40 text-primary bg-primary/10'
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filter</span>
                {filterBadgeCount > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {filterBadgeCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filters
                </h4>
                {filterBadgeCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLabelIds([]);
                      setSelectedPriorities([]);
                      setDueDateFilter('all');
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Due date filter */}
              <div className="space-y-1 mb-3">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  Due Date
                </div>
                {DUE_DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDueDateFilter(opt.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left transition-colors',
                      dueDateFilter === opt.id
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span>{opt.label}</span>
                    {dueDateFilter === opt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </div>

              {/* Priority filter */}
              <div className="space-y-1 mb-3">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  Priority
                </div>
                {PRIORITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-xs text-foreground"
                  >
                    <Checkbox
                      checked={selectedPriorities.includes(opt.id)}
                      onCheckedChange={() => togglePriorityFilter(opt.id)}
                    />
                    <Flag className={cn('h-3 w-3', opt.colorClass)} />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Labels filter */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  Labels
                </div>
                {(board.labels || []).length > 0 ? (
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {(board.labels || []).map((label) => (
                      <label
                        key={label.id}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-xs text-foreground"
                      >
                        <Checkbox
                          checked={selectedLabelIds.includes(label.id)}
                          onCheckedChange={() => toggleLabelFilter(label.id)}
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="truncate">{label.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    No labels on this board
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Board labels management button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBoardLabelsOpen(true)}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-card"
          >
            <Tag className="h-3.5 w-3.5" />
            <span>Labels ({board.labels?.length ?? 0})</span>
          </Button>
        </div>
      </div>

      {/* Active filters summary bar */}
      {isFiltered && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-2 text-xs">
          <span className="text-muted-foreground font-medium mr-1">
            Filters:
          </span>

          {/* Search chip */}
          {searchQuery.trim() && (
            <Badge variant="secondary" className="gap-1 font-normal text-xs py-0.5 pr-1">
              <span>Search: &ldquo;{searchQuery.trim()}&rdquo;</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Remove search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Due date chip */}
          {dueDateFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1 font-normal text-xs py-0.5 pr-1">
              <span>Due: {DUE_DATE_OPTIONS.find((o) => o.id === dueDateFilter)?.label}</span>
              <button
                type="button"
                onClick={() => setDueDateFilter('all')}
                className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Remove due date filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Priority chips */}
          {selectedPriorities.map((priority) => (
            <Badge key={priority} variant="secondary" className="gap-1 font-normal text-xs py-0.5 pr-1">
              <span>Priority: {priority.charAt(0) + priority.slice(1).toLowerCase()}</span>
              <button
                type="button"
                onClick={() => setSelectedPriorities((prev) => prev.filter((p) => p !== priority))}
                className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                title={`Remove priority ${priority} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {/* Label chips */}
          {selectedLabelIds.map((labelId) => {
            const label = (board.labels || []).find((l) => l.id === labelId);
            if (!label) return null;
            return (
              <Badge key={labelId} variant="secondary" className="gap-1.5 font-normal text-xs py-0.5 pr-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                <span>{label.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedLabelIds((prev) => prev.filter((id) => id !== labelId))}
                  className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                  title={`Remove label ${label.name} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}

          {/* Clear all */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAllFilters}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>

          <span className="ml-auto text-muted-foreground">
            Showing {filteredCardsCount} of {totalCardsCount} cards
          </span>
        </div>
      )}

      {/* Lists - horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-3 p-4">
          {filteredLists.map((list) => (
            <ListView
              key={list.id}
              list={list}
              isFiltered={isFiltered}
              onAddCard={onAddCard}
              onDeleteList={onDeleteList}
              onDeleteCard={onDeleteCard}
              onEditCard={onEditCard}
              onReorderCard={onReorderCard}
              onMoveCard={onMoveCard}
              onOpenCard={(c) => setSelectedCardId(c.id)}
            />
          ))}

          {/* Add list */}
          <div className="w-72 shrink-0">
            {isAddingList ? (
              <div className="rounded-xl border border-border bg-muted/40 p-2.5">
                <Input
                  ref={listInputRef}
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddList();
                    if (e.key === 'Escape') {
                      setIsAddingList(false);
                      setNewListTitle('');
                    }
                  }}
                  placeholder="Enter list title..."
                  className="h-8 text-sm"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handleAddList} className="h-7 text-xs">
                    Add list
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setIsAddingList(false);
                      setNewListTitle('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingList(true)}
                className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>Add another list</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Card Detail Modal */}
      <CardDetailModal
        card={selectedCard}
        listTitle={selectedList?.title}
        boardLabels={board.labels || []}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCardId(null)}
        onUpdateCard={onUpdateCard}
        onDeleteCard={async (cardId) => {
          const ok = await onDeleteCard(cardId);
          if (ok) {
            setSelectedCardId(null);
          }
          return ok;
        }}
        onCreateLabel={onCreateLabel}
        onUpdateLabel={onUpdateLabel}
        onDeleteLabel={onDeleteLabel}
        onAddLabelToCard={onAddLabelToCard}
        onRemoveLabelFromCard={onRemoveLabelFromCard}
        onAddChecklistItem={onAddChecklistItem}
        onUpdateChecklistItem={onUpdateChecklistItem}
        onDeleteChecklistItem={onDeleteChecklistItem}
        onReorderChecklistItems={onReorderChecklistItems}
      />

      {/* Board Labels Management Dialog */}
      <Dialog open={isBoardLabelsOpen} onOpenChange={setIsBoardLabelsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Board Labels</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {(board.labels || []).map((label) => (
              <div
                key={label.id}
                className="flex items-center justify-between p-2 rounded-lg border border-border"
              >
                <span
                  style={{ backgroundColor: label.color }}
                  className="px-2.5 py-1 rounded text-xs font-semibold text-white tracking-wide shadow-xs"
                >
                  {label.name}
                </span>
                {onDeleteLabel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteLabel(label.id)}
                    title="Delete label from board"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {(board.labels || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No labels created for this board yet. Open any card to create labels.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { Card };
