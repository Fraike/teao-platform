import type { StandardImportRecord } from "./standard";

export interface SanitaryMigrationPayload {
  format: "teao-sanitary-migration-v1";
  sourceHash: string;
  sourceSheet: string;
  records: SourcedStandardImportRecord[];
}

export interface SanitaryLegacySourcePayload {
  format: "teao-sanitary-legacy-source-v1";
  sourceHash: string;
  sourceSheet: string;
  records: SourcedStandardImportRecord[];
}

export interface StandardImportRowRecord extends StandardImportRecord {
  sourceRow: number;
}

export interface SourcedStandardImportRecord extends StandardImportRowRecord {
  sourceHash: string;
  sourceSheet: string;
}

export interface StandardImportSource {
  sheetName: string;
  range: string;
  rowCount: number;
  columnCount: number;
}

export interface StandardImportFileResult {
  records: SourcedStandardImportRecord[];
  errors: string[];
  warnings: string[];
  fileHash: string;
  source: StandardImportSource;
}

export type StandardImportWorkerResponse =
  | { ok: true; data: StandardImportFileResult }
  | { ok: false; error: string };

export type StandardImportScope = "main" | "sanitary";
export type StandardImportWorkerRequest = ArrayBuffer | { buffer: ArrayBuffer; scope: StandardImportScope };
