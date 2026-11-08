import type { Dataset, FileName, ParsedTable } from "../analytics/types";

export const CONTRACT_VERSION = "goflow-operational-csv/v1" as const;
export const IMPORT_LIMITS = { fileBytes: 35 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, rowsPerFile: 500000, displayedIssues: 80 } as const;
export interface ParameterForm {
  operation: string; referenceDate: string; horizonStart: string; horizonEnd: string;
  budget: string; servicePercent: string; annualCapitalPercent: string;
  monthlyStoragePercent: string; maxDiscountPercent: string; demandWindowDays: string;
}
export interface OperationalParameters {
  operation: string; referenceDate: string; horizonStart: string; horizonEnd: string;
  budgetCents: number; serviceBps: number; annualCapitalBps: number;
  monthlyStorageBps: number; maxDiscountBps: number; demandWindowDays: 30 | 60 | 90;
}
export interface Recognition {
  id: string; name: string; bytes: number; candidates: FileName[];
  assigned: FileName | null; sampleTypesValid: boolean; records: number;
  problem?: string;
}
export interface InspectedFile { recognition: Recognition; header: string[]; rows: string[][] }
export interface ImportIssue {
  severity: "error" | "warning"; code: string; message: string;
  fileId?: string; field?: string; records?: number[];
}
export interface FileSummary {
  id: string; name: string; type: FileName; inputRecords: number; acceptedRecords: number;
  start: string | null; end: string | null;
}
export interface ImportReport {
  canProcess: boolean; errors: number; warnings: number; issues: ImportIssue[];
  hiddenIssues: number; files: FileSummary[];
}
export interface ImportedOperation {
  contractVersion: typeof CONTRACT_VERSION; source: "imported_local";
  parameters: OperationalParameters; dataset: Dataset;
  metadata: { files: FileSummary[]; warnings: number; duplicatePolicy: Dataset["policy"] };
}
export interface ValidationResult { report: ImportReport; operation: ImportedOperation | null }
export type Progress = { phase: "read" | "validate" | "normalize" | "ready"; completed: number; total: number };
export type WorkerRequest =
  | { kind: "inspect"; files: File[] }
  | { kind: "validate"; assignments: Record<string, FileName | null>; parameters: ParameterForm }
  | { kind: "process" };
export type WorkerResponse =
  | { kind: "progress"; progress: Progress }
  | { kind: "recognized"; files: Recognition[] }
  | { kind: "validated"; report: ImportReport }
  | { kind: "processed"; operation: ImportedOperation }
  | { kind: "failure"; message: string };
export type CanonicalTables = ParsedTable[];
