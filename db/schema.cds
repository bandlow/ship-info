namespace skf.zcapn.shipimporter;
entity tblShip {
    key LRIMOShipNo: String;
    ShipName: String;
    ShiptypeLevel5: String;
    StatCode5: String;
	ShipStatus: String;
	ShipStatusCode: String;
	ShipStatusEffectiveDate: String;
	ClassificationSociety: String;
	FlagName: String;
	GrossTonnage: Double;
	Deadweight: Double;
	YearOfBuild: String;
	Draught: Double;
	Depth: Double;
	LengthOverallLOA: Double;
	LengthBetweenPerpendicularsLBP: Double;
	BreadthExtreme: Double;
	BreadthMoulded: Double;
	NumberofDecks: String;
	NewconstructionEntryDate: String;
	Shipbuilder: String;
	ShipbuilderCompanyCode: String;
	YardNumber: String;
	ShipbuilderSubContractor: String;
	ShipbuilderSubContractorCode: String;
	ShipbuilderSubContractorShipyardYardHullNo: String;
	LeadshipinseriesbyIMONumber: String;
	PropulsionType: String;
	NumberOfPropulsionUnits: Int16;
	MainEngineDesigner: String;
	MainEngineModel: String;
	MainEngineRPM: Double;
	MainEngineStrokeType:String;
	NumberOfAllEngines: Int16;
	NumberofMainEngines: Int16;
	Power: Int32;
	Speed: Double;
	GroupBeneficialOwner: String;
	GroupBeneficialOwnerCompanyCode: String;
	GroupBeneficialOwnerCountryofDomicile: String;
	Operator: String;
	OperatorCompanyCode: String;
	OperatorCountryofDocmicileName: String;
	ShipManager: String;
	ShipManagerCompanyCode: String;
	ShipManagerCountryofDomicileName: String;
	TechnicalManager: String;
	TechnicalManagerCode: String;
	TechnicalManagerCountryOfDomicile:String;
	RegisteredOwner: String;
	RegisteredOwnerCode: String;
	RegisteredOwnerCountryofDomicile:String;
	LastUpdateDateString: String;
	LastUpdateDate: DateTime;
	FairplayID: Int32;
	TEU: Double;
	ShiptypeGroup: String;
	DOCCompany: String;
	DocumentofComplianceDOCCompanyCode: String;
	DOCCompanyCountryofDomicile: String;
}

entity tblAuxEngines {
	LRNO: String;
	EngineSequence: String;
	EngineBuilder: String;
	EngineDesigner: String;
	EngineModel: String;
	NumberOfCylinders: String;
	Bore: String;
	Stroke: String;
	StrokeType: String;
	MaxPower: String;
}

entity tblAuxiliaryGenerators {
    LRNO: String;
    Number: Int16;
    KWEach: Double;
    Voltage1: Int32;
    Voltage2: Int32;
    Frequency: Int32;
    ACDC: String;
    MainEngineDriven: String;
}

entity tblBuilderAndSubcontractorDetails {
     key BuilderCode:String;
      ShipbuilderFullStyle:String;
      Shipbuilder:String;
      FullAddress:String;
      CountryName:String;
      Contact:String;
      EmailAddress:String;
      Facsimilie:String;
      Telephone:String;
      Telex:String;
      Website:String;
      CountryCode:String;
      TownCode:String;
      BuilderStatus:String;
}

entity tblBuilderAndSubcontractorLinkFile {
    key LRNO:String;
    key SequenceNumber:String;
    BuilderCode: String;
    Section: String;
}

entity tblBuilderAssociations {
    BuilderCode:String;
    AssociatedBuilderCode:String;
}

entity tblBuilderDetails {
    key BuilderCode:String;
    ShipbuilderFullStyle:String;
    Shipbuilder:String;
    FullAddress:String;
    CountryName:String;
    Contact:String;
    EmailAddress:String;
    Facsimilie:String;
    Telephone:String;
    Telex:String;
    Website:String;
    CountryCode:String;
    TownCode:String;
    BuilderStatus:String;
}

entity tblCompanyDetailsAll {
    OWCODE:String;
    ShortCompanyName:String;
    CountryName:String;
    Telephone:String;
    Telex:String;
    Facsimilie:String;
    Emailaddress:String;
    Website:String;
    FullName:String;
    FullAdress:String;
    NationalityofRegistration:String;
    NationalityofControl:String;
    LastChangeDate:String;
    CompanyStatus:String;
}

entity tblCompanyFullDetailsWithCodesAndParent {
    OWCODE:String;
    ShortCompanyName:String;
    CountryName:String;
    TownName:String;
    Telephone:String;
    Telex:String;
    Facsimilie:String;
    Emailaddress:String;
    Website:String;
    FullName:String;
    FullAdress:String;
    CareOfCode:String;
    RoomFloorBuilding1:String;
    RoomFloorBuilding2:String;
    RoomFloorBuilding3:String;
    POBox:String;
    StreetNumber:String;
    Street:String;
    PrePostcode:String;
    PostPostcode:String;
    NationalityofRegistration:String;
    NationalityofControl:String;
    LocationCode:String;
    NationalityofRegistrationCode:String;
    NationalityofControlCode:String;
    LastChangeDate:String;
    parentCompany:String;
}

entity tblDOCHistory {
    key LRNO: String;
    key Sequence: String;
    EffectiveDate: String;
    DOCCompany: String;
    DOCCompanyCode: String;
    CompanyStatus: String;
}

entity tblGroupBeneficialOwnerHistory {
    key LRNO: String;
    key Sequence: String;
    EffectiveDate: String;
    GroupBeneficialOwner: String;
    GroupBeneficialOwnerCode: String;
}

entity tblIceClass {
    key LRNO: String;
    key IceClassCode: String;
    IceClass: String;
}

entity tblLiftingGear {
    key LRNO: String;
    key Sequence: String;
    GearType: String;
    NumberOfGears: Int16;
    MaxSWLOfGear: Double;
}

entity tblMainEngines {
    key LRNO:String;
    key Position:String;
    EngineType:String;
    EngineDesigner:String;
    EngineBuilder:String;
    EngineModel:String;
    NumberOfCylinders:Int16;
    Bore:Int32;
    Stroke:Int32;
    StrokeType:String;
    PowerBHP:Int32;
    PowerKW:Int32;
    RPM:Int32;
    EngineBuilderCode:String;
    EngineMakerCode:String;
}

entity tblMainGenerators {
    LRNO: String;
    SequenceNumber: String;
    GeneratorPosition: String;
    Number: Int16;
    KW: Int32;
    Voltage: Int32;
    ACDCIndicator: String;
    Frequency: Int32;
    GeneratorMaker: String;
}

entity tblNameHistory {
    key LRNO: String;
    key Sequence: String;
    VesselName: String;
    Effective_Date: String;
}

entity tblOperatorHistory {
    key LRNO: String;
    key Sequence: String;
    EffectiveDate: String;
    Operator: String;
    OperatorCode: String;
}

entity tblPropellers {
    key LRNO: String;
    key Sequence: String;
    PropellerPosition: String;
    PropellerType: String;
    PropellerTypeCode: String;
    RPMService: Int32;
    RPMMaximum: Int32;
    NozzleType: String;
}

entity tblRegisteredOwnerHistory {
    key LRNO: String;
    key Sequence: String;
    EffectiveDate: String;
    Owner: String;
    OwnerCode: String;
}

entity tblShipManagerHistory {
    key LRNO: String;
    key Sequence: String;
    EffectiveDate: String;
    ShipManager: String;
    ShipManagerCode: String;
}

entity tblShipTypeCodes {
    StatCode5: String;
    ShiptypeLevel5: String;
    Level4Code: String;
    ShipTypeLevel4: String;
    Level3Code: String;
    ShipTypeLevel3: String;
    Level2Code: String;
    ShipTypeLevel2: String;
    ShipTypeLevel1Code: String;
    ShiptypeLevel1: String;
    HullType: String;
    SubGroup: String;
    SubType: String;
}

entity tblSpecialFeatures {
    key LRNO: String;
    key Sequence: String;
    SpecialFeature: String;
    SpecialFeatureCode: String;
}

entity tblStatusCodes {
    key StatusCode: String;
    Status: String;
}

entity tblStatusHistory {
    key LRNO: String;
    Status: String;
    Sequence: String;
    StatusDate: String;
    StatusCode: String;
}

entity tblSurveyDateHistory {
    key LRNO: String;
    ClassSocietyCode: String;
    SpecialSurvey: String;
    ContinuousSurvey: String;
    DockingSurvey: String;
    TailshaftSurvey: String;
    ClassSociety: String;
}

entity tblSurveyDates {
    LRNO: String;
    ClassSocietyCode: String;
    SpecialSurvey: String;
    SpecialSurveyLakes: String;
    ContinuousHullSurvey: String;
    ContinuousMachinerySurvey: String;
    TailShaftSurvey: String;
    DockingSurvey: String;
    AnnualSurvey: String;
    ClassSociety: String;
}

entity tblThrusters {
    key LRNO: String;
    key Sequence: String;
    ThrusterType: String;
    ThrusterTypeCode: String;
    NumberOfThrusters: Int16;
    ThrusterPosition: String;
    ThrusterBHP: Int32;
    ThrusterKW: Int32;
    TypeOfInstallation: String;
}

entity tblTownCodes {
    CountryCode: String;
    Country: String;
    TownCode: String;
    Town: String;
}

entity entityUpdateStatus {
    key Entity: String;
    key ![Key]: String;
    LastDeltaUpdateDate: Date;
}

entity jobLog {
  key ID: UUID;
  JobType: String(50);
  CreateDat: DateTime;
  UpdateDat: DateTime;
  StartTime: DateTime;
  EndTime: DateTime;
  Success: Boolean;
  Status: String(20);   
  Message: String(500);
}


entity importInfo {
    LastFileImportDate: Date;
}