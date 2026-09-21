import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 px-3 py-6' : 'gap-2 px-6 py-10'
      )}
      role="status"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className={cn('text-muted-foreground', compact ? 'max-w-56 text-xs' : 'max-w-72 text-[13px] leading-relaxed')}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
