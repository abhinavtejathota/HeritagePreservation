//The classifier is still not totally ml-based -> but nlp is used
import { extractKeywords } from "./intentNlp";
import { mapIntents } from "./intentMap";
import { calculateConfidence } from "./intentConfidence";
import { llmIntentFallback } from "./intentFallback";
import { ORCHESTRATOR } from "../config/constants";
import { Intent, isIntent } from "./intentFallback";

const CONFIDENCE_THRESHOLD = ORCHESTRATOR.INTENT_CONFIDENCE_THRESHOLD;

const PLACE_KEYWORDS = ["monument", "heritage", "temple", "fort", "palace", "site", "where", "location", "country"];

export async function classifyIntent(query: string): Promise<Intent[]> {
  const keywords = extractKeywords(query);
  let intents = mapIntents(keywords);
  const confidence = calculateConfidence(intents, keywords.length);

  if (confidence < CONFIDENCE_THRESHOLD) {
    const lowerQuery = query.toLowerCase();
    if (PLACE_KEYWORDS.some(k => lowerQuery.includes(k))) {
      if (["where", "location", "country"].some(k => lowerQuery.includes(k))) {
        intents = ["geo"];
      } else {
        intents = ["monument"];
      }
    } else {
      return await llmIntentFallback(query);
    }
  }

  return intents.length ? intents.filter(isIntent) : ["monument"];
}
