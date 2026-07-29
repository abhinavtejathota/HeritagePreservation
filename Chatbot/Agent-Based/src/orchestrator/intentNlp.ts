import nlp from "compromise";

export function extractKeywords(query: string): string[] {
  const doc = nlp(query);

  const keywords = [
    ...doc.nouns().out("array"),
    ...doc.verbs().out("array"),
    ...doc.topics().out("array")
  ];

  return [
    ...new Set(
      keywords
        .map(k => k.toLowerCase().trim())
        .filter(Boolean)
    )
  ];
}
