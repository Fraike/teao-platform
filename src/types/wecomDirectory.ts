export interface WecomDirectoryMember {
  name: string;
  userId: string;
  departments?: string[];
}

export type WecomSuggestion =
  | { kind: 'matched'; userId: string }
  | { kind: 'missing' | 'ambiguous' | 'occupied' };

export interface WecomDirectorySummary {
  count: number;
  invalidRows: number;
  ambiguousNames: number;
  ambiguousIds: number;
}

export interface WecomDirectoryImportSummary extends WecomDirectorySummary {
  fillable: number;
  unchanged: number;
  conflicts: { name: string; reason: string }[];
  bindingRevision: string;
}
