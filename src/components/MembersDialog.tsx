import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Crown, LogOut, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ASSIGNABLE_ROLES, ROLE_LABELS, canManageBoard, displayName } from '@/lib/roles';
import type { AssignableRole, BoardInvitation, BoardMember, BoardRole } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

interface MembersDialogProps {
  boardId: string;
  boardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  // Called after the current user's own role or membership changed (leave, ownership transfer)
  onLeft: () => void;
  onOwnershipTransferred: () => void;
}

type Confirm = { type: 'leave' } | { type: 'transfer'; member: BoardMember } | null;

const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssignableRole)} disabled={disabled}>
      <SelectTrigger className="h-8 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_ROLES.map((role) => (
          <SelectItem key={role} value={role} className="text-xs">
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    });

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
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Share &ldquo;{boardName}&rdquo;</DialogTitle>
            <DialogDescription>
              {canManage
                ? 'Invite people and manage what they can do on this board.'
                : 'People who have access to this board.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto py-1 pr-1">
            {/* Invite form */}
            {canManage && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Invite by email
                </p>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleInvite();
                  }}
                >
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-8 flex-1 text-sm"
                  />
                  <RoleSelect value={inviteRole} onChange={setInviteRole} />
                  <Button type="submit" size="sm" className="h-8" disabled={inviting || !inviteEmail.trim()}>
                    Invite
                  </Button>
                </form>

                {lastInvite && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                    <p className="text-foreground">
                      Invitation created for <span className="font-medium">{lastInvite.email}</span> as{' '}
                      {ROLE_LABELS[lastInvite.role]}. No email is sent &mdash; share this link with them:
                    </p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={inviteLink(lastInvite.token)} className="h-7 text-xs" onFocus={(e) => e.target.select()} />
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => copyLink(lastInvite.token)}>
                        {copiedToken === lastInvite.token ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedToken === lastInvite.token ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      {lastInvite.userExists
                        ? 'They already have an account and can accept after logging in. The link expires in 7 days.'
                        : 'There is no account for this email yet. They need to register with this exact email address first, then open the link. The link expires in 7 days.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Members */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Members ({members.length})
              </p>
              {loading && members.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
              )}
              <div className="space-y-1.5">
                {members.map((member) => {
                  const isMe = member.userId === currentUserId;
                  const isOwner = member.role === 'OWNER';
                  const canChange = canManage && !isMe && !isOwner;
                  return (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {displayName(member)[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {displayName(member)}
                            {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                          </p>
                          {member.name && (
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className="hidden font-normal text-muted-foreground sm:inline-flex">
                          Active
                        </Badge>
                        {canChange ? (
                          <RoleSelect
                            value={member.role as AssignableRole}
                            onChange={(role) => handleRoleChange(member, role)}
                          />
                        ) : (
                          <Badge variant="secondary" className="h-8 w-28 justify-center gap-1 font-medium">
                            {isOwner && <Crown className="h-3 w-3" />}
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        )}
                        {myRole === 'OWNER' && !isMe && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground"
                            onClick={() => setConfirm({ type: 'transfer', member })}
                            title="Transfer ownership to this member"
                          >
                            Make owner
                          </Button>
                        )}
                        {canChange && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemove(member)}
                            title="Remove from board"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending invitations */}
            {canManage && invitations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pending invitations ({invitations.length})
                </p>
                <div className="space-y-1.5">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{invitation.email}</p>
                        {!invitation.userExists && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Not registered yet &mdash; must sign up with this email first
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className="hidden font-normal text-muted-foreground sm:inline-flex">
                          Pending
                        </Badge>
                        <Badge variant="secondary" className="font-medium">
                          {ROLE_LABELS[invitation.role]}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => copyLink(invitation.token)}
                        >
                          {copiedToken === invitation.token ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedToken === invitation.token ? 'Copied' : 'Copy link'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRevoke(invitation)}
                          title="Revoke invitation"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer: leave */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            {myRole === 'OWNER' ? (
              <p className="text-xs text-muted-foreground">
                You own this board. To leave it, first make another member the owner.
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-destructive/20 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirm({ type: 'leave' })}
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave board
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'transfer'
                ? `Make ${displayName(confirm.member)} the owner?`
                : `Leave "${boardName}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'transfer'
                ? `${displayName(confirm.member)} will become the owner of this board and can delete it or remove anyone. You will become an admin, and the board will move to their workspace. Only the new owner can undo this.`
                : 'You will lose access to this board unless someone invites you again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirm?.type === 'transfer' ? 'Transfer ownership' : 'Leave board'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
