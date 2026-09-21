import { cn } from '@/lib/utils';

export function KalaLogo({ size = 32, withWordmark = false }: { size?: number; withWordmark?: boolean }) {
  const barW = size * 0.24;
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="Kala">
      <span
        className="inline-flex items-center justify-center rounded-[28%] bg-white"
        style={{
          width: size,
          height: size,
          border: '2px solid #2A2F36',
          boxShadow: '0 1px 2px rgba(42,47,54,0.08)',
        }}
        aria-hidden
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="3" y="4" width="7" height="24" rx="2.5" fill="#2A2F36" />
          <rect x="13.5" y="4.5" width="7" height="11" rx="2.5" transform="rotate(38 13.5 4.5)" fill="#CE6F51" />
          <rect x="13.5" y="17.5" width="7" height="11" rx="2.5" transform="rotate(-38 13.5 17.5)" fill="#7FA693" />
        </svg>
      </span>
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-[0.14em] text-foreground">KALA</span>
          <span className="mt-1 text-[9px] font-medium tracking-[0.18em] text-muted-foreground">
            KANBAN & FLOW
          </span>
        </span>
      )}
    </span>
  );
}

export function KalaMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-white',
        className
      )}
      style={{ border: '2px solid #2A2F36' }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="3" y="4" width="7" height="24" rx="2.5" fill="#2A2F36" />
        <rect x="13.5" y="4.5" width="7" height="11" rx="2.5" transform="rotate(38 13.5 4.5)" fill="#CE6F51" />
        <rect x="13.5" y="17.5" width="7" height="11" rx="2.5" transform="rotate(-38 13.5 17.5)" fill="#7FA693" />
      </svg>
    </span>
  );
}
