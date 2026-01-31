// srv/types/index.ts

export interface ImportStats {
  tableName: string;
  rows: number;
  duration: number;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  duration?: number;
  stats?: Record<string, ImportStats>;
  importedTables?: ImportTableResult[];
}

export interface ImportTableResult {
  tableName: string;
  rowCount: number;
  duration: number;
}

export interface DeltaImportResult {
  success: boolean;
  message: string;
  updated: number;
  inserted: number;
  errors: number;
  duration?: number;
}

// ✅ Erweitert um bigint und Buffer (von mdb-reader)
export interface MDBRow {
  [key: string]: string | number | boolean | Date | bigint | Buffer | null | undefined;
}

export interface TransformedRow {
  [key: string]: string | number | boolean | null;
}

export interface BusinessKey {
  [key: string]: string | number;
}

export interface JobLogEntry {
  ID?: string;
  JobType: string;
  CreateDat?: Date;
  UpdateDat?: Date;
  StartTime: Date;
  EndTime?: Date;
  Success?: boolean;
  Status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  Message?: string;
}

export interface EntityUpdateStatusEntry {
  Entity: string;
  Key: string;
  LastDeltaUpdateDate: Date;
}
