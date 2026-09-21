import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Check, Copy, Loader2, RotateCcw, SendHorizontal, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { AiStatus, CardAiAction } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Kala AI side panel. It sits next to the board (it does not cover it) and shows the current
// conversation. Kala AI is read-only: every answer is a suggestion, and nothing here changes
// board data. All requests go to the Kala backend, never to an AI provider directly.

const BOARD_PROMPTS = [
  'Summarize this board.',
  'What tasks are overdue?',
  'What are the highest-priority open tasks?',
  'What should I focus on this week?',
  'Which cards appear blocked?',
  'Which cards have no deadline?',
  'Summarize the recent activity.',
  'What are the main things that still need to be done?',
];

const CARD_ACTIONS: { action: CardAiAction; label: string }[] = [
  { action: 'improve_description', label: 'Improve this description' },
  { action: 'summarize_card', label: 'Summarize this card' },
  { action: 'suggest_checklist', label: 'Suggest a checklist' },
  { action: 'missing_info', label: 'Identify missing information' },
  { action: 'suggest_priority', label: 'Suggest a priority' },
  { action: 'suggest_deadline', label: 'Suggest a deadline' },
];

const MAX_HISTORY = 12;
const line = { borderColor: 'var(--kala-line)' };

interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  action?: CardAiAction;
  error?: boolean;
}

// ---- Minimal, safe Markdown (paragraphs, bullets, numbers, **bold**, `code`) ---------------

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={key++} className="font-semibold text-foreground">{match[1]}</strong>);
    else nodes.push(<code key={key++} className="rounded bg-[#EFEDE8] px-1 text-[12px]">{match[2]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MessageText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{renderInline(paragraph.join(' '))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={cn('space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
        {list.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
      </Tag>
    );
    list = null;
  };

  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const row = raw.trimEnd();
    const bullet = row.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = row.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = row.match(/^#{1,6}\s+(.*)$/);
    if (!row.trim()) {
      flushParagraph();
      flushList();
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<p key={blocks.length} className="font-semibold text-foreground">{renderInline(heading[1])}</p>);
    } else {
      flushList();
      paragraph.push(row.trim());
    }
  }
  flushParagraph();
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

// ---- Panel --------------------------------------------------------------------------------

interface AiPanelProps {
  open: boolean;
  boardId: string;
  boardName: string;
  /** When set, the conversation is about this card (plus the board around it). */
  card: { id: string; title: string } | null;
  onClearCard: () => void;
  onClose: () => void;
}

export function AiPanel({ open, boardId, boardName, card, onClearCard, onClose }: AiPanelProps) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const enabled: boolean | null = status ? status.enabled : null;
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const nextId = useRef(1);
  const requestSeq = useRef(0); // lets us ignore an answer that arrives after a reset
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ask the server whether Kala AI works for this user (and with which provider) every time the
  // panel opens, and again when they change their AI settings.
  const refreshStatus = useCallback(() => {
    api.getAiStatus().then(setStatus).catch(() => setStatus({ enabled: true }));
  }, []);
  useEffect(() => {
    if (open) refreshStatus();
  }, [open, refreshStatus]);
  useEffect(() => {
    window.addEventListener('kala-ai-settings-changed', refreshStatus);
    return () => window.removeEventListener('kala-ai-settings-changed', refreshStatus);
  }, [refreshStatus]);

  const reset = useCallback(() => {
    requestSeq.current++;
    setMessages([]);
    setInput('');
    setLoading(false);
  }, []);

  // A different card (or back to the whole board) starts a fresh conversation, so context
  // from one card never leaks into questions about another.
  const cardId = card?.id ?? null;
  useEffect(() => {
    reset();
  }, [cardId, reset]);

  useEffect(() => {
    if (open && enabled) inputRef.current?.focus();
  }, [open, enabled, cardId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string, action?: CardAiAction) => {
      const content = text.trim();
      if (!content || loading) return;
      const seq = ++requestSeq.current;

      const userMessage: UiMessage = { id: nextId.current++, role: 'user', content, action };
      const history = [...messages.filter((m) => !m.error), userMessage];
      setMessages((prev) => [...prev.filter((m) => !m.error), userMessage]);
      setInput('');
      setLoading(true);

      // Send the recent turns only, and always start with a user turn.
      const turns = history.slice(-MAX_HISTORY);
      while (turns.length > 1 && turns[0].role === 'assistant') turns.shift();

      try {
        const { reply } = await api.askKalaAi(boardId, {
          messages: turns.map((m) => ({ role: m.role, content: m.content })),
          cardId: card?.id,
          action,
          today: format(new Date(), 'yyyy-MM-dd'),
        });
        if (seq !== requestSeq.current) return;
        setMessages((prev) => [...prev, { id: nextId.current++, role: 'assistant', content: reply }]);
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setMessages((prev) => [
          ...prev,
          { id: nextId.current++, role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.', error: true },
        ]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [boardId, card?.id, loading, messages]
  );

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // Drop the failed attempt (error bubble + its question); send() adds the question again.
    setMessages((prev) => prev.filter((m) => !m.error && m.id !== lastUser.id));
    requestSeq.current++;
    setLoading(false);
    setTimeout(() => void send(lastUser.content, lastUser.action), 0);
  };

  const copy = async (message: UiMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1600);
    } catch {
      // Clipboard unavailable - the text is still selectable in the panel.
    }
  };

  const chipClass = 'rounded-lg border bg-white px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-[#FAFAF8] disabled:opacity-50';

  return (
    <aside
      aria-label="Kala AI"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className={cn(
        open ? 'flex' : 'hidden',
        'fixed inset-y-0 right-0 z-40 w-full max-w-[420px] flex-col border-l bg-white shadow-xl md:static md:z-auto md:w-[400px] md:max-w-none md:shrink-0 md:shadow-none'
      )}
      style={line}
    >
      {/* Header */}
      <header className="flex items-center gap-2 border-b px-4 py-3" style={line}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'var(--kala-coral-soft)' }}>
          <Sparkles className="h-4 w-4" style={{ color: 'var(--kala-coral-strong)' }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">Kala AI</h2>
          <p className="truncate text-[11px] leading-tight text-muted-foreground" title={status?.enabled ? `${status.provider} · ${status.model}` : undefined}>
            Read-only assistant{status?.enabled && status.provider ? ` · ${status.provider}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={reset} disabled={messages.length === 0 && !loading} aria-label="Start a new conversation" title="New conversation">
          <RotateCcw className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close Kala AI" title="Close">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      {/* What the conversation is about */}
      <div className="flex items-center gap-2 border-b px-4 py-2 text-xs" style={line}>
        {card ? (
          <>
            <span className="shrink-0 text-muted-foreground">Card</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={card.title}>{card.title}</span>
            <button type="button" onClick={onClearCard} className="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Ask about the whole board
            </button>
          </>
        ) : (
          <>
            <span className="shrink-0 text-muted-foreground">Board</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={boardName}>{boardName}</span>
          </>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed" aria-live="polite">
        {enabled === false ? (
          <div className="rounded-lg border p-3 text-muted-foreground" style={line}>
            <p className="font-medium text-foreground">Kala AI isn&rsquo;t ready yet.</p>
            <p className="mt-1">{status?.message ?? 'Kala AI is not set up yet.'} Your boards work as usual in the meantime.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              {card
                ? 'Ask about this card. Kala AI only makes suggestions - it never changes your card.'
                : 'Ask anything about this board. Kala AI reads the lists, cards, deadlines, priorities and recent activity - and never changes anything.'}
            </p>
            <div className="flex flex-col gap-1.5">
              {card
                ? CARD_ACTIONS.map(({ action, label }) => (
                    <button key={action} type="button" className={chipClass} style={line} onClick={() => void send(label, action)}>
                      {label}
                    </button>
                  ))
                : BOARD_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" className={chipClass} style={line} onClick={() => void send(prompt)}>
                      {prompt}
                    </button>
                  ))}
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#2A2F36] px-3 py-2 text-white">
                {message.content}
              </div>
            ) : (
              <div key={message.id} className="mr-auto max-w-[95%]">
                <div
                  className={cn(
                    'rounded-2xl rounded-bl-md border px-3 py-2',
                    message.error ? 'border-destructive/25 bg-destructive/[0.06] text-destructive' : 'bg-[#FAFAF8] text-foreground/90'
                  )}
                  style={message.error ? undefined : line}
                  role={message.error ? 'alert' : undefined}
                >
                  {message.error ? message.content : <MessageText text={message.content} />}
                </div>
                <div className="mt-1 flex items-center gap-1 pl-1">
                  {message.error ? (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground" onClick={retry}>
                      <RotateCcw className="h-3 w-3" aria-hidden /> Try again
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground" onClick={() => void copy(message)} aria-label="Copy answer">
                      {copiedId === message.id ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                      {copiedId === message.id ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </div>
              </div>
            )
          )
        )}
        {loading && (
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Kala AI is reading the board&hellip;
          </div>
        )}
      </div>

      {/* Quick actions once a card conversation is under way */}
      {enabled !== false && card && messages.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t px-4 py-2" style={line}>
          {CARD_ACTIONS.map(({ action, label }) => (
            <button key={action} type="button" disabled={loading} className="shrink-0 rounded-full border bg-white px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-[#FAFAF8] hover:text-foreground disabled:opacity-50" style={line} onClick={() => void send(label, action)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        className="border-t p-3"
        style={line}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        noValidate
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={2000}
            disabled={enabled === false}
            placeholder={card ? 'Ask about this card…' : 'Ask about this board…'}
            aria-label="Message to Kala AI"
            className="min-h-0 resize-none bg-white text-[13px]"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0 bg-[#2A2F36] text-white hover:bg-[#1E2329]" disabled={!input.trim() || loading || enabled === false} aria-label="Send">
            <SendHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Kala AI reads this board and can make mistakes. It never changes your data.
        </p>
      </form>
    </aside>
  );
}
