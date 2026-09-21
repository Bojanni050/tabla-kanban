import type { AssignableRole, BoardRole } from '@/types';

export const ROLE_LABELS: Record<BoardRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

export const ASSIGNABLE_ROLES: AssignableRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

// UI hints only - the server enforces every one of these rules.
export const canEditBoard = (role: BoardRole) => role !== 'VIEWER';
export const canManageBoard = (role: BoardRole) => role === 'OWNER' || role === 'ADMIN';

export const displayName = (person: { name: string | null; email: string }) =>
  person.name?.trim() || person.email;
