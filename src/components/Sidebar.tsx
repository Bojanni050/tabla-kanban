import { useState } from 'react';
import { Briefcase, LayoutDashboard, Plus, ChevronRight, LogOut, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Workspace, Board, User } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface SidebarProps {
  workspaces: Workspace[];
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

interface RowMenuProps {
  label: string;
  onRename: () => void;
  onDelete: () => void;
}

function RowMenu({ label, onRename, onDelete }: RowMenuProps) {
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

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

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

  const renderInput = (onCommit: () => void, placeholder: string) => (
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
      maxLength={100}
      className="h-7 text-xs"
    />
  );

  if (collapsed) {
    return (
      <div className="flex h-full w-14 flex-col items-center justify-between border-r border-border bg-card py-4">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Expand sidebar">
          <LayoutDashboard className="h-5 w-5" />
        </Button>
        {user && onLogout && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title={`Log out (${user.email})`}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      {/* Logo / Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Kanban</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleCollapse} title="Collapse sidebar">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {/* Workspaces */}
        <div className="px-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspaces
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => {
                resetInputs();
                setCreatingWorkspace(true);
              }}
              title="Create workspace"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {workspaces.length === 0 && !creatingWorkspace && (
            <p className="px-2 py-2 text-sm text-muted-foreground">No workspaces yet.</p>
          )}

          {workspaces.map((workspace) => {
            const isEditing = editing?.type === 'workspace' && editing.id === workspace.id;
            if (isEditing) {
              return (
                <div key={workspace.id} className="px-2 py-1">
                  {renderInput(() => commitRename(workspace.name), 'Workspace name')}
                </div>
              );
            }
            return (
              <div
                key={workspace.id}
                className={cn(
                  'group flex items-center rounded-md pr-1 transition-colors',
                  workspace.id === activeWorkspaceId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50'
                )}
              >
                <button
                  onClick={() => onSelectWorkspace(workspace.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm font-medium"
                >
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{workspace.name}</span>
                </button>
                <RowMenu
                  label={workspace.name}
                  onRename={() => startEditing({ type: 'workspace', id: workspace.id }, workspace.name)}
                  onDelete={() =>
                    setPendingDelete({ type: 'workspace', id: workspace.id, name: workspace.name })
                  }
                />
              </div>
            );
          })}

          {creatingWorkspace && (
            <div className="px-2 py-1">{renderInput(commitCreateWorkspace, 'Workspace name')}</div>
          )}
        </div>

        {/* Boards of the selected workspace */}
        {activeWorkspace && (
          <div className="mt-4 px-2">
            <p className="truncate px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Boards in {activeWorkspace.name}
            </p>

            {activeWorkspace.boards.map((board: Board) => {
              const isEditing = editing?.type === 'board' && editing.id === board.id;
              if (isEditing) {
                return (
                  <div key={board.id} className="px-2 py-1">
                    {renderInput(() => commitRename(board.name), 'Board name')}
                  </div>
                );
              }
              return (
                <div
                  key={board.id}
                  className={cn(
                    'group flex items-center rounded-md pr-1 transition-colors',
                    board.id === activeBoardId
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <button
                    onClick={() => onSelectBoard(board.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{board.name}</span>
                  </button>
                  <RowMenu
                    label={board.name}
                    onRename={() => startEditing({ type: 'board', id: board.id }, board.name)}
                    onDelete={() => setPendingDelete({ type: 'board', id: board.id, name: board.name })}
                  />
                </div>
              );
            })}

            {activeWorkspace.boards.length === 0 && !addingBoard && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No boards yet.</p>
            )}

            {addingBoard ? (
              <div className="px-2 py-1">{renderInput(commitCreateBoard, 'Board name')}</div>
            ) : (
              <button
                onClick={() => {
                  resetInputs();
                  setAddingBoard(true);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add board</span>
              </button>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.type === 'workspace' ? 'workspace' : 'board'} "{pendingDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === 'workspace'
                ? 'This permanently deletes the workspace and all of its boards, including their lists, cards, labels and checklists. This cannot be undone.'
                : 'This permanently deletes the board and all of its lists, cards, labels and checklists. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Footer / User Info */}
      {user && (
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-xs">
                {user.email ? user.email[0].toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{user.email}</p>
              </div>
            </div>
            {onLogout && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onLogout}
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
