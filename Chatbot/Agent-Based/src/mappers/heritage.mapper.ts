import { HeritageSite } from "../knowledge/models/HeritageSite.model";

export function mapHeritage(site: HeritageSite, field: keyof HeritageSite) {
  return site[field];
}
