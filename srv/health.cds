using { sys.HealthStatus, sys.EntityCount } from '../db/types/health';

service health {
  @readonly 
  @cds.persistence.skip
  entity Health {
    profile : String(20);
    dbKind  : String(20);
    dbUrl   : String(255);
    seeded  : Boolean;
    counts  : array of EntityCount;
  };
}