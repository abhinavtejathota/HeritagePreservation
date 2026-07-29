export type HeritageField =
  | "country"
  | "civilization"
  | "religion"
  | "architectureStyle"
  | "material"
  | "yearMidpoint"
  | "description";

export interface HeritageResponse {
  name: string;
  value: string;
  source: "database" | "llm";
}
