-- ----------------------------------------------------------
-- MDB Tools - A library for reading MS Access database files
-- Copyright (C) 2000-2011 Brian Bruns and others.
-- Files in libmdb are licensed under LGPL and the utilities under
-- the GPL, see COPYING.LIB and COPYING files respectively.
-- Check out http://mdbtools.sourceforge.net
-- ----------------------------------------------------------

-- That file uses encoding UTF-8

CREATE TABLE `tblAuxEngines`
 (
	`LRNO`			varchar, 
	`EngineSequence`			varchar, 
	`EngineBuilder`			varchar, 
	`EngineDesigner`			varchar, 
	`EngineModel`			varchar, 
	`NumberOfCylinders`			varchar, 
	`Bore`			varchar, 
	`Stroke`			varchar, 
	`StrokeType`			varchar, 
	`MaxPower`			varchar
);

CREATE TABLE `tblAuxiliaryGenerators`
 (
	`LRNO`			varchar, 
	`Number`			INTEGER, 
	`KWEach`			INTEGER, 
	`Voltage1`			INTEGER, 
	`Voltage2`			INTEGER, 
	`Frequency`			INTEGER, 
	`ACDC`			varchar, 
	`MainEngineDriven`			varchar
);

CREATE TABLE `tblBuilderAndSubcontractorDetails`
 (
	`BuilderCode`			varchar, 
	`ShipbuilderFullStyle`			TEXT, 
	`Shipbuilder`			varchar, 
	`FullAddress`			varchar, 
	`CountryName`			varchar, 
	`Contact`			varchar, 
	`EmailAddress`			varchar, 
	`Facsimilie`			varchar, 
	`Telephone`			varchar, 
	`Telex`			varchar, 
	`Website`			varchar, 
	`CountryCode`			varchar, 
	`TownCode`			varchar, 
	`BuilderStatus`			varchar
);

CREATE TABLE `tblBuilderAndSubcontractorLinkFile`
 (
	`LRNO`			varchar, 
	`SequenceNumber`			varchar, 
	`BuilderCode`			varchar, 
	`Section`			varchar
);

CREATE TABLE `tblBuilderAssociations`
 (
	`BuilderCode`			varchar, 
	`AssociatedBuilderCode`			varchar
);

CREATE TABLE `tblBuilderDetails`
 (
	`BuilderCode`			varchar, 
	`ShipbuilderFullStyle`			TEXT, 
	`Shipbuilder`			varchar, 
	`FullAddress`			varchar, 
	`CountryName`			varchar, 
	`Contact`			varchar, 
	`EmailAddress`			varchar, 
	`Facsimilie`			varchar, 
	`Telephone`			varchar, 
	`Telex`			varchar, 
	`Website`			varchar, 
	`CountryCode`			varchar, 
	`TownCode`			varchar, 
	`BuilderStatus`			varchar
);

CREATE TABLE `tblCompanyDetailsAll`
 (
	`OWCODE`			varchar, 
	`ShortCompanyName`			varchar, 
	`CountryName`			varchar, 
	`Telephone`			varchar, 
	`Telex`			varchar, 
	`Facsimilie`			varchar, 
	`Emailaddress`			varchar, 
	`Website`			varchar, 
	`FullName`			TEXT, 
	`FullAdress`			TEXT, 
	`NationalityofRegistration`			varchar, 
	`NationalityofControl`			varchar, 
	`LastChangeDate`			varchar, 
	`CompanyStatus`			varchar
);

CREATE TABLE `tblCompanyFullDetailsWithCodesAndParent`
 (
	`OWCODE`			varchar, 
	`ShortCompanyName`			varchar, 
	`CountryName`			varchar, 
	`TownName`			varchar, 
	`Telephone`			varchar, 
	`Telex`			varchar, 
	`Facsimilie`			varchar, 
	`Emailaddress`			varchar, 
	`Website`			varchar, 
	`FullName`			TEXT, 
	`FullAdress`			TEXT, 
	`CareOfCode`			varchar, 
	`RoomFloorBuilding1`			varchar, 
	`RoomFloorBuilding2`			varchar, 
	`RoomFloorBuilding3`			varchar, 
	`POBox`			varchar, 
	`StreetNumber`			varchar, 
	`Street`			varchar, 
	`PrePostcode`			varchar, 
	`PostPostcode`			varchar, 
	`NationalityofRegistration`			varchar, 
	`NationalityofControl`			varchar, 
	`LocationCode`			varchar, 
	`NationalityofRegistrationCode`			varchar, 
	`NationalityofControlCode`			varchar, 
	`LastChangeDate`			varchar, 
	`parentCompany`			varchar
);

CREATE TABLE `tblDOCHistory`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`EffectiveDate`			varchar, 
	`DOCCompany`			varchar, 
	`DOCCompanyCode`			varchar, 
	`CompanyStatus`			varchar
);

CREATE TABLE `tblGroupBeneficialOwnerHistory`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`EffectiveDate`			varchar, 
	`GroupBeneficialOwner`			varchar, 
	`GroupBeneficialOwnerCode`			varchar
);

CREATE TABLE `tblIceClass`
 (
	`LRNO`			varchar, 
	`IceClassCode`			varchar, 
	`IceClass`			varchar
);

CREATE TABLE `tblLiftingGear`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`GearType`			varchar, 
	`NumberOfGears`			INTEGER, 
	`MaxSWLOfGear`			INTEGER
);

CREATE TABLE `tblMainEngines`
 (
	`LRNO`			varchar, 
	`Position`			varchar, 
	`EngineType`			varchar, 
	`EngineDesigner`			varchar, 
	`EngineBuilder`			TEXT, 
	`EngineModel`			varchar, 
	`NumberOfCylinders`			INTEGER, 
	`Bore`			INTEGER, 
	`Stroke`			INTEGER, 
	`StrokeType`			varchar, 
	`PowerBHP`			INTEGER, 
	`PowerKW`			INTEGER, 
	`RPM`			INTEGER, 
	`EngineBuilderCode`			varchar, 
	`EngineMakerCode`			varchar
);

CREATE TABLE `tblMainGenerators`
 (
	`LRNO`			varchar, 
	`SequenceNumber`			varchar, 
	`GeneratorPosition`			varchar, 
	`Number`			INTEGER, 
	`KW`			INTEGER, 
	`Voltage`			INTEGER, 
	`AC/DCIndicator`			varchar, 
	`Frequency`			INTEGER, 
	`GeneratorMaker`			varchar
);

CREATE TABLE `tblNameHistory`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`VesselName`			varchar, 
	`Effective_Date`			varchar
);

CREATE TABLE `tblOperatorHistory`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`EffectiveDate`			varchar, 
	`Operator`			varchar, 
	`OperatorCode`			varchar
);

CREATE TABLE `tblPropellers`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`PropellerPosition`			varchar, 
	`PropellerType`			varchar, 
	`PropellerTypeCode`			varchar, 
	`RPMService`			INTEGER, 
	`RPMMaximum`			INTEGER, 
	`NozzleType`			varchar
);

CREATE TABLE `tblRegisteredOwnerHistory`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`EffectiveDate`			varchar, 
	`Owner`			varchar, 
	`OwnerCode`			varchar
);

CREATE TABLE `tblShip`
 (
	`LRIMOShipNo`			varchar, 
	`ShipName`			varchar, 
	`ShiptypeLevel5`			varchar, 
	`StatCode5`			varchar, 
	`ShipStatus`			varchar, 
	`ShipStatusCode`			varchar, 
	`ShipStatusEffectiveDate`			varchar, 
	`ClassificationSociety`			varchar, 
	`FlagName`			varchar, 
	`GrossTonnage`			INTEGER, 
	`Deadweight`			INTEGER, 
	`YearOfBuild`			varchar, 
	`Draught`			INTEGER, 
	`Depth`			INTEGER, 
	`LengthOverallLOA`			INTEGER, 
	`LengthBetweenPerpendicularsLBP`			INTEGER, 
	`BreadthExtreme`			INTEGER, 
	`BreadthMoulded`			INTEGER, 
	`NumberofDecks`			varchar, 
	`NewconstructionEntryDate`			varchar, 
	`Shipbuilder`			varchar, 
	`ShipbuilderCompanyCode`			varchar, 
	`YardNumber`			varchar, 
	`ShipbuilderSubContractor`			varchar, 
	`ShipbuilderSubContractorCode`			varchar, 
	`ShipbuilderSubContractorShipyardYardHullNo`			varchar, 
	`LeadshipinseriesbyIMONumber`			varchar, 
	`PropulsionType`			varchar, 
	`NumberOfPropulsionUnits`			INTEGER, 
	`MainEngineDesigner`			varchar, 
	`MainEngineModel`			varchar, 
	`MainEngineRPM`			INTEGER, 
	`MainEngineStrokeType`			varchar, 
	`NumberOfAllEngines`			INTEGER, 
	`NumberofMainEngines`			INTEGER, 
	`Power`			INTEGER, 
	`Speed`			INTEGER, 
	`GroupBeneficialOwner`			varchar, 
	`GroupBeneficialOwnerCompanyCode`			varchar, 
	`GroupBeneficialOwnerCountryofDomicile`			varchar, 
	`Operator`			varchar, 
	`OperatorCompanyCode`			varchar, 
	`OperatorCountryofDocmicileName`			varchar, 
	`ShipManager`			varchar, 
	`ShipManagerCompanyCode`			varchar, 
	`ShipManagerCountryofDomicileName`			varchar, 
	`TechnicalManager`			varchar, 
	`TechnicalManagerCode`			varchar, 
	`TechnicalManagerCountryOfDomicile`			varchar, 
	`RegisteredOwner`			varchar, 
	`RegisteredOwnerCode`			varchar, 
	`RegisteredOwnerCountryofDomicile`			varchar, 
	`LastUpdateDateString`			varchar, 
	`LastUpdateDate`			DateTime, 
	`FairplayID`			INTEGER, 
	`TEU`			INTEGER, 
	`ShiptypeGroup`			varchar, 
	`DOCCompany`			varchar, 
	`DocumentofComplianceDOCCompanyCode`			varchar, 
	`DOCCompanyCountryofDomicile`			varchar
);

CREATE TABLE `tblShipManagerHistory`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`EffectiveDate`			varchar, 
	`ShipManager`			varchar, 
	`ShipManagerCode`			varchar
);

CREATE TABLE `tblShipTypeCodes`
 (
	`StatCode5`			varchar, 
	`ShiptypeLevel5`			varchar, 
	`Level4Code`			varchar, 
	`ShipTypeLevel4`			varchar, 
	`Level3Code`			varchar, 
	`ShipTypeLevel3`			varchar, 
	`Level2Code`			varchar, 
	`ShipTypeLevel2`			varchar, 
	`ShipTypeLevel1Code`			varchar, 
	`ShiptypeLevel1`			varchar, 
	`HullType`			varchar, 
	`SubGroup`			varchar, 
	`SubType`			varchar
);

CREATE TABLE `tblSpecialFeatures`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`SpecialFeature`			varchar, 
	`SpecialFeatureCode`			varchar
);

CREATE TABLE `tblStatusCodes`
 (
	`StatusCode`			varchar, 
	`Status`			varchar
);

CREATE TABLE `tblStatusHistory`
 (
	`LRNO`			varchar, 
	`Status`			varchar, 
	`Sequence`			varchar, 
	`StatusDate`			varchar, 
	`StatusCode`			varchar
);

CREATE TABLE `tblSurveyDateHistory`
 (
	`LRNO`			varchar, 
	`ClassSocietyCode`			varchar, 
	`SpecialSurvey`			varchar, 
	`ContinuousSurvey`			varchar, 
	`DockingSurvey`			varchar, 
	`TailshaftSurvey`			varchar, 
	`ClassSociety`			varchar
);

CREATE TABLE `tblSurveyDates`
 (
	`LRNO`			varchar, 
	`ClassSocietyCode`			varchar, 
	`SpecialSurvey`			varchar, 
	`SpecialSurveyLakes`			varchar, 
	`ContinuousHullSurvey`			varchar, 
	`ContinuousMachinerySurvey`			varchar, 
	`TailShaftSurvey`			varchar, 
	`DockingSurvey`			varchar, 
	`AnnualSurvey`			varchar, 
	`ClassSociety`			varchar
);

CREATE TABLE `tblThrusters`
 (
	`LRNO`			varchar, 
	`Sequence`			varchar, 
	`ThrusterType`			varchar, 
	`ThrusterTypeCode`			varchar, 
	`NumberOfThrusters`			INTEGER, 
	`ThrusterPosition`			varchar, 
	`ThrusterBHP`			INTEGER, 
	`ThrusterKW`			INTEGER, 
	`TypeOfInstallation`			varchar
);

CREATE TABLE `tblTownCodes`
 (
	`CountryCode`			varchar, 
	`Country`			varchar, 
	`TownCode`			varchar, 
	`Town`			varchar
);


