import type { StandardRowSelectionStore } from "../types/standard";

export function createStandardRowSelection(initialId: string | null = null, onChange?: (id: string | null) => void): StandardRowSelectionStore {
  let selectedId: string | null = initialId;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isSelected: (id) => selectedId === id,
    toggle: (id) => {
      selectedId = selectedId === id ? null : id;
      onChange?.(selectedId);
      listeners.forEach((listener) => listener());
    },
  };
}
