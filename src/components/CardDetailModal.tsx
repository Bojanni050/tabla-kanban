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
  Archive,
  History,
  Sparkles,
} from 'lucide-react';
import { format, isToday } from 'date-fns';
import type { Card, Label, Priority } from '@/types';
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
import { EmptyState } from './EmptyState';

const LABEL_COLORS = [
  { name: 'Coral', hex: '#CE6F51' },
  { name: 'Red', hex: '#DC5A5A' },
  { name: 'Amber', hex: '#D9A03F' },
  { name: 'Sage', hex: '#7FA693' },
  { name: 'Teal', hex: '#4FA3A3' },
  { name: 'Blue', hex: '#5B8DD9' },
  { name: 'Indigo', hex: '#6B7BD6' },
  { name: 'Purple', hex: '#8B6FC7' },
  { name: 'Pink', hex: '#D96A9B' },
  { name: 'Slate', hex: '#64748B' },
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
  onCreateLabel?: (name: string, color: string) => Promise<Label | null>;
  onUpdateLabel?: (labelId: string, name: string, color: string) => Promise<boolean>;
  onDeleteLabel?: (labelId: string) => Promise<boolean>;
  onAddLabelToCard: (cardId: string, labelId: string) => Promise<boolean>;
  onRemoveLabelFromCard: (cardId: string, labelId: string) => Promise<boolean>;
  onAddChecklistItem: (cardId: string, title: string) => Promise<boolean>;
  onUpdateChecklistItem: (cardId: string, itemId: string, updates: { title?: string; completed?: boolean }) => Promise<boolean>;
  onDeleteChecklistItem: (cardId: string, itemId: string) => Promise<boolean>;
  onReorderChecklistItems: (cardId: string, itemIds: string[]) => Promise<boolean>;
  readOnly?: boolean;
  // Opens the Kala AI panel about this card (suggestions only; also available to viewers)
  onAskAi?: (card: Card) => void;
}

function SectionTitle({ icon: Icon, children, action }: { icon: typeof Tag; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="kala-section-label flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {children}
      </h3>
      {action}
    </div>
  );
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
  readOnly = false,
  onAskAi,
}: CardDetailModalProps) {
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [description, setDescription] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [priority, setPriority] = useState<Priority | 'NONE'>('NONE');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [isLabelsPopoverOpen, setIsLabelsPopoverOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');
  const [labelMode, setLabelMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelNameInput, setLabelNameInput] = useState('');
  const [labelColorInput, setLabelColorInput] = useState(LABEL_COLORS[0].hex);

  const [newItemTitle, setNewItemTitle] = useState('');
  const [isAddingChecklistItem, setIsAddingChecklistItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const editItemInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks which card the local buffers were initialized from, so live
  // updates to the same card (own saves, collaborator events) refresh the
  // view without wiping in-progress title/description edits or popover state.
  const syncedCardIdRef = useRef<string | null>(null);
  const isEditingTitleRef = useRef(false);
  const isEditingDescriptionRef = useRef(false);
  isEditingTitleRef.current = isEditingTitle;
  isEditingDescriptionRef.current = isEditingDescription;

  useEffect(() => {
    if (card && isOpen) {
      const fresh = syncedCardIdRef.current !== card.id;
      syncedCardIdRef.current = card.id;
      if (fresh || !isEditingTitleRef.current) setTitle(card.title);
      if (fresh || !isEditingDescriptionRef.current) setDescription(card.description || '');
      setPriority(card.priority || 'NONE');
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
      if (fresh) {
        setIsEditingTitle(false);
        setIsEditingDescription(false);
        setSaveStatus('idle');
        setLabelMode('list');
        setLabelSearch('');
        setIsAddingChecklistItem(false);
        setEditingItemId(null);
      }
    }
    if (!isOpen) syncedCardIdRef.current = null;
  }, [card, isOpen]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) descriptionRef.current.focus();
  }, [isEditingDescription]);

  useEffect(() => {
    if (isAddingChecklistItem && newItemInputRef.current) newItemInputRef.current.focus();
  }, [isAddingChecklistItem]);

  useEffect(() => {
    if (editingItemId && editItemInputRef.current) {
      editItemInputRef.current.focus();
      editItemInputRef.current.select();
    }
  }, [editingItemId]);

  const triggerSaveIndicator = (status: 'saved' | 'error') => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus(status);
    saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
  };

  if (!card) return null;

  const handleSaveTitle = async () => {
    const trimmed = title.trim();
    setIsEditingTitle(false);
    if (!trimmed) { setTitle(card.title); return; }
    if (trimmed === card.title) return;
    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { title: trimmed });
    if (success) triggerSaveIndicator('saved');
    else { setTitle(card.title); triggerSaveIndicator('error'); }
  };

  const handleSaveDescription = async () => {
    const trimmed = description.trim();
    setIsEditingDescription(false);
    const newDesc = trimmed.length > 0 ? trimmed : null;
    if (newDesc === card.description) return;
    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { description: newDesc });
    if (success) triggerSaveIndicator('saved');
    else { setDescription(card.description || ''); triggerSaveIndicator('error'); }
  };

  const handleCancelDescription = () => {
    setDescription(card.description || '');
    setIsEditingDescription(false);
  };

  const handlePriorityChange = async (val: string) => {
    const newPriority = val === 'NONE' ? null : (val as Priority);
    setPriority((val as Priority) || 'NONE');
    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { priority: newPriority });
    if (success) triggerSaveIndicator('saved');
    else { setPriority(card.priority || 'NONE'); triggerSaveIndicator('error'); }
  };

  const handleDateSelect = async (selected: Date | undefined) => {
    setDueDate(selected);
    setIsCalendarOpen(false);
    const isoString = selected ? selected.toISOString() : null;
    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { dueDate: isoString });
    if (success) triggerSaveIndicator('saved');
    else { setDueDate(card.dueDate ? new Date(card.dueDate) : undefined); triggerSaveIndicator('error'); }
  };

  const handleRemoveDueDate = async () => {
    setDueDate(undefined);
    setIsCalendarOpen(false);
    setSaveStatus('saving');
    const success = await onUpdateCard(card.id, { dueDate: null });
    if (success) triggerSaveIndicator('saved');
    else { setDueDate(card.dueDate ? new Date(card.dueDate) : undefined); triggerSaveIndicator('error'); }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const success = await onDeleteCard(card.id);
    setIsDeleting(false);
    if (success) { setIsConfirmDeleteOpen(false); onClose(); }
  };

  const handleArchiveCard = async () => {
    if (!card || !onArchiveCard) return;
    setIsArchiving(true);
    const success = await onArchiveCard(card.id);
    setIsArchiving(false);
    if (success) onClose();
  };

  const formatDateTime = (dateStr?: string | Date | null) => {
    if (!dateStr) return '—';
    try {
      const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      return format(d, "MMM d, yyyy 'at' h:mm a");
    } catch { return '—'; }
  };

  const isDueDateOverdue = () => {
    if (!dueDate) return false;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  };

  const isDueToday = () => {
    if (!dueDate) return false;
    return isToday(dueDate);
  };

  const isLabelAttached = (labelId: string) => (card.labels || []).some((l) => l.id === labelId);

  const handleToggleLabel = async (label: Label) => {
    if (isLabelAttached(label.id)) await onRemoveLabelFromCard(card.id, label.id);
    else await onAddLabelToCard(card.id, label.id);
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

  const filteredLabels = boardLabels.filter((l) => l.name.toLowerCase().includes(labelSearch.toLowerCase()));

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
      newItemInputRef.current?.focus();
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
    await onReorderChecklistItems(card.id, newItems.map((i) => i.id));
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden border bg-white p-0 sm:rounded-xl" style={{ borderColor: 'var(--kala-line)' }} aria-describedby={undefined}>
          <fieldset disabled={readOnly} className="contents">
            {/* 1 — Title */}
            <DialogHeader className="shrink-0 space-y-2 border-b bg-white p-5 pb-4 text-left" style={{ borderColor: 'var(--kala-line)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pr-6">
                  {isEditingTitle ? (
                    <Input
                      ref={titleInputRef}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={handleSaveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') { setTitle(card.title); setIsEditingTitle(false); }
                      }}
                      aria-label="Card title"
                      className="h-9 bg-white px-2 text-[17px] font-semibold tracking-tight"
                      placeholder="Card title..."
                      maxLength={255}
                    />
                  ) : (
                    <DialogTitle
                      onClick={() => !readOnly && setIsEditingTitle(true)}
                      className="cursor-pointer rounded px-1.5 py-1 text-[17px] font-semibold leading-snug tracking-tight text-foreground transition-colors hover:bg-muted/60"
                      title={readOnly ? undefined : 'Click to edit title'}
                    >
                      {title || card.title}
                    </DialogTitle>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 px-1.5 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" aria-hidden />
                    in list <span className="font-semibold text-foreground">{listTitle || 'Current list'}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-1" aria-live="polite">
                  {saveStatus === 'saving' && <span className="animate-pulse text-xs text-muted-foreground">Saving...</span>}
                  {saveStatus === 'saved' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-[#3E6355]"><Check className="h-3 w-3" aria-hidden />Saved</span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-destructive"><AlertCircle className="h-3 w-3" aria-hidden />Failed to save</span>
                  )}
                </div>
              </div>

              {/* Attached labels */}
              {card.labels && card.labels.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1" aria-label="Attached labels">
                  {card.labels.map((label) => (
                    <span key={label.id} style={{ backgroundColor: label.color }} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white">
                      {label.name}
                      <button onClick={() => onRemoveLabelFromCard(card.id, label.id)} className="opacity-80 transition-opacity hover:opacity-100" aria-label={`Remove label ${label.name}`} title={`Remove label ${label.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </DialogHeader>

            {/* Body */}
            <div className="grid flex-1 grid-cols-1 divide-y overflow-y-auto md:grid-cols-3 md:divide-x md:divide-y-0" style={{ borderColor: 'var(--kala-line)' }}>
              {/* Main column */}
              <div className="space-y-6 p-5 md:col-span-2">
                {/* 2 — Description */}
                <section aria-label="Description" className="space-y-2">
                  <SectionTitle
                    icon={AlignLeft}
                    action={!isEditingDescription && description ? (
                      <Button variant="ghost" size="sm" onClick={() => !readOnly && setIsEditingDescription(true)} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">Edit</Button>
                    ) : undefined}
                  >
                    Description
                  </SectionTitle>
                  {isEditingDescription ? (
                    <div className="space-y-2">
                      <Textarea
                        ref={descriptionRef}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSaveDescription();
                          if (e.key === 'Escape') handleCancelDescription();
                        }}
                        placeholder="Add a more detailed description..."
                        aria-label="Card description"
                        rows={4}
                        className="min-h-[100px] resize-y bg-white text-sm"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={handleSaveDescription} className="h-8 bg-[#2A2F36] px-3 text-xs text-white hover:bg-[#1E2329]">Save</Button>
                          <Button variant="ghost" size="sm" onClick={handleCancelDescription} className="h-8 px-3 text-xs">Cancel</Button>
                        </div>
                        <span className="hidden text-[11px] text-muted-foreground sm:inline">Ctrl+Enter to save</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => !readOnly && setIsEditingDescription(true)}
                      role={readOnly ? undefined : 'button'}
                      tabIndex={readOnly ? undefined : 0}
                      onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setIsEditingDescription(true); } }}
                      aria-label={description ? 'Edit description' : 'Add a description'}
                      className={cn(
                        'rounded-lg border border-transparent p-3 text-sm leading-relaxed transition-colors',
                        readOnly ? 'bg-muted/30 text-foreground' : 'cursor-pointer',
                        description ? 'whitespace-pre-wrap bg-[#F5F4F1] text-foreground hover:bg-[#EFEEE9]' : 'border-dashed bg-muted/20 italic text-muted-foreground hover:bg-muted/40'
                      )}
                      style={description ? undefined : { borderColor: 'var(--kala-line)' }}
                    >
                      {description || 'Add a more detailed description...'}
                    </div>
                  )}
                </section>

                {/* 5 — Checklist */}
                <section aria-label="Checklist" className="space-y-2.5 border-t pt-5" style={{ borderColor: 'var(--kala-line)' }}>
                  <SectionTitle
                    icon={CheckSquare}
                    action={totalCount > 0 ? <span className="text-xs font-medium text-muted-foreground" aria-label={`${completedCount} of ${totalCount} complete`}>{completedCount}/{totalCount} · {progressPercent}%</span> : undefined}
                  >
                    Checklist
                  </SectionTitle>
                  {totalCount > 0 && <Progress value={progressPercent} className="h-1.5" aria-label={`Checklist ${progressPercent}% complete`} />}
                  {totalCount === 0 && !isAddingChecklistItem ? (
                    <div className="rounded-lg border border-dashed px-3 py-4 text-center" style={{ borderColor: 'var(--kala-line)' }}>
                      <p className="text-[13px] text-muted-foreground">No checklist items yet. Break this card into smaller steps.</p>
                    </div>
                  ) : (
                    <ul className="space-y-0.5 pt-1">
                      {checklistItems.map((item, index) => (
                        <li key={item.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                          <Checkbox checked={item.completed} onCheckedChange={() => handleToggleChecklistItem(item.id, item.completed)} aria-label={`Mark "${item.title}" as ${item.completed ? 'incomplete' : 'complete'}`} className="h-4 w-4" />
                          {editingItemId === item.id ? (
                            <span className="flex flex-1 items-center gap-1.5">
                              <Input ref={editItemInputRef} value={editingItemTitle} onChange={(e) => setEditingItemTitle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveChecklistItemTitle(item.id); if (e.key === 'Escape') setEditingItemId(null); }}
                                onBlur={() => handleSaveChecklistItemTitle(item.id)}
                                aria-label="Checklist item title" className="h-7 bg-white px-2 text-[13px]" />
                              <Button size="sm" className="h-7 bg-[#2A2F36] px-2 text-xs text-white hover:bg-[#1E2329]" onClick={() => handleSaveChecklistItemTitle(item.id)}>Save</Button>
                            </span>
                          ) : (
                            <span
                              onClick={() => { if (readOnly) return; setEditingItemId(item.id); setEditingItemTitle(item.title); }}
                              className={cn('flex-1 cursor-pointer select-none text-sm', item.completed ? 'text-muted-foreground line-through' : 'text-foreground')}
                            >
                              {item.title}
                            </span>
                          )}
                          <span className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === 0} onClick={() => handleMoveChecklistItem(index, 'up')} aria-label={`Move "${item.title}" up`}><ArrowUp className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === checklistItems.length - 1} onClick={() => handleMoveChecklistItem(index, 'down')} aria-label={`Move "${item.title}" down`}><ArrowDown className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => onDeleteChecklistItem(card.id, item.id)} aria-label={`Delete "${item.title}"`}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pt-1">
                    {isAddingChecklistItem ? (
                      <div className="space-y-2 rounded-lg border bg-[#FAFAF8] p-2.5" style={{ borderColor: 'var(--kala-line)' }}>
                        <Input ref={newItemInputRef} value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItemSubmit(); if (e.key === 'Escape') { setIsAddingChecklistItem(false); setNewItemTitle(''); } }}
                          placeholder="Add an item..." aria-label="New checklist item" className="h-8 bg-white text-[13px]" />
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={handleAddChecklistItemSubmit} disabled={!newItemTitle.trim()} className="h-7 bg-[#2A2F36] px-3 text-xs text-white hover:bg-[#1E2329]">Add</Button>
                          <Button variant="ghost" size="sm" onClick={() => { setIsAddingChecklistItem(false); setNewItemTitle(''); }} className="h-7 px-2.5 text-xs">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setIsAddingChecklistItem(true)} className="h-8 bg-white text-xs text-muted-foreground hover:text-foreground">
                        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Add an item
                      </Button>
                    )}
                  </div>
                </section>

                {/* 6 — Activity */}
                <section aria-label="Activity" className="space-y-2.5 border-t pt-5" style={{ borderColor: 'var(--kala-line)' }}>
                  <SectionTitle icon={History}>Activity</SectionTitle>
                  <ul className="space-y-2 text-[13px]">
                    <li className="flex items-center justify-between rounded-lg bg-[#F5F4F1] px-3 py-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden /> Created</span>
                      <span className="font-medium text-foreground/80">{formatDateTime(card.createdAt)}</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-[#F5F4F1] px-3 py-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden /> Last updated</span>
                      <span className="font-medium text-foreground/80">{formatDateTime(card.updatedAt)}</span>
                    </li>
                  </ul>
                  <p className="px-0.5 text-xs text-muted-foreground">No further activity yet. Checklist changes and edits update the timestamp above.</p>
                </section>
              </div>

              {/* Side column */}
              <aside className="space-y-5 bg-[#FAFAF8] p-5" aria-label="Card settings">
                {/* 3 — Labels */}
                <section className="space-y-1.5" aria-label="Labels">
                  <h3 className="kala-section-label flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" aria-hidden />Labels</h3>
                  <Popover open={isLabelsPopoverOpen} onOpenChange={(open) => { setIsLabelsPopoverOpen(open); if (!open) { setLabelMode('list'); setLabelSearch(''); } }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 w-full justify-start bg-white px-3 text-xs" aria-label="Manage labels">
                        <Tag className="mr-2 h-3.5 w-3.5" aria-hidden /> Manage labels
                        {(card.labels?.length ?? 0) > 0 && <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{card.labels?.length}</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 space-y-3 p-3" align="start">
                      {labelMode === 'list' && (
                        <>
                          <p className="text-center text-xs font-semibold text-foreground">Labels</p>
                          <Input placeholder="Search labels..." value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} aria-label="Search labels" className="h-8 bg-white text-xs" />
                          <div className="max-h-48 space-y-1 overflow-y-auto">
                            {filteredLabels.map((label) => {
                              const attached = isLabelAttached(label.id);
                              return (
                                <div key={label.id} onClick={() => handleToggleLabel(label)} className="group flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted/60">
                                  <span style={{ backgroundColor: label.color }} className="flex flex-1 items-center justify-between rounded px-2 py-1 text-xs font-medium text-white">
                                    {label.name}
                                    {attached && <Check className="h-3.5 w-3.5" aria-label="Attached" />}
                                  </span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" onClick={(e) => handleStartEditLabel(label, e)} aria-label={`Edit label ${label.name}`}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                            {filteredLabels.length === 0 && (
                              <EmptyState compact icon={<Tag className="h-4 w-4" />} title="No labels found" description="Try a different search or create a new label." />
                            )}
                          </div>
                          {onCreateLabel && (
                            <Button variant="outline" size="sm" className="h-8 w-full bg-white text-xs" onClick={handleStartCreateLabel}>
                              <Plus className="mr-1 h-3 w-3" aria-hidden /> Create a new label
                            </Button>
                          )}
                        </>
                      )}
                      {labelMode === 'create' && (
                        <div className="space-y-3">
                          <p className="text-center text-xs font-semibold text-foreground">Create label</p>
                          <div className="space-y-1.5">
                            <label className="text-[11px] text-muted-foreground" htmlFor="kala-new-label">Title</label>
                            <Input id="kala-new-label" value={labelNameInput} onChange={(e) => setLabelNameInput(e.target.value)} placeholder="Label title..." className="h-8 bg-white text-xs" autoFocus />
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[11px] text-muted-foreground" id="kala-color-label">Color</span>
                            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="kala-color-label">
                              {LABEL_COLORS.map((c) => (
                                <button key={c.hex} type="button" role="radio" aria-checked={labelColorInput === c.hex} aria-label={c.name} title={c.name} style={{ backgroundColor: c.hex }} onClick={() => setLabelColorInput(c.hex)}
                                  className={cn('flex h-6 w-full items-center justify-center rounded transition-transform hover:scale-105', labelColorInput === c.hex && 'ring-2 ring-[#2A2F36] ring-offset-1')}>
                                  {labelColorInput === c.hex && <Check className="h-3.5 w-3.5 text-white" aria-hidden />}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" onClick={handleCreateLabelSubmit} disabled={!labelNameInput.trim()} className="h-8 flex-1 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]">Create</Button>
                            <Button variant="ghost" size="sm" onClick={() => setLabelMode('list')} className="h-8 text-xs">Back</Button>
                          </div>
                        </div>
                      )}
                      {labelMode === 'edit' && (
                        <div className="space-y-3">
                          <p className="text-center text-xs font-semibold text-foreground">Edit label</p>
                          <div className="space-y-1.5">
                            <label className="text-[11px] text-muted-foreground" htmlFor="kala-edit-label">Title</label>
                            <Input id="kala-edit-label" value={labelNameInput} onChange={(e) => setLabelNameInput(e.target.value)} placeholder="Label title..." className="h-8 bg-white text-xs" autoFocus />
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[11px] text-muted-foreground">Color</span>
                            <div className="grid grid-cols-5 gap-1.5">
                              {LABEL_COLORS.map((c) => (
                                <button key={c.hex} type="button" aria-label={c.name} title={c.name} style={{ backgroundColor: c.hex }} onClick={() => setLabelColorInput(c.hex)}
                                  className={cn('flex h-6 w-full items-center justify-center rounded transition-transform hover:scale-105', labelColorInput === c.hex && 'ring-2 ring-[#2A2F36] ring-offset-1')}>
                                  {labelColorInput === c.hex && <Check className="h-3.5 w-3.5 text-white" aria-hidden />}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" onClick={handleUpdateLabelSubmit} disabled={!labelNameInput.trim()} className="h-8 flex-1 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]">Save</Button>
                            <Button variant="destructive" size="sm" onClick={handleDeleteLabelSubmit} className="h-8 px-2.5 text-xs">Delete</Button>
                            <Button variant="ghost" size="sm" onClick={() => setLabelMode('list')} className="h-8 text-xs">Back</Button>
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </section>

                {/* 4 — Priority & Due date */}
                <section className="space-y-4" aria-label="Priority and due date">
                  <div className="space-y-1.5">
                    <h3 className="kala-section-label flex items-center gap-1.5"><Flag className="h-3.5 w-3.5" aria-hidden />Priority</h3>
                    <Select value={priority} onValueChange={handlePriorityChange}>
                      <SelectTrigger className="h-9 w-full bg-white text-xs" aria-label="Card priority">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE"><span className="text-muted-foreground">None</span></SelectItem>
                        <SelectItem value="LOW"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#7FA693]" aria-hidden /><span className="font-medium text-[#3E6355]">Low</span></span></SelectItem>
                        <SelectItem value="MEDIUM"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#D9A03F]" aria-hidden /><span className="font-medium text-[#7A5F1F]">Medium</span></span></SelectItem>
                        <SelectItem value="HIGH"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#CE6F51]" aria-hidden /><span className="font-medium text-[#9A4A30]">High</span></span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="kala-section-label flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" aria-hidden />Due date</h3>
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn('h-9 w-full justify-start bg-white px-3 text-left text-xs font-normal',
                            !dueDate && 'text-muted-foreground',
                            isDueDateOverdue() && 'border-[#EAC5B8] text-[#9A4A30]',
                            isDueToday() && !isDueDateOverdue() && 'border-[#E8D9B8] text-[#7A5F1F]')}
                          aria-label={dueDate ? `Due date: ${format(dueDate, 'PPP')}. Change due date` : 'Set due date'}
                        >
                          <CalendarCheck className="mr-2 h-3.5 w-3.5" aria-hidden />
                          {dueDate ? format(dueDate, 'PPP') : 'Set due date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dueDate} onSelect={handleDateSelect} initialFocus />
                        {dueDate && (
                          <div className="flex justify-end border-t p-2" style={{ borderColor: 'var(--kala-line)' }}>
                            <Button variant="ghost" size="sm" onClick={handleRemoveDueDate} className="h-7 text-xs text-destructive hover:text-destructive">Remove due date</Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    {dueDate && (
                      <div className="pt-0.5">
                        {isDueDateOverdue() && <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">Overdue since {format(dueDate, 'MMM d')}</Badge>}
                        {isDueToday() && !isDueDateOverdue() && <Badge className="border border-[#E8D9B8] bg-[#FAF3E2] px-1.5 py-0 text-[10px] text-[#7A5F1F]">Due today</Badge>}
                        {!isDueDateOverdue() && !isDueToday() && <span className="text-[11px] text-muted-foreground">Due {format(dueDate, 'MMM d, yyyy')}</span>}
                      </div>
                    )}
                  </div>
                </section>

                {/* Kala AI - read-only suggestions. Rendered as a span with role="button" so that it
                    keeps working for viewers, where the surrounding fieldset disables real buttons. */}
                {onAskAi && (
                  <section className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--kala-line)' }} aria-label="Kala AI">
                    <h3 className="kala-section-label flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden />Kala AI</h3>
                    <Button asChild variant="outline" size="sm" className="h-8 w-full cursor-pointer justify-start bg-white text-xs text-foreground">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => onAskAi(card)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onAskAi(card);
                          }
                        }}
                      >
                        <Sparkles className="mr-2 h-3.5 w-3.5" style={{ color: 'var(--kala-coral-strong)' }} aria-hidden />
                        Ask Kala AI
                      </span>
                    </Button>
                    <p className="px-1 text-[11px] leading-snug text-muted-foreground">Suggestions only. Kala AI never changes your card.</p>
                  </section>
                )}

                {/* 7 — Actions, destructive separated */}
                <section className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--kala-line)' }} aria-label="Card actions">
                  <h3 className="kala-section-label">Actions</h3>
                  {onArchiveCard && (
                    <Button variant="outline" size="sm" onClick={handleArchiveCard} disabled={isArchiving || isDeleting} className="h-8 w-full justify-start bg-white text-xs text-muted-foreground hover:text-foreground">
                      <Archive className="mr-2 h-3.5 w-3.5" aria-hidden />
                      {isArchiving ? 'Archiving...' : 'Archive card'}
                    </Button>
                  )}
                  <div className="rounded-lg border border-destructive/25 bg-destructive/[0.03] p-2" role="group" aria-label="Danger zone">
                    <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-destructive/80">Danger zone</p>
                    <Button variant="outline" size="sm" onClick={() => setIsConfirmDeleteOpen(true)} className="h-8 w-full justify-start border-destructive/25 bg-white text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                      Delete card
                    </Button>
                  </div>
                </section>
              </aside>
            </div>
          </fieldset>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmDeleteOpen} onOpenChange={(open) => !isDeleting && setIsConfirmDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{card.title}&rdquo; will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
