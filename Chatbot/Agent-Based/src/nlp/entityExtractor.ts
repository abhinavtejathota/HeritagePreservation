import nlp from "compromise";
import { normalizeEntity } from "./normalize";

export type ExtractedEntity = {
  text: string;
  normalized: string;
  tags: string[];
};

const STOPWORDS = ["where", "what", "who", "is", "the", "of", "are"];

const INTENT_NOUNS = [
  "architecture",
  "structure",
  "history",
  "timeline",
  "location",
  "civilization",
  "culture"
];


export function extractEntities(query: string): ExtractedEntity[] {
  const doc = nlp(query);
  const entities: ExtractedEntity[] = [];

  doc.places().forEach(p => {
    entities.push({
      text: p.text(),
      normalized: normalizeEntity(p.text()),
      tags: ["Place"]
    });
  });

  doc.match("#ProperNoun").forEach(m => {
    const text = m.text().toLowerCase().trim();
    if (text.split(" ").length > 2) return;

    entities.push({
      text: m.text(),
      normalized: normalizeEntity(m.text()),
      tags: ["ProperNoun"]
    });
  });

  doc.nouns().forEach(n => {
    const text = n.text().toLowerCase().trim();
    const tokens = text.split(" ");

    if (tokens.length > 2) return;
    if (tokens.some(t => STOPWORDS.includes(t))) return;
	if (tokens.some(t => INTENT_NOUNS.includes(t))) return;
    if (text.length < 4) return;

    entities.push({
      text,
      normalized: normalizeEntity(text),
      tags: ["PossiblePlace"]
    });
  });

  if (entities.length === 0) {
    const tokens = query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(" ")
      .filter(t => t.length > 3 && !STOPWORDS.includes(t));
  
    const last = tokens.at(-1);
	
    if (last) {
      entities.push({
        text: last,
        normalized: normalizeEntity(last),
        tags: ["PossiblePlace"]
      });
    } 
  }
  

  return dedupe(entities).sort((a, b) => {
    const priority = (e: ExtractedEntity) => {
      if (e.tags.includes("Place")) return 1;
      if (e.tags.includes("ProperNoun")) return 2;
      return 3;
    };
    return priority(a) - priority(b);
  });
}

function dedupe(list: ExtractedEntity[]) {
  const seen = new Set<string>();
  return list.filter(e => {
    if (seen.has(e.normalized)) return false;
    seen.add(e.normalized);
    return true;
  });
}
