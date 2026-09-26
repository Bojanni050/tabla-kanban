// Normalized integration status.
//
// Kala's workflow model is lists: a card's status is simply the list it sits in, and
// there is no status column anywhere. External systems need a small, stable status set,
// so the integration API exposes a normalized status derived from the list title - the
// same idea the AI context code uses for "finished" lists.
//
// The mapping is configurable through INTEGRATION_STATUS_MAP, a JSON object of
// exact list titles (case-insensitive) to statuses, e.g.
//   INTEGRATION_STATUS_MAP={"Triaging":"todo","Building":"in_progress","Shipped":"completed"}
// Title patterns below cover common Kala boards when no override matches.

export type IntegrationStatus = 'created' | 'todo' | 'in_progress' | 'completed' | 'cancelled';

/** The statuses every list can normalize to. "created" only exists at creation time. */
export const LIST_STATUSES = ['todo', 'in_progress', 'completed', 'cancelled'] as const;

export type ListStatus = (typeof LIST_STATUSES)[number];

export const INTEGRATION_STATUSES: readonly IntegrationStatus[] = ['created', ...LIST_STATUSES];

const COMPLETED_RE = /^(done|completed?|finished|closed|shipped|released|archived?|afgerond|klaar|gedaan|voltooid)$/i;
const CANCELLED_RE = /^(cancelled|canceled|rejected|dropped|verworpen|geschrapt|wont do|won't do)$/i;
const IN_PROGRESS_RE = /^(doing|in[ _-]?progress|wip|in[ _-]?review|review|bezig)$/i;
const TODO_RE = /^(to[ _-]?do|todo|backlog|new|open|ready|planned|nieuw|gepland)$/i;

let overrides: Map<string, ListStatus> | null = null;

// Parsed lazily (and cached) so tests and operators can change the env between runs.
function titleOverrides(): Map<string, ListStatus> {
  if (overrides) return overrides;
  overrides = new Map();
  const raw = process.env.INTEGRATION_STATUS_MAP;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [title, status] of Object.entries(parsed)) {
        if (typeof status === 'string' && (LIST_STATUSES as readonly string[]).includes(status)) {
          overrides.set(title.trim().toLowerCase(), status as ListStatus);
        }
      }
    } catch {
      // A malformed map must not break the app; fall back to the default patterns.
    }
  }
  return overrides;
}

/** Reset the parsed INTEGRATION_STATUS_MAP cache (used by tests). */
export function reloadStatusOverrides(): void {
  overrides = null;
}

/** Normalized status of a card sitting in the list named `title`. */
export function statusForListTitle(title: string): ListStatus {
  const key = title.trim().toLowerCase();
  const override = titleOverrides().get(key);
  if (override) return override;
  if (COMPLETED_RE.test(key)) return 'completed';
  if (CANCELLED_RE.test(key)) return 'cancelled';
  if (IN_PROGRESS_RE.test(key)) return 'in_progress';
  if (TODO_RE.test(key)) return 'todo';
  // Unrecognized titles (e.g. "Waiting on legal") are still open work.
  return 'todo';
}

export interface ListLike {
  id: string;
  title: string;
  position: number;
}

/**
 * The list a normalized status maps to on a board: the first list (by position) whose
 * title normalizes to that status. Returns null when no list on the board matches.
 */
export function listForStatus<T extends ListLike>(lists: T[], status: ListStatus): T | null {
  const sorted = [...lists].sort((a, b) => a.position - b.position);
  return sorted.find((list) => statusForListTitle(list.title) === status) ?? null;
}
