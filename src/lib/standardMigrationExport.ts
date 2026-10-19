import type { SanitaryMigrationPayload, SanitaryLegacySourcePayload, SourcedStandardImportRecord } from "../types/standardImport";

const SANITARY_SOURCE_HASH = "78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f";

export function sanitaryMigrationPayload(source: { fileHash: string; sheetName: string; records: SourcedStandardImportRecord[] }): SanitaryMigrationPayload | null {
  if (source.fileHash !== SANITARY_SOURCE_HASH || source.records.length !== 45
    || source.records.filter(record => record.fields.part_type === "盖").length !== 25
    || source.records.filter(record => record.fields.part_type === "座").length !== 20) return null;
  return { format: "teao-sanitary-migration-v1", sourceHash: source.fileHash, sourceSheet: source.sheetName, records: source.records };
}

export function sanitaryLegacySourcePayload(source: { fileHash: string; sheetName: string; records: SourcedStandardImportRecord[] }): SanitaryLegacySourcePayload | null {
  if (source.fileHash !== "f6267272947847810a542d7124f908bc03629ec243c6a65bf44719d34db89723"
    || source.records.length !== 70 || source.records.some(record => !record.serialNo.startsWith("WY-") || record.fields.part_type)) return null;
  return { format: "teao-sanitary-legacy-source-v1", sourceHash: source.fileHash, sourceSheet: source.sheetName, records: source.records };
}
