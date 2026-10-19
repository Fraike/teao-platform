import type { StandardRowSelectionStore } from "../types/standard";

export function createStandardRowSelection(): StandardRowSelectionStore {
  let selectedId: string | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isSelected: (id) => selectedId === id,
    toggle: (id) => {
      selectedId = selectedId === id ? null : id;
      listeners.forEach((listener) => listener());
    },
  };
}
