namespace sys;

type EntityCount {
  entity : String(120);
  rows   : Integer64;
}

type HealthStatus {
  profile : String(20);
  dbKind  : String(20);
  dbUrl   : String(255);
  seeded  : Boolean;
  counts  : array of EntityCount;
};
