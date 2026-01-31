// srv/importers/table-mapper.ts
import type { MDBRow, TransformedRow, BusinessKey } from '../types/index.js';

/**
 * Type Guard: Prüft ob ein Wert ein gültiger Key-Wert ist (string | number)
 */
function isValidKeyValue(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Type Guard: Extrahiert string | number aus TransformedRow-Wert
 */
function toKeyValue(value: string | number | boolean | null): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return null;
}

/**
 * Helper: Erstellt Business Key nur wenn alle Werte valid sind
 */
function createBusinessKey(keys: Record<string, unknown>): BusinessKey | null {
  const validKey: BusinessKey = {};
  
  for (const [field, value] of Object.entries(keys)) {
    if (!isValidKeyValue(value)) {
      return null;
    }
    validKey[field] = value;
  }
  
  return Object.keys(validKey).length > 0 ? validKey : null;
}

// ... TABLE_MAPPING und IMPORT_ORDER bleiben gleich ...

export const TABLE_MAPPING: Record<string, string> = {
  'tblShip': 'shipinfo.tblShip',
  'tblMainEngines': 'shipinfo.tblMainEngines',
  'tblAuxEngines': 'shipinfo.tblAuxEngines',
  'tblAuxiliaryGenerators': 'shipinfo.tblAuxiliaryGenerators',
  'tblBuilderDetails': 'shipinfo.tblBuilderDetails',
  'tblBuilderAndSubcontractorDetails': 'shipinfo.tblBuilderAndSubcontractorDetails',
  'tblBuilderAndSubcontractorLinkFile': 'shipinfo.tblBuilderAndSubcontractorLinkFile',
  'tblBuilderAssociations': 'shipinfo.tblBuilderAssociations',
  'tblCompanyDetailsAll': 'shipinfo.tblCompanyDetailsAll',
  'tblCompanyFullDetailsWithCodesAndParent': 'shipinfo.tblCompanyFullDetailsWithCodesAndParent',
  'tblDOCHistory': 'shipinfo.tblDOCHistory',
  'tblGroupBeneficialOwnerHistory': 'shipinfo.tblGroupBeneficialOwnerHistory',
  'tblIceClass': 'shipinfo.tblIceClass',
  'tblLiftingGear': 'shipinfo.tblLiftingGear',
  'tblMainGenerators': 'shipinfo.tblMainGenerators',
  'tblNameHistory': 'shipinfo.tblNameHistory',
  'tblOperatorHistory': 'shipinfo.tblOperatorHistory',
  'tblPropellers': 'shipinfo.tblPropellers',
  'tblRegisteredOwnerHistory': 'shipinfo.tblRegisteredOwnerHistory',
  'tblShipManagerHistory': 'shipinfo.tblShipManagerHistory',
  'tblShipTypeCodes': 'shipinfo.tblShipTypeCodes',
  'tblSpecialFeatures': 'shipinfo.tblSpecialFeatures',
  'tblStatusCodes': 'shipinfo.tblStatusCodes',
  'tblStatusHistory': 'shipinfo.tblStatusHistory',
  'tblSurveyDateHistory': 'shipinfo.tblSurveyDateHistory',
  'tblSurveyDates': 'shipinfo.tblSurveyDates',
  'tblThrusters': 'shipinfo.tblThrusters',
  'tblTownCodes': 'shipinfo.tblTownCodes'
} as const;

export const IMPORT_ORDER: ReadonlyArray<string> = [
  'tblStatusCodes',
  'tblShipTypeCodes',
  'tblTownCodes',
  'tblCompanyDetailsAll',
  'tblCompanyFullDetailsWithCodesAndParent',
  'tblBuilderDetails',
  'tblBuilderAndSubcontractorDetails',
  'tblShip',
  'tblMainEngines',
  'tblAuxEngines',
  'tblMainGenerators',
  'tblAuxiliaryGenerators',
  'tblPropellers',
  'tblThrusters',
  'tblIceClass',
  'tblLiftingGear',
  'tblSurveyDates',
  'tblSurveyDateHistory',
  'tblSpecialFeatures',
  'tblBuilderAndSubcontractorLinkFile',
  'tblBuilderAssociations',
  'tblNameHistory',
  'tblStatusHistory',
  'tblOperatorHistory',
  'tblShipManagerHistory',
  'tblRegisteredOwnerHistory',
  'tblGroupBeneficialOwnerHistory',
  'tblDOCHistory'
] as const;

/**
 * Transformiert MDB-Zeile zu CDS-kompatiblen Daten
 * ✅ Behandelt jetzt auch bigint und Buffer
 */
export function transformRow(row: MDBRow): TransformedRow {
  const transformed: TransformedRow = {};
  
  for (const [key, value] of Object.entries(row)) {
    // Null/Undefined beibehalten
    if (value === null || value === undefined) {
      transformed[key] = null;
      continue;
    }
    
    // String-Trimming
    if (typeof value === 'string') {
      const trimmed = value.trim();
      transformed[key] = trimmed === '' ? null : trimmed;
    }
    // Date-Konvertierung zu ISO String
    else if (value instanceof Date) {
      if (!isNaN(value.getTime())) {
        transformed[key] = value.toISOString();
      } else {
        transformed[key] = null;
      }
    }
    // ✅ BigInt zu Number konvertieren (vorsichtig bei großen Werten!)
    else if (typeof value === 'bigint') {
      // Prüfe ob BigInt in Number passt (MAX_SAFE_INTEGER)
      if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
        transformed[key] = Number(value);
      } else {
        // Zu groß → als String speichern
        transformed[key] = value.toString();
      }
    }
    // ✅ Buffer zu String konvertieren (z.B. für Memo-Felder)
    else if (value instanceof Buffer) {
      transformed[key] = value.toString('utf-8');
    }
    // Boolean und Numbers direkt übernehmen
    else if (typeof value === 'boolean' || typeof value === 'number') {
      transformed[key] = value;
    }
    // Alles andere zu String
    else {
      transformed[key] = String(value);
    }
  }
  
  return transformed;
}

// ✅ BUSINESS_KEY_MAPPINGS bleiben wie vorher
export const BUSINESS_KEY_MAPPINGS: Record<string, (row: TransformedRow) => BusinessKey | null> = {
  'tblShip': (row) => {
    const lrno = toKeyValue(row.LRIMOShipNo);
    return lrno ? createBusinessKey({ LRIMOShipNo: lrno }) : null;
  },
  
  'tblMainEngines': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const position = toKeyValue(row.Position);
    return lrno && position 
      ? createBusinessKey({ LRNO: lrno, Position: position }) 
      : null;
  },
  
  'tblAuxEngines': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.EngineSequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, EngineSequence: seq }) 
      : null;
  },
  
  'tblMainGenerators': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.SequenceNumber);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, SequenceNumber: seq }) 
      : null;
  },
  
  'tblAuxiliaryGenerators': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const num = toKeyValue(row.Number);
    return lrno && num 
      ? createBusinessKey({ LRNO: lrno, Number: num }) 
      : null;
  },
  
  'tblPropellers': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblThrusters': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblIceClass': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const code = toKeyValue(row.IceClassCode);
    return lrno && code 
      ? createBusinessKey({ LRNO: lrno, IceClassCode: code }) 
      : null;
  },
  
  'tblLiftingGear': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblSurveyDates': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const code = toKeyValue(row.ClassSocietyCode);
    return lrno && code 
      ? createBusinessKey({ LRNO: lrno, ClassSocietyCode: code }) 
      : null;
  },
  
  'tblSpecialFeatures': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblCompanyDetailsAll': (row) => {
    const code = toKeyValue(row.OWCODE);
    return code ? createBusinessKey({ OWCODE: code }) : null;
  },
  
  'tblCompanyFullDetailsWithCodesAndParent': (row) => {
    const code = toKeyValue(row.OWCODE);
    return code ? createBusinessKey({ OWCODE: code }) : null;
  },
  
  'tblBuilderDetails': (row) => {
    const code = toKeyValue(row.BuilderCode);
    return code ? createBusinessKey({ BuilderCode: code }) : null;
  },
  
  'tblBuilderAndSubcontractorDetails': (row) => {
    const code = toKeyValue(row.BuilderCode);
    return code ? createBusinessKey({ BuilderCode: code }) : null;
  },
  
  'tblBuilderAndSubcontractorLinkFile': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.SequenceNumber);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, SequenceNumber: seq }) 
      : null;
  },
  
  'tblBuilderAssociations': (row) => {
    const code1 = toKeyValue(row.BuilderCode);
    const code2 = toKeyValue(row.AssociatedBuilderCode);
    return code1 && code2 
      ? createBusinessKey({ BuilderCode: code1, AssociatedBuilderCode: code2 }) 
      : null;
  },
  
  'tblShipTypeCodes': (row) => {
    const code = toKeyValue(row.StatCode5);
    return code ? createBusinessKey({ StatCode5: code }) : null;
  },
  
  'tblStatusCodes': (row) => {
    const code = toKeyValue(row.StatusCode);
    return code ? createBusinessKey({ StatusCode: code }) : null;
  },
  
  'tblTownCodes': (row) => {
    const country = toKeyValue(row.CountryCode);
    const town = toKeyValue(row.TownCode);
    return country && town 
      ? createBusinessKey({ CountryCode: country, TownCode: town }) 
      : null;
  },
  
  'tblNameHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblStatusHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblOperatorHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblShipManagerHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblRegisteredOwnerHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblGroupBeneficialOwnerHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblDOCHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const seq = toKeyValue(row.Sequence);
    return lrno && seq 
      ? createBusinessKey({ LRNO: lrno, Sequence: seq }) 
      : null;
  },
  
  'tblSurveyDateHistory': (row) => {
    const lrno = toKeyValue(row.LRNO);
    const code = toKeyValue(row.ClassSocietyCode);
    return lrno && code 
      ? createBusinessKey({ LRNO: lrno, ClassSocietyCode: code }) 
      : null;
  }
};

export function getBusinessKey(tableName: string, row: TransformedRow): BusinessKey | null {
  const keyFn = BUSINESS_KEY_MAPPINGS[tableName];
  
  if (!keyFn) {
    console.warn(`⚠️  Kein Business Key Mapping für ${tableName}`);
    return null;
  }
  
  try {
    return keyFn(row);
  } catch (error) {
    console.error(`❌ Fehler beim Ermitteln des Business Key für ${tableName}:`, error);
    return null;
  }
}

export function isTableMapped(tableName: string): boolean {
  return tableName in TABLE_MAPPING;
}

export function getEntityName(tableName: string): string | null {
  return TABLE_MAPPING[tableName] || null;
}

export function getMappedTableNames(): string[] {
  return Object.keys(TABLE_MAPPING);
}
