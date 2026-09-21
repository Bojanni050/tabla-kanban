import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, LogOut, X, MailPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { ASSIGNABLE_ROLES, canManageBoard, displayName } from '@/lib/roles';
import type { AssignableRole, BoardInvitation, BoardMember, BoardRole } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { EmptyState } from './EmptyState';
import { MemberAvatar, ROLE_META } from './MemberAvatar';

interface MembersDialogProps {
  boardId: string;
  boardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onLeft: () => void;
  onOwnershipTransferred: () => void;
}

type Confirm = { type: 'leave' } | { type: 'transfer'; member: BoardMember } | null;

const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

function RoleSelect({ value, onChange, disabled, label }: { value: AssignableRole; onChange: (role: AssignableRole) => void; disabled?: boolean; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssignableRole)} disabled={disabled}>
      <SelectTrigger className="h-8 w-28 bg-white text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_ROLES.map((role) => (
          <SelectItem key={role} value={role} className="text-xs">
            <span title={ROLE_META[role].description}>{ROLE_META[role].label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RoleBadge({ role }: { role: BoardRole }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium text-foreground">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs">{meta.description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MembersDialog({
  boardId,
  boardName,
  open,
  onOpenChange,
  currentUserId,
  onLeft,
  onOwnershipTransferred,
}: MembersDialogProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [invitations, setInvitations] = useState<BoardInvitation[]>([]);
  const [myRole, setMyRole] = useState<BoardRole>('VIEWER');
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<BoardInvitation | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const canManage = canManageBoard(myRole);

  const load = useCallback(async () => {
    try {
      const data = await api.getBoardMembers(boardId);
      setMembers(data.members);
      setInvitations(data.invitations);
      setMyRole(data.myRole);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not load members',
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [boardId, toast]);

  useEffect(() => {
    if (!open) return;
    setLastInvite(null);
    setInviteEmail('');
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [open, load]);

  const fail = (title: string, e: unknown) =>
    toast({ variant: 'destructive', title, description: e instanceof Error ? e.message : undefined });

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy the link', description: inviteLink(token) });
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    try {
      const invitation = await api.inviteToBoard(boardId, { email, role: inviteRole });
      setLastInvite(invitation);
      setInviteEmail('');
      await load();
    } catch (e) {
      fail('Could not create invitation', e);
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (invitation: BoardInvitation) => {
    try {
      await api.revokeInvitation(boardId, invitation.id);
      if (lastInvite?.id === invitation.id) setLastInvite(null);
      await load();
    } catch (e) {
      fail('Could not revoke invitation', e);
    }
  };

  const handleRoleChange = async (member: BoardMember, role: AssignableRole) => {
    try {
      await api.updateMemberRole(boardId, member.userId, role);
      await load();
    } catch (e) {
      fail('Could not change role', e);
      await load();
    }
  };

  const handleRemove = async (member: BoardMember) => {
    try {
      await api.removeMember(boardId, member.userId);
      await load();
    } catch (e) {
      fail('Could not remove member', e);
    }
  };

  const handleConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    if (!action) return;
    try {
      if (action.type === 'leave') {
        await api.leaveBoard(boardId);
        onOpenChange(false);
        toast({ title: 'You left the board' });
        onLeft();
      } else {
        await api.transferOwnership(boardId, action.member.userId);
        toast({ title: `${displayName(action.member)} is now the owner` });
        await load();
        onOwnershipTransferred();
      }
    } catch (e) {
      fail(action.type === 'leave' ? 'Could not leave the board' : 'Could not transfer ownership', e);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl flex-col bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Share &ldquo;{boardName}&rdquo;</DialogTitle>
            <DialogDescription>
              {canManage ? 'Invite people and manage what they can do on this board.' : 'People who have access to this board.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto py-1 pr-1">
            {canManage && (
              <section aria-label="Invite by email" className="space-y-2">
                <h3 className="kala-section-label flex items-center gap-1.5">
                  <MailPlus className="h-3.5 w-3.5" aria-hidden /> Invite by email
                </h3>
                <form noValidate className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); handleInvite(); }}>
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@example.com" aria-label="Email to invite" className="h-9 flex-1 bg-white text-sm" />
                  <div className="flex items-center gap-2">
                    <RoleSelect value={inviteRole} onChange={setInviteRole} label="Role for new invitation" />
                    <Button type="submit" size="sm" className="h-9 bg-[#2A2F36] px-4 text-white hover:bg-[#1E2329]" disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? 'Inviting...' : 'Invite'}
                    </Button>
                  </div>
                </form>
                <p className="text-xs text-muted-foreground">
                  {ROLE_META[inviteRole].label}: {ROLE_META[inviteRole].description}
                </p>

                {lastInvite && (
                  <div className="space-y-2 rounded-lg border bg-[#F5F4F1] p-3 text-xs" style={{ borderColor: 'var(--kala-line)' }}>
                    <p className="text-foreground">
                      Invitation created for <span className="font-semibold">{lastInvite.email}</span> as {ROLE_META[lastInvite.role].label}. No email is sent &mdash; share this link:
                    </p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={inviteLink(lastInvite.token)} className="h-8 bg-white text-xs" onFocus={(e) => e.target.select()} aria-label="Invitation link" />
                      <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 bg-white text-xs" onClick={() => copyLink(lastInvite.token)}>
                        {copiedToken === lastInvite.token ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                        {copiedToken === lastInvite.token ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      {lastInvite.userExists
                        ? 'They already have an account and can accept after logging in. The link expires in 7 days.'
                        : 'No account for this email yet. They need to register with this exact email first, then open the link. Expires in 7 days.'}
                    </p>
                  </div>
                )}
              </section>
            )}

            <section aria-label="Members" className="space-y-2">
              <h3 className="kala-section-label flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" aria-hidden /> Members ({members.length})
              </h3>
              {loading && members.length === 0 && (
                <div className="space-y-1.5" aria-label="Loading members">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border p-2" style={{ borderColor: 'var(--kala-line)' }}>
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
                      <Skeleton className="h-8 w-24 rounded-md" />
                    </div>
                  ))}
                </div>
              )}
              {!loading && members.length === 0 && (
                <EmptyState compact icon={<Users className="h-4 w-4" />} title="No members yet" description="Invite someone to collaborate on this board." />
              )}
              <ul className="space-y-1.5">
                {members.map((member) => {
                  const isMe = member.userId === currentUserId;
                  const isOwner = member.role === 'OWNER';
                  const canChange = canManage && !isMe && !isOwner;
                  return (
                    <li key={member.userId} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-2" style={{ borderColor: 'var(--kala-line)' }}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <MemberAvatar person={member} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {displayName(member)}
                            {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                          </p>
                          {member.name ? (
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          ) : (
                            <p className="truncate text-xs text-muted-foreground">{ROLE_META[member.role].description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {canChange ? (
                          <RoleSelect value={member.role as AssignableRole} onChange={(role) => handleRoleChange(member, role)} label={`Role for ${displayName(member)}`} />
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                        {myRole === 'OWNER' && !isMe && (
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setConfirm({ type: 'transfer', member })} title="Transfer ownership to this member">
                            Make owner
                          </Button>
                        )}
                        {canChange && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemove(member)} aria-label={`Remove ${displayName(member)} from board`} title="Remove from board">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {canManage && invitations.length > 0 && (
              <section aria-label="Pending invitations" className="space-y-2">
                <h3 className="kala-section-label">Pending invitations ({invitations.length})</h3>
                <ul className="space-y-1.5">
                  {invitations.map((invitation) => (
                    <li key={invitation.id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-white p-2" style={{ borderColor: 'var(--kala-line)' }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_META[invitation.role].label}
                          {!invitation.userExists && <span className="text-[#9A4A30]"> · Not registered yet</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className="hidden font-normal text-muted-foreground sm:inline-flex">Pending</Badge>
                        <Button variant="outline" size="sm" className="h-7 gap-1 bg-white text-xs" onClick={() => copyLink(invitation.token)} aria-label={`Copy invite link for ${invitation.email}`}>
                          {copiedToken === invitation.token ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                          {copiedToken === invitation.token ? 'Copied' : 'Copy link'}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRevoke(invitation)} aria-label={`Revoke invitation for ${invitation.email}`} title="Revoke invitation">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Role legend — makes roles understandable */}
            <section aria-label="What each role can do" className="rounded-lg bg-[#F5F4F1] p-3" style={{ border: '1px solid var(--kala-line)' }}>
              <h3 className="kala-section-label pb-2">What each role can do</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {(Object.keys(ROLE_META) as BoardRole[]).map((r) => {
                  const Icon = ROLE_META[r].icon;
                  return (
                    <li key={r} className="flex items-start gap-2 text-xs">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span><span className="font-semibold text-foreground">{ROLE_META[r].label}</span> <span className="text-muted-foreground">— {ROLE_META[r].description}</span></span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'var(--kala-line)' }}>
            {myRole === 'OWNER' ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                You own this board. To leave it, first make another member the owner.
              </p>
            ) : (
              <div className="rounded-lg border border-destructive/25 bg-destructive/[0.03] p-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 border-destructive/25 bg-white text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirm({ type: 'leave' })}>
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Leave board
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'transfer' ? `Make ${confirm ? displayName(confirm.member) : ''} the owner?` : `Leave "${boardName}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'transfer'
                ? `${confirm ? displayName(confirm.member) : ''} will become the owner of this board and can delete it or remove anyone. You will become an admin, and the board will move to their workspace. Only the new owner can undo this.`
                : 'You will lose access to this board unless someone invites you again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {confirm?.type === 'transfer' ? 'Transfer ownership' : 'Leave board'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
