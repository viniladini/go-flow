import type { ImportedOperation } from "./types";

export interface ImportSnapshot { source: "demo" | "imported_local"; operation: ImportedOperation | null; revision: number }
export function createImportSession() {
  let snapshot: ImportSnapshot = { source: "demo", operation: null, revision: 0 };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear: () => { snapshot = { source: "demo", operation: null, revision: snapshot.revision + 1 }; emit(); return snapshot.revision; },
    commit: (operation: ImportedOperation, expectedRevision: number) => {
      if (expectedRevision !== snapshot.revision) return false;
      snapshot = { source: "imported_local", operation, revision: snapshot.revision + 1 }; emit(); return true;
    },
  };
}
export type ImportSession = ReturnType<typeof createImportSession>;
