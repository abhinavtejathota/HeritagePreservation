/**
 * LLM generation with Gemini → Groq fallback for the RAG reasoner.
 */
import { geminiClient } from "./gemini.client";
import { groqClient } from "./groq.client";
import { logger } from "../../utils/logger";

export type LlmResult = {
  text: string;
  provider: "gemini" | "groq";
};

export async function generateWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResult> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  try {
    const result = await geminiClient.generateContent(fullPrompt);
    const text = result.response.text()?.trim();
    if (text) {
      return { text, provider: "gemini" };
    }
  } catch (err) {
    logger.warn("Gemini generation failed, falling back to Groq", { err });
  }

  const completion = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() || "";
  if (!text) {
    throw new Error("Both Gemini and Groq returned empty responses");
  }
  return { text, provider: "groq" };
}
