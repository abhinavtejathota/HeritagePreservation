import dotenv from "dotenv";
dotenv.config();

/** API keys optional — Local-RAG path needs none. */
export const env = {
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
  PORT: process.env.PORT || "8176",
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_USER: process.env.DB_USER || "",
  DB_PASSWORD: process.env.DB_PASSWORD || "",
  DB_NAME: process.env.DB_NAME || "",
};
