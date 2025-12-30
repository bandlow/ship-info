using skf.zcapn.shipimporter as ship from '../db/schema';

service ShipInfoService {
  //@odata.draft.enabled
  entity tblShip as projection on ship.tblShip;
  entity tblMainEngines as projection on ship.tblMainEngines;
  //entity tblShipTypeCodes as projection on ship.tblShipTypeCodes;
  //entity tblStatusCodes as projection on ship.tblStatusCodes;
  //entity tblBuilderDetails as projection on ship.tblBuilderDetails;
  //entity tblAuxEngines as projection on ship.tblAuxEngines;
  //entity tblAuxiliaryGenerators as projection on ship.tblAuxiliaryGenerators;
  // ... alle weiteren nach Bedarf
}
