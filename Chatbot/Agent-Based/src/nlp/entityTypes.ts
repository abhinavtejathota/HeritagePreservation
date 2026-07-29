export enum EntityType {
  PLACE = "PLACE",
  MONUMENT = "MONUMENT",
  CIVILIZATION = "CIVILIZATION",
  RELIGION = "RELIGION",
  MATERIAL = "MATERIAL",
  ARCHITECTURE = "ARCHITECTURE",
  TIME = "TIME"
}

export interface Entity {
  text: string;        
  value: string;       
  type: EntityType;    
  confidence: number; 
}
