# Plan: Drag-and-drop cards within a list (visual only)

## Goal
Let a user grab a card and drag it up or down to reorder it **within its current list**. The new order is reflected on screen immediately. Nothing is saved and nothing else changes.

## In scope
- A card can be picked up and dropped at a new position among the other cards in the same list.
- While dragging, there is light visual feedback: the card being dragged looks "lifted"/dimmed, and the spot where it will land is indicated.
- The reordered position holds on screen for the rest of the session (until the board is switched or the page is reloaded).
- All current behavior stays exactly as-is: adding cards, editing a card, deleting a card (with its confirm dialog), adding/deleting lists, renaming a list, the sidebar, and the demo-data fallback.

## Explicitly out of scope (per request)
- No database or schema changes.
- No API call to save the new order — reload/board-switch resets to the original order.
- No moving cards between different lists.
- No dragging/reordering of whole lists.
- No new features and no visual redesign of the board or cards.

## Assumptions (chosen for you — flag if you disagree)
- Uses the browser's built-in drag-and-drop (no new drag library added), so the existing look and code stay intact.
- Reordering is handled in the app's current in-memory board state so that adding/editing/deleting a card keeps working normally alongside the new order.
- Drag is initiated by dragging the card itself (the whole card is the drag handle); the existing hover edit/delete buttons continue to work on click as before.

## How you'll know it's done
- Drag a card above or below others in the same list → it settles into the new spot and stays there.
- Try to drag a card into another list → it does not move there.
- Add, rename, and delete cards/lists → all behave as they did before.
