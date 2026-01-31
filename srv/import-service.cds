// srv/import-service.cds
using { skf.zcapn.shipimporter as si } from '../db/schema';

service ImportService @(requires: 'authenticated-user') {
    
    // Import Actions
    action importFromMDB(filePath: String) returns {
        success: Boolean;
        message: String;
        importedTables: array of {
            tableName: String;
            rowCount: Integer;
            duration: Integer;
        };
    };
    
    action importDeltaJSON(filePath: String) returns {
        success: Boolean;
        message: String;
        updated: Integer;
        inserted: Integer;
        errors: Integer;
    };
    
    // Monitoring
    entity JobLog as projection on si.jobLog;
    entity EntityUpdateStatus as projection on si.entityUpdateStatus;
}
