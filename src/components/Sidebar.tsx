import { useState } from 'react';
import { LayoutDashboard, Plus, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Workspace, Board } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SidebarProps {
  workspaces: Workspace[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string, workspaceId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  workspaces,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set(workspaces.map((w) => w.id))
  );
  const [addingBoardFor, setAddingBoardFor] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  };

  const handleAddBoard = (workspaceId: string) => {
    if (!newBoardName.trim()) {
      setAddingBoardFor(null);
      return;
    }
    onCreateBoard(newBoardName.trim(), workspaceId);
    setNewBoardName('');
    setAddingBoardFor(null);
    setExpandedWorkspaces((prev) => new Set(prev).add(workspaceId));
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-14 flex-col items-center border-r border-border bg-card py-4">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Expand sidebar">
          <LayoutDashboard className="h-5 w-5" />
        </Button>
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

      <div className="px-3 pb-2">
        <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Workspaces
        </p>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {workspaces.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">No workspaces yet.</p>
        )}
        {workspaces.map((workspace) => {
          const expanded = expandedWorkspaces.has(workspace.id);
          return (
            <div key={workspace.id} className="mb-1">
              <button
                onClick={() => toggleWorkspace(workspace.id)}
                className="group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="truncate">{workspace.name}</span>
              </button>

              {expanded && (
                <div className="ml-3 mt-0.5 border-l border-border pl-2">
                  {workspace.boards.map((board: Board) => (
                    <button
                      key={board.id}
                      onClick={() => onSelectBoard(board.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        board.id === activeBoardId
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )}
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{board.name}</span>
                    </button>
                  ))}

                  {addingBoardFor === workspace.id ? (
                    <div className="px-2 py-1.5">
                      <Input
                        autoFocus
                        value={newBoardName}
                        onChange={(e) => setNewBoardName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddBoard(workspace.id);
                          if (e.key === 'Escape') {
                            setAddingBoardFor(null);
                            setNewBoardName('');
                          }
                        }}
                        onBlur={() => handleAddBoard(workspace.id)}
                        placeholder="Board name"
                        className="h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingBoardFor(workspace.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add board</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Settings</span>
        </div>
      </div>
    </div>
  );
}
