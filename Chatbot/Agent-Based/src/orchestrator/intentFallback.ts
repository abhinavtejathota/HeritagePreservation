import { geminiClient } from "../external/llm/gemini.client";
import { groqClient } from "../external/llm/groq.client";

export const INTENTS = [
  "geo",
  "civilization",
  "architecture",
  "timeline",
  "monument"
] as const;

export type Intent = typeof INTENTS[number];

export function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}

export async function llmIntentFallback(
  query: string
): Promise<Intent[]> {

  const prompt = `
You are a strict intent classifier.

Rules:
- Choose intents ONLY from this list:
  ${INTENTS.join(", ")}
- If the question is about location, ALWAYS include "geo"
- ALWAYS include "monument"
- Return a valid JSON array only
- Do not explain

User query:
"${query}"
`;

//gemini
  try {
    const response = await geminiClient.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 30
      }
    });

    const raw = response.response.text().trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const validIntents = parsed.filter(isIntent);

    return validIntents;
  } catch (err) {
    console.warn("[WARN] Gemini failed, falling back to Groq");
  }

//groq
  try {
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: "system",
          content: "You are a strict intent classifier."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty Groq response");

    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const validIntents = parsed.filter(isIntent);


    return validIntents;
  } catch (err) {
    console.warn("[WARN] Groq also failed, using safe default");
  }

//default
  return ["monument"];
}
