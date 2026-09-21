import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABELS, displayName } from '@/lib/roles';
import type { MyInvitation, User } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KalaLogo } from '@/components/KalaLogo';
import { ROLE_META } from './MemberAvatar';

interface InvitePageProps {
  token: string;
  user: User;
  onAccepted: (boardId: string) => void;
  onDone: () => void;
}

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF8] px-4">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <KalaLogo size={48} />
        <h1 className="text-xl font-bold tracking-[0.14em] text-foreground">KALA</h1>
      </div>

      <Card className="w-full max-w-md border bg-white shadow-[0_4px_16px_-4px_rgba(42,47,54,0.12)]" style={{ borderColor: 'var(--kala-line)' }}>
        {loading ? (
          <CardContent className="flex justify-center py-10" aria-label="Loading invitation">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
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
              <div className="space-y-2 rounded-lg border bg-[#F5F4F1] p-3 text-sm" style={{ borderColor: 'var(--kala-line)' }}>
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
                <p className="border-t pt-2 text-xs text-muted-foreground" style={{ borderColor: 'var(--kala-line)' }}>
                  {ROLE_META[invitation.role].description}
                </p>
              </div>
              {error && <p className="rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex gap-2">
                <Button className="flex-1 bg-[#2A2F36] text-white hover:bg-[#1E2329]" onClick={accept} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Accept'}
                </Button>
                <Button variant="outline" className="flex-1 bg-white" onClick={decline} disabled={busy}>
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
              <Button variant="outline" className="w-full bg-white" onClick={onDone}>
                Go to my boards
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
