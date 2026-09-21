import { useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LIST_TEMPLATES, type ListTemplate } from '@/lib/list-templates';
import { cn } from '@/lib/utils';

interface ListTemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating: boolean;
  onUseTemplate: (template: ListTemplate) => void;
}

const PREVIEW_LIMIT = 5;

export function ListTemplatePicker({ open, onOpenChange, creating, onUseTemplate }: ListTemplatePickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open ]);

  const selected = LIST_TEMPLATES.find((t) => t.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg flex-col bg-white">
        <DialogHeader className="text-left">
          <DialogTitle>List templates</DialogTitle>
          <DialogDescription>
            Start with a proven structure. All of the template&apos;s lists and labels are added to this board at once — no cards are created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-2 overflow-y-auto py-1 pr-0.5 sm:grid-cols-2" role="radiogroup" aria-label="List templates">
          {LIST_TEMPLATES.map((template) => {
            const isSelected = template.id === selectedId;
            const shown = template.lists.slice(0, PREVIEW_LIMIT);
            const hidden = template.lists.length - shown.length;
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedId(template.id)}
                className={cn(
                  'relative rounded-lg border bg-white p-3 text-left transition-colors focus-visible:outline-none',
                  isSelected
                    ? 'bg-[#FDF6F2]'
                    : 'hover:bg-muted/50'
                )}
                style={{ borderColor: isSelected ? 'var(--kala-coral)' : 'var(--kala-line)' }}
              >
                {isSelected && (
                  <span
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white"
                    style={{ background: 'var(--kala-coral)' }}
                    aria-hidden
                  >
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="block pr-6 text-[13px] font-semibold text-foreground">{template.name}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{template.description}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1" aria-label={`Lists: ${template.lists.join(', ')}`}>
                  {shown.map((name) => (
                    <span key={name} className="inline-flex max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {name}
                    </span>
                  ))}
                  {hidden > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                      <ArrowRight className="h-2.5 w-2.5" aria-hidden />
                      {hidden} more
                    </span>
                  )}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold text-muted-foreground">
                  <span>Lists: {template.lists.length}</span>
                  <span aria-hidden>·</span>
                  <span aria-label={`Labels: ${template.labels.join(', ')}`}>Labels: {template.labels.length}</span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating} className="bg-white">
            Cancel
          </Button>
          <Button
            onClick={() => selected && onUseTemplate(selected)}
            disabled={!selected || creating}
            className="gap-1.5 bg-[#2A2F36] text-white hover:bg-[#1E2329]"
          >
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {creating
              ? 'Creating lists and labels...'
              : selected
                ? `Use template · ${selected.lists.length} lists · ${selected.labels.length} labels`
                : 'Use template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
