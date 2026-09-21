import { useEffect, useState } from 'react';
import { LayoutDashboard, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABELS, displayName } from '@/lib/roles';
import type { MyInvitation, User } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface InvitePageProps {
  token: string;
  user: User;
  onAccepted: (boardId: string) => void;
  onDone: () => void; // decline, or leave the invitation page
}

const ROLE_DESCRIPTIONS = {
  OWNER: 'Full access to the board.',
  ADMIN: 'Manage the board, its content and its members.',
  MEMBER: 'View the board and create, edit and move cards.',
  VIEWER: 'View the board (read-only).',
} as const;

export function InvitePage({ token, user, onAccepted, onDone }: InvitePageProps) {
  const [invitation, setInvitation] = useState<MyInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getInvitation(token)
      .then((data) => !cancelled && setInvitation(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Invitation not available'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.acceptInvitation(token);
      onAccepted(result.boardId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the invitation');
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.declineInvitation(token);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decline the invitation');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Tabla</h1>
      </div>

      <Card className="w-full max-w-md">
        {loading ? (
          <CardContent className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        ) : invitation ? (
          <>
            <CardHeader>
              <CardTitle className="text-lg">Board invitation</CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">{displayName(invitation.invitedBy)}</span> invited
                you to join a board.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Board</span>
                  <span className="font-medium text-foreground">{invitation.board.name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Invited by</span>
                  <span className="text-foreground">{displayName(invitation.invitedBy)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Your role</span>
                  <span className="font-medium text-foreground">{ROLE_LABELS[invitation.role]}</span>
                </div>
                <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[invitation.role]}
                </p>
              </div>
              {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={accept} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                </Button>
                <Button variant="outline" className="flex-1" onClick={decline} disabled={busy}>
                  Decline
                </Button>
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-lg">Invitation unavailable</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                You are signed in as <span className="font-medium text-foreground">{user.email}</span>. An
                invitation can only be used by the email address it was sent to.
              </p>
              <Button variant="outline" className="w-full" onClick={onDone}>
                Go to my boards
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
