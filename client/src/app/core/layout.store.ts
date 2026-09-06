import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { labelOf, nextOf, type BoardLayout } from '../features/board/dashboards/dashboard-registry';

export type { BoardLayout };

// Matches socket.service.ts's `perudo:<name>` localStorage key convention.
const LAYOUT_STORAGE_KEY = 'perudo:boardLayout';

/** Falls back to 'default' on a missing, malformed, or unknown stored value — same guarded-read
 * style as socket.service.ts's `loadSession` (there is no SSR guard in this codebase either). */
function readStoredLayout(): BoardLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === 'default' || stored === 'clockwise' || stored === 'linear') {
      return stored;
    }
  } catch {
    // Ignore and fall through to the default below.
  }
  return 'default';
}

/**
 * The active board dashboard (Default/Clockwise/Linear) and the one fixed cycle between them.
 * `cycleLayout()` is the only public mutator — the product decision is a fixed cycle, not an
 * arbitrary setter/dropdown.
 */
export const LayoutStore = signalStore(
  { providedIn: 'root' },
  withState<{ activeLayout: BoardLayout }>({ activeLayout: 'default' }),
  withComputed((store) => ({
    nextLayoutLabel: computed(() => labelOf(nextOf(store.activeLayout()))),
  })),
  withMethods((store) => ({
    cycleLayout(): void {
      const next = nextOf(store.activeLayout());
      patchState(store, { activeLayout: next });
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, next);
      } catch {
        // Best-effort persistence only — a failed write just means the choice doesn't survive reload.
      }
    },
  })),
  withHooks({
    onInit(store) {
      patchState(store, { activeLayout: readStoredLayout() });
    },
  }),
);
