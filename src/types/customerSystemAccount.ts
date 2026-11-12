export interface CustomerAccountDetails {
  company: string;
  url: string;
  username: string;
  note: string;
}

export interface CustomerAccountInput extends CustomerAccountDetails {
  password: string;
}

export interface CustomerAccount extends CustomerAccountDetails {
  id: string;
  revision: number;
  passwordChangedAt: string | null;
  hasPassword?: boolean;
  sourceRows?: { rowNumber: number; issues: string[] }[];
}

export interface CustomerAccountPasswordChange {
  id: number;
  changedAt: string;
  actorName: string;
  reason: string;
}

export interface CustomerAccountImportRow {
  rowNumber: number;
  account: CustomerAccountInput;
}

export interface CustomerAccountImportResult {
  imported: number;
  duplicates: number[];
}

export interface CustomerAccountArchiveCell {
  column: string;
  value: string;
  hyperlink?: string;
  formula?: string;
}

export interface CustomerAccountArchiveRow extends CustomerAccountImportRow {
  issues: string[];
  cells: CustomerAccountArchiveCell[];
}
