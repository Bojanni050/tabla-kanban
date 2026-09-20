import { useState, useRef, useEffect } from 'react';
import { Plus, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { BoardWithDetails, Card } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListView } from './ListView';

interface BoardViewProps {
  board: BoardWithDetails;
  onAddList: (title: string, boardId: string) => void;
  onAddCard: (title: string, listId: string) => void;
  onDeleteList: (listId: string) => void;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onEditCard: (cardId: string, title: string) => Promise<boolean>;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function BoardView({
  board,
  onAddList,
  onAddCard,
  onDeleteList,
  onDeleteCard,
  onEditCard,
  sidebarCollapsed,
  onToggleSidebar,
}: BoardViewProps) {
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const listInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddingList && listInputRef.current) {
      listInputRef.current.focus();
    }
  }, [isAddingList]);

  const handleAddList = () => {
    if (!newListTitle.trim()) {
      setIsAddingList(false);
      setNewListTitle('');
      return;
    }
    onAddList(newListTitle.trim(), board.id);
    setNewListTitle('');
    setIsAddingList(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Board header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {board.name}
        </h1>
        <span className="text-sm text-muted-foreground">
          {board.workspace?.name}
        </span>
      </div>

      {/* Lists - horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-3 p-4">
          {board.lists.map((list) => (
            <ListView
              key={list.id}
              list={list}
              onAddCard={onAddCard}
              onDeleteList={onDeleteList}
              onDeleteCard={onDeleteCard}
              onEditCard={onEditCard}
            />
          ))}

          {/* Add list */}
          <div className="w-72 shrink-0">
            {isAddingList ? (
              <div className="rounded-xl border border-border bg-muted/40 p-2.5">
                <Input
                  ref={listInputRef}
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddList();
                    if (e.key === 'Escape') {
                      setIsAddingList(false);
                      setNewListTitle('');
                    }
                  }}
                  placeholder="Enter list title..."
                  className="h-8 text-sm"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handleAddList} className="h-7 text-xs">
                    Add list
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setIsAddingList(false);
                      setNewListTitle('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingList(true)}
                className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>Add another list</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { Card };
