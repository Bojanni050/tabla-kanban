import { Skeleton } from '@/components/ui/skeleton';

export function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-label="Loading board" role="status">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-52 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kala-list flex w-72 shrink-0 flex-col gap-2 rounded-xl p-2.5">
            <div className="flex items-center justify-between px-1 py-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <Skeleton className="h-16 w-full rounded-lg bg-white" />
            <Skeleton className="h-20 w-full rounded-lg bg-white" />
            <Skeleton className="h-14 w-5/6 rounded-lg bg-white" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-white p-3" aria-hidden>
      <div className="flex items-center gap-2 px-1 py-2">
        <Skeleton className="h-8 w-8 rounded-[9px]" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-2 h-16 w-full rounded-lg" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-5/6 rounded-md" />
      </div>
    </div>
  );
}

export function AppLoadingShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAF8]">
      <SidebarSkeleton />
      <main className="flex-1 overflow-hidden">
        <BoardSkeleton />
      </main>
    </div>
  );
}
