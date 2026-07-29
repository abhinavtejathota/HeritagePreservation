import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

export const geminiClient = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite"
});
