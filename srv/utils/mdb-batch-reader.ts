// srv/utils/mdb-batch-reader.ts
import { readFileSync } from 'node:fs';
import MDBReader from 'mdb-reader';

type BatchHandler = (rows: any[]) => Promise<void> | void;

export interface MDBBatchOptions {
  table: string;
  batchSize?: number;
  columns?: string[];
  password?: string;
}

/**
 * Liest MDB-Tabelle in Batches (paginiert)
 * Minimaler Speicherverbrauch durch rowOffset/rowLimit
 */
export async function readTableInBatches(
  filePath: string,
  { table, batchSize = 5000, columns, password }: MDBBatchOptions,
  onBatch: BatchHandler
): Promise<number> {
  // MDB-Datei als Buffer laden
  const buf = readFileSync(filePath);
  
  // Reader instanziieren
  const reader = new MDBReader(buf, password ? { password } : undefined);
  const tbl = reader.getTable(table);
  const total = tbl.rowCount;
  
  let offset = 0;
  let processedRows = 0;
  
  while (offset < total) {
    // Teilmenge lesen (paginiert)
    const rows = tbl.getData({
      columns,
      rowOffset: offset,
      rowLimit: Math.min(batchSize, total - offset)
    });
    
    // Batch verarbeiten
    await onBatch(rows);
    
    processedRows += rows.length;
    offset += rows.length;
  }
  
  return processedRows;
}

/**
 * Liste alle Tabellen in einer MDB-Datei
 */
export function listTables(filePath: string, password?: string): string[] {
  const buf = readFileSync(filePath);
  const reader = new MDBReader(buf, password ? { password } : undefined);
  return reader.getTableNames();
}

/**
 * Hole Tabellen-Metadaten
 */
export function getTableInfo(filePath: string, tableName: string, password?: string) {
  const buf = readFileSync(filePath);
  const reader = new MDBReader(buf, password ? { password } : undefined);
  const tbl = reader.getTable(tableName);
  
  return {
    name: tbl.name,
    rowCount: tbl.rowCount,
    columnCount: tbl.columnCount,
    columns: tbl.getColumnNames()
  };
}
