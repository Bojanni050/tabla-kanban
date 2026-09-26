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

const templateMeta = (template: ListTemplate) => [
  { label: 'Lists', names: template.lists },
  { label: 'Labels', names: template.labels ?? [] },
  { label: 'Swimlanes', names: template.swimlanes ?? [] },
  { label: 'Card Types', names: template.cardTypes ?? [] },
];

function SectionPreview({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, PREVIEW_LIMIT);
  const hidden = names.length - shown.length;
  return (
    <span className="mt-1.5 block">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1" aria-label={`${label}: ${names.join(', ')}`}>
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
    </span>
  );
}

export function ListTemplatePicker({ open, onOpenChange, creating, onUseTemplate }: ListTemplatePickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open]);

  const selected = LIST_TEMPLATES.find((t) => t.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg flex-col bg-white">
        <DialogHeader className="text-left">
          <DialogTitle>Board templates</DialogTitle>
          <DialogDescription>
            Start with a proven workflow. A template adds its lists, labels, swimlanes and card types to this board at once — no cards are created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-2 overflow-y-auto py-1 pr-0.5 sm:grid-cols-2" role="radiogroup" aria-label="Board templates">
          {LIST_TEMPLATES.map((template) => {
            const isSelected = template.id === selectedId;
            const labels = template.labels ?? [];
            const swimlanes = template.swimlanes ?? [];
            const cardTypes = template.cardTypes ?? [];
            const meta = templateMeta(template);
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
                <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold text-muted-foreground">
                  {meta.map(({ label, names }, i) => (
                    <span key={label} className="inline-flex items-center gap-1">
                      {i > 0 && <span aria-hidden>·</span>}
                      <span
                        title={names.length > 0 ? `${label}: ${names.join(', ')}` : `${label}: none`}
                      >
                        {label}: {names.length}
                      </span>
                    </span>
                  ))}
                </span>
                <SectionPreview label="Lists" names={template.lists} />
                <SectionPreview label="Swimlanes" names={swimlanes} />
                <SectionPreview label="Card types" names={cardTypes} />
                <SectionPreview label="Labels" names={labels} />
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="rounded-lg border bg-[#FAFAF8] p-3" style={{ borderColor: 'var(--kala-line)' }} aria-label={`${selected.name} template preview`}>
            <p className="text-[11px] font-semibold text-foreground">{selected.name}</p>
            <dl className="mt-1.5 space-y-1">
              {templateMeta(selected).map(({ label, names }) =>
                names.length === 0 ? null : (
                  <div key={label} className="flex items-baseline gap-2">
                    <dt className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                      {label === 'Lists' ? names.join(' → ') : names.join(' · ')}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {selected && (
            <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
              {selected.lists.length} lists · {(selected.labels ?? []).length} labels · {(selected.swimlanes ?? []).length} swimlanes · {(selected.cardTypes ?? []).length} card types
            </p>
          )}
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
              ? 'Applying template...'
              : selected
                ? `Use template · ${selected.lists.length} lists · ${(selected.labels ?? []).length} labels · ${(selected.swimlanes ?? []).length} swimlanes · ${(selected.cardTypes ?? []).length} card types`
                : 'Use template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
