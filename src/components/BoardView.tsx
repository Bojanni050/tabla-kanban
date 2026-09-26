import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  Archive,
  RotateCcw,
  Trash2,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Users,
  LayoutGrid,
  LayoutTemplate,
  SearchX,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { isPast, isToday, isThisWeek, startOfDay, format } from 'date-fns';
import type { BoardTemplateResult, BoardTemplateSnapshot, BoardWithDetails, BoardActivityEntry, BoardRole, Card, CardType, Label, Priority, BoardMember } from '@/types';
import type { BoardRealtimeEvent, RealtimeStatus } from '@/lib/realtime';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { cn } from '@/lib/utils';
import { ListView } from './ListView';
import { CardDetailModal } from './CardDetailModal';
import { MembersDialog } from './MembersDialog';
import { AiPanel } from './AiPanel';
import { EmptyState } from './EmptyState';
import { ListTemplatePicker } from './ListTemplatePicker';
import { toBoardTemplateSnapshot, type ListTemplate } from '@/lib/list-templates';
import { AvatarStack, MemberAvatar } from './MemberAvatar';
import { ROLE_META } from './MemberAvatar';
import { displayName } from '@/lib/roles';
import { canEditBoard, canManageBoard } from '@/lib/roles';
import { SwimlaneBoard } from './SwimlaneBoard';
import { NameDialog } from '@/components/NameDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DueDateFilterOption = 'all' | 'overdue' | 'today' | 'this_week' | 'no_due_date';

const DUE_DATE_OPTIONS: { id: DueDateFilterOption; label: string }[] = [
  { id: 'all', label: 'All dates' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'this_week', label: 'Due this week' },
  { id: 'no_due_date', label: 'No due date' },
];

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
];
const CARD_TYPE_COLORS = [
  { name: 'Blue', hex: '#5B8DD9' },
  { name: 'Coral', hex: '#CE6F51' },
  { name: 'Amber', hex: '#D9A03F' },
  { name: 'Sage', hex: '#7FA693' },
  { name: 'Teal', hex: '#4FA3A3' },
  { name: 'Indigo', hex: '#6B7BD6' },
  { name: 'Purple', hex: '#8B6FC7' },
  { name: 'Pink', hex: '#D96A9B' },
];
// First-use suggestions shown in the manage dialog; never created without an explicit user action.
const SUGGESTED_CARD_TYPES = ['Task', 'Feature', 'Bug', 'Request'];

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function describeCount(count: number, singular: string): string {
  return `${count} ${pluralize(count, singular)}`;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

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
  onMoveCardToCell: (args: { cardId: string; toListId: string; toSwimlaneId: string | null; toIndex: number }) => void;
  onAddSwimlane: (name: string) => Promise<boolean>;
  onRenameSwimlane: (swimlaneId: string, name: string) => Promise<boolean>;
  onDeleteSwimlane: (swimlaneId: string) => Promise<boolean>;
  onReorderSwimlanes: (orderedIds: string[]) => void;
  onAddCardType?: (name: string, color: string) => Promise<boolean>;
  onUpdateCardType?: (cardTypeId: string, data: { name?: string; color?: string }) => Promise<boolean>;
  onDeleteCardType?: (cardTypeId: string) => Promise<boolean>;
  onReorderCardTypes?: (orderedIds: string[]) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onCreateLabel?: (name: string, color: string) => Promise<Label | null>;
  onUpdateLabel?: (labelId: string, name: string, color: string) => Promise<boolean>;
  onDeleteLabel?: (labelId: string) => Promise<boolean>;
  onAddLabelToCard: (cardId: string, labelId: string) => Promise<boolean>;
  onRemoveLabelFromCard: (cardId: string, labelId: string) => Promise<boolean>;
  onAddChecklistItem: (cardId: string, title: string) => Promise<boolean>;
  onUpdateChecklistItem: (cardId: string, itemId: string, updates: { title?: string; completed?: boolean }) => Promise<boolean>;
  onDeleteChecklistItem: (cardId: string, itemId: string) => Promise<boolean>;
  onReorderChecklistItems: (cardId: string, itemIds: string[]) => Promise<boolean>;
  onArchiveCard?: (cardId: string) => Promise<boolean>;
  onRestoreCard?: (cardId: string) => Promise<boolean>;
  currentUserId: string;
  onLeftBoard: () => void;
  onOwnershipTransferred: () => void;
  /** Live connection state; the indicator only renders while unavailable. */
  connectionStatus?: RealtimeStatus;
  /** Latest remote event (with counter) so open panels can catch up. */
  remoteEventTick?: { n: number; event: BoardRealtimeEvent } | null;
  /** Apply a board template (lists, labels, swimlanes, card types) in one atomic operation. */
  onApplyBoardTemplate?: (boardId: string, snapshot: BoardTemplateSnapshot) => Promise<BoardTemplateResult | null>;
}

function HeaderIconButton({ label, onClick, children, badge }: { label: string; onClick?: () => void; children: React.ReactNode; badge?: number }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            aria-label={label}
            title={label}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
          >
            {children}
            {typeof badge === 'number' && badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: 'var(--kala-coral)' }}>
                {badge}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  onMoveCardToCell,
  onAddSwimlane,
  onRenameSwimlane,
  onDeleteSwimlane,
  onReorderSwimlanes,
  onAddCardType,
  onUpdateCardType,
  onDeleteCardType,
  onReorderCardTypes,
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
  onArchiveCard,
  onRestoreCard,
  currentUserId,
  onLeftBoard,
  onOwnershipTransferred,
  connectionStatus = 'connected',
  remoteEventTick = null,
  onApplyBoardTemplate,
}: BoardViewProps) {
  const canEdit = canEditBoard(board.myRole);
  const { toast } = useToast();
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCard, setAiCard] = useState<{ id: string; title: string } | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isBoardLabelsOpen, setIsBoardLabelsOpen] = useState(false);
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [teamActivity, setTeamActivity] = useState<BoardActivityEntry[]>([]);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [isAddListMenuOpen, setIsAddListMenuOpen] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isAddingSwimlane, setIsAddingSwimlane] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const listInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isArchivedCardsOpen, setIsArchivedCardsOpen] = useState(false);
  const [archivedCards, setArchivedCards] = useState<Card[]>([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [cardToDeletePermanently, setCardToDeletePermanently] = useState<Card | null>(null);
  const [isDeletingPermanently, setIsDeletingPermanently] = useState(false);
  const [restoringCardId, setRestoringCardId] = useState<string | null>(null);

  // Compact member preview for the header avatar stack (read-only, best effort)
  const [memberPreview, setMemberPreview] = useState<BoardMember[]>([]);
  const refreshTeamData = useCallback(() => {
    api.getBoardMembers(board.id).then((d) => setMemberPreview(d.members)).catch(() => {});
    api.getBoardActivity(board.id).then(setTeamActivity).catch(() => {});
  }, [board.id]);
  useEffect(() => {
    let cancelled = false;
    api.getBoardMembers(board.id).then((d) => { if (!cancelled) setMemberPreview(d.members); }).catch(() => {});
    api.getBoardActivity(board.id).then((d) => { if (!cancelled) setTeamActivity(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [board.id]);
  useEffect(() => {
    if (isTeamPanelOpen) refreshTeamData();
  }, [isTeamPanelOpen, refreshTeamData]);

  const handleOpenArchivedCards = async () => {
    setIsArchivedCardsOpen(true);
    setIsLoadingArchived(true);
    try {
      const data = await api.getArchivedCards(board.id);
      setArchivedCards(data);
    } catch (err) {
      console.error('Failed to load archived cards:', err);
    } finally {
      setIsLoadingArchived(false);
    }
  };

  const handleRestoreCard = async (cardId: string) => {
    if (!onRestoreCard) return;
    setRestoringCardId(cardId);
    const ok = await onRestoreCard(cardId);
    setRestoringCardId(null);
    if (ok) setArchivedCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleConfirmPermanentDelete = async () => {
    if (!cardToDeletePermanently) return;
    setIsDeletingPermanently(true);
    const ok = await onDeleteCard(cardToDeletePermanently.id);
    setIsDeletingPermanently(false);
    if (ok) {
      setArchivedCards((prev) => prev.filter((c) => c.id !== cardToDeletePermanently.id));
      setCardToDeletePermanently(null);
    }
  };

  // Keep the team panel in sync with membership and role changes.
  useEffect(() => {
    if (!remoteEventTick) return;
    const { event } = remoteEventTick;
    if (event.type === 'member.added' || event.type === 'member.updated' || event.type === 'member.removed') {
      refreshTeamData();
    }
  }, [remoteEventTick, refreshTeamData]);
  // Keep the open archived-cards panel in sync with collaborators' actions.
  useEffect(() => {
    if (!isArchivedCardsOpen || !remoteEventTick) return;
    const { event } = remoteEventTick;
    if (event.type === 'card.archived') {
      const card = event.data as Card;
      setArchivedCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [card, ...prev]));
    } else if (event.type === 'card.restored') {
      const card = event.data as Card;
      setArchivedCards((prev) => prev.filter((c) => c.id !== card.id));
    } else if (event.type === 'card.deleted') {
      const { cardId } = event.data as { cardId: string };
      setArchivedCards((prev) => prev.filter((c) => c.id !== cardId));
    }
  }, [isArchivedCardsOpen, remoteEventTick]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilterOption>('all');
  // 'all' | 'unassigned' | 'me' | a member's userId
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [cardTypeFilter, setCardTypeFilter] = useState<string>('all');
  const [isCardTypesOpen, setIsCardTypesOpen] = useState(false);
  const [isAddingCardType, setIsAddingCardType] = useState(false);
  const [newCardTypeName, setNewCardTypeName] = useState('');
  const [newCardTypeColor, setNewCardTypeColor] = useState(CARD_TYPE_COLORS[0].hex);

  const assigneeFilterActive = assigneeFilter !== 'all';
  const isMyCardsFilter = assigneeFilter === 'me' || assigneeFilter === currentUserId;
  const filterBadgeCount = selectedLabelIds.length + selectedPriorities.length + (dueDateFilter !== 'all' ? 1 : 0) + (assigneeFilterActive ? 1 : 0) + (cardTypeFilter !== 'all' ? 1 : 0);

  const isFiltered = Boolean(
    searchQuery.trim() || selectedLabelIds.length > 0 || selectedPriorities.length > 0 || dueDateFilter !== 'all' || assigneeFilterActive || cardTypeFilter !== 'all'
  );

  // Reset filters when switching boards
  useEffect(() => {
    setSearchQuery('');
    setSelectedLabelIds([]);
    setSelectedPriorities([]);
    setDueDateFilter('all');
    setAssigneeFilter('all');
    setCardTypeFilter('all');
    setSelectedCardId(null);
  }, [board.id]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSelectedLabelIds([]);
    setSelectedPriorities([]);
    setDueDateFilter('all');
    setAssigneeFilter('all');
    setCardTypeFilter('all');
  };

  const toggleLabelFilter = (labelId: string) => {
    setSelectedLabelIds((prev) => prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]);
  };

  const togglePriorityFilter = (priority: Priority) => {
    setSelectedPriorities((prev) => prev.includes(priority) ? prev.filter((p) => p !== priority) : [...prev, priority]);
  };

  const selectedCard = selectedCardId
    ? board.lists.flatMap((l) => l.cards).find((c) => c.id === selectedCardId) ?? null
    : null;
  const selectedList = selectedCardId
    ? board.lists.find((l) => l.cards.some((c) => c.id === selectedCardId))
    : undefined;

  const filteredLists = useMemo(() => {
    if (!isFiltered) return board.lists;
    const q = searchQuery.trim().toLowerCase();
    return board.lists.map((list) => ({
      ...list,
      cards: list.cards.filter((card) => {
        if (q) {
          const titleMatch = card.title.toLowerCase().includes(q);
          const descMatch = card.description ? card.description.toLowerCase().includes(q) : false;
          if (!titleMatch && !descMatch) return false;
        }
        if (selectedLabelIds.length > 0) {
          if (!card.labels?.some((l) => selectedLabelIds.includes(l.id))) return false;
        }
        if (selectedPriorities.length > 0) {
          if (!card.priority || !selectedPriorities.includes(card.priority)) return false;
        }
        if (dueDateFilter === 'overdue' && !isCardOverdue(card.dueDate)) return false;
        if (dueDateFilter === 'today' && !isCardDueToday(card.dueDate)) return false;
        if (dueDateFilter === 'this_week' && !isCardDueThisWeek(card.dueDate)) return false;
        if (dueDateFilter === 'no_due_date' && card.dueDate) return false;
        if (assigneeFilterActive) {
          if (assigneeFilter === 'unassigned') {
            if (card.assigneeId) return false;
          } else if (card.assigneeId !== (isMyCardsFilter ? currentUserId : assigneeFilter)) return false;
        }
        if (cardTypeFilter === 'none') {
          if (card.cardTypeId) return false;
        } else if (cardTypeFilter !== 'all' && card.cardTypeId !== cardTypeFilter) return false;
        return true;
      }),
    }));
  }, [board.lists, isFiltered, searchQuery, selectedLabelIds, selectedPriorities, dueDateFilter, assigneeFilter, assigneeFilterActive, isMyCardsFilter, cardTypeFilter, currentUserId]);

  const hasSwimlanes = (board.swimlanes?.length ?? 0) > 0;
  const totalCardsCount = useMemo(() => board.lists.reduce((acc, l) => acc + l.cards.length, 0), [board.lists]);
  // Team overview: assigned card count per member, over live board state
  const assigneeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of board.lists) {
      for (const card of list.cards) {
        if (card.assigneeId) counts.set(card.assigneeId, (counts.get(card.assigneeId) ?? 0) + 1);
      }
    }
    return counts;
  }, [board.lists]);
  const unassignedCount = useMemo(
    () => board.lists.reduce((acc, l) => acc + l.cards.filter((c) => !c.assigneeId).length, 0),
    [board.lists]
  );
  const filteredCardsCount = useMemo(() => filteredLists.reduce((acc, l) => acc + l.cards.length, 0), [filteredLists]);

  useEffect(() => {
    if (isAddingList && listInputRef.current) listInputRef.current.focus();
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

  const handleUseTemplate = async (template: ListTemplate) => {
    if (!onApplyBoardTemplate) return;
    setIsCreatingTemplate(true);
    const result = await onApplyBoardTemplate(board.id, toBoardTemplateSnapshot(template));
    setIsCreatingTemplate(false);
    if (!result) return;
    setIsTemplatePickerOpen(false);

    const parts: string[] = [];
    parts.push(describeCount(result.lists.length, 'list'));
    if (result.labels.created.length > 0 || result.labels.existing > 0) {
      parts.push(
        result.labels.existing > 0 && result.labels.created.length > 0
          ? `${result.labels.created.length} new ${pluralize(result.labels.created.length, 'label')}`
          : describeCount(result.labels.created.length + result.labels.existing, 'label')
      );
    }
    if (result.swimlanes.created.length > 0 || result.swimlanes.existing > 0) {
      parts.push(
        result.swimlanes.existing > 0 && result.swimlanes.created.length > 0
          ? `${result.swimlanes.created.length} new ${pluralize(result.swimlanes.created.length, 'swimlane')}`
          : describeCount(result.swimlanes.created.length + result.swimlanes.existing, 'swimlane')
      );
    }
    if (result.cardTypes.created.length > 0 || result.cardTypes.existing > 0) {
      parts.push(
        result.cardTypes.existing > 0 && result.cardTypes.created.length > 0
          ? `${result.cardTypes.created.length} new ${pluralize(result.cardTypes.created.length, 'card type')}`
          : describeCount(result.cardTypes.created.length + result.cardTypes.existing, 'card type')
      );
    }
    const restricted =
      result.swimlanes.restricted > 0 || result.cardTypes.restricted > 0
        ? ' Swimlanes and card types need an admin role.'
        : '';
    toast({ title: 'Template applied', description: `${joinParts(parts)} created.${restricted}` });
  };

  const myRoleMeta = ROLE_META[board.myRole];

  return (
    <div className="flex h-full flex-col bg-[#FAFAF8]">
      {/* ── Board header ─────────────────────────────────── */}
      <header className="border-b bg-white" style={{ borderColor: 'var(--kala-line)' }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          {/* Left: sidebar toggle + breadcrumb */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <HeaderIconButton label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} onClick={onToggleSidebar}>
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </HeaderIconButton>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="hidden shrink-0 text-muted-foreground sm:inline">{board.workspace?.name}</span>
              <span className="hidden shrink-0 text-muted-foreground/50 sm:inline" aria-hidden>/</span>
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{board.name}</h1>
            </nav>
            {!canEdit ? (
              <Badge variant="secondary" className="shrink-0 text-[11px] font-medium">View only</Badge>
            ) : (
              <span className="hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground md:inline-flex" style={{ borderColor: 'var(--kala-line)' }} title={myRoleMeta.description}>
                <myRoleMeta.icon className="h-3 w-3" aria-hidden />
                {myRoleMeta.label}
              </span>
            )}
            {connectionStatus !== 'connected' && (
              <span
                role="status"
                aria-label={connectionStatus === 'offline' ? 'Offline. Changes will sync when reconnected.' : 'Reconnecting to live updates.'}
                title={connectionStatus === 'offline' ? 'Offline - working locally. The board will sync when the connection returns.' : 'Reconnecting to live updates...'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E8D9B8] bg-[#FAF3E2] px-2 py-0.5 text-[11px] font-medium text-[#7A5F1F]"
              >
                <span className="relative flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D9A03F] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#D9A03F]" />
                </span>
                {connectionStatus === 'offline' ? 'Offline' : 'Reconnecting'}
              </span>
            )}
          </div>

          {/* Right: grouped actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Search — immediately accessible */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cards..."
                aria-label="Search cards"
                className="h-8 w-44 bg-white pl-8 pr-12 text-[13px] lg:w-60"
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="kala-kbd pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex" aria-hidden>/</kbd>
              )}
            </div>

            {/* Filters */}
            <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  aria-label={filterBadgeCount > 0 ? `Filters, ${filterBadgeCount} active` : 'Open filters'}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-[13px] transition-colors hover:bg-muted/60',
                    filterBadgeCount > 0 ? 'border-[#CE6F51]/50 font-medium text-[#9A4A30]' : 'text-muted-foreground hover:text-foreground'
                  )}
                  style={{ borderColor: filterBadgeCount > 0 ? '#E3BBA9' : 'var(--kala-line)' }}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">Filters</span>
                  {filterBadgeCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: 'var(--kala-coral)' }}>
                      {filterBadgeCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3" sideOffset={8}>
                <div className="mb-2 flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--kala-line)' }}>
                  <h4 className="kala-section-label">Filters</h4>
                  {filterBadgeCount > 0 && (
                    <button type="button" onClick={() => { setSelectedLabelIds([]); setSelectedPriorities([]); setDueDateFilter('all'); setAssigneeFilter('all'); setCardTypeFilter('all'); }} className="text-xs font-medium text-[#9A4A30] hover:underline">
                      Reset
                    </button>
                  )}
                </div>
                <div className="mb-3 space-y-0.5">
                  <p className="kala-section-label px-1 pb-1">Assignee</p>
                  <button
                    type="button"
                    onClick={() => setAssigneeFilter('all')}
                    aria-pressed={assigneeFilter === 'all'}
                    className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', assigneeFilter === 'all' ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                  >
                    <span>Everyone</span>
                    {assigneeFilter === 'all' && <Check className="h-3.5 w-3.5 text-[#7FA693]" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigneeFilter('unassigned')}
                    aria-pressed={assigneeFilter === 'unassigned'}
                    className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', assigneeFilter === 'unassigned' ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                  >
                    <span>Unassigned</span>
                    {assigneeFilter === 'unassigned' && <Check className="h-3.5 w-3.5 text-[#7FA693]" aria-hidden />}
                  </button>
                  {memberPreview.map((member) => {
                    const selected = assigneeFilter === member.userId || (isMyCardsFilter && member.userId === currentUserId);
                    return (
                      <button
                        key={member.userId}
                        type="button"
                        onClick={() => setAssigneeFilter(member.userId)}
                        aria-pressed={selected}
                        className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', selected ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <MemberAvatar person={member} size="sm" />
                          <span className="truncate">{displayName(member)}</span>
                        </span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#7FA693]" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
                <div className="mb-3 space-y-0.5">
                  <p className="kala-section-label px-1 pb-1">Type</p>
                  <button
                    type="button"
                    onClick={() => setCardTypeFilter('all')}
                    aria-pressed={cardTypeFilter === 'all'}
                    className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', cardTypeFilter === 'all' ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                  >
                    <span>All Types</span>
                    {cardTypeFilter === 'all' && <Check className="h-3.5 w-3.5 text-[#7FA693]" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardTypeFilter('none')}
                    aria-pressed={cardTypeFilter === 'none'}
                    className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', cardTypeFilter === 'none' ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                  >
                    <span className="italic text-muted-foreground">No type</span>
                    {cardTypeFilter === 'none' && <Check className="h-3.5 w-3.5 text-[#7FA693]" aria-hidden />}
                  </button>
                  {(board.cardTypes || []).map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setCardTypeFilter(ct.id)}
                      aria-pressed={cardTypeFilter === ct.id}
                      className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', cardTypeFilter === ct.id ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ct.color }} aria-hidden />
                        <span className="truncate">{ct.name}</span>
                      </span>
                      {cardTypeFilter === ct.id && <Check className="h-3.5 w-3.5 shrink-0 text-[#7FA693]" aria-hidden />}
                    </button>
                  ))}
                </div>
                <div className="mb-3 space-y-0.5">
                  <p className="kala-section-label px-1 pb-1">Due date</p>
                  {DUE_DATE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDueDateFilter(opt.id)}
                      aria-pressed={dueDateFilter === opt.id}
                      className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors', dueDateFilter === opt.id ? 'bg-[#F2F0EB] font-medium text-foreground' : 'text-foreground hover:bg-muted/70')}
                    >
                      <span>{opt.label}</span>
                      {dueDateFilter === opt.id && <Check className="h-3.5 w-3.5 text-[#7FA693]" aria-hidden />}
                    </button>
                  ))}
                </div>
                <div className="mb-3 space-y-0.5">
                  <p className="kala-section-label px-1 pb-1">Priority</p>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-muted/70">
                      <Checkbox checked={selectedPriorities.includes(opt.id)} onCheckedChange={() => togglePriorityFilter(opt.id)} aria-label={`Filter by ${opt.label} priority`} />
                      <Flag className="h-3 w-3 text-muted-foreground" aria-hidden />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <p className="kala-section-label px-1 pb-1">Labels</p>
                  {(board.labels || []).length > 0 ? (
                    <div className="max-h-36 space-y-0.5 overflow-y-auto pr-1">
                      {(board.labels || []).map((label) => (
                        <label key={label.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-muted/70">
                          <Checkbox checked={selectedLabelIds.includes(label.id)} onCheckedChange={() => toggleLabelFilter(label.id)} aria-label={`Filter by label ${label.name}`} />
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                          <span className="truncate">{label.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="px-2 py-1 text-xs text-muted-foreground">No labels on this board</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* My Cards quick select */}
            <div className="hidden items-center gap-0.5 rounded-md border bg-white p-0.5 md:inline-flex" style={{ borderColor: 'var(--kala-line)' }} role="group" aria-label="Card selection">
              {(['all', 'me', 'unassigned'] as const).map((key) => {
                const active = key === 'all' ? assigneeFilter === 'all' : key === 'me' ? isMyCardsFilter : assigneeFilter === 'unassigned';
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAssigneeFilter(key)}
                    className={cn(
                      'inline-flex h-7 items-center rounded-[5px] px-2.5 text-[12px] font-medium transition-colors',
                      active ? 'bg-[#F2F0EB] text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {key === 'all' ? 'All' : key === 'me' ? 'My Cards' : 'Unassigned'}
                  </button>
                );
              })}
            </div>

            <span className="mx-0.5 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />

            {/* Members + Share */}
            {memberPreview.length > 0 && (
              <button onClick={() => setIsMembersOpen(true)} className="hidden rounded-md p-1 hover:bg-muted/60 md:block" aria-label="View members" title="View members">
                <AvatarStack people={memberPreview} max={4} />
              </button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiOpen((open) => !open)}
              aria-pressed={aiOpen}
              className={cn('h-8 gap-1.5 bg-white px-3 text-[13px]', aiOpen && 'bg-[#F6E4DC] hover:bg-[#F6E4DC]')}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--kala-coral-strong)' }} aria-hidden />
              Kala AI
            </Button>
            <Button size="sm" onClick={() => setIsMembersOpen(true)} className="h-8 gap-1.5 bg-[#2A2F36] px-3 text-[13px] text-white hover:bg-[#1E2329]">
              <Users className="h-3.5 w-3.5" aria-hidden />
              Share
            </Button>

            <HeaderIconButton label={`Team (${memberPreview.length})`} onClick={() => setIsTeamPanelOpen(true)}>
              <Users className="h-4 w-4" />
            </HeaderIconButton>
            <HeaderIconButton label={`Board labels (${board.labels?.length ?? 0})`} onClick={() => setIsBoardLabelsOpen(true)}>
              <Tag className="h-4 w-4" />
            </HeaderIconButton>
            <HeaderIconButton label={`Card types (${board.cardTypes?.length ?? 0})`} onClick={() => setIsCardTypesOpen(true)}>
              <Layers className="h-4 w-4" />
            </HeaderIconButton>

            <DropdownMenu>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <DropdownMenuTrigger asChild>
                    <TooltipTrigger asChild>
                      <button
                        aria-label="Board menu"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </button>
                    </TooltipTrigger>
                  </DropdownMenuTrigger>
                  <TooltipContent side="bottom" className="text-xs">Board menu</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setIsBoardLabelsOpen(true)} className="cursor-pointer text-[13px]">
                  <Tag className="mr-2 h-3.5 w-3.5" /> Manage labels ({board.labels?.length ?? 0})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsCardTypesOpen(true)} className="cursor-pointer text-[13px]">
                  <Layers className="mr-2 h-3.5 w-3.5" /> Card types ({board.cardTypes?.length ?? 0})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleOpenArchivedCards} className="cursor-pointer text-[13px]">
                  <Archive className="mr-2 h-3.5 w-3.5" /> Archived cards
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active filters — always visible when set, with Clear */}
        {isFiltered && (
          <div className="flex flex-wrap items-center gap-1.5 border-t bg-[#F5F4F1] px-4 py-2 text-xs" style={{ borderColor: 'var(--kala-line)' }} role="status" aria-label="Active filters">
            <span className="mr-1 font-medium text-muted-foreground">Active:</span>
            {searchQuery.trim() && (
              <Badge variant="secondary" className="gap-1 bg-white py-0.5 pr-1 text-xs font-normal">
                <Search className="h-3 w-3 text-muted-foreground" aria-hidden />
                <span>&ldquo;{searchQuery.trim()}&rdquo;</span>
                <button type="button" onClick={() => setSearchQuery('')} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label="Remove search filter"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {dueDateFilter !== 'all' && (
              <Badge variant="secondary" className="gap-1 bg-white py-0.5 pr-1 text-xs font-normal">
                <CalendarIcon className="h-3 w-3 text-muted-foreground" aria-hidden />
                <span>{DUE_DATE_OPTIONS.find((o) => o.id === dueDateFilter)?.label}</span>
                <button type="button" onClick={() => setDueDateFilter('all')} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label="Remove due date filter"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {selectedPriorities.map((priority) => (
              <Badge key={priority} variant="secondary" className="gap-1 bg-white py-0.5 pr-1 text-xs font-normal">
                <Flag className="h-3 w-3 text-muted-foreground" aria-hidden />
                <span>{priority.charAt(0) + priority.slice(1).toLowerCase()}</span>
                <button type="button" onClick={() => setSelectedPriorities((prev) => prev.filter((p) => p !== priority))} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${priority} priority filter`}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            {selectedLabelIds.map((labelId) => {
              const label = (board.labels || []).find((l) => l.id === labelId);
              if (!label) return null;
              return (
                <Badge key={labelId} variant="secondary" className="gap-1.5 bg-white py-0.5 pr-1 text-xs font-normal">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                  <span>{label.name}</span>
                  <button type="button" onClick={() => setSelectedLabelIds((prev) => prev.filter((id) => id !== labelId))} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove label ${label.name} filter`}><X className="h-3 w-3" /></button>
                </Badge>
              );
            })}
            <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="h-6 px-2 text-xs font-medium text-[#9A4A30] hover:bg-[#F6E4DC] hover:text-[#9A4A30]">
              Clear filters
            </Button>
            <span className="ml-auto text-muted-foreground">Showing {filteredCardsCount} of {totalCardsCount} cards</span>
          </div>
        )}
      </header>

      {/* ── Board canvas + Kala AI panel ───────────────── */}
      <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden" role="region" aria-label={`Cards for board ${board.name}`}>
        {board.lists.length === 0 && !isFiltered ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="kala-card w-full max-w-md p-2">
              <EmptyState
                icon={<LayoutGrid className="h-5 w-5" />}
                title={canEdit ? 'This board is empty' : 'No lists on this board'}
                description={canEdit ? 'Add your first list or start from a proven template with lists, labels, swimlanes and card types. Typical flow: To do, In progress, Done.' : 'There are no lists to show yet.'}
                action={canEdit ? (
                  isAddingList ? (
                    <div className="flex w-72 items-center gap-2">
                      <Input ref={listInputRef} value={newListTitle} onChange={(e) => setNewListTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddList(); if (e.key === 'Escape') { setIsAddingList(false); setNewListTitle(''); } }}
                        placeholder="Enter list title..." aria-label="New list title" className="h-9 bg-white text-sm" />
                      <Button size="sm" onClick={handleAddList} className="h-9 bg-[#2A2F36] text-white hover:bg-[#1E2329]">Add</Button>
                    </div>
                  ) : onApplyBoardTemplate ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button onClick={() => setIsAddingList(true)} className="gap-1.5 bg-[#2A2F36] text-white hover:bg-[#1E2329]">
                        <Plus className="h-4 w-4" aria-hidden /> Add your first list
                      </Button>
                      <Button variant="outline" onClick={() => setIsTemplatePickerOpen(true)} className="gap-1.5 bg-white">
                        <LayoutTemplate className="h-4 w-4" aria-hidden /> Use a template
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => setIsAddingList(true)} className="gap-1.5 bg-[#2A2F36] text-white hover:bg-[#1E2329]">
                      <Plus className="h-4 w-4" aria-hidden /> Add your first list
                    </Button>
                  )
                ) : undefined}
              />
            </div>
          </div>
        ) : isFiltered && filteredCardsCount === 0 ? (
          <div className="flex h-full items-start justify-center overflow-y-auto p-8">
            <div className="flex w-full max-w-3xl flex-col gap-3">
              <div className="kala-card">
                <EmptyState
                  icon={<SearchX className="h-5 w-5" />}
                  title={
                    searchQuery.trim()
                      ? `No results for "${searchQuery.trim()}"`
                      : assigneeFilter === 'unassigned'
                        ? 'There are no unassigned cards'
                        : isMyCardsFilter
                          ? 'You have no assigned cards'
                          : memberPreview.some((m) => m.userId === assigneeFilter)
                            ? 'This team member has no assigned cards'
                            : 'No cards match these filters'
                  }
                  description="Try a different keyword, remove a filter, or clear everything to see the full board."
                  action={<Button variant="outline" size="sm" onClick={handleClearAllFilters} className="bg-white">Clear filters</Button>}
                />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 opacity-60" aria-hidden>
                {filteredLists.slice(0, 4).map((list) => (
                  <div key={list.id} className="kala-list w-72 shrink-0 rounded-xl p-2.5">
                    <p className="px-1 py-1 text-[13px] font-semibold text-foreground">{list.title}</p>
                    <p className="px-1 pb-1 text-xs text-muted-foreground">No matching cards</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : hasSwimlanes ? (
          <div className="h-full overflow-x-auto overflow-y-auto p-4">
            <SwimlaneBoard
              swimlanes={board.swimlanes || []}
              lists={filteredLists}
              canEdit={canEdit}
              canManage={canManageBoard(board.myRole)}
              onDeleteCard={onDeleteCard}
              onEditCard={onEditCard}
              onOpenCard={(c) => setSelectedCardId(c.id)}
              onAddCard={onAddCard}
              onMoveCard={onMoveCardToCell}
              onAddSwimlane={onAddSwimlane}
              onRenameSwimlane={onRenameSwimlane}
              onDeleteSwimlane={onDeleteSwimlane}
              onReorderSwimlanes={onReorderSwimlanes}
              isFiltered={isFiltered}
            />
          </div>
        ) : (
          <div className="flex h-full items-start gap-3 overflow-y-hidden p-4">
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
                readOnly={!canEdit}
              />
            ))}
            {canEdit && (
              <div className="w-72 shrink-0">
                {isAddingList ? (
                  <div className="kala-list rounded-xl p-2.5">
                    <Input
                      ref={listInputRef}
                      value={newListTitle}
                      onChange={(e) => setNewListTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddList();
                        if (e.key === 'Escape') { setIsAddingList(false); setNewListTitle(''); }
                      }}
                      placeholder="Enter list title..."
                      aria-label="New list title"
                      className="h-9 border bg-white text-sm"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" onClick={handleAddList} className="h-8 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]">Add list</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Cancel adding list" onClick={() => { setIsAddingList(false); setNewListTitle(''); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : onApplyBoardTemplate ? (
                  <Popover open={isAddListMenuOpen} onOpenChange={setIsAddListMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        aria-label="Add list"
                        aria-haspopup="menu"
                        className="flex w-full items-center gap-1.5 rounded-xl border border-dashed bg-white/60 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
                        style={{ borderColor: 'var(--kala-line)' }}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        Add another list
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-1.5" sideOffset={6}>
                      <p className="kala-section-label px-2 pb-1 pt-1">Add list</p>
                      <button
                        onClick={() => {
                          setIsAddListMenuOpen(false);
                          setIsAddingList(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#2A2F36] text-white" aria-hidden>
                          <Plus className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-foreground">Blank list</span>
                          <span className="block truncate text-[11px] text-muted-foreground">Start empty</span>
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setIsAddListMenuOpen(false);
                          setIsTemplatePickerOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F6E4DC] text-[#9A4A30]" aria-hidden>
                          <LayoutTemplate className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-foreground">Use a template</span>
                          <span className="block truncate text-[11px] text-muted-foreground">Simple, Project, Sprint and more</span>
                        </span>
                      </button>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <button
                    onClick={() => setIsAddingList(true)}
                    className="flex w-full items-center gap-1.5 rounded-xl border border-dashed bg-white/60 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
                    style={{ borderColor: 'var(--kala-line)' }}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add another list
                  </button>
                )}
              </div>
            )}
            {canManageBoard(board.myRole) && !hasSwimlanes && (
              <div className="w-72 shrink-0">
                <button
                  onClick={() => setIsAddingSwimlane(true)}
                  className="flex w-full items-center gap-1.5 rounded-xl border border-dashed bg-white/60 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
                  style={{ borderColor: 'var(--kala-line)' }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add swimlane
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <NameDialog
        open={isAddingSwimlane}
        onOpenChange={setIsAddingSwimlane}
        title="Add swimlane"
        description="A swimlane is a horizontal row across the lists of this board. Existing cards stay in the Unassigned row until you move them."
        label="Swimlane name"
        placeholder="e.g. Features, Bugs, Improvements"
        confirmLabel="Add swimlane"
        onSubmit={async (name) => { await onAddSwimlane(name); }}
      />
      {/* key: a different board starts a fresh conversation */}
      <AiPanel
        key={board.id}
        open={aiOpen}
        boardId={board.id}
        boardName={board.name}
        card={aiCard}
        onClearCard={() => setAiCard(null)}
        onClose={() => setAiOpen(false)}
      />
      </div>

      <CardDetailModal
        card={selectedCard}
        listTitle={selectedList?.title}
        boardLabels={board.labels || []}
        boardCardTypes={board.cardTypes || []}
        boardMembers={memberPreview}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCardId(null)}
        onUpdateCard={onUpdateCard}
        onDeleteCard={async (cardId) => {
          const ok = await onDeleteCard(cardId);
          if (ok) setSelectedCardId(null);
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
        onArchiveCard={onArchiveCard}
        readOnly={!canEdit}
        onAskAi={(c) => {
          setSelectedCardId(null);
          setAiCard({ id: c.id, title: c.title });
          setAiOpen(true);
        }}
      />

      <ListTemplatePicker
        open={isTemplatePickerOpen}
        onOpenChange={setIsTemplatePickerOpen}
        creating={isCreatingTemplate}
        onUseTemplate={handleUseTemplate}
      />

      <MembersDialog
        boardId={board.id}
        boardName={board.name}
        open={isMembersOpen}
        onOpenChange={setIsMembersOpen}
        currentUserId={currentUserId}
        onLeft={onLeftBoard}
        onOwnershipTransferred={onOwnershipTransferred}
      />

      <Dialog open={isTeamPanelOpen} onOpenChange={setIsTeamPanelOpen}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Team</DialogTitle>
            <DialogDescription>
              Everyone on this board, their role and assigned cards. Click a member to filter the board by their cards.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-3 overflow-y-auto py-1 pr-1">
            <div className="space-y-1.5">
              {[...memberPreview]
                .sort((a, b) => (assigneeCounts.get(b.userId) ?? 0) - (assigneeCounts.get(a.userId) ?? 0) || displayName(a).localeCompare(displayName(b)))
                .map((member) => {
                  const RoleIcon = ROLE_META[member.role].icon;
                  return (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-white p-2 pl-2.5"
                      style={{ borderColor: 'var(--kala-line)' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAssigneeFilter(member.userId);
                          setIsTeamPanelOpen(false);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none"
                        aria-label={`Filter by ${displayName(member)}, ${assigneeCounts.get(member.userId) ?? 0} assigned cards`}
                      >
                        <MemberAvatar person={member} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-foreground">{displayName(member)}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{member.email}</span>
                        </span>
                      </button>
                      <span
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-muted px-2 text-[10px] font-semibold uppercase tracking-wide text-foreground"
                        title={ROLE_META[member.role].description}
                      >
                        <RoleIcon className="h-3 w-3 text-muted-foreground" aria-hidden />
                        {ROLE_META[member.role].label}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAssigneeFilter(member.userId);
                          setIsTeamPanelOpen(false);
                        }}
                        className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/70"
                        aria-label={`${assigneeCounts.get(member.userId) ?? 0} cards assigned to ${displayName(member)}. Filter by ${displayName(member)}`}
                      >
                        {assigneeCounts.get(member.userId) ?? 0} cards
                      </button>
                    </div>
                  );
                })}
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter('unassigned');
                setIsTeamPanelOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg border bg-white p-2 pl-2.5 text-left transition-colors hover:bg-muted/50"
              style={{ borderColor: 'var(--kala-line)' }}
              aria-label={`Filter by unassigned, ${unassignedCount} cards`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground" aria-hidden>—</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">Unassigned</span>
                  <span className="block text-[11px] text-muted-foreground">Cards without an assignee</span>
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
                {unassignedCount} cards
              </span>
            </button>
            </div>
            {teamActivity.length > 0 && (
              <section aria-label="Recent team activity" className="space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--kala-line)' }}>
                <h3 className="kala-section-label px-1 pb-1">Recent team activity</h3>
                <ul className="space-y-1">
                  {teamActivity.map((entry) => {
                    const meta = (entry.metadata ?? {}) as { memberName?: string; role?: string; swimlaneName?: string; cardTypeName?: string };
                    const roleLabel = meta.role ? ROLE_META[meta.role as BoardRole]?.label ?? meta.role : null;
                    const text =
                      entry.type === 'member.joined'
                        ? `${meta.memberName ?? 'Someone'} joined the board${roleLabel ? ` as ${roleLabel}` : ''}`
                        : entry.type === 'member.role_changed'
                          ? `${meta.memberName ?? 'Someone'} is now ${roleLabel ?? 'a member'}`
                          : entry.type === 'member.removed'
                            ? `${meta.memberName ?? 'Someone'} was removed from the board`
                            : entry.type === 'member.left'
                              ? `${meta.memberName ?? 'Someone'} left the board`
                              : entry.type === 'member.ownership_transferred'
                                ? `Ownership was transferred to ${meta.memberName ?? 'a new owner'}`
                                : entry.type === 'swimlane.created'
                                  ? `Swimlane ${meta.swimlaneName ?? ''} was created`.trim()
                                  : entry.type === 'swimlane.renamed'
                                    ? `Swimlane was renamed to ${meta.swimlaneName ?? ''}`.trim()
                                    : entry.type === 'swimlane.deleted'
                                      ? `Swimlane ${meta.swimlaneName ?? ''} was deleted`.trim()
                                      : entry.type === 'swimlane.reordered'
                                        ? 'Swimlanes were reordered'
                                        : entry.type === 'card_type.created'
                                          ? `Card type ${meta.cardTypeName ?? ''} was created`.trim()
                                          : entry.type === 'card_type.renamed'
                                            ? `Card type was renamed to ${meta.cardTypeName ?? ''}`.trim()
                                            : entry.type === 'card_type.reordered'
                                              ? 'Card types were reordered'
                                              : entry.type === 'card_type.deleted'
                                                ? `Card type ${meta.cardTypeName ?? ''} was deleted`.trim()
                                                : null;
                    if (!text) return null;
                    return (
                      <li key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F5F4F1] px-3 py-1.5 text-[12px]">
                        <span className="min-w-0 truncate text-muted-foreground">{text}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground/70">{format(new Date(entry.createdAt), 'MMM d, HH:mm')}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {canManageBoard(board.myRole) && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full gap-1.5 bg-white text-xs"
                onClick={() => {
                  setIsTeamPanelOpen(false);
                  setIsMembersOpen(true);
                }}
              >
                <Users className="h-3.5 w-3.5" aria-hidden />
                Manage team — invite, roles and removal
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBoardLabelsOpen} onOpenChange={setIsBoardLabelsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Board labels</DialogTitle>
            <DialogDescription>Labels help you categorize cards. Open any card to create or assign them.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {(board.labels || []).map((label) => (
              <div key={label.id} className="flex items-center justify-between rounded-lg border bg-white p-2 pl-2.5" style={{ borderColor: 'var(--kala-line)' }}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                  <span className="text-[13px] font-medium text-foreground">{label.name}</span>
                </span>
                {onDeleteLabel && canEdit && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => onDeleteLabel(label.id)} aria-label={`Delete label ${label.name}`}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {(board.labels || []).length === 0 && (
              <EmptyState compact icon={<Tag className="h-4 w-4" />} title="No labels yet" description="Open any card and choose Manage labels to create your first one." />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isCardTypesOpen} onOpenChange={setIsCardTypesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Card types</DialogTitle>
            <DialogDescription>Types describe what a card is, e.g. Task, Feature or Bug. Each card has at most one type.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {(board.cardTypes || []).map((ct, i) => (
              <div key={ct.id} className="flex items-center justify-between rounded-lg border bg-white p-2 pl-2.5" style={{ borderColor: 'var(--kala-line)' }}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  {canManageBoard(board.myRole) && onReorderCardTypes && board.cardTypes && board.cardTypes.length > 1 ? (
                    <span className="flex flex-col">
                      <button
                        type="button"
                        className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                        disabled={i === 0}
                        aria-label={`Move ${ct.name} up`}
                        onClick={() => {
                          const ids = (board.cardTypes || []).map((t) => t.id);
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          onReorderCardTypes(ids);
                        }}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                        disabled={i === (board.cardTypes?.length ?? 0) - 1}
                        aria-label={`Move ${ct.name} down`}
                        onClick={() => {
                          const ids = (board.cardTypes || []).map((t) => t.id);
                          [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                          onReorderCardTypes(ids);
                        }}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </span>
                  ) : null}
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: ct.color }} aria-hidden />
                  {canManageBoard(board.myRole) && onUpdateCardType ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                      <input
                        defaultValue={ct.name}
                        aria-label={`Rename card type ${ct.name}`}
                        className="w-28 rounded border-none bg-transparent text-[13px] font-medium text-foreground outline-none focus:underline"
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== ct.name) onUpdateCardType(ct.id, { name });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                      {CARD_TYPE_COLORS.slice(0, 5).map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => onUpdateCardType(ct.id, { color: c.hex })}
                          aria-label={`Set ${ct.name} color to ${c.name}`}
                          className={cn('h-4 w-4 rounded-full transition-transform', ct.color === c.hex ? 'scale-110 ring-2 ring-offset-1 ring-[#2A2F36]' : 'hover:scale-110 opacity-70')}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="truncate text-[13px] font-medium text-foreground">{ct.name}</span>
                  )}
                </span>
                {canManageBoard(board.myRole) && onDeleteCardType && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDeleteCardType(ct.id)}
                    aria-label={`Delete card type ${ct.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {(board.cardTypes || []).length === 0 && (
              <EmptyState compact icon={<Layers className="h-4 w-4" />} title="No card types yet" description="Add your first type below. Cards without a type keep working as before." />
            )}
            {canManageBoard(board.myRole) && onAddCardType && (
              <>
                {isAddingCardType ? (
                  <div className="space-y-2 rounded-lg border bg-[#FAFAF8] p-2.5" style={{ borderColor: 'var(--kala-line)' }}>
                    <Input
                      value={newCardTypeName}
                      onChange={(e) => setNewCardTypeName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newCardTypeName.trim()) {
                          const ok = await onAddCardType(newCardTypeName.trim(), newCardTypeColor);
                          if (ok) { setIsAddingCardType(false); setNewCardTypeName(''); }
                        }
                        if (e.key === 'Escape') { setIsAddingCardType(false); setNewCardTypeName(''); }
                      }}
                      placeholder="Type name, e.g. Task"
                      aria-label="New card type name"
                      className="h-8 bg-white text-[13px]"
                      autoFocus
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {CARD_TYPE_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setNewCardTypeColor(c.hex)}
                          aria-label={`Color ${c.name}`}
                          aria-pressed={newCardTypeColor === c.hex}
                          className={cn('h-5 w-5 rounded-full transition-transform', newCardTypeColor === c.hex ? 'scale-110 ring-2 ring-offset-2 ring-[#2A2F36]' : 'hover:scale-105')}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={!newCardTypeName.trim()}
                        onClick={async () => {
                          const ok = await onAddCardType(newCardTypeName.trim(), newCardTypeColor);
                          if (ok) { setIsAddingCardType(false); setNewCardTypeName(''); }
                        }}
                        className="h-7 bg-[#2A2F36] px-3 text-xs text-white hover:bg-[#1E2329]"
                      >
                        Add type
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setIsAddingCardType(false); setNewCardTypeName(''); }} className="h-7 px-2.5 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsAddingCardType(true)} className="h-8 w-full gap-1.5 bg-white text-xs">
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add card type
                    </Button>
                    {(board.cardTypes || []).length === 0 && (
                      <div>
                        <p className="kala-section-label px-1 pb-1">Suggestions</p>
                        <div className="flex flex-wrap gap-1.5">
                          {SUGGESTED_CARD_TYPES.map((name) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => onAddCardType(name, CARD_TYPE_COLORS[SUGGESTED_CARD_TYPES.indexOf(name) % CARD_TYPE_COLORS.length].hex)}
                              className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
                              style={{ borderColor: 'var(--kala-line)' }}
                            >
                              <Plus className="h-3 w-3" aria-hidden /> {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isArchivedCardsOpen} onOpenChange={setIsArchivedCardsOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" aria-hidden />
              Archived cards
            </DialogTitle>
            <DialogDescription>Archived cards are hidden from the board until you restore them.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-y-auto py-2 pr-1">
            {isLoadingArchived ? (
              <div className="space-y-2" aria-label="Loading archived cards">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-lg border p-3" style={{ borderColor: 'var(--kala-line)' }}>
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </div>
                ))}
              </div>
            ) : archivedCards.length === 0 ? (
              <EmptyState icon={<Archive className="h-5 w-5" />} title="No archived cards" description="Cards you archive from this board will appear here." />
            ) : (
              archivedCards.map((card) => (
                <div key={card.id} className="rounded-lg border bg-white p-3" style={{ borderColor: 'var(--kala-line)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="break-words text-sm font-medium leading-snug text-foreground">{card.title}</h4>
                      <p className="text-xs text-muted-foreground">List: <span className="font-medium text-foreground/80">{card.list?.title || 'Unknown list'}</span></p>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleRestoreCard(card.id)} disabled={restoringCardId === card.id} className="h-7 gap-1 bg-white px-2 text-xs" aria-label={`Restore ${card.title}`}>
                          <RotateCcw className="h-3 w-3" aria-hidden />
                          <span>{restoringCardId === card.id ? 'Restoring...' : 'Restore'}</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setCardToDeletePermanently(card)} className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Permanently delete ${card.title}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {(card.labels?.length || card.priority || card.dueDate) ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: 'var(--kala-line)' }}>
                      {card.labels?.map((label) => (
                        <span key={label.id} style={{ backgroundColor: label.color }} className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white">{label.name}</span>
                      ))}
                      {card.priority && (
                        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Flag className="h-2.5 w-2.5" aria-hidden />
                          {card.priority.charAt(0) + card.priority.slice(1).toLowerCase()}
                        </span>
                      )}
                      {card.dueDate && (
                        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <CalendarIcon className="h-2.5 w-2.5" aria-hidden />
                          Due: {format(new Date(card.dueDate), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cardToDeletePermanently} onOpenChange={(open) => !isDeletingPermanently && !open && setCardToDeletePermanently(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete card?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{cardToDeletePermanently?.title}&rdquo; will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPermanently}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmPermanentDelete(); }}
              disabled={isDeletingPermanently}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingPermanently ? 'Deleting...' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export type { Card };
