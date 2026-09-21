import { useState } from 'react';
import {
  Briefcase,
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  Plus,
  LogOut,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  X,
  Settings,
  PanelLeftClose,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Workspace, Board, User, SharedBoard, MyInvitation } from '@/types';
import { ROLE_LABELS, displayName } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KalaLogo } from '@/components/KalaLogo';
import { EmptyState } from '@/components/EmptyState';
import { MemberAvatar } from '@/components/MemberAvatar';

interface SidebarProps {
  workspaces: Workspace[];
  sharedBoards: SharedBoard[];
  invitations: MyInvitation[];
  onAcceptInvitation: (token: string) => void;
  onDeclineInvitation: (token: string) => void;
  activeWorkspaceId: string | null;
  activeBoardId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (name: string) => void;
  onRenameWorkspace: (workspaceId: string, name: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string, workspaceId: string) => void;
  onRenameBoard: (boardId: string, name: string) => void;
  onDeleteBoard: (boardId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  user?: User | null;
  onLogout?: () => void;
}

type Target = { type: 'workspace' | 'board'; id: string };
type PendingDelete = Target & { name: string };

function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RowMenu({ label, onRename, onDelete }: { label: string; onRename: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          aria-label={`${label} options`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({
  workspaces,
  sharedBoards,
  invitations,
  onAcceptInvitation,
  onDeclineInvitation,
  activeWorkspaceId,
  activeBoardId,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  collapsed,
  onToggleCollapse,
  user,
  onLogout,
}: SidebarProps) {
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [addingBoard, setAddingBoard] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const resetInputs = () => {
    setCreatingWorkspace(false);
    setAddingBoard(false);
    setEditing(null);
    setDraft('');
  };

  const startEditing = (target: Target, currentName: string) => {
    resetInputs();
    setEditing(target);
    setDraft(currentName);
  };

  const commitCreateWorkspace = () => {
    const name = draft.trim();
    if (name) onCreateWorkspace(name);
    resetInputs();
  };

  const commitCreateBoard = () => {
    const name = draft.trim();
    if (name && activeWorkspace) onCreateBoard(name, activeWorkspace.id);
    resetInputs();
  };

  const commitRename = (currentName: string) => {
    const name = draft.trim();
    if (editing && name && name !== currentName) {
      if (editing.type === 'workspace') onRenameWorkspace(editing.id, name);
      else onRenameBoard(editing.id, name);
    }
    resetInputs();
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'workspace') onDeleteWorkspace(pendingDelete.id);
    else onDeleteBoard(pendingDelete.id);
    setPendingDelete(null);
  };

  const renderInput = (onCommit: () => void, placeholder: string, label: string) => (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') resetInputs();
      }}
      onBlur={onCommit}
      placeholder={placeholder}
      aria-label={label}
      maxLength={100}
      className="h-8 bg-white text-[13px]"
    />
  );

  if (collapsed) {
    return (
      <div className="z-40 flex h-full w-14 shrink-0 flex-col items-center justify-between border-r bg-white py-3 max-md:absolute max-md:shadow-lg" style={{ borderColor: 'var(--kala-line)' }}>
        <div className="flex flex-col items-center gap-2">
          <KalaLogo size={30} />
          <IconTip label="Expand sidebar">
            <Button variant="ghost" size="icon" onClick={onToggleCollapse} aria-label="Expand sidebar" className="h-9 w-9">
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          </IconTip>
          {activeWorkspace && (
            <IconTip label={`Workspace: ${activeWorkspace.name}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F2F1ED] text-xs font-semibold text-foreground">
                {activeWorkspace.name.slice(0, 2).toUpperCase()}
              </span>
            </IconTip>
          )}
          {invitations.length > 0 && (
            <IconTip label={`${invitations.length} pending invitation${invitations.length > 1 ? 's' : ''}`}>
              <span className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                <Inbox className="h-4 w-4" />
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: 'var(--kala-coral)' }}>
                  {invitations.length}
                </span>
              </span>
            </IconTip>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <IconTip label="Settings">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
              <Settings className="h-4 w-4" />
            </Button>
          </IconTip>
          {user && onLogout && (
            <IconTip label={`Log out (${user.email})`}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                aria-label={`Log out (${user.email})`}
                className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </IconTip>
          )}
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} user={user} workspaces={workspaces} sharedCount={sharedBoards.length} />
      </div>
    );
  }

  return (
    <div className="z-40 flex h-full w-64 shrink-0 flex-col border-r bg-white max-md:absolute max-md:shadow-lg" style={{ borderColor: 'var(--kala-line)' }}>
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <KalaLogo size={32} withWordmark />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onToggleCollapse} aria-label="Collapse sidebar">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Workspace switcher */}
        <section aria-label="Workspace" className="mt-1">
          <p className="kala-section-label px-1 pb-1.5">Workspace</p>
          <Popover open={wsSwitcherOpen} onOpenChange={setWsSwitcherOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
                style={{ borderColor: 'var(--kala-line)' }}
                aria-label={activeWorkspace ? `Current workspace: ${activeWorkspace.name}. Switch workspace` : 'Select workspace'}
                aria-haspopup="listbox"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#2A2F36] text-[11px] font-bold text-white" aria-hidden>
                  {activeWorkspace ? activeWorkspace.name.slice(0, 2).toUpperCase() : <Briefcase className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {activeWorkspace?.name ?? 'No workspace'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {activeWorkspace ? `${activeWorkspace.boards.length} board${activeWorkspace.boards.length === 1 ? '' : 's'}` : 'Create one to begin'}
                  </span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-1.5" sideOffset={6}>
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Switch workspace
              </p>
              <div className="max-h-56 overflow-y-auto" role="listbox">
                {workspaces.map((w) => (
                  <div
                    key={w.id}
                    className={cn(
                      'group flex items-center rounded-md pr-1',
                      w.id === activeWorkspace?.id ? 'bg-muted' : 'hover:bg-muted/60'
                    )}
                  >
                    {editing?.type === 'workspace' && editing.id === w.id ? (
                      <div className="w-full px-1 py-1">{renderInput(() => commitRename(w.name), 'Workspace name', 'Rename workspace')}</div>
                    ) : (
                      <>
                        <button
                          role="option"
                          aria-selected={w.id === activeWorkspace?.id}
                          onClick={() => { onSelectWorkspace(w.id); setWsSwitcherOpen(false); }}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#2A2F36] text-[10px] font-bold text-white" aria-hidden>
                            {w.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{w.name}</span>
                          {w.id === activeWorkspace?.id && <Check className="h-3.5 w-3.5 shrink-0 text-[#7FA693]" aria-label="Current workspace" />}
                        </button>
                        <RowMenu
                          label={w.name}
                          onRename={() => startEditing({ type: 'workspace', id: w.id }, w.name)}
                          onDelete={() => setPendingDelete({ type: 'workspace', id: w.id, name: w.name })}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
              {creatingWorkspace ? (
                <div className="px-1 py-1">{renderInput(commitCreateWorkspace, 'New workspace name', 'New workspace name')}</div>
              ) : (
                <button
                  onClick={() => { resetInputs(); setCreatingWorkspace(true); }}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  New workspace
                </button>
              )}
            </PopoverContent>
          </Popover>
        </section>

        {/* My Boards */}
        <section aria-label="My boards" className="mt-5">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <p className="kala-section-label">My boards</p>
            {activeWorkspace && !addingBoard && (
              <button
                onClick={() => { resetInputs(); setAddingBoard(true); setDraft(''); }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Create board"
                title="Create board"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!activeWorkspace ? (
            <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground" style={{ borderColor: 'var(--kala-line)' }}>
              No workspace selected. Create a workspace to add boards.
            </p>
          ) : activeWorkspace.boards.length === 0 && !addingBoard ? (
            <div className="rounded-lg border border-dashed px-2 py-1" style={{ borderColor: 'var(--kala-line)' }}>
              <EmptyState
                compact
                icon={<LayoutDashboard className="h-4 w-4" />}
                title="No boards yet"
                description="Create your first board to start organizing work."
              />
            </div>
          ) : (
            <nav className="space-y-0.5" aria-label="Boards in current workspace">
              {activeWorkspace.boards.map((board: Board) => {
                const isActive = board.id === activeBoardId;
                const isEditing = editing?.type === 'board' && editing.id === board.id;
                if (isEditing) {
                  return (
                    <div key={board.id} className="py-0.5">
                      {renderInput(() => commitRename(board.name), 'Board name', 'Rename board')}
                    </div>
                  );
                }
                return (
                  <div key={board.id} className="group relative flex items-center">
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full" style={{ background: 'var(--kala-coral)' }} aria-hidden />
                    )}
                    <div
                      className={cn(
                        'flex flex-1 items-center rounded-md py-0.5 pl-2 pr-1 transition-colors',
                        isActive ? 'bg-[#F2F0EB]' : 'hover:bg-muted/60'
                      )}
                    >
                      <button
                        onClick={() => onSelectBoard(board.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1.5 text-left"
                      >
                        <LayoutDashboard className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} aria-hidden />
                        <span className={cn('truncate text-[13px]', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
                          {board.name}
                        </span>
                      </button>
                      <RowMenu
                        label={board.name}
                        onRename={() => startEditing({ type: 'board', id: board.id }, board.name)}
                        onDelete={() => setPendingDelete({ type: 'board', id: board.id, name: board.name })}
                      />
                    </div>
                  </div>
                );
              })}
              {addingBoard ? (
                <div className="py-1">{renderInput(commitCreateBoard, 'Board name', 'New board name')}</div>
              ) : (
                activeWorkspace.boards.length > 0 && (
                  <button
                    onClick={() => { resetInputs(); setAddingBoard(true); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add board
                  </button>
                )
              )}
            </nav>
          )}
        </section>

        {/* Shared with me */}
        <section aria-label="Shared boards" className="mt-5">
          <p className="kala-section-label px-1 pb-1.5">Shared with me {sharedBoards.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal">{sharedBoards.length}</span>}</p>
          {sharedBoards.length === 0 ? (
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Boards others share with you will appear here.
            </p>
          ) : (
            <nav className="space-y-0.5" aria-label="Boards shared with me">
              {sharedBoards.map((board) => {
                const isActive = board.id === activeBoardId;
                return (
                  <div key={board.id} className="group relative flex items-center">
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full" style={{ background: 'var(--kala-coral)' }} aria-hidden />
                    )}
                    <button
                      onClick={() => onSelectBoard(board.id)}
                      aria-current={isActive ? 'page' : undefined}
                      title={board.owner ? `Owned by ${displayName(board.owner)} · ${ROLE_LABELS[board.role]}` : ROLE_LABELS[board.role]}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md py-0.5 pl-2 pr-2 transition-colors',
                        isActive ? 'bg-[#F2F0EB]' : 'hover:bg-muted/60'
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1.5 text-left">
                        <Users className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} aria-hidden />
                        <span className={cn('min-w-0 flex-1 truncate text-[13px]', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
                          {board.name}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" style={{ borderColor: 'var(--kala-line)' }}>
                        {ROLE_LABELS[board.role]}
                      </span>
                    </button>
                  </div>
                );
              })}
            </nav>
          )}
        </section>

        {/* Invitations */}
        {invitations.length > 0 && (
          <section aria-label="Pending invitations" className="mt-5">
            <p className="kala-section-label px-1 pb-1.5">
              Invitations <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: 'var(--kala-coral)' }}>{invitations.length}</span>
            </p>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.token} className="rounded-lg border bg-white p-2.5" style={{ borderColor: 'var(--kala-line)' }}>
                  <p className="truncate text-[13px] font-semibold text-foreground">{inv.board.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    From {displayName(inv.invitedBy)} · {ROLE_LABELS[inv.role]}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" className="h-7 flex-1 gap-1 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]" onClick={() => onAcceptInvitation(inv.token)}>
                      <Check className="h-3 w-3" aria-hidden />
                      Accept
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 bg-white text-xs" onClick={() => onDeclineInvitation(inv.token)}>
                      <X className="h-3 w-3" aria-hidden />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Bottom area: settings / profile / logout */}
      <div className="border-t bg-white p-2.5" style={{ borderColor: 'var(--kala-line)' }}>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/60"
                aria-label={user ? `Account: ${user.email}. Open account menu` : 'Open account menu'}
              >
                {user ? (
                  <MemberAvatar person={{ name: user.name ?? null, email: user.email }} />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">?</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{user?.email ?? 'Account'}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {invitations.length > 0 ? `${invitations.length} pending invite${invitations.length > 1 ? 's' : ''}` : 'View profile & invites'}
                  </span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-72 p-3" sideOffset={8}>
              <p className="text-[11px] text-muted-foreground">Signed in as</p>
              <p className="truncate text-sm font-semibold text-foreground">{user?.email}</p>
              <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--kala-line)' }}>
                <p className="kala-section-label pb-2">Invitations {invitations.length > 0 && `(${invitations.length})`}</p>
                {invitations.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No pending invitations.</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {invitations.map((invitation) => (
                      <div key={invitation.token} className="rounded-lg border p-2" style={{ borderColor: 'var(--kala-line)' }}>
                        <p className="truncate text-[13px] font-medium text-foreground">{invitation.board.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          From {displayName(invitation.invitedBy)} · {ROLE_LABELS[invitation.role]}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <Button size="sm" className="h-7 flex-1 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]" onClick={() => onAcceptInvitation(invitation.token)}>
                            <Check className="h-3 w-3" aria-hidden /> Accept
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 flex-1 bg-white text-xs" onClick={() => onDeclineInvitation(invitation.token)}>
                            <X className="h-3 w-3" aria-hidden /> Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Open settings"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden />
            Settings
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">Logout</span>
            </button>
          )}
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} user={user} workspaces={workspaces} sharedCount={sharedBoards.length} />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.type === 'workspace' ? 'workspace' : 'board'} &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === 'workspace'
                ? 'This permanently deletes the workspace and all of its boards, including their lists, cards, labels and checklists. This cannot be undone.'
                : 'This permanently deletes the board and all of its lists, cards, labels and checklists. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  user,
  workspaces,
  sharedCount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user?: User | null;
  workspaces: Workspace[];
  sharedCount: number;
}) {
  const boardCount = workspaces.reduce((n, w) => n + w.boards.length, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your Kala workspace preferences and account overview.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--kala-line)' }}>
            {user && <MemberAvatar person={{ name: user.name ?? null, email: user.email }} />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{user?.email ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Signed in · Kala Kanban & Flow</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: String(workspaces.length), v: 'Workspaces' },
              { k: String(boardCount), v: 'My boards' },
              { k: String(sharedCount), v: 'Shared' },
            ].map((s) => (
              <div key={s.v} className="rounded-lg bg-muted/60 px-2 py-3">
                <dt className="text-lg font-bold text-foreground">{s.k}</dt>
                <dd className="text-[11px] text-muted-foreground">{s.v}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg bg-[#F2F1ED] p-3 text-xs leading-relaxed text-muted-foreground">
            Kala uses a calm charcoal + coral + sage palette. Boards stay lightly styled on purpose:
            white cards, subtle borders and restrained shadows keep the focus on your work.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
