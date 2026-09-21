import { useState, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Flag,
  Trash2,
  X,
  Check,
  AlignLeft,
  Layers,
  AlertCircle,
  CalendarCheck,
  Tag,
  CheckSquare,
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Archive,
} from 'lucide-react';
import { format, isToday } from 'date-fns';
import type { Card, ChecklistItem, Label, Priority } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const LABEL_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Teal', hex: '#06b6d4' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Slate', hex: '#64748b' },
];

interface CardDetailModalProps {
  card: Card | null;
  listTitle?: string;
  boardLabels: Label[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateCard: (cardId: string, updates: Partial<Card>) => Promise<boolean>;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onArchiveCard?: (cardId: string) => Promise<boolean>;
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

export function CardDetailModal({
  card,
  listTitle,
  boardLabels,
  isOpen,
  onClose,
  onUpdateCard,
  onDeleteCard,
  onArchiveCard,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  onAddLabelToCard,
  onRemoveLabelFromCard,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onReorderChecklistItems,
}: CardDetailModalProps) {
  // Local state for editing fields
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [description, setDescription] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [priority, setPriority] = useState<Priority | 'NONE'>('NONE');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  // Status & confirmation
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Labels Popover state
  const [isLabelsPopoverOpen, setIsLabelsPopoverOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');
  const [labelMode, setLabelMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelNameInput, setLabelNameInput] = useState('');
  const [labelColorInput, setLabelColorInput] = useState(LABEL_COLORS[0].hex);

  // Checklist state
  const [newItemTitle, setNewItemTitle] = useState('');
  const [isAddingChecklistItem, setIsAddingChecklistItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const editItemInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state when card changes or modal opens
  useEffect(() => {
    if (card && isOpen) {
      setTitle(card.title);
      setDescription(card.description || '');
      setPriority(card.priority || 'NONE');
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
      setIsEditingTitle(false);
      setIsEditingDescription(false);
      setSaveStatus('idle');
      setLabelMode('list');
      setLabelSearch('');
      setIsAddingChecklistItem(false);
      setEditingItemId(null);
    }
  }, [card, isOpen]);

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Focus description textarea when editing starts
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [isEditingDescription]);

  // Focus new checklist item input
  useEffect(() => {
    if (isAddingChecklistItem && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [isAddingChecklistItem]);

  // Focus editing checklist item input
  useEffect(() => {
    if (editingItemId && editItemInputRef.current) {
      editItemInputRef.current.focus();
      editItemInputRef.current.select();
    }
  }, [editingItemId]);

  const triggerSaveIndicator = (status: 'saved' | 'error') => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus(status);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('idle');
    }, 2500);
  };

  if (!card) return null;

  // Title save
  const handleSaveTitle = async () => {
    const trimmed = title.trim();
    setIsEditingTitle(false);

    if (!trimmed) {
      setTitle(card.title);
      return;
    }

    if (trimmed === card.title) return;

    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { title: trimmed });
    if (success) {
      triggerSaveIndicator('saved');
    } else {
      setTitle(card.title);
      triggerSaveIndicator('error');
    }
  };

  // Description save
  const handleSaveDescription = async () => {
    const trimmed = description.trim();
    setIsEditingDescription(false);

    const newDesc = trimmed.length > 0 ? trimmed : null;
    if (newDesc === card.description) return;

    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { description: newDesc });
    if (success) {
      triggerSaveIndicator('saved');
    } else {
      setDescription(card.description || '');
      triggerSaveIndicator('error');
    }
  };

  const handleCancelDescription = () => {
    setDescription(card.description || '');
    setIsEditingDescription(false);
  };

  // Priority change
  const handlePriorityChange = async (val: string) => {
    const newPriority = val === 'NONE' ? null : (val as Priority);
    setPriority((val as Priority) || 'NONE');

    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { priority: newPriority });
    if (success) {
      triggerSaveIndicator('saved');
    } else {
      setPriority(card.priority || 'NONE');
      triggerSaveIndicator('error');
    }
  };

  // Due date change
  const handleDateSelect = async (selected: Date | undefined) => {
    setDueDate(selected);
    setIsCalendarOpen(false);

    const isoString = selected ? selected.toISOString() : null;
    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { dueDate: isoString });
    if (success) {
      triggerSaveIndicator('saved');
    } else {
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
      triggerSaveIndicator('error');
    }
  };

  const handleRemoveDueDate = async () => {
    setDueDate(undefined);
    setIsCalendarOpen(false);

    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { dueDate: null });
    if (success) {
      triggerSaveIndicator('saved');
    } else {
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
      triggerSaveIndicator('error');
    }
  };

  // Delete card
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const success = await onDeleteCard(card.id);
    setIsDeleting(false);
    if (success) {
      setIsConfirmDeleteOpen(false);
      onClose();
    }
  };

  const handleArchiveCard = async () => {
    if (!card || !onArchiveCard) return;
    setIsArchiving(true);
    const success = await onArchiveCard(card.id);
    setIsArchiving(false);
    if (success) {
      onClose();
    }
  };

  // Date formatters
  const formatDateTime = (dateStr?: string | Date | null) => {
    if (!dateStr) return '—';
    try {
      const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      return format(d, "MMM d, yyyy 'at' h:mm a");
    } catch {
      return '—';
    }
  };

  const isDueDateOverdue = () => {
    if (!dueDate) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(dueDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  };

  const isDueToday = () => {
    if (!dueDate) return false;
    return isToday(dueDate);
  };

  // --- Label Handlers ---
  const isLabelAttached = (labelId: string) => {
    return (card.labels || []).some((l) => l.id === labelId);
  };

  const handleToggleLabel = async (label: Label) => {
    if (isLabelAttached(label.id)) {
      await onRemoveLabelFromCard(card.id, label.id);
    } else {
      await onAddLabelToCard(card.id, label.id);
    }
  };

  const handleStartCreateLabel = () => {
    setLabelNameInput(labelSearch.trim());
    setLabelColorInput(LABEL_COLORS[0].hex);
    setLabelMode('create');
  };

  const handleCreateLabelSubmit = async () => {
    if (!labelNameInput.trim() || !onCreateLabel) return;
    const created = await onCreateLabel(labelNameInput.trim(), labelColorInput);
    if (created) {
      // Auto attach to this card
      await onAddLabelToCard(card.id, created.id);
      setLabelMode('list');
      setLabelSearch('');
    }
  };

  const handleStartEditLabel = (label: Label, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLabelId(label.id);
    setLabelNameInput(label.name);
    setLabelColorInput(label.color);
    setLabelMode('edit');
  };

  const handleUpdateLabelSubmit = async () => {
    if (!editingLabelId || !labelNameInput.trim() || !onUpdateLabel) return;
    await onUpdateLabel(editingLabelId, labelNameInput.trim(), labelColorInput);
    setLabelMode('list');
    setEditingLabelId(null);
  };

  const handleDeleteLabelSubmit = async () => {
    if (!editingLabelId || !onDeleteLabel) return;
    await onDeleteLabel(editingLabelId);
    setLabelMode('list');
    setEditingLabelId(null);
  };

  const filteredLabels = boardLabels.filter((l) =>
    l.name.toLowerCase().includes(labelSearch.toLowerCase())
  );

  // --- Checklist Handlers ---
  const checklistItems = card.checklistItems || [];
  const completedCount = checklistItems.filter((i) => i.completed).length;
  const totalCount = checklistItems.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAddChecklistItemSubmit = async () => {
    const trimmed = newItemTitle.trim();
    if (!trimmed) return;
    const success = await onAddChecklistItem(card.id, trimmed);
    if (success) {
      setNewItemTitle('');
      if (newItemInputRef.current) newItemInputRef.current.focus();
    }
  };

  const handleToggleChecklistItem = async (itemId: string, currentCompleted: boolean) => {
    await onUpdateChecklistItem(card.id, itemId, { completed: !currentCompleted });
  };

  const handleSaveChecklistItemTitle = async (itemId: string) => {
    const trimmed = editingItemTitle.trim();
    setEditingItemId(null);
    if (!trimmed) return;
    await onUpdateChecklistItem(card.id, itemId, { title: trimmed });
  };

  const handleMoveChecklistItem = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === checklistItems.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newItems = [...checklistItems];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);

    const itemIds = newItems.map((i) => i.id);
    await onReorderChecklistItems(card.id, itemIds);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden sm:rounded-xl border border-border shadow-2xl bg-background max-h-[90vh] flex flex-col">
          {/* Header */}
          <DialogHeader className="p-6 pb-4 border-b border-border/70 space-y-2 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1 pr-4">
                {isEditingTitle ? (
                  <Input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') {
                        setTitle(card.title);
                        setIsEditingTitle(false);
                      }
                    }}
                    className="text-lg font-semibold tracking-tight h-9 px-2 focus-visible:ring-1"
                    placeholder="Card title..."
                  />
                ) : (
                  <DialogTitle
                    onClick={() => setIsEditingTitle(true)}
                    className="text-xl font-semibold tracking-tight text-foreground cursor-pointer rounded px-1.5 py-1 -ml-1.5 hover:bg-muted/60 transition-colors"
                    title="Click to edit title"
                  >
                    {title || card.title}
                  </DialogTitle>
                )}

                {/* Breadcrumb / Current List */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-0.5">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span>in list</span>
                  <span className="font-medium text-foreground underline underline-offset-2 decoration-muted-foreground/30">
                    {listTitle || 'Current List'}
                  </span>
                </div>
              </div>

              {/* Save status badge */}
              <div className="flex items-center gap-2 pt-1 mr-6">
                {saveStatus === 'saving' && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <Check className="h-3 w-3" />
                    Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <AlertCircle className="h-3 w-3" />
                    Failed to save
                  </span>
                )}
              </div>
            </div>

            {/* Attached Labels Row */}
            {card.labels && card.labels.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                  <Tag className="h-3 w-3" />
                  Labels:
                </span>
                {card.labels.map((label) => (
                  <span
                    key={label.id}
                    style={{ backgroundColor: label.color }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white shadow-xs group"
                  >
                    <span>{label.name}</span>
                    <button
                      onClick={() => onRemoveLabelFromCard(card.id, label.id)}
                      className="opacity-70 hover:opacity-100 transition-opacity ml-0.5"
                      title="Remove label"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </DialogHeader>

          {/* Modal Body - Two Column Layout */}
          <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Main Content Column (Left, 2 cols) */}
            <div className="p-6 md:col-span-2 space-y-6">
              {/* Description Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <AlignLeft className="h-4 w-4 text-muted-foreground" />
                    <span>Description</span>
                  </div>
                  {!isEditingDescription && description && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingDescription(true)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </Button>
                  )}
                </div>

                {isEditingDescription ? (
                  <div className="space-y-2">
                    <Textarea
                      ref={descriptionRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          handleSaveDescription();
                        }
                        if (e.key === 'Escape') {
                          handleCancelDescription();
                        }
                      }}
                      placeholder="Add a more detailed description..."
                      rows={4}
                      className="min-h-[100px] text-sm resize-y focus-visible:ring-1"
                    />
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveDescription}
                          className="h-8 px-3 text-xs"
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelDescription}
                          className="h-8 px-3 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Press Ctrl+Enter to save
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingDescription(true)}
                    className={cn(
                      'rounded-lg p-3 text-sm transition-colors cursor-pointer border border-transparent',
                      description
                        ? 'bg-muted/30 hover:bg-muted/50 text-foreground whitespace-pre-wrap leading-relaxed'
                        : 'bg-muted/20 hover:bg-muted/40 text-muted-foreground italic border-dashed border-border/70'
                    )}
                  >
                    {description || 'Add a more detailed description...'}
                  </div>
                )}
              </div>

              {/* Checklist Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <span>Checklist</span>
                    {totalCount > 0 && (
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {completedCount} / {totalCount} completed
                      </span>
                    )}
                  </div>
                  {totalCount > 0 && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {progressPercent}%
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                {totalCount > 0 && (
                  <div className="space-y-1">
                    <Progress value={progressPercent} className="h-1.5" />
                  </div>
                )}

                {/* Checklist Items */}
                <div className="space-y-1 pt-1">
                  {checklistItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => handleToggleChecklistItem(item.id, item.completed)}
                        className="h-4 w-4 rounded"
                      />

                      {editingItemId === item.id ? (
                        <div className="flex-1 flex items-center gap-1.5">
                          <Input
                            ref={editItemInputRef}
                            value={editingItemTitle}
                            onChange={(e) => setEditingItemTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveChecklistItemTitle(item.id);
                              if (e.key === 'Escape') setEditingItemId(null);
                            }}
                            onBlur={() => handleSaveChecklistItemTitle(item.id)}
                            className="h-7 text-xs px-2"
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleSaveChecklistItemTitle(item.id)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <span
                          onClick={() => {
                            setEditingItemId(item.id);
                            setEditingItemTitle(item.title);
                          }}
                          className={cn(
                            'flex-1 text-sm cursor-pointer select-none',
                            item.completed
                              ? 'line-through text-muted-foreground/70'
                              : 'text-foreground'
                          )}
                        >
                          {item.title}
                        </span>
                      )}

                      {/* Item Actions (Reorder & Delete) */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={index === 0}
                          onClick={() => handleMoveChecklistItem(index, 'up')}
                          title="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={index === checklistItems.length - 1}
                          onClick={() => handleMoveChecklistItem(index, 'down')}
                          title="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => onDeleteChecklistItem(card.id, item.id)}
                          title="Delete item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Item Form */}
                <div className="pt-1">
                  {isAddingChecklistItem ? (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2.5">
                      <Input
                        ref={newItemInputRef}
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddChecklistItemSubmit();
                          if (e.key === 'Escape') {
                            setIsAddingChecklistItem(false);
                            setNewItemTitle('');
                          }
                        }}
                        placeholder="Add an item..."
                        className="h-8 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleAddChecklistItemSubmit}
                          disabled={!newItemTitle.trim()}
                          className="h-7 text-xs px-3"
                        >
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsAddingChecklistItem(false);
                            setNewItemTitle('');
                          }}
                          className="h-7 text-xs px-2.5"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddingChecklistItem(true)}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add an item
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar / Metadata Column (Right, 1 col) */}
            <div className="p-6 space-y-6 bg-muted/10">
              {/* Labels Popover */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Labels
                </label>
                <Popover
                  open={isLabelsPopoverOpen}
                  onOpenChange={(open) => {
                    setIsLabelsPopoverOpen(open);
                    if (!open) {
                      setLabelMode('list');
                      setLabelSearch('');
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs h-9 bg-card px-3"
                    >
                      <Tag className="mr-2 h-3.5 w-3.5" />
                      Manage labels
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 space-y-3" align="start">
                    {labelMode === 'list' && (
                      <>
                        <div className="text-xs font-semibold text-foreground text-center">
                          Labels
                        </div>
                        <Input
                          placeholder="Search labels..."
                          value={labelSearch}
                          onChange={(e) => setLabelSearch(e.target.value)}
                          className="h-7 text-xs"
                        />
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {filteredLabels.map((label) => {
                            const attached = isLabelAttached(label.id);
                            return (
                              <div
                                key={label.id}
                                onClick={() => handleToggleLabel(label)}
                                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/60 cursor-pointer group"
                              >
                                <span
                                  style={{ backgroundColor: label.color }}
                                  className="flex-1 px-2 py-1 rounded text-xs font-medium text-white shadow-xs flex items-center justify-between"
                                >
                                  <span>{label.name}</span>
                                  {attached && <Check className="h-3.5 w-3.5" />}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => handleStartEditLabel(label, e)}
                                  title="Edit label"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                          {filteredLabels.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              No labels found
                            </p>
                          )}
                        </div>

                        {onCreateLabel && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-7"
                            onClick={handleStartCreateLabel}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Create a new label
                          </Button>
                        )}
                      </>
                    )}

                    {labelMode === 'create' && (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-foreground text-center">
                          Create Label
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">Title</label>
                          <Input
                            value={labelNameInput}
                            onChange={(e) => setLabelNameInput(e.target.value)}
                            placeholder="Label title..."
                            className="h-7 text-xs"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">Select a color</label>
                          <div className="grid grid-cols-5 gap-1.5">
                            {LABEL_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                style={{ backgroundColor: c.hex }}
                                onClick={() => setLabelColorInput(c.hex)}
                                className={cn(
                                  'h-6 w-full rounded flex items-center justify-center transition-transform hover:scale-105',
                                  labelColorInput === c.hex && 'ring-2 ring-primary ring-offset-1'
                                )}
                              >
                                {labelColorInput === c.hex && (
                                  <Check className="h-3.5 w-3.5 text-white" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={handleCreateLabelSubmit}
                            disabled={!labelNameInput.trim()}
                            className="flex-1 h-7 text-xs"
                          >
                            Create
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLabelMode('list')}
                            className="h-7 text-xs"
                          >
                            Back
                          </Button>
                        </div>
                      </div>
                    )}

                    {labelMode === 'edit' && (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-foreground text-center">
                          Edit Label
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">Title</label>
                          <Input
                            value={labelNameInput}
                            onChange={(e) => setLabelNameInput(e.target.value)}
                            placeholder="Label title..."
                            className="h-7 text-xs"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">Select a color</label>
                          <div className="grid grid-cols-5 gap-1.5">
                            {LABEL_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                style={{ backgroundColor: c.hex }}
                                onClick={() => setLabelColorInput(c.hex)}
                                className={cn(
                                  'h-6 w-full rounded flex items-center justify-center transition-transform hover:scale-105',
                                  labelColorInput === c.hex && 'ring-2 ring-primary ring-offset-1'
                                )}
                              >
                                {labelColorInput === c.hex && (
                                  <Check className="h-3.5 w-3.5 text-white" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={handleUpdateLabelSubmit}
                            disabled={!labelNameInput.trim()}
                            className="flex-1 h-7 text-xs"
                          >
                            Save
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteLabelSubmit}
                            className="h-7 text-xs px-2.5"
                            title="Delete label from board"
                          >
                            Delete
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLabelMode('list')}
                            className="h-7 text-xs"
                          >
                            Back
                          </Button>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                </label>
                <Select
                  value={priority}
                  onValueChange={handlePriorityChange}
                >
                  <SelectTrigger className="h-9 w-full bg-card text-xs">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    <SelectItem value="LOW">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="font-medium text-blue-700 dark:text-blue-400">Low</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="MEDIUM">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span className="font-medium text-amber-700 dark:text-amber-400">Medium</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="HIGH">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        <span className="font-medium text-rose-700 dark:text-rose-400">High</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Due date
                </label>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-9 bg-card text-xs px-3',
                        !dueDate && 'text-muted-foreground',
                        isDueDateOverdue() && 'border-rose-300 text-rose-700 dark:text-rose-400',
                        isDueToday() && 'border-amber-300 text-amber-700 dark:text-amber-400'
                      )}
                    >
                      <CalendarCheck className="mr-2 h-3.5 w-3.5" />
                      {dueDate ? format(dueDate, 'PPP') : <span>Set due date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={handleDateSelect}
                      initialFocus
                    />
                    {dueDate && (
                      <div className="p-2 border-t border-border flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveDueDate}
                          className="h-7 text-xs text-destructive hover:text-destructive"
                        >
                          Remove due date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Due Date Status Badge */}
                {dueDate && (
                  <div className="pt-0.5">
                    {isDueDateOverdue() && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        Overdue
                      </Badge>
                    )}
                    {isDueToday() && (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300/40 text-[10px] px-1.5 py-0">
                        Due today
                      </Badge>
                    )}
                    {!isDueDateOverdue() && !isDueToday() && (
                      <span className="text-[11px] text-muted-foreground">
                        Due {format(dueDate, 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="space-y-2 pt-2 border-t border-border/70 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Created
                  </span>
                  <span className="text-foreground/80 font-medium">
                    {formatDateTime(card.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated
                  </span>
                  <span className="text-foreground/80 font-medium">
                    {formatDateTime(card.updatedAt)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-3 border-t border-border/70">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </label>
                {onArchiveCard && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleArchiveCard}
                    disabled={isArchiving || isDeleting}
                    className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-8"
                  >
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    {isArchiving ? 'Archiving...' : 'Archive card'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfirmDeleteOpen(true)}
                  className="w-full justify-start text-xs text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive h-8"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete card
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={isConfirmDeleteOpen}
        onOpenChange={(open) => !isDeleting && setIsConfirmDeleteOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{card.title}&rdquo; will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
