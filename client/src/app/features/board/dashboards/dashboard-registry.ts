export type BoardLayout = 'default' | 'clockwise' | 'linear';

/** Single source of truth for the fixed switcher cycle (Decision: "no dropdown, fixed cycle") —
 * adding a fourth experimental layout is one entry here plus one `@case` in board-shell.html. */
export interface DashboardDescriptor {
  readonly id: BoardLayout;
  readonly label: string;
}

export const DASHBOARD_REGISTRY: readonly DashboardDescriptor[] = [
  { id: 'default', label: 'Default' },
  { id: 'clockwise', label: 'Clockwise' },
  { id: 'linear', label: 'Linear' },
];

export function labelOf(layout: BoardLayout): string {
  return DASHBOARD_REGISTRY.find((d) => d.id === layout)?.label ?? layout;
}

/** Advances to the next layout in cycle order, wrapping from the last entry back to the first. */
export function nextOf(layout: BoardLayout): BoardLayout {
  const index = DASHBOARD_REGISTRY.findIndex((d) => d.id === layout);
  const nextIndex = (index + 1) % DASHBOARD_REGISTRY.length;
  return DASHBOARD_REGISTRY[nextIndex].id;
}
