import { Crown, ShieldCheck, User as UserIcon, Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { displayName } from '@/lib/roles';
import type { BoardRole } from '@/types';

const AVATAR_BG = [
  'bg-[#E9E4D8] text-[#5C5645]',
  'bg-[#F6E4DC] text-[#8A4A33]',
  'bg-[#E2EDE7] text-[#3E6355]',
  'bg-[#E7EAF0] text-[#455062]',
];

export function avatarTone(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return AVATAR_BG[h % AVATAR_BG.length];
}

export function initialsOf(person: { name: string | null; email: string }) {
  const base = displayName(person).trim();
  if (!base) return '?';
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (base.includes('@')) return base[0].toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export const ROLE_META: Record<BoardRole, { label: string; description: string; icon: typeof Crown }> = {
  OWNER: { label: 'Owner', description: 'Full access. Can delete the board and manage everyone.', icon: Crown },
  ADMIN: { label: 'Admin', description: 'Can manage content, members and invitations.', icon: ShieldCheck },
  MEMBER: { label: 'Member', description: 'Can view and create, edit and move cards.', icon: UserIcon },
  VIEWER: { label: 'Viewer', description: 'Can view the board. Read-only.', icon: Eye },
};

export function MemberAvatar({
  person,
  size = 'md',
  ring = false,
}: {
  person: { name: string | null; email: string };
  size?: 'sm' | 'md';
  ring?: boolean;
}) {
  const label = displayName(person);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
              avatarTone(label),
              size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]',
              ring && 'ring-2 ring-background'
            )}
            aria-label={label}
            title={label}
          >
            {initialsOf(person)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-48 text-center">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AvatarStack({ people, max = 5 }: { people: { name: string | null; email: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center" aria-label={`${people.length} members`}>
      {shown.map((p, i) => (
        <span key={`${p.email}-${i}`} className={i > 0 ? '-ml-1.5' : ''}>
          <MemberAvatar person={p} size="sm" ring />
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{rest}
        </span>
      )}
    </span>
  );
}
